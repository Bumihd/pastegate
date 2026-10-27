# app/core/migrations.py
# Alembic is the only source of the schema. The app no longer runs create_all()
# at startup; the schema is brought to head by `python -m app.cli migrate`
# (container start, installer) or `alembic upgrade head`.
#
# Unstamped databases: container installations before 0.1.0-alpha.4 never ran
# Alembic – their schema came from create_all() of whatever version was running.
# adopt_unstamped() derives the revision from the schema itself and stamps it,
# so that `upgrade head` only runs what is actually missing.

import os
import time

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.exc import OperationalError

from app.core.database import engine

_ALEMBIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'alembic')


def _has_column(conn: Connection, table: str, column: str) -> bool:
    insp = inspect(conn)
    return insp.has_table(table) and column in {c['name'] for c in insp.get_columns(table)}


# Migrations that cannot run twice (add_column, create_table without
# if_not_exists), in order, each with a check whether its change is present.
# All other migrations are idempotent and may simply run again.
_NON_IDEMPOTENT = [
    ('0004_event_host',      lambda c: _has_column(c, 'paste_events', 'host')),
    ('0005_shared_state',    lambda c: _has_column(c, 'users', 'totp_failed_attempts')),
    ('0008_device_identity', lambda c: _has_column(c, 'devices', 'identity_enc')),
    ('0009_access_tokens',   lambda c: inspect(c).has_table('access_tokens')),
]


def alembic_config() -> Config:
    # No ini file: env.py then leaves logging alone; the URL comes from the settings.
    cfg = Config()
    cfg.set_main_option('script_location', _ALEMBIC_DIR)
    return cfg


def head_revision() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def current_revision() -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def detect_revision(conn: Connection) -> str:
    """Revision of an unstamped schema: the last non-idempotent migration whose
    change is present, as long as all earlier ones are present too. Everything
    after it runs again on upgrade (idempotent) or for the first time."""
    revision = '0001_baseline'
    for rev, present in _NON_IDEMPOTENT:
        if not present(conn):
            break
        revision = rev
    return revision


def adopt_unstamped() -> str | None:
    """Stamp an unstamped database that already has tables. Returns the stamped
    revision, or None if nothing was to do (stamped already, or empty)."""
    with engine.connect() as conn:
        if MigrationContext.configure(conn).get_current_revision() is not None:
            return None
        if not set(inspect(conn).get_table_names()) - {'alembic_version'}:
            return None  # empty database: 0001 builds the schema
        revision = detect_revision(conn)
    command.stamp(alembic_config(), revision)
    return revision


def migrate(wait_seconds: int = 60) -> tuple[str | None, str]:
    """Adopt an unstamped schema if needed, then upgrade to head. Waits for the
    database (container start: the DB container may still be starting).
    Returns (adopted revision or None, revision before the upgrade)."""
    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            adopted = adopt_unstamped()
            break
        except OperationalError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)
    before = current_revision()
    command.upgrade(alembic_config(), 'head')
    return adopted, before
