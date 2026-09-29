# app/models/models.py

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Enums ─────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    itsec       = 'itsec'
    infosec     = 'infosec'
    admin       = 'admin'
    management  = 'management'
    dataprivacy = 'dataprivacy'
    viewer      = 'viewer'


class Severity(str, enum.Enum):
    critical = 'critical'
    high     = 'high'
    medium   = 'medium'
    low      = 'low'


class EventAction(str, enum.Enum):
    blocked      = 'blocked'
    blocked_hard = 'blocked_hard'  # hard_block domain: warning without bypass
    allowed      = 'allowed'       # user chose "Paste anyway"


# ── User ──────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = 'users'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    username:      Mapped[str]  = mapped_column(String(64), unique=True, nullable=False)
    email:         Mapped[str]  = mapped_column(String(256), unique=True, nullable=False)
    password_hash: Mapped[str]  = mapped_column(String(256), nullable=False)
    role:          Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.viewer
    )
    totp_secret:   Mapped[str | None]  = mapped_column(String(64), nullable=True)
    totp_enabled:  Mapped[bool] = mapped_column(Boolean, default=False)
    is_active:     Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:    Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    last_login:    Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # TOTP brute-force protection – in the DB so it applies across all workers/replicas
    totp_failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default='0', nullable=False)
    totp_locked_until:    Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    api_keys: Mapped[list['ApiKey']] = relationship(back_populates='user', cascade='all, delete-orphan')


# ── API-Key ───────────────────────────────────────────────────────

class ApiKey(Base):
    __tablename__ = 'api_keys'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id:    Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False)
    name:       Mapped[str]  = mapped_column(String(128), nullable=False)
    key_hash:   Mapped[str]  = mapped_column(String(64), unique=True, nullable=False)
    is_active:  Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Deploy keys (created by the extension builder) reference their base key.
    # Revoking the base key also revokes all derived deploy keys.
    parent_id:  Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey('api_keys.id', ondelete='SET NULL', name='fk_api_keys_parent_id'), nullable=True, index=True
    )

    user: Mapped['User'] = relationship(back_populates='api_keys')


# ── Personal API token (reporting) ────────────────────────────────
# Every dashboard user can create their own read-only tokens for /api/v1/data/*
# (Grafana, Jira, BI …). Only the HMAC hash is stored; the token inherits its
# user's role and never returns real names.

class AccessToken(Base):
    __tablename__ = 'access_tokens'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id:    Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    name:       Mapped[str]  = mapped_column(String(128), nullable=False)
    token_hash: Mapped[str]  = mapped_column(String(64), unique=True, nullable=False)
    is_active:  Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped['User'] = relationship()


# ── Device ────────────────────────────────────────────────────────

class Device(Base):
    __tablename__ = 'devices'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # The HMAC hash of the device ID – never the raw UUID
    device_hash:  Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    first_seen:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    event_count:  Mapped[int] = mapped_column(Integer, default=0)

    # Optional manual assignment by an admin
    label:        Mapped[str | None] = mapped_column(String(128), nullable=True)
    # AES-GCM-encrypted identity from the extension – cleartext only for itsec/infosec (audited)
    identity_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    events: Mapped[list['PasteEvent']] = relationship(back_populates='device', cascade='all, delete-orphan')


# ── PasteEvent ────────────────────────────────────────────────────

class PasteEvent(Base):
    __tablename__ = 'paste_events'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    device_id:  Mapped[uuid.UUID] = mapped_column(ForeignKey('devices.id'), nullable=False, index=True)
    ts:         Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    received_at:Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)
    url_hash:   Mapped[str]       = mapped_column(String(64), nullable=False)
    # Cleartext hostname (domain only, not the path) – optional, for triage.
    # The full URL stays anonymous via url_hash.
    host:       Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    action:     Mapped[EventAction] = mapped_column(Enum(EventAction), nullable=False, index=True)

    device: Mapped['Device'] = relationship(back_populates='events')
    findings: Mapped[list['EventFinding']] = relationship(back_populates='event', cascade='all, delete-orphan')


