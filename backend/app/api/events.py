# app/api/events.py
# Receives events from the extension

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core import ratelimit
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_api_key
from app.core.i18n import _
from app.core.security import decrypt_identity, encrypt_identity, hash_device_id
from app.models.models import ApiKey, Device, EventAction, EventFinding, PasteEvent, Severity

router = APIRouter(prefix='/api/v1', tags=['events'])

settings = get_settings()

# ── Rate limit per API key (in the DB, shared across all workers) ──
# Protects the ingest path against flooding by a single key.
# Generously sized: the extension flushes roughly every 30s in batches of <=100;
# 120 requests/min also allow large offline backlogs to be delivered.
_INGEST_WINDOW = 60
_INGEST_MAX    = 120


# ── Schemas ───────────────────────────────────────────────────────

class FindingIn(BaseModel):
    rule_id:  str      = Field(max_length=64)
    severity: Severity


class EventIn(BaseModel):
    ts:       datetime
    url_hash: str      = Field(max_length=64)
    host:     str | None = Field(default=None, max_length=255)
    action:   EventAction
    findings: list[FindingIn] = Field(max_length=50)


class BatchIn(BaseModel):
    device_id: str           = Field(min_length=1, max_length=128)
    # Profile email or MDM value – stored only in encrypted form
    identity:  str | None    = Field(default=None, max_length=254)
    events:    list[EventIn] = Field(max_length=100)


# ── Endpoints ─────────────────────────────────────────────────────

@router.get('/health')
def health(api_key: Annotated[ApiKey, Depends(get_api_key)]):
    """Connection test – the extension uses it to check that server + key are correct."""
    return {'status': 'ok'}


@router.post('/events/batch', status_code=status.HTTP_202_ACCEPTED)
def ingest_batch(
    payload: BatchIn,
    request: Request,
    db:      Session = Depends(get_db),
    api_key: ApiKey  = Depends(get_api_key),
):
    """
    Receives up to 100 events from an extension instance.
    The device ID is hashed server-side – the raw UUID never leaves the extension.
    """
    if ratelimit.hit(db, f'ingest:{api_key.id}', _INGEST_MAX, _INGEST_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_('events.rate_limited'),
            headers={'Retry-After': '60'},
        )

    if not payload.events:
        return {'accepted': 0}

    device_hash = hash_device_id(payload.device_id)
    max_age_days = settings.event_retention_days
    now = datetime.now(timezone.utc)

    # Device upsert
    device = db.query(Device).filter_by(device_hash=device_hash).first()
    if not device:
        device = Device(device_hash=device_hash)
        db.add(device)
        db.flush()

    identity = (payload.identity or '').strip()
    if identity and decrypt_identity(device.identity_enc) != identity:
        device.identity_enc = encrypt_identity(identity)

    accepted = 0

    for ev in payload.events:
        # Normalise the timestamp – treat tz-naive values as UTC
        ts = ev.ts if ev.ts.tzinfo is not None else ev.ts.replace(tzinfo=timezone.utc)

        # Timestamp must not be in the future
        if ts > now:
            continue

        # Timestamp must not be older than the retention period
        if (now - ts).days > max_age_days:
            continue

        paste_event = PasteEvent(
            device_id=device.id,
            ts=ts,
            url_hash=ev.url_hash,
            host=(ev.host or None),
            action=ev.action,
        )
        db.add(paste_event)
        db.flush()

        for f in ev.findings:
            db.add(EventFinding(
                event_id=paste_event.id,
                rule_id=f.rule_id,
                severity=f.severity,
            ))

        accepted += 1

    device.last_seen   = now
    device.event_count = (device.event_count or 0) + accepted
    db.commit()

    return {'accepted': accepted}
