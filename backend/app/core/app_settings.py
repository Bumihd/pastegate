# app/core/app_settings.py
# Organisation-wide settings (app_settings table).

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.i18n import FALLBACK_LANG, SUPPORTED_LANGS, normalize_lang
from app.models.models import AppSetting

DEFAULT_LANG_KEY = 'default_lang'


def get_setting(db: Session, key: str) -> str | None:
    row = db.get(AppSetting, key)
    return row.value if row else None


def set_setting(db: Session, key: str, value: str) -> None:
    """Write the value; does not commit."""
    row = db.get(AppSetting, key)
    if row:
        row.value = value
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.add(AppSetting(key=key, value=value))


def get_default_lang(db: Session) -> str:
    """DB setting, else DEFAULT_LANG from .env, else FALLBACK_LANG."""
    stored = get_setting(db, DEFAULT_LANG_KEY)
    if stored in SUPPORTED_LANGS:
        return stored
    return normalize_lang(get_settings().default_lang) or FALLBACK_LANG


def set_default_lang(db: Session, lang: str) -> None:
    if lang not in SUPPORTED_LANGS:
        raise ValueError(lang)
    set_setting(db, DEFAULT_LANG_KEY, lang)
