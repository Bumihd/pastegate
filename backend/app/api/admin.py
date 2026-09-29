# app/api/admin.py
# Admin endpoints: API keys, devices, extension builder, stats, audit log, settings

import io
import uuid
import json
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.app_settings import get_default_lang, set_default_lang
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import require_roles
from app.core.i18n import LANG_PATTERN, _
from app.core.security import decrypt_identity, generate_api_key, hash_api_key
from app.models.models import (
    ApiKey, AuditLog, Device, EventAction, EventFinding, PasteEvent, Severity, User, UserRole
)

router = APIRouter(prefix='/api/v1/admin', tags=['admin'])
settings = get_settings()

ITSEC_ROLES = (UserRole.itsec, UserRole.infosec, UserRole.admin)
# Only these roles see the device identity in cleartext, everyone else only sees the hash
IDENTITY_ROLES = (UserRole.itsec, UserRole.infosec)


# ── Stats (Dashboard) ─────────────────────────────────────────────

@router.get('/stats')
def get_stats(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(*ITSEC_ROLES, UserRole.management, UserRole.dataprivacy)),
):
    now   = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_events  = db.scalar(select(func.count()).select_from(PasteEvent)) or 0
    blocked_today = db.scalar(
        select(func.count()).select_from(PasteEvent)
        .where(PasteEvent.ts >= today,
               PasteEvent.action.in_(['blocked', 'blocked_hard']))
    ) or 0
    devices = db.scalar(select(func.count()).select_from(Device)) or 0
    week_total = db.scalar(
        select(func.count()).select_from(PasteEvent)
        .where(PasteEvent.ts >= now - timedelta(days=7))
    ) or 0

    # Top Rules
    top_rules = db.execute(
        select(EventFinding.rule_id, func.count().label('cnt'))
        .group_by(EventFinding.rule_id)
        .order_by(func.count().desc())
        .limit(6)
    ).all()

    # Severity distribution
    by_severity = db.execute(
        select(EventFinding.severity, func.count().label('cnt'))
        .group_by(EventFinding.severity)
    ).all()

    # 30-day trend – one query instead of 30
    from sqlalchemy import cast, Date, text
    thirty_days_ago = now - timedelta(days=29)
    raw_trend = db.execute(
        select(
            cast(PasteEvent.ts, Date).label('day'),
            func.count().label('cnt')
        )
        .where(PasteEvent.ts >= thirty_days_ago)
        .group_by(cast(PasteEvent.ts, Date))
        .order_by(cast(PasteEvent.ts, Date))
    ).all()
    trend_map = {str(row.day): row.cnt for row in raw_trend}
    trend = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date()
        trend.append({'date': day.isoformat(), 'count': trend_map.get(str(day), 0)})

    return {
        'total_events':  total_events,
        'blocked_today': blocked_today,
        'devices':       devices,
        'week_total':    week_total,
        'top_rules':     [{'rule_id': r.rule_id, 'count': r.cnt} for r in top_rules],
        'by_severity':   [{'severity': s.severity, 'count': s.cnt} for s in by_severity],
        'trend':         trend,
    }


# ── Events ────────────────────────────────────────────────────────

@router.get('/events')
def list_events(
    limit:    int = Query(25, ge=1, le=200),
    offset:   int = Query(0, ge=0),
    severity: Severity | None = None,
    action:   EventAction | None = None,
    db:       Session = Depends(get_db),
    user      = Depends(require_roles(*ITSEC_ROLES)),
):
    q = select(PasteEvent).order_by(PasteEvent.ts.desc())
    if action:
        q = q.where(PasteEvent.action == action)
    if severity:
        q = q.where(
            select(EventFinding.id)
            .where(EventFinding.event_id == PasteEvent.id, EventFinding.severity == severity)
            .exists()
        )
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.limit(limit).offset(offset)).all()

    if not items:
        return {'items': [], 'total': 0}

    # Fetch all device IDs and event IDs at once (no N+1)
    event_ids  = [ev.id for ev in items]
    device_ids = list({ev.device_id for ev in items})

    devices_map = {
        d.id: d for d in db.scalars(select(Device).where(Device.id.in_(device_ids))).all()
    }
    findings_map: dict = {}
    for f in db.scalars(select(EventFinding).where(EventFinding.event_id.in_(event_ids))).all():
        findings_map.setdefault(f.event_id, []).append(f)

    result = []
    for ev in items:
        device = devices_map.get(ev.device_id)
        result.append({
            'id':           str(ev.id),
            'device_id':    str(ev.device_id),
            'device_hash':  device.device_hash if device else '',
            'device_label': device.label if device else None,
            'device_has_identity': bool(device and device.identity_enc),
            'ts':           ev.ts.isoformat(),
            'url_hash':     ev.url_hash,
            'host':         ev.host,
            'action':       ev.action,
            'findings': [
                {'rule_id': f.rule_id, 'severity': f.severity}
                for f in findings_map.get(ev.id, [])
            ],
        })
    return {'items': result, 'total': total or 0}


