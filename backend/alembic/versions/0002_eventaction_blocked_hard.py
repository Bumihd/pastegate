"""Add 'blocked_hard' value to the eventaction enum

Revision ID: 0002_blocked_hard
Revises: 0001_baseline
Create Date: 2026-06-18 00:00:00

For hard_block domains the extension reports action='blocked_hard'. Without this
enum value, event ingestion rejects the entire batch (422). On fresh installs
create_all() already creates the value from the model; this migration adds it
on existing systems.

PostgreSQL 12+ allows ALTER TYPE ... ADD VALUE inside a transaction as long as
the new value is not used in the same transaction (it is not here).
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0002_blocked_hard'
down_revision: Union[str, None] = '0001_baseline'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE eventaction ADD VALUE IF NOT EXISTS 'blocked_hard'")


def downgrade() -> None:
    # PostgreSQL does not support removing individual enum values directly.
    # Intentionally left as a no-op (the extra value is harmless).
    pass
