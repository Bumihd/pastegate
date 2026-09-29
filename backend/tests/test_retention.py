from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core import retention
from app.core.config import get_settings
from app.models.models import (
    Device, EventAction, EventFinding, PasteEvent, Severity, UserRole, ViewerDeviceAssignment,
)


def _device(db, hash_char, last_seen_days_ago, event_days_ago=None):
    now = datetime.now(timezone.utc)
    d = Device(device_hash=hash_char * 64, last_seen=now - timedelta(days=last_seen_days_ago))
    db.add(d)
    db.flush()
    ev = PasteEvent(device_id=d.id, ts=now - timedelta(days=event_days_ago or last_seen_days_ago),
                    url_hash='c' * 64, action=EventAction.blocked)
    db.add(ev)
    db.flush()
    db.add(EventFinding(event_id=ev.id, rule_id='aws_access_key', severity=Severity.critical))
    db.commit()
    return d


def count(db, model):
    return db.scalar(select(func.count()).select_from(model))


def test_stale_devices_deleted_with_all_data(db, make_user):
    fresh = _device(db, 'a', 29)
    stale = _device(db, 'b', 31)
    viewer = make_user(UserRole.viewer)
    db.add(ViewerDeviceAssignment(user_id=viewer.id, device_id=stale.id))
    db.commit()

    result = retention.run_cleanup(db)
    assert result['devices'] == 1

    db.expire_all()
    assert [d.id for d in db.scalars(select(Device))] == [fresh.id]
    assert count(db, PasteEvent) == 1
    assert count(db, EventFinding) == 1
    assert count(db, ViewerDeviceAssignment) == 0


def test_old_events_with_findings_are_deleted(db):
    # Device active, but one event outside the event retention (90 days)
    _device(db, 'a', 1, event_days_ago=91)
    result = retention.run_cleanup(db)
    assert result == {'revoked_tokens': 0, 'events': 1, 'devices': 0}
    assert count(db, EventFinding) == 0


def test_device_cleanup_can_be_disabled(db, monkeypatch):
    _device(db, 'b', 400, event_days_ago=1)
    monkeypatch.setattr(get_settings(), 'device_retention_days', 0)
    assert retention.run_cleanup(db)['devices'] == 0
    assert count(db, Device) == 1


def test_cli_dry_run_deletes_nothing(db, capsys):
    from app.cli import main
    _device(db, 'b', 31)
    assert main(['cleanup', '--dry-run']) == 0
    assert '1 device(s)' in capsys.readouterr().out
    assert count(db, Device) == 1
    assert main(['cleanup']) == 0
    db.expire_all()
    assert count(db, Device) == 0