# ── Devices ───────────────────────────────────────────────────────

@router.get('/devices')
def list_devices(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(*ITSEC_ROLES)),
):
    devices = db.scalars(select(Device).order_by(Device.last_seen.desc())).all()
    return [{
        'id':          str(d.id),
        'device_hash': d.device_hash,
        'label':       d.label,
        'first_seen':  d.first_seen.isoformat(),
        'last_seen':   d.last_seen.isoformat(),
        'event_count': d.event_count,
        'has_identity': d.identity_enc is not None,
    } for d in devices]


@router.post('/devices/{device_id}/identity')
def view_identity(
    device_id: uuid.UUID,
    request:   Request,
    db:        Session = Depends(get_db),
    user:      User = Depends(require_roles(*IDENTITY_ROLES)),
):
    """Show the real name of a device – every lookup is recorded in the audit log with the viewer's name."""
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail=_('devices.not_found'))

    db.add(AuditLog(
        actor_id=user.id,
        action='identity_viewed',
        target_hash=device.device_hash,
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()
    return {'device_hash': device.device_hash, 'identity': decrypt_identity(device.identity_enc)}


# ── API-Keys ──────────────────────────────────────────────────────

class KeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


@router.get('/api-keys')
def list_api_keys(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(UserRole.admin)),
):
    keys = db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())).all()
    return [{
        'id':         str(k.id),
        'name':       k.name,
        'is_active':  k.is_active,
        'created_at': k.created_at.isoformat(),
        'last_used':  k.last_used.isoformat() if k.last_used else None,
        'parent_id':  str(k.parent_id) if k.parent_id else None,
    } for k in keys]


@router.post('/api-keys', status_code=201)
def create_api_key(
    body: KeyCreate,
    db:   Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    raw_key = generate_api_key()
    key = ApiKey(user_id=user.id, name=body.name, key_hash=hash_api_key(raw_key))
    db.add(key)
    db.commit()
    return {'id': str(key.id), 'key': raw_key}


@router.delete('/api-keys/{key_id}', status_code=204)
def revoke_api_key(
    key_id: uuid.UUID,
    db:     Session = Depends(get_db),
    user    = Depends(require_roles(UserRole.admin)),
):
    """Revoke a key. For a base key, all of its deploy keys are revoked as well."""
    key = db.get(ApiKey, key_id)
    if not key:
        return
    key.is_active = False
    db.execute(
        update(ApiKey).where(ApiKey.parent_id == key.id).values(is_active=False)
    )
    db.commit()


# ── Audit-Log ─────────────────────────────────────────────────────

@router.get('/audit-log')
def list_audit_log(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(*ITSEC_ROLES, UserRole.dataprivacy)),
):
    logs = db.scalars(select(AuditLog).order_by(AuditLog.ts.desc()).limit(200)).all()
    # Names for the audit: who acted / approved (one query instead of N)
    user_ids = {l.actor_id for l in logs} | {l.approver_id for l in logs if l.approver_id}
    names = dict(db.execute(select(User.id, User.username).where(User.id.in_(user_ids))).all()) if user_ids else {}
    return [{
        'id':            str(l.id),
        'ts':            l.ts.isoformat(),
        'actor_id':      str(l.actor_id),
        'actor_name':    names.get(l.actor_id),
        'approver_id':   str(l.approver_id) if l.approver_id else None,
        'approver_name': names.get(l.approver_id) if l.approver_id else None,
        'action':        l.action,
        'target_hash':   l.target_hash,
        'reason':        l.reason,
        'ip_address':    l.ip_address,
    } for l in logs]


# ── Extension-Builder ─────────────────────────────────────────────

