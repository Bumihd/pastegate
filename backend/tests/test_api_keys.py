import io
import re
import zipfile

from app.models.models import ApiKey, UserRole


def _build(client, headers, key_id, **extra):
    r = client.post('/api/v1/admin/build-extension', headers=headers,
                    json={'lang': 'en', 'key_id': key_id, 'server_url': 'https://ps.example.com', **extra})
    assert r.status_code == 200, r.text
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        config = zf.read('extension/config.js').decode()
    return re.search(r'"(pg_[0-9a-f]{64})"', config).group(1)


def test_build_embeds_working_deploy_key(client, make_user, login):
    headers = login(make_user(UserRole.admin).username)
    base = client.post('/api/v1/admin/api-keys', headers=headers, json={'name': 'Sales'}).json()

    raw = _build(client, headers, base['id'])
    assert raw != base['key']
    assert client.get('/api/v1/health', headers={'X-API-Key': raw}).status_code == 200

    keys = client.get('/api/v1/admin/api-keys', headers=headers).json()
    deploy = [k for k in keys if k['parent_id'] == base['id']]
    assert len(deploy) == 1 and deploy[0]['name'].startswith('Sales (')


def test_build_from_deploy_key_attaches_to_root(client, make_user, login, db):
    headers = login(make_user(UserRole.admin).username)
    base = client.post('/api/v1/admin/api-keys', headers=headers, json={'name': 'HQ'}).json()
    _build(client, headers, base['id'])
    first_deploy = db.query(ApiKey).filter(ApiKey.parent_id == base['id']).one()

    _build(client, headers, str(first_deploy.id))
    assert db.query(ApiKey).filter(ApiKey.parent_id == base['id']).count() == 2


def test_replace_previous_revokes_older_deploy_keys(client, make_user, login):
    headers = login(make_user(UserRole.admin).username)
    base = client.post('/api/v1/admin/api-keys', headers=headers, json={'name': 'Ops'}).json()
    old = _build(client, headers, base['id'])
    new = _build(client, headers, base['id'], replace_previous=True)

    assert client.get('/api/v1/health', headers={'X-API-Key': old}).status_code == 401
    assert client.get('/api/v1/health', headers={'X-API-Key': new}).status_code == 200
    assert client.get('/api/v1/health', headers={'X-API-Key': base['key']}).status_code == 200


def test_revoking_base_cascades(client, make_user, login):
    headers = login(make_user(UserRole.admin).username)
    base = client.post('/api/v1/admin/api-keys', headers=headers, json={'name': 'Pilot'}).json()
    deploys = [_build(client, headers, base['id']) for _ in range(2)]

    assert client.delete(f'/api/v1/admin/api-keys/{base["id"]}', headers=headers).status_code == 204
    for raw in [base['key'], *deploys]:
        assert client.get('/api/v1/health', headers={'X-API-Key': raw}).status_code == 401


def test_build_rejects_unknown_key(client, make_user, login):
    headers = login(make_user(UserRole.admin).username)
    r = client.post('/api/v1/admin/build-extension', headers=headers,
                    json={'lang': 'en', 'key_id': '00000000-0000-0000-0000-000000000000'})
    assert r.status_code == 404
    r = client.post('/api/v1/admin/build-extension', headers=headers, json={'lang': 'en', 'key_id': 'not-a-uuid'})
    assert r.status_code == 422


def test_build_zip_excludes_tests(client, make_user, login):
    headers = login(make_user(UserRole.admin).username)
    base = client.post('/api/v1/admin/api-keys', headers=headers, json={'name': 'Z'}).json()
    r = client.post('/api/v1/admin/build-extension', headers=headers,
                    json={'lang': 'en', 'key_id': base['id'], 'server_url': 'https://ps.example.com'})
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert 'extension/manifest.json' in names and 'extension/custom-rules.js' in names
    assert not any('/tests/' in n or n.endswith('.md') for n in names)
    assert names.count('extension/config.js') == 1
