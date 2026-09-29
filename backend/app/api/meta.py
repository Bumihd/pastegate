# app/api/meta.py
# Public metadata for the dashboard/login page (no auth).

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.app_settings import get_default_lang
from app.core.database import get_db
from app.core.i18n import SUPPORTED_LANGS

router = APIRouter(prefix='/api/v1', tags=['meta'])


@router.get('/meta')
def get_meta(db: Session = Depends(get_db)):
    return {'default_lang': get_default_lang(db), 'languages': list(SUPPORTED_LANGS)}
