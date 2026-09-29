from datetime import datetime, timezone

from sqlalchemy import func, select

from app.api.events import _INGEST_MAX
from app.core.security import hash_device_id
from app.models.models import Device, PasteEvent, UserRole


def _batch(n=1, device_id='device-uuid-1', action='blocked', severity='critical', host='chat.example.com'):
    return {
        'device_id': device_id,
        'events': [{
            'ts': datetime.now(timezone.utc).isoformat(),
            'url_hash': 'a' * 64,
            'host': host,
            'action': action,
            'findings': [{'rule_id': 'aws_access_key', 'severity': severity}],
        } for _ in range(n)],
    }


def test_health_requires_valid_key(client, api_key):
    raw, _ = api_key
    assert client.get('/api/v1/health').status_code == 401
    assert client.get('/api/v1/health', headers={'X-API-Key': 'pg_' + '0' * 64}).status_code == 401
    assert client.get('/api/v1/health', headers={'X-API-Key': raw}).status_code == 200


def test_revoked_key_rejected(client, api_key, db):
    raw, key = api_key
    key.is_active = False
    db.commit()
    assert client.get('/api/v1/health', headers={'X-API-Key': raw}).status_code == 401


def test_ingest_stores_hashed_device(client, api_key, db):
    raw, _ = api_key
    r = client.post('/api/v1/events/batch', json=_batch(3), headers={'X-API-Key': raw})
    assert r.status_code == 202
    assert db.scalar(select(func.count()).select_from(PasteEvent)) == 3

    device = db.scalar(select(Device))
    assert device.device_hash == hash_device_id('device-uuid-1')
    assert 'device-uuid-1' not in device.device_hash


def test_ingest_rejects_invalid_action(client, api_key):
    raw, _ = api_key
    r = client.post('/api/v1/events/batch', json=_batch(action='exfiltrated'), headers={'X-API-Key': raw})
    assert r.status_code == 422


def test_ingest_batch_size_limit(client, api_key):
    raw, _ = api_key
    r = client.post('/api/v1/events/batch', json=_batch(101), headers={'X-API-Key': raw})
    assert r.status_code == 422


def test_ingest_rate_limit_per_key(client, api_key):
    raw, _ = api_key
    headers = {'X-API-Key': raw}
    empty = {'device_id': 'd', 'events': []}
    for _ in range(_INGEST_MAX):
        assert client.post('/api/v1/events/batch', json=empty, headers=headers).status_code == 202
    assert client.post('/api/v1/events/batch', json=empty, headers=headers).status_code == 429


def test_event_list_filters(client, api_key, make_user, login):
    raw, _ = api_key
    headers = {'X-API-Key': raw}
    client.post('/api/v1/events/batch', json=_batch(2, action='blocked', severity='critical'), headers=headers)
    client.post('/api/v1/events/batch', json=_batch(1, action='allowed', severity='low'), headers=headers)

    auth = login(make_user(UserRole.itsec).username)
    get = lambda q='': client.get(f'/api/v1/admin/events{q}', headers=auth)

    assert get().json()['total'] == 3
    assert get('?action=allowed').json()['total'] == 1
    assert get('?severity=critical').json()['total'] == 2
    assert get('?action=bogus').status_code == 422
    assert get('?limit=5000').status_code == 422
    assert get().json()['items'][0]['host'] == 'chat.example.com'