class BuildRequest(BaseModel):
    # If omitted, the organisation's default language applies.
    lang:       str | None = Field(default=None, pattern=LANG_PATTERN)
    key_id:     uuid.UUID
    # Optional: server URL embedded into the extension.
    # If omitted → taken from .env automatically (with X-Forwarded-Proto auto-upgrade).
    # Format: 'https://pastegate.example.com' or 'http://10.0.0.10'
    server_url: str | None = Field(default=None, max_length=255, pattern=r'^https?://[a-zA-Z0-9.\-_:]+(/.*)?$')
    # Revoke earlier deploy keys of the same base key (new rollout, e.g. via MDM).
    # Off by default: otherwise already distributed extensions would stop reporting immediately.
    replace_previous: bool = False


@router.post('/build-extension')
def build_extension(
    body:    BuildRequest,
    request: Request,
    db:      Session = Depends(get_db),
    user     = Depends(require_roles(UserRole.admin)),
):
    """
    Generate a fully configured extension ZIP.
    - server_url from .env
    - api_key from the DB (the raw key is not stored – a new key is generated)
    - lang from the request, else the organisation's default language
    - no config panel in the popup
    """
    lang = body.lang or get_default_lang(db)

    # Fetch the API key
    api_key_obj = db.get(ApiKey, body.key_id)
    if not api_key_obj or not api_key_obj.is_active:
        raise HTTPException(status_code=404, detail=_('api_keys.not_found'))

    # The selected key only exists as a hash and cannot be embedded again
    # → create a deploy key per build, attached to the base key. This keeps
    # deploy keys grouped, and they are revoked together with the base key.
    root = db.get(ApiKey, api_key_obj.parent_id) if api_key_obj.parent_id else api_key_obj
    if not root or not root.is_active:
        raise HTTPException(status_code=404, detail=_('api_keys.root_not_found'))

    if body.replace_previous:
        db.execute(
            update(ApiKey)
            .where(ApiKey.parent_id == root.id, ApiKey.is_active == True)
            .values(is_active=False)
        )

    raw_key     = generate_api_key()
    new_key_obj = ApiKey(
        user_id=user.id,
        name=f'{root.name} ({datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")} UTC)',
        key_hash=hash_api_key(raw_key),
        is_active=True,
        parent_id=root.id,
    )
    db.add(new_key_obj)
    db.add(AuditLog(
        actor_id=user.id,
        action='extension_build',
        target_hash=str(root.id).replace('-', ''),
        reason='replace_previous' if body.replace_previous else None,
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()

    # Locate the extension source directory
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ext_src  = os.path.normpath(os.path.join(base_dir, '..', 'extension'))

    if not os.path.isdir(ext_src):
        raise HTTPException(status_code=500, detail=_('extension.source_missing', path=ext_src))

    # Determine server_url
    # Priority: 1. body override 2. auto-detect from headers 3. .env fallback
    if body.server_url:
        # The admin explicitly set a URL in the dashboard — it takes precedence.
        # Strip the trailing slash for consistency.
        server_url = body.server_url.rstrip('/')
    else:
        server_url = getattr(settings, 'server_url', '')
        if server_url and not server_url.startswith('http'):
            server_url = 'https://' + server_url

        # Auto-upgrade to HTTPS if the current request came in over HTTPS.
        # Background: SSL termination via a Cloudflare/nginx proxy → .env has http://,
        # but external clients reach the server via https://.
        # Without this fix the extension connects via http://, hits a
        # 301 redirect and the fetch in MV3 fails silently.
        try:
            # Standard: X-Forwarded-Proto (from nginx/Apache reverse proxies)
            forwarded_proto = request.headers.get('x-forwarded-proto', '').lower()
            # Cloudflare: the CF-Visitor header contains {"scheme":"https"} for HTTPS requests
            cf_visitor = request.headers.get('cf-visitor', '')
            is_https = (
                forwarded_proto == 'https'
                or '"scheme":"https"' in cf_visitor.replace(' ', '')
                or request.url.scheme == 'https'
            )
            if is_https and server_url.startswith('http://'):
                server_url = 'https://' + server_url[len('http://'):]
        except Exception:
            pass

    # Build the entire ZIP in BytesIO INSIDE the with block
    # IMPORTANT: StreamingResponse OUTSIDE – otherwise tmpdir is deleted before the stream is sent
    zip_buffer = io.BytesIO()

    with tempfile.TemporaryDirectory() as tmpdir:
        ext_dir = os.path.join(tmpdir, 'extension')
        # Tests and docs do not belong in the end-user package
        shutil.copytree(ext_src, ext_dir, ignore=shutil.ignore_patterns('tests', '*.md', 'config.js'))

        # Embed config.js
        config_js = (
            "// Pastegate – Deployment Config (auto-generated, do not edit)\n"
            f"const PASTEGATE_CONFIG = {{\n"
            f"  server_url: {json.dumps(server_url)},\n"
            f"  api_key:    {json.dumps(raw_key)},\n"
            f"  lang:       {json.dumps(lang)},\n"
            f"}};\n"
        )
        with open(os.path.join(ext_dir, 'config.js'), 'w') as f:
            f.write(config_js)

        # manifest.json stays unchanged.
        # config.js is loaded by background.js (service worker) via importScripts('config.js')
        # — content scripts do NOT need it, since there is no PASTEGATE_CONFIG there.
        # Earlier versions wrongly registered config.js as a content script
        # — that worked, but was semantically wrong and never reached the SW.

        # Pack all files into the ZIP
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(ext_dir):
                for fname in sorted(files):
                    filepath = os.path.join(root, fname)
                    arcname  = os.path.relpath(filepath, tmpdir)
                    zf.write(filepath, arcname)
        # with block ends here – tmpdir is deleted, but the ZIP is already in BytesIO

    # Rewind BytesIO and send – AFTER the with block
    zip_buffer.seek(0)
    filename = f'pastegate-extension-{lang}.zip'
    return StreamingResponse(
        zip_buffer,
        media_type='application/zip',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


# ── Settings ──────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    default_lang: str = Field(pattern=LANG_PATTERN)


@router.get('/settings')
def get_app_settings(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(UserRole.admin)),
):
    return {'default_lang': get_default_lang(db)}


@router.put('/settings')
def update_app_settings(
    body:    SettingsUpdate,
    request: Request,
    db:      Session = Depends(get_db),
    user:    User = Depends(require_roles(UserRole.admin)),
):
    previous = get_default_lang(db)
    set_default_lang(db, body.default_lang)
    db.add(AuditLog(
        actor_id=user.id,
        action='settings_update',
        reason=f'default_lang: {previous} -> {body.default_lang}',
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()
    return {'default_lang': body.default_lang}


# ── Users ─────────────────────────────────────────────────────────

@router.get('/users')
def list_users(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(UserRole.admin)),
):
    users = db.scalars(select(User).order_by(User.created_at)).all()
    return [{
        'id':           str(u.id),
        'username':     u.username,
        'email':        u.email,
        'role':         u.role.value,
        'totp_enabled': u.totp_enabled,
        'is_active':    u.is_active,
        'created_at':   u.created_at.isoformat(),
        'last_login':   u.last_login.isoformat() if u.last_login else None,
    } for u in users]

# ── User Create / Deactivate ──────────────────────────────────────

class UserCreate(BaseModel):
    username: str  = Field(min_length=2, max_length=64)
    email:    str  = Field(max_length=256)
    password: str  = Field(min_length=12, max_length=256)
    role:     str  = Field(pattern='^(itsec|infosec|admin|management|dataprivacy|viewer)$')


@router.post('/users', status_code=201)
def create_user(
    body: UserCreate,
    db:   Session = Depends(get_db),
    actor = Depends(require_roles(UserRole.admin)),
):
    from app.core.security import hash_password
    existing = db.scalar(select(User).where(User.username == body.username))
    if existing:
        raise HTTPException(status_code=409, detail=_('users.username_taken'))
    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole(body.role),
        is_active=True,
    )
    db.add(user)
    db.commit()
    return {'id': str(user.id), 'username': user.username, 'role': user.role.value}


@router.post('/users/{user_id}/deactivate', status_code=204)
def deactivate_user(
    user_id: str,
    db:      Session = Depends(get_db),
    actor    = Depends(require_roles(UserRole.admin)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=_('users.not_found'))
    # Prevent self-lockout
    if str(user.id) == str(actor.id):
        raise HTTPException(status_code=400, detail=_('users.cannot_deactivate_self'))
    # Do not deactivate the last active admin (otherwise no admin access is left)
    if user.role == UserRole.admin and user.is_active:
        active_admins = db.scalar(
            select(func.count()).select_from(User)
            .where(User.role == UserRole.admin, User.is_active == True)  # noqa: E712
        ) or 0
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail=_('users.cannot_deactivate_last_admin'))
    user.is_active = False
    db.commit()


# ── Viewer endpoints ──────────────────────────────────────────────
# A viewer only sees events from their own devices (via device_hash)

@router.get('/viewer/events')
def viewer_events(
    db:   Session = Depends(get_db),
    # Only viewers (their own assigned devices) + ITSEC roles (itsec/infosec/admin).
    # management/dataprivacy intentionally get NO raw event data through this path
    # — consistent with the role policy of list_events.
    user: User    = Depends(require_roles(UserRole.viewer, *ITSEC_ROLES)),
):
    """
    A viewer only sees events from their assigned devices.
    Assignment happens automatically via the extension device hash or manually by an admin.
    """
    from app.models.models import ViewerDeviceAssignment

    if user.role == UserRole.viewer:
        # Fetch assigned devices
        assignments = db.scalars(
            select(ViewerDeviceAssignment).where(ViewerDeviceAssignment.user_id == user.id)
        ).all()

        if not assignments:
            return {'items': [], 'note': _('viewer.no_devices')}

        device_ids = [a.device_id for a in assignments]
        items = db.scalars(
            select(PasteEvent)
            .where(PasteEvent.device_id.in_(device_ids))
            .order_by(PasteEvent.ts.desc())
            .limit(200)
        ).all()
    else:
        items = db.scalars(
            select(PasteEvent).order_by(PasteEvent.ts.desc()).limit(50)
        ).all()

    # Load findings for all events in ONE query (no N+1).
    findings_map: dict = {}
    if items:
        event_ids = [ev.id for ev in items]
        for f in db.scalars(
            select(EventFinding).where(EventFinding.event_id.in_(event_ids))
        ).all():
            findings_map.setdefault(f.event_id, []).append(f)

    result = []
    for ev in items:
        result.append({
            'ts':       ev.ts.isoformat(),
            'host':     ev.host,
            'action':   ev.action,
            'findings': [{'rule_id': f.rule_id, 'severity': f.severity}
                         for f in findings_map.get(ev.id, [])],
        })
    return {'items': result}


# ── Viewer device assignment ──────────────────────────────────────

class AssignDeviceRequest(BaseModel):
    user_id:   str
    device_id: str
    note:      str | None = None


@router.get('/viewer-assignments')
def list_assignments(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(UserRole.admin, UserRole.itsec, UserRole.infosec)),
):
    from app.models.models import ViewerDeviceAssignment
    items = db.scalars(select(ViewerDeviceAssignment)).all()
    return [{
        'id':          str(a.id),
        'user_id':     str(a.user_id),
        'device_id':   str(a.device_id),
        'assigned_at': a.assigned_at.isoformat(),
        'note':        a.note,
    } for a in items]


@router.post('/viewer-assignments', status_code=201)
def assign_device(
    body: AssignDeviceRequest,
    db:   Session = Depends(get_db),
    actor: User   = Depends(require_roles(UserRole.admin, UserRole.itsec, UserRole.infosec)),
):
    from app.models.models import ViewerDeviceAssignment
    from sqlalchemy.exc import IntegrityError
    import uuid as _uuid
    try:
        user_uuid   = _uuid.UUID(body.user_id)
        device_uuid = _uuid.UUID(body.device_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=422, detail=_('assignments.invalid_ids'))
    assignment = ViewerDeviceAssignment(
        user_id=user_uuid,
        device_id=device_uuid,
        assigned_by=actor.id,
        note=body.note,
    )
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError:
        # Duplicate assignment (unique constraint) OR unknown user_id/device_id (FK).
        db.rollback()
        raise HTTPException(status_code=409, detail=_('assignments.conflict'))
    return {'id': str(assignment.id)}


@router.delete('/viewer-assignments/{assignment_id}', status_code=204)
def remove_assignment(
    assignment_id: str,
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(UserRole.admin)),
):
    from app.models.models import ViewerDeviceAssignment
    import uuid as _uuid
    try:
        aid = _uuid.UUID(assignment_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=422, detail=_('assignments.invalid_id'))
    a = db.get(ViewerDeviceAssignment, aid)
    if a:
        db.delete(a)
        db.commit()
