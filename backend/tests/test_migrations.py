# Alembic chain against the real schema: a fresh database must reach head with
# `alembic upgrade head` alone, and the result must match the models exactly.
# Plus the three installation paths of app.cli migrate: fresh native install,
# update of an old native install (stamped), update of an old container (unstamped).

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import ProgrammingError

from app.cli import main as cli
from app.core import migrations
from app.core.database import Base, engine
from app.main import app


def _schema_diff() -> list:
    with engine.connect() as conn:
        return compare_metadata(MigrationContext.configure(conn, opts={'compare_type': True}), Base.metadata)


def _drop_version_table() -> None:
    with engine.begin() as conn:
        conn.execute(text('DROP TABLE IF EXISTS alembic_version'))


def _create_all_except(*names: str) -> None:
    """Schema as create_all() of an older version produced it (unstamped)."""
    Base.metadata.create_all(bind=engine, tables=[t for t in Base.metadata.sorted_tables if t.name not in names])


@pytest.fixture
def empty_db():
    """Drop the session schema (incl. enum types); restore create_all() afterwards."""
    Base.metadata.drop_all(bind=engine)
    _drop_version_table()
    yield
    Base.metadata.drop_all(bind=engine)
    _drop_version_table()
    Base.metadata.create_all(bind=engine)


def test_upgrade_head_on_empty_database(empty_db):
    command.upgrade(migrations.alembic_config(), 'head')
    assert migrations.current_revision() == migrations.head_revision()
    assert _schema_diff() == []


def test_baseline_is_noop_on_unstamped_existing_schema(empty_db):
    """Unstamped installation with tables: 0001 must not touch them."""
    Base.metadata.create_all(bind=engine)
    command.upgrade(migrations.alembic_config(), '0001_baseline')
    assert migrations.current_revision() == '0001_baseline'
    assert _schema_diff() == []


# ── app.cli migrate: installation paths ──────────────────────────

def test_fresh_native_install(empty_db, capsys):
    assert cli(['migrate']) == 0
    assert migrations.current_revision() == migrations.head_revision()
    assert _schema_diff() == []
    assert 'stamped' not in capsys.readouterr().out


def test_update_old_native_install(empty_db):
    """Native alpha.3: create_all + 'stamp head' back then = 0009, no setup_state."""
    _create_all_except('setup_state')
    command.stamp(migrations.alembic_config(), '0009_access_tokens')
    adopted, before = migrations.migrate()
    assert adopted is None and before == '0009_access_tokens'
    assert migrations.current_revision() == migrations.head_revision()
    assert _schema_diff() == []


def test_update_old_container_without_revision(empty_db, capsys):
    """Container alpha.3: schema from create_all at startup, never stamped."""
    _create_all_except('setup_state')
    assert cli(['migrate']) == 0
    assert 'stamped as 0009_access_tokens' in capsys.readouterr().out
    assert migrations.current_revision() == migrations.head_revision()
    assert _schema_diff() == []


def test_update_older_container_missing_columns(empty_db):
    """Container whose schema dates from before 0004 (no host column)."""
    command.upgrade(migrations.alembic_config(), '0003_event_indexes')
    _drop_version_table()
    adopted, _ = migrations.migrate()
    assert adopted == '0001_baseline'
    assert migrations.current_revision() == migrations.head_revision()
    assert _schema_diff() == []


def test_inconsistent_container_schema_fails_loudly(empty_db):
    """Later table present, earlier column missing: the upgrade must fail, not guess."""
    command.upgrade(migrations.alembic_config(), '0003_event_indexes')
    _drop_version_table()
    Base.metadata.tables['access_tokens'].create(bind=engine)
    with pytest.raises(ProgrammingError, match='access_tokens.*already exists'):
        migrations.migrate()


def test_second_migrate_is_noop(empty_db):
    migrations.migrate()
    adopted, before = migrations.migrate()
    assert adopted is None and before == migrations.head_revision()


# ── App start ─────────────────────────────────────────────────────

def test_app_start_does_not_create_tables(empty_db):
    with TestClient(app):
        pass
    assert set(inspect(engine).get_table_names()) - {'alembic_version'} == set()
