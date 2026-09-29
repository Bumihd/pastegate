# app/core/deps.py
# FastAPI dependencies for auth and RBAC

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.i18n import _
from app.core import ratelimit
from app.core.security import ACCESS_TOKEN_PREFIX, decode_access_token, hash_api_key
from app.models.models import AccessToken, ApiKey, User, UserRole

# ── API key auth (for the extension) ──────────────────────────────

api_key_header = APIKeyHeader(name='X-API-Key', auto_error=False)


def get_api_key(
    key: Annotated[str | None, Security(api_key_header)],
    db: Session = Depends(get_db),
) -> ApiKey:
    if not key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_('auth.api_key_missing'))

    key_hash = hash_api_key(key)
    api_key = db.scalar(
        select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
    )
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_('auth.api_key_invalid'))

    # update last_used
    api_key.last_used = datetime.now(timezone.utc)
    db.commit()

    return api_key


# ── JWT auth (for the dashboard) ──────────────────────────────────

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_('auth.not_authenticated'))

    username, jti = decode_access_token(credentials.credentials)
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_('auth.token_invalid'))

    # Revocation check
    from app.models.models import RevokedToken
    if jti:
        revoked = db.scalar(select(RevokedToken).where(RevokedToken.jti == jti))
        if revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_('auth.token_revoked'))

    user = db.scalar(select(User).where(User.username == username, User.is_active == True))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_('auth.user_not_found'))

    return user


# ── Reporting API: personal token OR dashboard JWT ────────────────
# Personal tokens (pgr_…) are only valid here – get_current_user rejects them
# because they are not JWTs. So a token can only read what /data/* returns.

_DATA_MAX, _DATA_WINDOW = 120, 60


def get_data_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Session = Depends(get_db),
) -> User:
    if not credentials or not credentials.credentials.startswith(ACCESS_TOKEN_PREFIX):
        return get_current_user(credentials, db)

    now = datetime.now(timezone.utc)
    token = db.scalar(select(AccessToken).where(
        AccessToken.token_hash == hash_api_key(credentials.credentials),
        AccessToken.is_active == True,  # noqa: E712
    ))
    if not token or (token.expires_at and token.expires_at <= now) or not token.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_('auth.token_invalid'))

    if ratelimit.hit(db, f'data:{token.id}', _DATA_MAX, _DATA_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_('data.rate_limited'),
            headers={'Retry-After': str(_DATA_WINDOW)},
        )
    token.last_used = now
    db.commit()
    return token.user


# ── Role guards ───────────────────────────────────────────────────

def require_roles(*roles: UserRole):
    """Dependency factory: only allows users with one of the given roles."""
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=_('auth.forbidden_role', roles=', '.join(r.value for r in roles)),
            )
        return user
    return _check


# Predefined guards
RequireITSec      = Depends(require_roles(UserRole.itsec, UserRole.infosec))
RequireAdmin      = Depends(require_roles(UserRole.admin))
RequireManagement = Depends(require_roles(UserRole.management, UserRole.itsec, UserRole.infosec))
RequirePrivacy    = Depends(require_roles(UserRole.dataprivacy, UserRole.itsec, UserRole.infosec))
RequireAnyDash    = Depends(require_roles(*list(UserRole)))
