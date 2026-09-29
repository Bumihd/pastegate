"""Shared rate-limit/lockout state + deploy-key parent

Revision ID: 0005_shared_state
Revises: 0004_event_host
Create Date: 2026-09-26 00:00:00

Rate limits and TOTP lockout used to live in RAM per worker process and thus
applied neither across multiple workers nor across multiple replicas. Both now
live in PostgreSQL. Additionally, deploy keys created by the extension builder
reference their base key (grouping + cascading revocation).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0005_shared_state'
down_revision: Union[str, None] = '0004_event_host'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'rate_limit_hits',
        sa.Column('bucket', sa.String(length=160), primary_key=True),
        sa.Column('window_start', sa.DateTime(timezone=True), primary_key=True),
        sa.Column('count', sa.Integer(), nullable=False, server_default='0'),
        if_not_exists=True,
    )
    op.add_column('users', sa.Column('totp_failed_attempts', sa.Integer(),
                                     nullable=False, server_default='0'))
    op.add_column('users', sa.Column('totp_locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('api_keys', sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_api_keys_parent_id', 'api_keys', 'api_keys',
                          ['parent_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_api_keys_parent_id', 'api_keys', ['parent_id'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_api_keys_parent_id', table_name='api_keys', if_exists=True)
    op.drop_constraint('fk_api_keys_parent_id', 'api_keys', type_='foreignkey')
    op.drop_column('api_keys', 'parent_id')
    op.drop_column('users', 'totp_locked_until')
    op.drop_column('users', 'totp_failed_attempts')
    op.drop_table('rate_limit_hits')
