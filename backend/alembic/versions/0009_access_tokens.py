"""Personal read-only API tokens

Revision ID: 0009_access_tokens
Revises: 0008_device_identity
Create Date: 2026-09-27 00:00:00

Every dashboard user can create their own tokens for the reporting API
(/api/v1/data/*). Only the HMAC hash of the token is stored.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0009_access_tokens'
down_revision: Union[str, None] = '0008_device_identity'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'access_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False, unique=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_used', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_access_tokens_user_id', 'access_tokens', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_access_tokens_user_id', table_name='access_tokens')
    op.drop_table('access_tokens')
