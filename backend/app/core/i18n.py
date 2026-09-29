# app/core/i18n.py
# Translation of API messages. Catalogs: app/locales/<lang>.json (flat, dotted keys).
# New language: create the JSON file + add the code to SUPPORTED_LANGS. en.json is the reference.

import json
import os
from contextvars import ContextVar
from functools import lru_cache

SUPPORTED_LANGS: tuple[str, ...] = ('de', 'en', 'fr', 'es')
FALLBACK_LANG = 'en'
# For Pydantic fields (Field(pattern=...))
LANG_PATTERN = '^(' + '|'.join(SUPPORTED_LANGS) + ')$'

_LOCALES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'locales')

# Language of the current request, set by the middleware in main.py
request_lang: ContextVar[str] = ContextVar('request_lang', default=FALLBACK_LANG)


@lru_cache
def catalog(lang: str) -> dict[str, str]:
    path = os.path.join(_LOCALES_DIR, f'{lang}.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def normalize_lang(value: str | None) -> str | None:
    """'fr-CH' → 'fr'; None if not supported."""
    if not value:
        return None
    base = value.strip().lower().replace('_', '-').split('-', 1)[0]
    return base if base in SUPPORTED_LANGS else None


def parse_accept_language(header: str | None) -> str:
    """Pick the best supported language from an Accept-Language header (RFC 9110, q-values)."""
    if not header:
        return FALLBACK_LANG
    candidates: list[tuple[float, int, str]] = []
    for idx, part in enumerate(header.split(',')):
        tag, *params = [p.strip() for p in part.split(';')]
        if not tag:
            continue
        q = 1.0
        for p in params:
            name, _sep, val = p.partition('=')
            if name.strip().lower() == 'q':
                try:
                    q = float(val.strip())
                except ValueError:
                    q = 0.0
        if q <= 0:
            continue
        candidates.append((-q, idx, tag))
    for _q, _idx, tag in sorted(candidates):
        lang = normalize_lang(tag)
        if lang:
            return lang
    return FALLBACK_LANG


def translate(key: str, lang: str | None = None, **vars) -> str:
    lang = lang or request_lang.get()
    msg = catalog(lang).get(key) or catalog(FALLBACK_LANG).get(key) or key
    if vars:
        try:
            return msg.format(**vars)
        except (KeyError, IndexError, ValueError):
            return msg
    return msg


def _(key: str, **vars) -> str:
    return translate(key, None, **vars)
