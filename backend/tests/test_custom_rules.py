import uuid
from datetime import datetime, timezone

import pytest

from app.api import custom_rules as custom_rules_api
from app.core.custom_rules import RuleError, compile_rule, python_regex
from app.models.models import AuditLog, CustomRule, EventFinding, UserRole

BASE = '/api/v1/admin/custom-rules'


def _matches(kind, config, text):
    rule = compile_rule(kind, config)
    return [m.group(0) for m in python_regex(rule.pattern, rule.flags).finditer(text)]


def _error(kind, config) -> RuleError:
    with pytest.raises(RuleError) as exc:
        compile_rule(kind, config)
    return exc.value


# ── Compiler: keywords ────────────────────────────────────────────

def test_keywords_pattern():
    rule = compile_rule('keywords', {'words': ['secret', 'Project Phoenix', 'C++']})
    assert rule.pattern == r'(?:\bProject\s+Phoenix\b|\bsecret\b|\bC\+\+)'
    assert rule.flags == 'gi'
    assert rule.config == {'words': ['secret', 'Project Phoenix', 'C++'],
                           'case_sensitive': False, 'whole_word': True}


def test_keywords_matching():
    cfg = {'words': ['secret', 'Project Phoenix']}
    assert _matches('keywords', cfg, 'This is SECRET.') == ['SECRET']
    assert _matches('keywords', cfg, 'Status: project\nphoenix running') == ['project\nphoenix']
    assert _matches('keywords', cfg, 'very secretive') == []
    assert _matches('keywords', {**cfg, 'whole_word': False}, 'very secretive') == ['secret']


def test_keywords_case_sensitive():
    rule = compile_rule('keywords', {'words': ['ACME'], 'case_sensitive': True})
    assert rule.flags == 'g'
    assert _matches('keywords', {'words': ['ACME'], 'case_sensitive': True}, 'acme ACME') == ['ACME']


def test_keywords_escaping():
    cfg = {'words': ['a.b (x)', '[rel]']}
    assert _matches('keywords', cfg, 'aXb (x) a.b (x)') == ['a.b (x)']
    assert _matches('keywords', cfg, 'r [rel] e') == ['[rel]']


def test_keywords_dedupe():
    rule = compile_rule('keywords', {'words': ['Foo', 'foo', 'FOO']})
    assert rule.pattern == r'(?:\bFoo\b)'


# ── Compiler: prefix ──────────────────────────────────────────────

def test_prefix_pattern():
    rule = compile_rule('prefix', {'prefix': 'acme_', 'charset': 'alnum', 'min_length': 20, 'max_length': 24})
    assert rule.pattern == r'\bacme_[A-Za-z0-9]{20,24}(?![A-Za-z0-9_])'
    assert rule.flags == 'g'


def test_prefix_matching():
    cfg = {'prefix': 'acme_', 'charset': 'alnum', 'min_length': 20, 'max_length': 24}
    token = 'acme_' + 'Ab1' * 7  # 21 characters after the prefix
    assert _matches('prefix', cfg, f'key={token};') == [token]
    assert _matches('prefix', cfg, 'acme_' + 'a' * 19) == []          # too short
    assert _matches('prefix', cfg, 'acme_' + 'a' * 30) == []          # too long
    assert _matches('prefix', cfg, 'xacme_' + 'a' * 20) == []         # in the middle of a word
    assert _matches('prefix', cfg, 'ACME_' + 'a' * 20) == []          # case-sensitive


@pytest.mark.parametrize('charset,good,bad', [
    ('hex', 'deadBEEF', 'deadbeefx'),
    ('digits', '12345678', '1234567a'),
    ('base64url', 'ab-_CD12', 'ab-_CD12-'),
])
def test_prefix_charsets(charset, good, bad):
    cfg = {'prefix': 'tk-', 'charset': charset, 'min_length': 8, 'max_length': 8}
    assert _matches('prefix', cfg, f' tk-{good} ') == [f'tk-{good}']
    assert _matches('prefix', cfg, f' tk-{good}. ') == [f'tk-{good}']
    assert _matches('prefix', cfg, f' tk-{bad} ') == []


