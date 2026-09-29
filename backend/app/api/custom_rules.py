# app/api/custom_rules.py
# Organisation-defined detection rules (dashboard). Compilation happens server-side;
# the extension only receives pattern + flags via /config.

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.custom_rules import CompiledRule, RuleError, compile_rule
from app.core.database import get_db
from app.core.deps import require_roles
from app.core.i18n import _
from app.models.models import AuditLog, CustomRule, Severity, User, UserRole

router = APIRouter(prefix='/api/v1/admin/custom-rules', tags=['custom-rules'])

MAX_CUSTOM_RULES = 200

RequireRuleAdmin = Depends(require_roles(UserRole.admin, UserRole.itsec, UserRole.infosec))


# ── Schemas ───────────────────────────────────────────────────────
# kind/config are validated in compile_rule() so the 422 is translated.

class PreviewIn(BaseModel):
    kind:   Any = None
    config: Any = None


class CustomRuleIn(PreviewIn):
    name:        str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=200)
    severity:    Severity
    is_active:   bool = True

    @field_validator('name')
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('empty')
        return v

    @field_validator('description')
    @classmethod
    def _strip_description(cls, v: str | None) -> str | None:
        return (v.strip() or None) if v is not None else None


# ── Helpers ───────────────────────────────────────────────────────

def public_rule_id(rule: CustomRule) -> str:
    return f'custom_{rule.id.hex[:8]}'


def _compile(kind: Any, config: Any) -> CompiledRule:
    try:
        return compile_rule(kind, config)
    except RuleError as exc:
        raise HTTPException(status_code=422, detail=_(exc.key, **exc.params)) from None


def compiled_or_none(rule: CustomRule) -> CompiledRule | None:
    # Stored rules have already been validated – skip the expensive ReDoS run here
    try:
        return compile_rule(rule.kind, rule.config, check_safety=False)
    except RuleError:
        return None


def _out(rule: CustomRule) -> dict:
    compiled = compiled_or_none(rule)
    return {
        'id':          str(rule.id),
        'rule_id':     public_rule_id(rule),
        'name':        rule.name,
        'description': rule.description,
        'kind':        rule.kind,
        'config':      rule.config,
        'severity':    rule.severity.value,
        'is_active':   rule.is_active,
        'pattern':     compiled.pattern if compiled else None,
        'flags':       compiled.flags if compiled else None,
        'created_at':  rule.created_at.isoformat() if rule.created_at else None,
        'updated_at':  rule.updated_at.isoformat() if rule.updated_at else None,
    }


def _get(db: Session, rule_id: uuid.UUID) -> CustomRule:
    rule = db.get(CustomRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=_('custom_rules.not_found'))
    return rule


def _audit(db: Session, request: Request, user: User, action: str, rule: CustomRule) -> None:
    db.add(AuditLog(
        actor_id=user.id,
        action=action,
        target_hash=rule.id.hex,
        reason=f'{rule.kind}: {rule.name}',
        ip_address=request.client.host if request.client else None,
    ))


# ── Endpoints ─────────────────────────────────────────────────────

@router.get('')
def list_custom_rules(db: Session = Depends(get_db), user: User = RequireRuleAdmin):
    rules = db.scalars(select(CustomRule).order_by(CustomRule.created_at.desc())).all()
    return [_out(r) for r in rules]


@router.post('/preview')
def preview_custom_rule(body: PreviewIn, user: User = RequireRuleAdmin):
    compiled = _compile(body.kind, body.config)
    return {'pattern': compiled.pattern, 'flags': compiled.flags}


@router.post('', status_code=201)
def create_custom_rule(
    body:    CustomRuleIn,
    request: Request,
    db:      Session = Depends(get_db),
    user:    User = RequireRuleAdmin,
):
    count = db.scalar(select(func.count()).select_from(CustomRule))
    if count >= MAX_CUSTOM_RULES:
        raise HTTPException(status_code=409, detail=_('custom_rules.limit_reached', max=MAX_CUSTOM_RULES))
    compiled = _compile(body.kind, body.config)
    rule = CustomRule(
        name=body.name, description=body.description, kind=body.kind, config=compiled.config,
        severity=body.severity, is_active=body.is_active, created_by=user.id,
    )
    db.add(rule)
    db.flush()
    _audit(db, request, user, 'custom_rule_create', rule)
    db.commit()
    db.refresh(rule)
    return _out(rule)


@router.put('/{rule_id}')
def update_custom_rule(
    rule_id: uuid.UUID,
    body:    CustomRuleIn,
    request: Request,
    db:      Session = Depends(get_db),
    user:    User = RequireRuleAdmin,
):
    rule = _get(db, rule_id)
    compiled = _compile(body.kind, body.config)
    rule.name        = body.name
    rule.description = body.description
    rule.kind        = body.kind
    rule.config      = compiled.config
    rule.severity    = body.severity
    rule.is_active   = body.is_active
    _audit(db, request, user, 'custom_rule_update', rule)
    db.commit()
    db.refresh(rule)
    return _out(rule)


@router.delete('/{rule_id}', status_code=204)
def delete_custom_rule(
    rule_id: uuid.UUID,
    request: Request,
    db:      Session = Depends(get_db),
    user:    User = RequireRuleAdmin,
):
    rule = _get(db, rule_id)
    _audit(db, request, user, 'custom_rule_delete', rule)
    db.delete(rule)
    db.commit()
    return Response(status_code=204)
