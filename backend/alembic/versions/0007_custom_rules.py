"""Organisation-defined custom detection rules

Revision ID: 0007_custom_rules
Revises: 0006_app_settings
Create Date: 2026-09-26 00:00:00

Custom detection rules defined in the dashboard (keywords, prefix tokens,
patterns, regex). The extension receives them via /config as pre-compiled JS
regexes. The "severity" enum type already exists (event_findings).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0007_custom_rules'
down_revision: Union[str, None] = '0006_app_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    severity = postgresql.ENUM('critical', 'high', 'medium', 'low', name='severity', create_type=False)
    op.create_table(
        'custom_rules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('description', sa.String(length=200), nullable=True),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('config', postgresql.JSONB(), nullable=False),
        sa.Column('severity', severity, nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table('custom_rules')
