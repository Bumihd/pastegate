# app/api/sso.py
# Azure SSO (OIDC) + LDAP authentication backend implementation

import time
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.i18n import _
from app.core.security import create_access_token, hash_password
from app.models.models import AuditLog, User, UserRole

router = APIRouter(prefix='/api/v1/auth', tags=['sso'])
settings = get_settings()

# ── Azure SSO state store (DB-backed, persistent, TTL) ────────────
# Prevents CSRF, works with multiple workers and after restarts
STATE_TTL = 300  # 5 minutes


def _azure_role_from_groups(groups: list[str]) -> UserRole:
    """Map Azure AD groups to Pastegate roles."""
    mapping = {
        'pastegate-itsec':        UserRole.itsec,
        'pastegate-infosec':      UserRole.infosec,
        'pastegate-admin':        UserRole.admin,
        'pastegate-management':   UserRole.management,
        'pastegate-dataprivacy':  UserRole.dataprivacy,
    }
    for group in groups:
        if group in mapping:
            return mapping[group]
    return UserRole.viewer


# ── Azure OIDC ────────────────────────────────────────────────────

@router.get('/azure/login')
async def azure_login(request: Request):
    """Start the Azure OIDC flow – redirects to the Microsoft login page."""
    tenant_id   = getattr(settings, 'azure_tenant_id', '')
    client_id   = getattr(settings, 'azure_client_id', '')

    if not tenant_id or not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_('sso.azure_not_configured'),
        )

    import base64, time as _time
    ts = str(_time.time())
    sig = hmac.new(settings.secret_key.encode(), ts.encode(), hashlib.sha256).hexdigest()[:16]
    state = base64.b64encode(ts.encode()).rstrip(b'=').decode() + '.' + sig

    redirect_uri = f"{settings.server_url}/api/v1/auth/azure/callback"
    params = {
        'client_id':     client_id,
        'response_type': 'code',
        'redirect_uri':  redirect_uri,
        'response_mode': 'query',
        'scope':         'openid profile email https://graph.microsoft.com/GroupMember.Read.All',
        'state':         state,
    }
    auth_url = (
        f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize?"
        + "&".join(f"{k}={v}" for k, v in params.items())
    )
    return RedirectResponse(auth_url)


@router.get('/azure/callback')
async def azure_callback(code: str, state: str, db: Session = Depends(get_db)):
    """Azure OIDC callback – exchanges the code for a token, creates/updates the user."""
    tenant_id     = getattr(settings, 'azure_tenant_id', '')
    client_id     = getattr(settings, 'azure_client_id', '')
    client_secret = getattr(settings, 'azure_client_secret', '')
    redirect_uri  = f"{settings.server_url}/api/v1/auth/azure/callback"

    # Verify state with TTL (state is verified as an HMAC over a timestamp)
    # Simplified: the state is treated as a signed token
    # Format: base64(timestamp):hmac(secret, timestamp)
    import base64
    try:
        parts = state.split('.')
        if len(parts) != 2:
            raise ValueError
        ts_b64, sig = parts
        ts = float(base64.b64decode(ts_b64 + '==').decode())
        expected = hmac.new(settings.secret_key.encode(), str(ts).encode(), hashlib.sha256).hexdigest()[:16]
        if sig != expected:
            raise ValueError
        if time.time() - ts > STATE_TTL:
            raise ValueError('State expired')
    except Exception:
        raise HTTPException(status_code=400, detail=_('sso.invalid_state'))

    # Token endpoint
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={
                'grant_type':    'authorization_code',
                'client_id':     client_id,
                'client_secret': client_secret,
                'code':          code,
                'redirect_uri':  redirect_uri,
            },
        )
        if not token_res.is_success:
            raise HTTPException(status_code=400, detail=_('sso.token_exchange_failed'))
        tokens = token_res.json()

    access_token = tokens.get('access_token', '')

    # User info + groups from Microsoft Graph
    async with httpx.AsyncClient() as client:
        me_res = await client.get(
            'https://graph.microsoft.com/v1.0/me',
            headers={'Authorization': f'Bearer {access_token}'},
        )
        groups_res = await client.get(
            'https://graph.microsoft.com/v1.0/me/memberOf',
            headers={'Authorization': f'Bearer {access_token}'},
        )

    if not me_res.is_success:
        raise HTTPException(status_code=400, detail=_('sso.profile_failed'))

    me = me_res.json()
    email    = me.get('mail') or me.get('userPrincipalName', '')
    username = email.split('@')[0]

    groups: list[str] = []
    if groups_res.is_success:
        groups = [
            g.get('displayName', '')
            for g in groups_res.json().get('value', [])
            if g.get('displayName', '').startswith('pastegate-')
        ]

    role = _azure_role_from_groups(groups)

    # User upsert
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(secrets.token_hex(32)),  # no local login
            role=role,
            is_active=True,
        )
        db.add(user)
    else:
        user.role      = role
        user.is_active = True

    db.add(AuditLog(actor_id=user.id, action='azure_sso_login'))
    db.commit()

    jwt, _jti = create_access_token(subject=user.username)

    # Redirect to the dashboard with the token
    return RedirectResponse(
        f"{settings.server_url}/auth/callback?token={jwt}&role={role.value}"
    )


