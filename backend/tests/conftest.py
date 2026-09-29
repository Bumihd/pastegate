# Test setup: real PostgreSQL database (ON CONFLICT, UUID, enums).
#
#   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/pastegate_test python -m pytest
#
# The database is wiped for every test – hence only databases with the suffix "_test".

import os
import uuid

import pytest

TEST_DB = os.environ.get('TEST_DATABASE_URL', '')
if not TEST_DB:
    pytest.exit('TEST_DATABASE_URL is not set.', returncode=2)
if not TEST_DB.rsplit('/', 1)[-1].endswith('_test'):
    pytest.exit('TEST_DATABASE_URL must point to a database with the suffix "_test".', returncode=2)

os.environ['DATABASE_URL'] = TEST_DB
os.environ['SECRET_KEY'] = 'test-secret-' + 'a' * 52
os.environ['HMAC_SALT'] = 'test-salt-' + 'b' * 54
os.environ['DEBUG'] = 'false'
os.environ['SETUP_TOKEN_PATH'] = ''

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.api import setup as setup_api  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import generate_api_key, hash_api_key, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models.models import ApiKey, User, UserRole  # noqa: E402

PASSWORD = 'correct-horse-battery'


@pytest.fixture(scope='session', autouse=True)
def _schema():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_db(tmp_path, monkeypatch):
    tables = ', '.join(t.name for t in reversed(Base.metadata.sorted_tables))
    with engine.begin() as conn:
        conn.execute(text(f'TRUNCATE {tables} CASCADE'))
    # Never read the setup token from the real install dir
    monkeypatch.setattr(setup_api, '_TOKEN_CANDIDATES', [str(tmp_path / 'SETUP_TOKEN')])
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def make_user(db):
    def _make(role: UserRole = UserRole.admin, username: str | None = None, **kw) -> User:
        name = username or f'{role.value}-{uuid.uuid4().hex[:6]}'
        user = User(username=name, email=f'{name}@example.com',
                    password_hash=hash_password(PASSWORD), role=role, **kw)
        db.add(user)
        db.commit()
        return user
    return _make


@pytest.fixture
def login(client):
    def _login(username: str, password: str = PASSWORD, **extra) -> dict:
        r = client.post('/api/v1/auth/login', json={'username': username, 'password': password, **extra})
        assert r.status_code == 200, r.text
        return {'Authorization': f'Bearer {r.json()["access_token"]}'}
    return _login


@pytest.fixture
def api_key(db, make_user):
    admin = make_user(UserRole.admin)
    raw = generate_api_key()
    key = ApiKey(user_id=admin.id, name='Test', key_hash=hash_api_key(raw))
    db.add(key)
    db.commit()
    return raw, key
