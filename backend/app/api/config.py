# app/api/config.py
# Delivers the organisation configuration to the extension.
# Currently: domain rules (hard_block / warn), custom detection rules + default language.
# Extensible for future config fields without an extension update.

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.custom_rules import compiled_or_none, public_rule_id
from app.core.app_settings import get_default_lang
from app.core.database import get_db
from app.core.deps import get_api_key, require_roles
from app.models.models import ApiKey, CustomRule, DomainRule, UserRole

router = APIRouter(prefix='/api/v1', tags=['config'])


# ── Schemas ───────────────────────────────────────────────────────

class DomainRuleOut(BaseModel):
    pattern: str
    mode:    str  # 'warn' | 'hard_block'


class CustomRuleOut(BaseModel):
    rule_id:     str
    name:        str
    description: str | None
    severity:    str
    pattern:     str
    flags:       str


class ConfigResponse(BaseModel):
    domain_rules: list[DomainRuleOut]
    default_lang: str
    custom_rules: list[CustomRuleOut] = []


class DomainRuleIn(BaseModel):
    pattern: str = Field(min_length=1, max_length=253)
    mode:    str = Field(pattern='^(warn|hard_block|allow)$')


# ── Extension endpoint ────────────────────────────────────────────

@router.get('/config', response_model=ConfigResponse)
def get_config(
    db:      Session = Depends(get_db),
    api_key: ApiKey  = Depends(get_api_key),
):
    """
    Fetched by the extension every 60 minutes.
    Returns the current domain rules, active custom rules and the default language.
    No auth token required – the API key is sufficient.
    """
    rules = db.query(DomainRule).filter_by(is_active=True).all()
    custom = []
    for rule in db.query(CustomRule).filter_by(is_active=True).order_by(CustomRule.created_at).all():
        compiled = compiled_or_none(rule)
        if compiled:
            custom.append(CustomRuleOut(
                rule_id=public_rule_id(rule), name=rule.name, description=rule.description,
                severity=rule.severity.value, pattern=compiled.pattern, flags=compiled.flags,
            ))
    return ConfigResponse(
        domain_rules=[DomainRuleOut(pattern=r.pattern, mode=r.mode) for r in rules],
        default_lang=get_default_lang(db),
        custom_rules=custom,
    )


# ── Admin endpoints (dashboard, phase 2) ──────────────────────────

@router.get('/admin/domain-rules')
def list_domain_rules(
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(UserRole.admin, UserRole.itsec, UserRole.infosec)),
):
    rules = db.query(DomainRule).all()
    return [
        {
            'id':        str(r.id),
            'pattern':   r.pattern,
            'mode':      r.mode,
            'is_active': r.is_active,
            'created_at': r.created_at.isoformat(),
        }
        for r in rules
    ]


@router.post('/admin/domain-rules', status_code=201)
def create_domain_rule(
    body: DomainRuleIn,
    db:   Session = Depends(get_db),
    user  = Depends(require_roles(UserRole.admin, UserRole.itsec, UserRole.infosec)),
):
    # Check for duplicates
    existing = db.query(DomainRule).filter_by(pattern=body.pattern).first()
    if existing:
        existing.mode      = body.mode
        existing.is_active = True
        db.commit()
        return {'id': str(existing.id), 'updated': True}

    rule = DomainRule(pattern=body.pattern, mode=body.mode)
    db.add(rule)
    db.commit()
    return {'id': str(rule.id), 'created': True}


@router.delete('/admin/domain-rules/{rule_id}', status_code=204)
def delete_domain_rule(
    rule_id: str,
    db:      Session = Depends(get_db),
    user     = Depends(require_roles(UserRole.admin, UserRole.itsec, UserRole.infosec)),
):
    rule = db.query(DomainRule).filter_by(id=rule_id).first()
    if rule:
        rule.is_active = False
        db.commit()
