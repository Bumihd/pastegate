"""Baseline – initial schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-04-27 00:00:00

Creates the schema as it was before 0002, but ONLY on an empty database (no
tables apart from alembic_version). That makes `alembic upgrade head` work on a
fresh database: 0001 builds the baseline, 0002–head add the later changes.

On every other database this migration does nothing, exactly as before:
- Installations created with create_all() are stamped at a later revision and
  never run 0001 again.
- An unstamped installation with tables (e.g. container, schema from
  create_all at startup) must first be stamped at the revision its schema
  corresponds to – for create_all() of the current models that is head.

The table definitions below are frozen: they describe the baseline and must not
follow later model changes – those belong in new migrations.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001_baseline'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names()) - {'alembic_version'}
    if tables:
        return  # existing schema (create_all) – nothing to do

    # Enum values are stored by member name. 'blocked_hard' follows in 0002.
    userrole = sa.Enum('itsec', 'infosec', 'admin', 'management', 'dataprivacy', 'viewer', name='userrole')
    severity = sa.Enum('critical', 'high', 'medium', 'low', name='severity')
    eventaction = sa.Enum('blocked', 'allowed', name='eventaction')

    op.create_table(
        'users',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('username', sa.String(64), nullable=False, unique=True),
        sa.Column('email', sa.String(256), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(256), nullable=False),
        sa.Column('role', userrole, nullable=False),
        sa.Column('totp_secret', sa.String(64), nullable=True),
        sa.Column('totp_enabled', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', TS, nullable=False),
        sa.Column('last_login', TS, nullable=True),
    )
    op.create_table(
        'api_keys',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('key_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', TS, nullable=False),
        sa.Column('last_used', TS, nullable=True),
    )
    op.create_table(
        'devices',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('device_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('first_seen', TS, nullable=False),
        sa.Column('last_seen', TS, nullable=False),
        sa.Column('event_count', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(128), nullable=True),
    )
    op.create_table(
        'paste_events',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('device_id', UUID, sa.ForeignKey('devices.id'), nullable=False),
        sa.Column('ts', TS, nullable=False),
        sa.Column('received_at', TS, nullable=False),
        sa.Column('url_hash', sa.String(64), nullable=False),
        sa.Column('action', eventaction, nullable=False),
    )
    op.create_table(
        'event_findings',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('event_id', UUID, sa.ForeignKey('paste_events.id'), nullable=False),
        sa.Column('rule_id', sa.String(64), nullable=False),
        sa.Column('severity', severity, nullable=False),
    )
    op.create_table(
        'audit_log',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('ts', TS, nullable=False),
        sa.Column('actor_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('approver_id', UUID, sa.ForeignKey('users.id'), nullable=True),
        sa.Column('action', sa.String(64), nullable=False),
        sa.Column('target_hash', sa.String(64), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
    )
    op.create_table(
        'domain_rules',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('pattern', sa.String(253), nullable=False),
        sa.Column('mode', sa.String(16), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', TS, nullable=False),
        sa.UniqueConstraint('pattern', name='uq_domain_rules_pattern'),
    )
    op.create_table(
        'viewer_device_assignments',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('device_id', UUID, sa.ForeignKey('devices.id'), nullable=False),
        sa.Column('assigned_at', TS, nullable=False),
        sa.Column('assigned_by', UUID, sa.ForeignKey('users.id'), nullable=True),
        sa.Column('note', sa.String(256), nullable=True),
        sa.UniqueConstraint('user_id', 'device_id', name='uq_viewer_device'),
    )
    op.create_table(
        'revoked_tokens',
        sa.Column('jti', sa.String(64), primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('revoked_at', TS, nullable=False),
        sa.Column('expires_at', TS, nullable=False),
    )


def downgrade() -> None:
    # Intentionally a no-op: on existing installations 'downgrade base' must
    # never drop the production schema.
    pass
