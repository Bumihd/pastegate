"""Baseline – initial schema (matches create_all() output)

Revision ID: 0001_baseline
Revises:
Create Date: 2026-04-27 00:00:00

This migration is intentionally empty:
- On a fresh install the schema is still created by create_all(),
  and alembic stamps "0001_baseline" as the current revision.
- Future migrations created with `alembic revision --autogenerate -m "..."`
  produce diff-based migrations from this baseline onward.
- When upgrading an old installation, `alembic stamp 0001_baseline` runs
  once — after that all further migrations are applied correctly.
"""
from typing import Sequence, Union

revision: str = '0001_baseline'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
