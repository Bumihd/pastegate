"""Add cleartext host column to paste_events

Revision ID: 0004_event_host
Revises: 0003_event_indexes
Create Date: 2026-06-20 00:00:00

Optional cleartext hostname (domain only, not the path) for triage in the
dashboard ("which app did the event come from"). The full URL stays anonymous
via url_hash. On fresh installs create_all() already creates the column from
the model; this migration adds it on existing systems.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0004_event_host'
down_revision: Union[str, None] = '0003_event_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('paste_events', sa.Column('host', sa.String(length=255), nullable=True))
    op.create_index('ix_paste_events_host', 'paste_events', ['host'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_paste_events_host', table_name='paste_events', if_exists=True)
    op.drop_column('paste_events', 'host')
