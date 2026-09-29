"""Encrypted device identity

Revision ID: 0008_device_identity
Revises: 0007_custom_rules
Create Date: 2026-09-27 00:00:00

The extension transmits the device identity (profile email or MDM value).
Only AES-GCM ciphertext is stored; cleartext is available only to itsec/infosec (every access is audit-logged).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0008_device_identity'
down_revision: Union[str, None] = '0007_custom_rules'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('devices', sa.Column('identity_enc', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('devices', 'identity_enc')
