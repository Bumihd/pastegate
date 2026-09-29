# app/api/data.py
# Reporting API for external systems (Grafana, Jira, BI …) + personal tokens.
#
# /api/v1/data/*   – read-only, via personal token (pgr_…) or dashboard JWT.
#                    Returns aggregates and pseudonymous events (device hash), NEVER real names.
# /api/v1/tokens   – manage your own tokens (dashboard login only, not via token).

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_data_user
from app.core.i18n import _
from app.core.security import generate_access_token, hash_api_key
from app.models.models import (
    AccessToken, AuditLog, Device, EventAction, EventFinding, PasteEvent, Severity, User, UserRole,
    ViewerDeviceAssignment,
)

router = APIRouter(prefix='/api/v1', tags=['data'])

# Raw events as in the dashboard: itsec/infosec/admin see all, viewers only assigned devices.
# management/dataprivacy intentionally only get aggregates.
ALL_EVENTS_ROLES = (UserRole.itsec, UserRole.infosec, UserRole.admin)
MAX_TOKENS_PER_USER = 10


# ── Personal tokens ───────────────────────────────────────────────

def _token_out(t: AccessToken) -> dict:
    return {
        'id':         str(t.id),
        'name':       t.name,
        'is_active':  t.is_active,
        'created_at': t.created_at.isoformat(),
        'last_used':  t.last_used.isoformat() if t.last_used else None,
        'expires_at': t.expires_at.isoformat() if t.expires_at else None,
    }


class TokenCreate(BaseModel):
    name:            str = Field(min_length=1, max_length=128)
    # If omitted, the token never expires (long-running use in Grafana etc.)
    expires_in_days: int | None = Field(default=None, ge=1, le=730)


