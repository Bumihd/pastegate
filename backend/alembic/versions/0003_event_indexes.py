"""Add indexes on hot event columns

Revision ID: 0003_event_indexes
Revises: 0002_blocked_hard
Create Date: 2026-06-20 00:00:00

The stats/events queries filter and sort on paste_events.ts,
paste_events.action and paste_events.device_id as well as event_findings.event_id;
the startup cleanup uses revoked_tokens.expires_at. Without indexes these
queries turn into full table scans as volume grows.

On fresh installs create_all() already creates the indexes from the model
(index=True); this migration adds them on existing systems. CONCURRENTLY is
intentionally NOT used here (runs inside the Alembic transaction); for very large
existing tables, consider running CREATE INDEX CONCURRENTLY manually.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0003_event_indexes'
down_revision: Union[str, None] = '0002_blocked_hard'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_paste_events_ts', 'paste_events', ['ts'], if_not_exists=True)
    op.create_index('ix_paste_events_action', 'paste_events', ['action'], if_not_exists=True)
    op.create_index('ix_paste_events_device_id', 'paste_events', ['device_id'], if_not_exists=True)
    op.create_index('ix_event_findings_event_id', 'event_findings', ['event_id'], if_not_exists=True)
    op.create_index('ix_revoked_tokens_expires_at', 'revoked_tokens', ['expires_at'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_revoked_tokens_expires_at', table_name='revoked_tokens', if_exists=True)
    op.drop_index('ix_event_findings_event_id', table_name='event_findings', if_exists=True)
    op.drop_index('ix_paste_events_device_id', table_name='paste_events', if_exists=True)
    op.drop_index('ix_paste_events_action', table_name='paste_events', if_exists=True)
    op.drop_index('ix_paste_events_ts', table_name='paste_events', if_exists=True)
