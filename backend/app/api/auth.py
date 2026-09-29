# app/api/auth.py

from datetime import datetime, timedelta, timezone
from typing import Annotated

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.i18n import _
from app.core.qr import totp_qr_data_uri
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.models import AuditLog, RevokedToken, User, UserRole

router   = APIRouter(prefix='/api/v1/auth', tags=['auth'])
settings = get_settings()

# ── TOTP brute-force protection ───────────────────────────────────
# Counter + lock live on the user record → apply across all workers/replicas.
TOTP_MAX_ATTEMPTS = 5
TOTP_LOCKOUT_SECONDS = 900  # 15 minutes


def _check_totp_lockout(db: Session, user: User) -> None:
    if not user.totp_locked_until:
        return
    remaining = (user.totp_locked_until - datetime.now(timezone.utc)).total_seconds()
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_('auth.totp_locked', minutes=int(remaining / 60) + 1),
            headers={'Retry-After': str(int(remaining))},
        )
    # Lockout expired – reset
    _reset_totp_failures(db, user)


def _record_totp_failure(db: Session, user: User) -> None:
    # Increment atomically in the DB (concurrent requests across multiple workers)
    fails = db.execute(
        update(User)
        .where(User.id == user.id)
        .values(totp_failed_attempts=User.totp_failed_attempts + 1)
        .returning(User.totp_failed_attempts)
    ).scalar_one()
    if fails >= TOTP_MAX_ATTEMPTS:
        db.execute(
            update(User).where(User.id == user.id).values(
                totp_locked_until=datetime.now(timezone.utc) + timedelta(seconds=TOTP_LOCKOUT_SECONDS)
            )
        )
    db.commit()


def _reset_totp_failures(db: Session, user: User) -> None:
    user.totp_failed_attempts = 0
    user.totp_locked_until = None
    db.commit()


# ── Schemas ───────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username:  str      = Field(max_length=64)
    password:  str      = Field(max_length=256)
    totp_code: str | None = Field(default=None, max_length=6)


class LoginResponse(BaseModel):
    access_token:  str
    token_type:    str  = 'bearer'
    role:          str
    totp_required: bool = False


class TotpConfirmRequest(BaseModel):
    totp_code: str = Field(max_length=6)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=256)
    new_password:     str = Field(min_length=12, max_length=256)


# ── Endpoints ─────────────────────────────────────────────────────

@router.post('/login', response_model=LoginResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(
        select(User).where(User.username == body.username, User.is_active == True)
    )
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_('auth.invalid_credentials'),
        )

    # Check 2FA if enabled
    if user.totp_enabled:
        if not user.totp_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=_('auth.totp_misconfigured'),
            )
        if not body.totp_code:
            return LoginResponse(
                access_token='',
                role=user.role.value,
                totp_required=True,
            )

        # Brute-force check before verification
        _check_totp_lockout(db, user)

        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(body.totp_code, valid_window=1):
            _record_totp_failure(db, user)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=_('auth.totp_invalid'),
            )
        _reset_totp_failures(db, user)

    user.last_login = datetime.now(timezone.utc)
    db.add(AuditLog(
        actor_id=user.id,
        action='login',
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()

    token, jti = create_access_token(subject=user.username)
    return LoginResponse(access_token=token, role=user.role.value)


@router.post('/logout', status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """Revoke the current JWT server-side (jti in revoked_tokens)."""
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.removeprefix('Bearer ').strip()
    if token:
        _sub, jti = decode_access_token(token)
        if jti:
            expires_at = datetime.now(timezone.utc) + timedelta(
                minutes=settings.access_token_expire_minutes
            )
            # Ignore duplicate inserts (on repeated logout clicks)
            existing = db.scalar(select(RevokedToken).where(RevokedToken.jti == jti))
            if not existing:
                db.add(RevokedToken(
                    jti=jti,
                    user_id=user.id,
                    expires_at=expires_at,
                ))
                db.commit()


@router.post('/change-password', status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_('auth.current_password_wrong'))

    # Revoke the current token (invalid immediately after a password change)
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.removeprefix('Bearer ').strip()
    if token:
        _sub, jti = decode_access_token(token)
        if jti:
            expires_at = datetime.now(timezone.utc) + timedelta(
                minutes=settings.access_token_expire_minutes
            )
            existing = db.scalar(select(RevokedToken).where(RevokedToken.jti == jti))
            if not existing:
                db.add(RevokedToken(jti=jti, user_id=user.id, expires_at=expires_at))

    user.password_hash = hash_password(body.new_password)
    db.add(AuditLog(
        actor_id=user.id,
        action='change_password',
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()


@router.get('/me')
def me(user: User = Depends(get_current_user)):
    return {
        'username':     user.username,
        'email':        user.email,
        'role':         user.role.value,
        'totp_enabled': user.totp_enabled,
    }


# ── TOTP Setup ────────────────────────────────────────────────────

@router.post('/totp/setup')
def totp_setup(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """Generate a new TOTP secret and return it."""
    secret = pyotp.random_base32()
    totp   = pyotp.TOTP(secret)
    qr_uri = totp.provisioning_uri(name=user.email, issuer_name='Pastegate')
    user.totp_secret  = secret
    user.totp_enabled = False
    db.commit()
    return {'secret': secret, 'qr_uri': qr_uri, 'qr_image': totp_qr_data_uri(qr_uri)}


@router.post('/totp/confirm')
def totp_confirm(
    body: TotpConfirmRequest,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """Confirm the TOTP secret with the first code."""
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail=_('auth.totp_no_secret'))
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail=_('auth.totp_invalid_code'))
    user.totp_enabled = True
    db.commit()
    return {'totp_enabled': True}
