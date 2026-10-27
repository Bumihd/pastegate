"""Setup completion state

Revision ID: 0010_setup_state
Revises: 0009_access_tokens
Create Date: 2026-10-27 00:00:00

Single-row table (id=1) that records whether the setup wizard has been
completed. Once completed, all /api/v1/setup/* endpoints answer 403, even
with a valid setup token. Existing installations with an active admin are
marked as completed.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0010_setup_state'
down_revision: Union[str, None] = '0009_access_tokens'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # if_not_exists: the app no longer runs create_all() at startup, but servers
    # that ran an earlier development build of this release may have the table already
    op.create_table(
        'setup_state',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('completed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        if_not_exists=True,
    )
    op.execute("""
        INSERT INTO setup_state (id, completed, completed_at)
        SELECT 1, true, now()
        WHERE EXISTS (SELECT 1 FROM users WHERE role::text = 'admin' AND is_active)
        ON CONFLICT (id) DO UPDATE
            SET completed = true, completed_at = COALESCE(setup_state.completed_at, now())
    """)


def downgrade() -> None:
    op.drop_table('setup_state')
