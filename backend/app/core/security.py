# app/core/security.py

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

settings = get_settings()

# bcrypt processes at most 72 bytes. Older versions truncated silently, bcrypt >= 5
# raises an error – truncating explicitly keeps existing hashes compatible.
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:_BCRYPT_MAX_BYTES], bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode()[:_BCRYPT_MAX_BYTES], hashed.encode())
    except ValueError:
        # Not a valid bcrypt hash
        return False


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> tuple[str, str]:
    """Return (token, jti). The jti is needed for revocation."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    jti = secrets.token_hex(16)
    token = jwt.encode(
        {'sub': subject, 'exp': expire, 'jti': jti},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    return token, jti


def decode_access_token(token: str) -> tuple[str | None, str | None]:
    """Return (subject, jti)."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload.get('sub'), payload.get('jti')
    except Exception:
        return None, None





def hash_device_id(device_id: str) -> str:
    """
    Create a deterministic, irreversible hash of the device ID.
    Same device ID → always the same hash.
    Cannot be reversed without the HMAC salt (which only lives on the server).
    """
    return hmac.new(
        settings.hmac_salt.encode(),
        device_id.encode(),
        hashlib.sha256,
    ).hexdigest()


def generate_api_key() -> str:
    """Generate a secure API key in the format pg_<64 hex chars>."""
    return f'pg_{secrets.token_hex(32)}'


ACCESS_TOKEN_PREFIX = 'pgr_'


def generate_access_token() -> str:
    """Personal, read-only reporting token in the format pgr_<64 hex chars>."""
    return f'{ACCESS_TOKEN_PREFIX}{secrets.token_hex(32)}'


def hash_api_key(key: str) -> str:
    """
    HMAC-SHA256 of the API key with SECRET_KEY as salt.
    Safer than plain SHA-256 – prevents rainbow-table attacks after a DB leak.
    Deterministic: same key + same secret = same hash.
    """
    return hmac.new(
        settings.secret_key.encode(),
        key.encode(),
        hashlib.sha256,
    ).hexdigest()


# ── Device identity (encrypted at rest) ───────────────────────────
# The extension transmits the identity (e.g. profile email). Only AES-GCM
# ciphertext is stored; it is decrypted only for itsec/infosec and every access
# is audited. The key is derived from HMAC_SALT – which must stay stable anyway,
# otherwise all device hashes change.

def _identity_key() -> bytes:
    return hmac.new(settings.hmac_salt.encode(), b'pastegate-identity-v1', hashlib.sha256).digest()


def encrypt_identity(identity: str) -> str:
    nonce = secrets.token_bytes(12)
    ct = AESGCM(_identity_key()).encrypt(nonce, identity.encode(), b'device-identity')
    return base64.b64encode(nonce + ct).decode()


def decrypt_identity(blob: str | None) -> str | None:
    if not blob:
        return None
    try:
        raw = base64.b64decode(blob)
        return AESGCM(_identity_key()).decrypt(raw[:12], raw[12:], b'device-identity').decode()
    except (InvalidTag, ValueError):
        return None