# ── Compiler: pattern ─────────────────────────────────────────────

def test_template_pattern():
    assert compile_rule('pattern', {'template': 'KD-######'}).pattern == r'\bKD-[0-9]{6}\b'
    assert compile_rule('pattern', {'template': 'PRJ-AAA-####'}).pattern == r'\bPRJ-[A-Z]{3}-[0-9]{4}\b'
    assert compile_rule('pattern', {'template': r'a*\#.#'}).pattern == r'\b[a-z][A-Za-z0-9]#\.[0-9]\b'


def test_template_matching():
    cfg = {'template': 'KD-######'}
    assert _matches('pattern', cfg, 'Kunde KD-123456, KD-12345, KD-1234567') == ['KD-123456']
    assert _matches('pattern', cfg, 'XKD-123456') == []
    cfg = {'template': 'PRJ-AAA-####'}
    assert _matches('pattern', cfg, 'PRJ-ABC-2024 prj-abc-2024 PRJ-AbC-2024') == ['PRJ-ABC-2024']


def test_template_errors():
    assert _error('pattern', {'template': 'KD-'}).key == 'custom_rules.template_no_placeholder'
    assert _error('pattern', {'template': '##\\'}).key == 'custom_rules.template_trailing_escape'
    assert _error('pattern', {'template': '#' * 65}).key == 'custom_rules.field_too_long'


# ── Compiler: regex ───────────────────────────────────────────────

def test_regex_ok():
    rule = compile_rule('regex', {'pattern': r'\bINT-\d{4}\b', 'case_sensitive': False})
    assert (rule.pattern, rule.flags) == (r'\bINT-\d{4}\b', 'gi')
    assert _matches('regex', {'pattern': r'\bINT-\d{4}\b'}, 'INT-2024 int-2024') == ['INT-2024']
    # Common, harmless expressions must pass
    compile_rule('regex', {'pattern': r'(?:\d{1,3}\.){3}\d{1,3}'})
    compile_rule('regex', {'pattern': r'[A-Za-z0-9._%+-]+@example\.com'})
    compile_rule('regex', {'pattern': r'(?<![A-Z])ZX(?:foo|bar)+'})


@pytest.mark.parametrize('pattern,key', [
    (r'(a+)+b', 'custom_rules.regex_nested_quantifier'),
    (r'(a*)*b', 'custom_rules.regex_nested_quantifier'),
    (r'(?:\w+\s?)+$', 'custom_rules.regex_nested_quantifier'),
    (r'(a|a)*b', 'custom_rules.regex_ambiguous_alternation'),
    (r'(ab|a[bc])*d', 'custom_rules.regex_ambiguous_alternation'),
    (r'"(\\.|[^"])*"', 'custom_rules.regex_ambiguous_alternation'),
    (r'(x)\1', 'custom_rules.regex_backreference'),
    (r'(x)\k<n>', 'custom_rules.regex_backreference'),
    (r'(x)(?P=n)', 'custom_rules.regex_backreference'),
    (r'a*', 'custom_rules.regex_empty_match'),
    (r'x?', 'custom_rules.regex_empty_match'),
    (r'^', 'custom_rules.regex_empty_match'),
    (r'\b', 'custom_rules.regex_empty_match'),
    (r'(?=a)', 'custom_rules.regex_empty_match'),
    (r'(?i)secret', 'custom_rules.regex_inline_flags'),
    (r'(?s:a.b)', 'custom_rules.regex_inline_flags'),
    (r'\Asecret', 'custom_rules.regex_unsupported'),
    (r'secret\Z', 'custom_rules.regex_unsupported'),
    (r'(?P<n>x)', 'custom_rules.regex_unsupported'),
    (r'(?#c)x', 'custom_rules.regex_unsupported'),
    (r'x{,3}', 'custom_rules.regex_unsupported'),
    (r'[]a]', 'custom_rules.regex_unsupported'),
    (r'(abc', 'custom_rules.regex_invalid'),
    (r'.*.*.*=', 'custom_rules.regex_too_slow'),
])
def test_regex_rejected(pattern, key):
    assert _error('regex', {'pattern': pattern}).key == key


