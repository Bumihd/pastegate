"""Organisation-wide settings (key/value)

Revision ID: 0006_app_settings
Revises: 0005_shared_state
Create Date: 2026-09-26 00:00:00

Key/value table for organisation-wide settings. First entry:
default_lang (default language for the dashboard and extension builder).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0006_app_settings'
down_revision: Union[str, None] = '0005_shared_state'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(length=64), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table('app_settings')
