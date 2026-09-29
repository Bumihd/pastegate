# app/core/retention.py
# Data minimisation: regular cleanup, at startup and periodically afterwards.
#
#   • events older than EVENT_RETENTION_DAYS
#   • devices that have not reported for DEVICE_RETENTION_DAYS – including their
#     events, findings, viewer assignments and encrypted identity
#   • expired token revocations and rate-limit windows
#
# The FKs have no ON DELETE CASCADE → delete children first. With multiple
# workers/replicas, an advisory lock ensures only one run at a time.

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.core import ratelimit
from app.core.config import get_settings
from app.models.models import (
    Device, EventFinding, PasteEvent, RevokedToken, ViewerDeviceAssignment,
)

log = logging.getLogger('pastegate')

_LOCK_ID = 0x70617374  # arbitrary but fixed ("past")
INTERVAL_SECONDS = 6 * 3600


def _delete_events(db: Session, where) -> int:
    ids = select(PasteEvent.id).where(where)
    db.execute(delete(EventFinding).where(EventFinding.event_id.in_(ids)))
    return db.execute(delete(PasteEvent).where(where)).rowcount


def stale_devices(days: int, now: datetime | None = None):
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    return select(Device.id).where(Device.last_seen < cutoff)


def purge_stale_devices(db: Session, days: int, now: datetime | None = None) -> int:
    """Delete devices that have not reported for `days` days, including all related data."""
    ids = stale_devices(days, now)
    _delete_events(db, PasteEvent.device_id.in_(ids))
    db.execute(delete(ViewerDeviceAssignment).where(ViewerDeviceAssignment.device_id.in_(ids)))
    return db.execute(delete(Device).where(Device.id.in_(ids))).rowcount


def run_cleanup(db: Session) -> dict | None:
    """One cleanup run. Returns None if another worker is currently cleaning up."""
    settings = get_settings()
    if not db.scalar(text('SELECT pg_try_advisory_xact_lock(:id)'), {'id': _LOCK_ID}):
        return None

    now = datetime.now(timezone.utc)
    result = {
        'revoked_tokens': db.execute(delete(RevokedToken).where(RevokedToken.expires_at < now)).rowcount,
        'events': _delete_events(db, PasteEvent.ts < now - timedelta(days=settings.event_retention_days)),
        'devices': purge_stale_devices(db, settings.device_retention_days, now)
                   if settings.device_retention_days > 0 else 0,
    }
    ratelimit.purge_expired(db)
    db.commit()

    if result['revoked_tokens'] or result['events'] or result['devices']:
        log.info('retention cleanup', extra={'event': 'retention_cleanup', **result})
    return result