def test_regex_too_long():
    assert _error('regex', {'pattern': 'a' * 513}).key == 'custom_rules.field_too_long'


def test_regex_extra_flags_rejected():
    err = _error('regex', {'pattern': 'abc', 'flags': 'gm'})
    assert (err.key, err.params) == ('custom_rules.field_unknown', {'field': 'flags'})


# ── Validation ────────────────────────────────────────────────────

@pytest.mark.parametrize('kind,config,key,params', [
    ('nope', {}, 'custom_rules.field_choice', {'field': 'kind'}),
    ('keywords', [], 'custom_rules.config_not_object', {}),
    ('keywords', {}, 'custom_rules.field_missing', {'field': 'words'}),
    ('keywords', {'words': []}, 'custom_rules.list_too_short', {'field': 'words'}),
    ('keywords', {'words': ['x'] * 51}, 'custom_rules.list_too_long', {'field': 'words'}),
    ('keywords', {'words': ['ok', 'y' * 65]}, 'custom_rules.field_too_long', {'field': 'words[1]'}),
    ('keywords', {'words': ['   ']}, 'custom_rules.keyword_blank', {}),
    ('keywords', {'words': ['a'], 'case_sensitive': 'yes'}, 'custom_rules.field_type', {'field': 'case_sensitive'}),
    ('keywords', {'words': 'abc'}, 'custom_rules.field_type', {'field': 'words'}),
    ('prefix', {'prefix': 'x', 'charset': 'alnum', 'min_length': 8, 'max_length': 8},
     'custom_rules.field_too_short', {'field': 'prefix'}),
    ('prefix', {'prefix': 'xx', 'charset': 'b64', 'min_length': 8, 'max_length': 8},
     'custom_rules.field_choice', {'field': 'charset'}),
    ('prefix', {'prefix': 'xx', 'charset': 'hex', 'min_length': 3, 'max_length': 8},
     'custom_rules.field_too_small', {'field': 'min_length'}),
    ('prefix', {'prefix': 'xx', 'charset': 'hex', 'min_length': 8, 'max_length': 257},
     'custom_rules.field_too_large', {'field': 'max_length'}),
    ('prefix', {'prefix': 'xx', 'charset': 'hex', 'min_length': 10, 'max_length': 8},
     'custom_rules.max_below_min', {}),
    ('prefix', {'prefix': 'xx', 'charset': 'hex', 'min_length': '8', 'max_length': 8},
     'custom_rules.field_type', {'field': 'min_length'}),
])
def test_validation_errors(kind, config, key, params):
    err = _error(kind, config)
    assert err.key == key
    for k, v in params.items():
        assert err.params[k] == v


# ── API ───────────────────────────────────────────────────────────

KEYWORDS_BODY = {'name': 'Project names', 'description': 'Internal code names', 'kind': 'keywords',
                 'config': {'words': ['Phoenix', 'Nebula']}, 'severity': 'high'}


@pytest.fixture
def admin_headers(make_user, login):
    user = make_user(UserRole.admin)
    return user, login(user.username)


