# app/core/config.py
# All configuration values come from environment variables or the .env file.
# Never hardcode secrets in the source code.

from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        case_sensitive=False,
    )

    # Database
    database_url: str = 'postgresql://pastegate:changeme@localhost:5432/pastegate'

    # Security
    secret_key: str = 'CHANGE_THIS_IN_PRODUCTION'
    hmac_salt: str  = 'CHANGE_THIS_IN_PRODUCTION'  # Used for the device hash
    algorithm: str  = 'HS256'
    access_token_expire_minutes: int = 60

    # Server
    host: str  = '127.0.0.1'
    port: int  = 8000
    debug: bool = False
    # Evaluated by uvicorn itself (proxy headers); only declared here so the
    # variable is allowed in .env.
    forwarded_allow_ips: str = '127.0.0.1'

    # Public server URL (for the extension builder)
    server_url: str = 'https://pastegate.example.com'

    # Azure SSO (OIDC)
    azure_tenant_id:     str = ''
    azure_client_id:     str = ''
    azure_client_secret: str = ''

    # LDAP / Active Directory
    ldap_host:          str = ''
    ldap_port:          int = 636
    ldap_base_dn:       str = ''
    ldap_bind_dn:       str = ''
    ldap_bind_password: str = ''
    ldap_user_attr:     str = 'sAMAccountName'

    # Event retention (days)
    event_retention_days: int = 90
    # Devices without a report for X days are deleted with all their data (0 = off)
    device_retention_days: int = 30

    # Default language as long as nothing is set in app_settings
    default_lang: str = 'en'


_DEFAULT_SECRET = 'CHANGE_THIS_IN_PRODUCTION'


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    using_defaults = s.secret_key == _DEFAULT_SECRET or s.hmac_salt == _DEFAULT_SECRET
    if using_defaults:
        if not s.debug:
            # In production a default secret/salt is a security failure
            # (predictable JWT signatures / device hashes) – abort hard.
            raise RuntimeError(
                'SECRET_KEY/HMAC_SALT are set to default values. This is not allowed '
                'in production (DEBUG=false) - set both in .env '
                '(64 random hex characters each).'
            )
        import warnings
        warnings.warn(
            'SECRET_KEY/HMAC_SALT use default values - only acceptable for development (DEBUG=true).',
            RuntimeWarning, stacklevel=2
        )
    return s
