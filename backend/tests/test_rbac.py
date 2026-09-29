import pytest

from app.models.models import UserRole

R = UserRole
ALL = set(R)
ITSEC = {R.itsec, R.infosec, R.admin}

# (method, path, allowed roles) – mirrors the require_roles() guards in the backend
MATRIX = [
    ('GET',  '/api/v1/admin/stats',               ITSEC | {R.management, R.dataprivacy}),
    ('GET',  '/api/v1/admin/events',              ITSEC),
    ('GET',  '/api/v1/admin/devices',             ITSEC),
    ('GET',  '/api/v1/admin/audit-log',           ITSEC | {R.dataprivacy}),
    ('GET',  '/api/v1/admin/api-keys',            {R.admin}),
    ('GET',  '/api/v1/admin/users',               {R.admin}),
    ('GET',  '/api/v1/admin/viewer/events',       ITSEC | {R.viewer}),
    ('GET',  '/api/v1/admin/viewer-assignments',  {R.admin, R.itsec, R.infosec}),
    ('GET',  '/api/v1/admin/domain-rules',        {R.admin, R.itsec, R.infosec}),
    ('GET',  '/api/v1/admin/custom-rules',        {R.admin, R.itsec, R.infosec}),
    ('GET',  '/api/v1/admin/settings',            {R.admin}),
]


@pytest.mark.parametrize('method,path,allowed', MATRIX, ids=[m[1] for m in MATRIX])
def test_role_matrix(client, make_user, login, method, path, allowed):
    for role in ALL:
        user = make_user(role)
        headers = login(user.username)
        r = client.request(method, path, headers=headers)
        if role in allowed:
            assert r.status_code == 200, f'{role.value} should be allowed {path}: {r.status_code} {r.text}'
        else:
            assert r.status_code == 403, f'{role.value} must not be allowed {path}: {r.status_code}'


@pytest.mark.parametrize('method,path,_', MATRIX, ids=[m[1] for m in MATRIX])
def test_unauthenticated_rejected(client, method, path, _):
    assert client.request(method, path).status_code == 401


def test_rate_limit_does_not_leak_between_tests(client):
    # Sanity: TRUNCATE also resets the rate-limit counters
    r = client.post('/api/v1/auth/login', json={'username': 'x', 'password': 'y'})
    assert r.status_code == 401