# ── LDAP Authentication ───────────────────────────────────────────

class LdapLoginRequest(BaseModel):
    username: str
    password: str


@router.post('/ldap/login')
async def ldap_login(body: LdapLoginRequest, db: Session = Depends(get_db)):
    """LDAP login – authenticates against Active Directory."""
    ldap_host   = getattr(settings, 'ldap_host', '')
    ldap_port   = int(getattr(settings, 'ldap_port', 636))
    ldap_base   = getattr(settings, 'ldap_base_dn', '')
    ldap_bind   = getattr(settings, 'ldap_bind_dn', '')
    ldap_pw     = getattr(settings, 'ldap_bind_password', '')
    ldap_attr   = getattr(settings, 'ldap_user_attr', 'sAMAccountName')

    if not ldap_host or not ldap_base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_('sso.ldap_not_configured'),
        )

    try:
        import ldap3
        from ldap3 import Server, Connection, ALL, NTLM, SIMPLE
        from ldap3.core.exceptions import LDAPBindError, LDAPException
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_('sso.ldap_lib_missing'),
        )

    use_ssl = ldap_port == 636
    server  = ldap3.Server(ldap_host, port=ldap_port, use_ssl=use_ssl, get_info=ALL)

    # Step 1: service account bind
    try:
        svc_conn = ldap3.Connection(server, user=ldap_bind, password=ldap_pw,
                                    authentication=ldap3.SIMPLE, auto_bind=True)
    except Exception:
        raise HTTPException(status_code=503, detail=_('sso.ldap_bind_failed'))

    # Step 2: look up the user
    svc_conn.search(
        search_base=ldap_base,
        search_filter=f'({ldap_attr}={ldap3.utils.conv.escape_filter_chars(body.username)})',
        attributes=['mail', 'memberOf', 'displayName', ldap_attr],
    )

    if not svc_conn.entries:
        raise HTTPException(status_code=401, detail=_('auth.invalid_credentials'))

    entry   = svc_conn.entries[0]
    user_dn = entry.entry_dn
    email   = str(entry.mail) if 'mail' in entry else f'{body.username}@local'

    # Step 3: user bind (password check)
    try:
        user_conn = ldap3.Connection(server, user=user_dn, password=body.password,
                                     authentication=ldap3.SIMPLE, auto_bind=True)
    except Exception:
        raise HTTPException(status_code=401, detail=_('auth.invalid_credentials'))

    # Groups → role
    member_of: list[str] = []
    if 'memberOf' in entry:
        for dn in entry.memberOf:
            # CN=pastegate-itsec,OU=... → pastegate-itsec
            cn = str(dn).split(',')[0].replace('CN=', '')
            member_of.append(cn)

    role = _azure_role_from_groups(member_of)

    # User upsert
    user = db.scalar(select(User).where(User.username == body.username))
    if not user:
        user = User(
            username=body.username,
            email=email,
            password_hash=hash_password(secrets.token_hex(32)),
            role=role,
            is_active=True,
        )
        db.add(user)
    else:
        user.role      = role
        user.is_active = True

    db.add(AuditLog(actor_id=user.id, action='ldap_login'))
    db.commit()

    jwt, _jti = create_access_token(subject=user.username)
    return {
        'access_token':  jwt,
        'token_type':    'bearer',
        'role':          role.value,
        'totp_required': False,
    }