@router.get('/tokens')
def list_tokens(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tokens = db.scalars(
        select(AccessToken).where(AccessToken.user_id == user.id).order_by(AccessToken.created_at.desc())
    ).all()
    return [_token_out(t) for t in tokens]


@router.post('/tokens', status_code=201)
def create_token(body: TokenCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    active = db.scalar(
        select(func.count()).select_from(AccessToken)
        .where(AccessToken.user_id == user.id, AccessToken.is_active == True)  # noqa: E712
    ) or 0
    if active >= MAX_TOKENS_PER_USER:
        raise HTTPException(status_code=400, detail=_('tokens.limit', max=MAX_TOKENS_PER_USER))

    raw = generate_access_token()
    token = AccessToken(
        user_id=user.id, name=body.name.strip(), token_hash=hash_api_key(raw),
        expires_at=(datetime.now(timezone.utc) + timedelta(days=body.expires_in_days))
                   if body.expires_in_days else None,
    )
    db.add(token)
    db.add(AuditLog(actor_id=user.id, action='token_created', reason=token.name))
    db.commit()
    return {**_token_out(token), 'token': raw}


@router.delete('/tokens/{token_id}', status_code=204)
def revoke_token(token_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    token = db.get(AccessToken, token_id)
    if not token or token.user_id != user.id:
        raise HTTPException(status_code=404, detail=_('tokens.not_found'))
    if token.is_active:
        token.is_active = False
        db.add(AuditLog(actor_id=user.id, action='token_revoked', reason=token.name))
        db.commit()


# ── Data ──────────────────────────────────────────────────────────

@router.get('/data/stats')
def data_stats(
    days: int = Query(30, ge=1, le=365),
    db:   Session = Depends(get_db),
    user: User = Depends(get_data_user),
):
    """Aggregated organisation metrics – for every role, without personal data."""
    now   = datetime.now(timezone.utc)
    since = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    in_window = PasteEvent.ts >= since

    by_action = dict(db.execute(
        select(PasteEvent.action, func.count()).where(in_window).group_by(PasteEvent.action)
    ).all())
    total = sum(by_action.values())

    active_devices = db.scalar(
        select(func.count(func.distinct(PasteEvent.device_id))).where(in_window)
    ) or 0

    finding_rows = (
        select(EventFinding.rule_id, EventFinding.severity)
        .join(PasteEvent, PasteEvent.id == EventFinding.event_id).where(in_window)
    ).subquery()
    top_rules = db.execute(
        select(finding_rows.c.rule_id, func.count().label('cnt'))
        .group_by(finding_rows.c.rule_id).order_by(func.count().desc()).limit(10)
    ).all()
    by_severity = db.execute(
        select(finding_rows.c.severity, func.count()).group_by(finding_rows.c.severity)
    ).all()
    top_hosts = db.execute(
        select(PasteEvent.host, func.count().label('cnt'))
        .where(in_window, PasteEvent.host.is_not(None))
        .group_by(PasteEvent.host).order_by(func.count().desc()).limit(10)
    ).all()

    # Trend per day and action – one query
    day = cast(PasteEvent.ts, Date)
    trend_map: dict[str, dict[str, int]] = {}
    for d, action, cnt in db.execute(
        select(day, PasteEvent.action, func.count()).where(in_window).group_by(day, PasteEvent.action)
    ).all():
        trend_map.setdefault(str(d), {})[action.value] = cnt
    trend = []
    for i in range(days - 1, -1, -1):
        key = (now - timedelta(days=i)).date().isoformat()
        counts = {a.value: trend_map.get(key, {}).get(a.value, 0) for a in EventAction}
        trend.append({'date': key, 'total': sum(counts.values()), **counts})

    return {
        'from':           since.isoformat(),
        'to':             now.isoformat(),
        'days':           days,
        'total_events':   total,
        'by_action':      {a.value: by_action.get(a, 0) for a in EventAction},
        'active_devices': active_devices,
        'by_severity':    {s.value: 0 for s in Severity} | {s.value: c for s, c in by_severity},
        'top_rules':      [{'rule_id': r, 'count': c} for r, c in top_rules],
        'top_hosts':      [{'host': h, 'count': c} for h, c in top_hosts],
        'trend':          trend,
    }


@router.get('/data/events')
def data_events(
    since:    datetime | None = None,
    until:    datetime | None = None,
    action:   EventAction | None = None,
    severity: Severity | None = None,
    limit:    int = Query(100, ge=1, le=1000),
    offset:   int = Query(0, ge=0),
    db:       Session = Depends(get_db),
    user:     User = Depends(get_data_user),
):
    """Pseudonymous events (device hash instead of person) – same visibility as in the dashboard."""
    q = select(PasteEvent).order_by(PasteEvent.ts.desc())
    if user.role == UserRole.viewer:
        q = q.where(PasteEvent.device_id.in_(
            select(ViewerDeviceAssignment.device_id).where(ViewerDeviceAssignment.user_id == user.id)
        ))
    elif user.role not in ALL_EVENTS_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_('data.events_forbidden'))

    if since:
        q = q.where(PasteEvent.ts >= since)
    if until:
        q = q.where(PasteEvent.ts < until)
    if action:
        q = q.where(PasteEvent.action == action)
    if severity:
        q = q.where(
            select(EventFinding.id)
            .where(EventFinding.event_id == PasteEvent.id, EventFinding.severity == severity)
            .exists()
        )

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.limit(limit).offset(offset)).all()

    hashes: dict = {}
    findings: dict = {}
    if items:
        hashes = dict(db.execute(
            select(Device.id, Device.device_hash).where(Device.id.in_({ev.device_id for ev in items}))
        ).all())
        for f in db.scalars(select(EventFinding).where(EventFinding.event_id.in_([ev.id for ev in items]))):
            findings.setdefault(f.event_id, []).append({'rule_id': f.rule_id, 'severity': f.severity.value})

    return {
        'total':  total,
        'limit':  limit,
        'offset': offset,
        'items': [{
            'id':          str(ev.id),
            'ts':          ev.ts.isoformat(),
            'device_hash': hashes.get(ev.device_id, ''),
            'host':        ev.host,
            'url_hash':    ev.url_hash,
            'action':      ev.action.value,
            'findings':    findings.get(ev.id, []),
        } for ev in items],
    }