# ── EventFinding ──────────────────────────────────────────────────

class EventFinding(Base):
    __tablename__ = 'event_findings'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('paste_events.id'), nullable=False, index=True)
    rule_id:  Mapped[str]       = mapped_column(String(64), nullable=False)
    severity: Mapped[Severity]  = mapped_column(Enum(Severity), nullable=False)

    event: Mapped['PasteEvent'] = relationship(back_populates='findings')


# ── AuditLog ──────────────────────────────────────────────────────
# Every real-name lookup of a device hash is logged here (GDPR).

class AuditLog(Base):
    __tablename__ = 'audit_log'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ts:          Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)
    actor_id:    Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False)
    approver_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    action:      Mapped[str]       = mapped_column(String(64), nullable=False)
    target_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason:      Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address:  Mapped[str | None] = mapped_column(String(45), nullable=True)

# ── DomainRule ────────────────────────────────────────────────────
# Domain rules configured by the admin.
# mode='warn'       → default: warning + bypass possible
# mode='hard_block' → warning without bypass – no "Paste anyway"
# mode='allow'      → no scan, no warning – domain allowed by the admin

class DomainRule(Base):
    __tablename__ = 'domain_rules'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pattern:    Mapped[str]  = mapped_column(String(253), nullable=False)
    mode:       Mapped[str]  = mapped_column(String(16),  nullable=False, default='warn')
    is_active:  Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint('pattern', name='uq_domain_rules_pattern'),
    )

# ── ViewerDeviceAssignment ────────────────────────────────────────
# Links a viewer user to one or more device hashes.
# The device hash is transmitted automatically when the extension logs in.
# Admins can manage assignments manually.

class ViewerDeviceAssignment(Base):
    __tablename__ = 'viewer_device_assignments'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id:     Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False)
    device_id:   Mapped[uuid.UUID] = mapped_column(ForeignKey('devices.id'), nullable=False)
    assigned_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    note:        Mapped[str | None] = mapped_column(String(256), nullable=True)

    __table_args__ = (
        UniqueConstraint('user_id', 'device_id', name='uq_viewer_device'),
    )

# ── RevokedToken ──────────────────────────────────────────────────
# JWT revocation: after a password change and explicit logout,
# token IDs (jti) are stored here.
# Cleanup: entries can be deleted automatically once the token has expired.

class RateLimitHit(Base):
    """Fixed-window counter for rate limits, shared across all workers/replicas."""
    __tablename__ = 'rate_limit_hits'

    bucket:       Mapped[str]      = mapped_column(String(160), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count:        Mapped[int]      = mapped_column(Integer, nullable=False, default=0)


class RevokedToken(Base):
    __tablename__ = 'revoked_tokens'

    jti:        Mapped[str]      = mapped_column(String(64), primary_key=True)
    user_id:    Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False)
    revoked_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False, index=True)


# ── AppSetting ────────────────────────────────────────────────────
# Organisation-wide settings as key/value (e.g. default_lang).

class AppSetting(Base):
    __tablename__ = 'app_settings'

    key:        Mapped[str]      = mapped_column(String(64), primary_key=True)
    value:      Mapped[str]      = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ── CustomRule ────────────────────────────────────────────────────
# Organisation-defined detection rules (dashboard). The server compiles each
# rule into a JS regex (app/core/custom_rules.py); the extension only receives that.

class CustomRule(Base):
    __tablename__ = 'custom_rules'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name:        Mapped[str]        = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    kind:        Mapped[str]        = mapped_column(String(16), nullable=False)  # keywords|prefix|pattern|regex
    config:      Mapped[dict]       = mapped_column(JSONB, nullable=False)
    severity:    Mapped[Severity]   = mapped_column(Enum(Severity), nullable=False)
    is_active:   Mapped[bool]       = mapped_column(Boolean, default=True, server_default='true', nullable=False)
    created_at:  Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:  Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    created_by:  Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL'), nullable=True
    )