def test_crud_and_audit(client, db, admin_headers):
    user, headers = admin_headers
    r = client.post(BASE, headers=headers, json=KEYWORDS_BODY)
    assert r.status_code == 201, r.text
    rule = r.json()
    rid = uuid.UUID(rule['id'])
    assert rule['rule_id'] == f'custom_{rid.hex[:8]}'
    assert rule['pattern'] == r'(?:\bPhoenix\b|\bNebula\b)' and rule['flags'] == 'gi'
    assert rule['config'] == {'words': ['Phoenix', 'Nebula'], 'case_sensitive': False, 'whole_word': True}
    assert rule['is_active'] is True and rule['severity'] == 'high' and rule['kind'] == 'keywords'
    assert set(rule) == {'id', 'rule_id', 'name', 'description', 'kind', 'config', 'severity',
                         'is_active', 'pattern', 'flags', 'created_at', 'updated_at'}
    assert db.get(CustomRule, rid).created_by == user.id

    r2 = client.post(BASE, headers=headers, json={
        'name': 'Customer number', 'kind': 'pattern', 'config': {'template': 'KD-######'}, 'severity': 'medium'})
    assert r2.status_code == 201
    listed = client.get(BASE, headers=headers).json()
    assert [x['name'] for x in listed] == ['Customer number', 'Project names']

    r = client.put(f'{BASE}/{rid}', headers=headers, json={
        **KEYWORDS_BODY, 'name': 'Tokens', 'kind': 'prefix', 'severity': 'critical', 'is_active': False,
        'config': {'prefix': 'acme_', 'charset': 'hex', 'min_length': 16, 'max_length': 16}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['id'] == str(rid) and body['kind'] == 'prefix' and body['is_active'] is False
    assert body['pattern'] == r'\bacme_[0-9a-fA-F]{16,16}(?![A-Za-z0-9_])' and body['flags'] == 'g'

    assert client.delete(f'{BASE}/{rid}', headers=headers).status_code == 204
    assert client.delete(f'{BASE}/{rid}', headers=headers).status_code == 404
    assert client.put(f'{BASE}/{rid}', headers=headers, json=KEYWORDS_BODY).status_code == 404
    assert len(client.get(BASE, headers=headers).json()) == 1

    logs = db.query(AuditLog).filter_by(target_hash=rid.hex).all()
    assert sorted(l.action for l in logs) == ['custom_rule_create', 'custom_rule_delete', 'custom_rule_update']
    assert all(l.actor_id == user.id for l in logs)


def test_create_invalid_config_translated(client, admin_headers):
    _user, headers = admin_headers
    body = {**KEYWORDS_BODY, 'kind': 'regex', 'config': {'pattern': '(a+)+$'}}
    r = client.post(BASE, headers={**headers, 'Accept-Language': 'de'}, json=body)
    assert r.status_code == 422
    assert r.json()['detail'] == 'Verschachtelte Quantoren wie (a+)+ sind nicht erlaubt (Gefahr von ReDoS).'
    r = client.post(BASE, headers={**headers, 'Accept-Language': 'fr'}, json={**body, 'kind': 'bogus'})
    assert r.status_code == 422
    assert r.json()['detail'].startswith('Valeur invalide pour « kind »')
    r = client.post(BASE, headers=headers, json={**KEYWORDS_BODY, 'severity': 'extreme'})
    assert r.status_code == 422
    r = client.post(BASE, headers=headers, json={**KEYWORDS_BODY, 'name': '   '})
    assert r.status_code == 422
    assert client.get(BASE, headers=headers).json() == []


def test_update_invalid_uuid(client, admin_headers):
    _user, headers = admin_headers
    assert client.put(f'{BASE}/not-a-uuid', headers=headers, json=KEYWORDS_BODY).status_code == 422


def test_preview(client, admin_headers):
    _user, headers = admin_headers
    r = client.post(f'{BASE}/preview', headers=headers,
                    json={'kind': 'pattern', 'config': {'template': 'PRJ-AAA-####'}})
    assert r.status_code == 200
    assert r.json() == {'pattern': r'\bPRJ-[A-Z]{3}-[0-9]{4}\b', 'flags': 'g'}

    r = client.post(f'{BASE}/preview', headers={**headers, 'Accept-Language': 'es'},
                    json={'kind': 'regex', 'config': {'pattern': 'a*'}})
    assert r.status_code == 422
    assert r.json()['detail'] == 'La expresión coincide con texto vacío y se activaría en todas partes.'

    r = client.post(f'{BASE}/preview', headers={**headers, 'Accept-Language': 'en'},
                    json={'kind': 'prefix', 'config': {'prefix': 'ab', 'charset': 'hex', 'min_length': 4}})
    assert r.status_code == 422
    assert r.json()['detail'] == 'Field "max_length" is missing.'


def test_limit(client, admin_headers, monkeypatch):
    _user, headers = admin_headers
    monkeypatch.setattr(custom_rules_api, 'MAX_CUSTOM_RULES', 2)
    for _i in range(2):
        assert client.post(BASE, headers=headers, json=KEYWORDS_BODY).status_code == 201
    r = client.post(BASE, headers={**headers, 'Accept-Language': 'de'}, json=KEYWORDS_BODY)
    assert r.status_code == 409
    assert r.json()['detail'] == 'Maximal 2 eigene Regeln pro Organisation erlaubt.'


def test_limit_default():
    assert custom_rules_api.MAX_CUSTOM_RULES == 200


@pytest.mark.parametrize('role', [UserRole.admin, UserRole.itsec, UserRole.infosec])
def test_rbac_allowed(client, make_user, login, role):
    headers = login(make_user(role).username)
    assert client.get(BASE, headers=headers).status_code == 200
    assert client.post(BASE, headers=headers, json=KEYWORDS_BODY).status_code == 201


@pytest.mark.parametrize('role', [UserRole.viewer, UserRole.management, UserRole.dataprivacy])
def test_rbac_forbidden(client, make_user, login, role, db):
    headers = login(make_user(role).username)
    rid = uuid.uuid4()
    assert client.get(BASE, headers=headers).status_code == 403
    assert client.post(BASE, headers=headers, json=KEYWORDS_BODY).status_code == 403
    assert client.post(f'{BASE}/preview', headers=headers,
                       json={'kind': 'pattern', 'config': {'template': '###'}}).status_code == 403
    assert client.put(f'{BASE}/{rid}', headers=headers, json=KEYWORDS_BODY).status_code == 403
    assert client.delete(f'{BASE}/{rid}', headers=headers).status_code == 403
    assert db.query(CustomRule).count() == 0


def test_requires_auth(client):
    assert client.get(BASE).status_code == 401
    assert client.post(f'{BASE}/preview', json={'kind': 'pattern', 'config': {'template': '#'}}).status_code == 401


# ── Delivery to the extension ─────────────────────────────────────

def test_config_delivers_active_rules(client, api_key, admin_headers):
    raw, _key = api_key
    _user, headers = admin_headers
    active = client.post(BASE, headers=headers, json=KEYWORDS_BODY).json()
    client.post(BASE, headers=headers, json={**KEYWORDS_BODY, 'name': 'Off', 'is_active': False})

    r = client.get('/api/v1/config', headers={'X-API-Key': raw})
    assert r.status_code == 200
    assert r.json()['custom_rules'] == [{
        'rule_id': active['rule_id'], 'name': 'Project names', 'description': 'Internal code names',
        'severity': 'high', 'pattern': active['pattern'], 'flags': 'gi',
    }]


def test_config_without_custom_rules(client, api_key):
    raw, _key = api_key
    assert client.get('/api/v1/config', headers={'X-API-Key': raw}).json()['custom_rules'] == []


def test_event_with_custom_rule_id(client, api_key, db):
    raw, _key = api_key
    ts = datetime.now(timezone.utc).isoformat()
    r = client.post('/api/v1/events/batch', headers={'X-API-Key': raw}, json={
        'device_id': str(uuid.uuid4()),
        'events': [{'ts': ts, 'url_hash': 'a' * 64, 'host': 'chat.example.com', 'action': 'blocked',
                    'findings': [{'rule_id': 'custom_0a1b2c3d', 'severity': 'high'}]}],
    })
    assert r.status_code == 202, r.text
    assert db.query(EventFinding).filter_by(rule_id='custom_0a1b2c3d').count() == 1
