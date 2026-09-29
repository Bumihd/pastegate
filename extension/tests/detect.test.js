#!/usr/bin/env node
// Pastegate — Node tests for editor detection (editor-detect.js),
// detection rules (content.js) and organization rules (custom-rules.js).
// Runs without a browser: minimal element mocks instead of jsdom.
// Usage: node extension/tests/detect.test.js   (exit code 1 on failures)

const { detectEditorType, SUPPORTED_EDITORS } = require('../editor-detect.js');
const CR = require('../custom-rules.js');   // sets findRuleMatch/compileCustomRules globally for content.js
const { RULES, scanText, setCustomRules, MAX_SCAN_LEN } = require('../content.js');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}` + (ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`));
  ok ? pass++ : fail++;
}

// Minimal element mock (hasAttribute / classList.contains / parentElement)
function el({ attrs = {}, classes = [], parent = null } = {}) {
  return {
    hasAttribute: (a) => Object.prototype.hasOwnProperty.call(attrs, a),
    classList: { contains: (c) => classes.includes(c) },
    parentElement: parent,
  };
}

// ── Framework editors: detected correctly? ────────────────────────
check('lexical (data-lexical-editor)',   detectEditorType(el({ attrs: { 'data-lexical-editor': '' } })), 'lexical');
check('slate (data-slate-editor)',       detectEditorType(el({ attrs: { 'data-slate-editor': '' } })),   'slate');
check('prosemirror (.ProseMirror)',      detectEditorType(el({ classes: ['ProseMirror'] })),             'prosemirror');
check('prosemirror (.tiptap)',           detectEditorType(el({ classes: ['tiptap'] })),                  'prosemirror');
check('codemirror v6 (.cm-editor)',      detectEditorType(el({ classes: ['cm-editor'] })),               'codemirror');
check('codemirror v5 (.CodeMirror)',     detectEditorType(el({ classes: ['CodeMirror'] })),              'codemirror');
check('monaco (.monaco-editor)',         detectEditorType(el({ classes: ['monaco-editor'] })),           'monaco');
check('quill (.ql-editor)',              detectEditorType(el({ classes: ['ql-editor'] })),               'quill');
check('draftjs (data-contents)',         detectEditorType(el({ attrs: { 'data-contents': '' } })),       'draftjs');

// ── Native targets / generic contenteditable → null (separate path) ──
check('plain element -> null',           detectEditorType(el({ classes: ['some-input'] })),              null);
check('null element -> null',            detectEditorType(null),                                          null);

// ── Ancestor walk: marker on the wrapper is found ────────────────
const deepTarget = el({ parent: el({ parent: el({ classes: ['ProseMirror'] }) }) });
check('marker 2 levels up -> detected', detectEditorType(deepTarget), 'prosemirror');

// Beyond 8 levels: no longer detected
let chain = el({ classes: ['monaco-editor'] });
for (let i = 0; i < 9; i++) chain = el({ parent: chain });
check('marker >8 levels away -> null', detectEditorType(chain), null);

// ── Priority: first match in order wins ─────────────────────────
check('lexical before draftjs (priority)',
  detectEditorType(el({ attrs: { 'data-lexical-editor': '', 'data-contents': '' } })), 'lexical');

// ── Completeness of the supported list ───────────────────────────
const expectedEditors = ['lexical', 'slate', 'prosemirror', 'codemirror', 'monaco', 'quill', 'draftjs'];
check('SUPPORTED_EDITORS complete',
  JSON.stringify([...SUPPORTED_EDITORS].sort()), JSON.stringify([...expectedEditors].sort()));

// ── Detection rules ───────────────────────────────────────────────
// Test values are format-valid made-up values. Prefixes are concatenated
// so that secret scanners (e.g. GitHub Push Protection) don't trigger.
const ids  = (text, custom) => scanText(text, custom).map((f) => f.id);
const hit  = (name, id, text) => check(`${id}: ${name}`, ids(text).includes(id), true);
const miss = (name, id, text) => check(`${id}: ${name} (no match)`, ids(text).includes(id), false);
const rep  = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);

check('RULES ids unique', new Set(RULES.map((r) => r.id)).size, RULES.length);

// Slack App-Level Token
hit ('xapp', 'slack_app_token', 'xa' + 'pp-1-A0123456789-1234567890123-' + rep('ab', 64));
miss('hex part too short', 'slack_app_token', 'xa' + 'pp-1-A0123456789-1234567890123-' + rep('ab', 63));

// Google OAuth Client Secret
hit ('GOCSPX', 'google_oauth_client_secret', 'client_secret: GOC' + 'SPX-' + rep('A1b2C3d4_-', 28));
miss('27 chars', 'google_oauth_client_secret', 'GOC' + 'SPX-' + rep('A1b2C3d4', 27));

// Azure SAS
const sig = 'sig=' + rep('AbCdEfGh12', 43) + '%3D';
hit ('sv before sig', 'azure_sas_token', 'https://acct.blob.core.windows.net/c/f.txt?sv=2022-11-02&ss=b&srt=o&sp=r&se=2030-01-01T00:00:00Z&' + sig);
hit ('sig before sv', 'azure_sas_token', 'https://acct.blob.core.windows.net/c/f.txt?' + sig + '&se=2030-01-01&sv=2022-11-02');
miss('sv without sig', 'azure_sas_token', 'https://acct.blob.core.windows.net/c/f.txt?sv=2022-11-02&ss=b&sp=r');
miss('sig too short', 'azure_sas_token', '?sv=2022-11-02&sp=r&sig=abc123');

// PyPI
hit ('pypi-AgEI', 'pypi_token', 'pyp' + 'i-AgEIcHlwaS5vcmc' + rep('CJx9_-', 70));
miss('prefix only', 'pypi_token', 'pyp' + 'i-AgEIcHlwaS5vcmcabc');

// Docker Hub
hit ('dckr_pat', 'dockerhub_pat', 'dck' + 'r_pat_' + rep('aB3dE6gH9jK2mN5pQ8sT1vW4yZ7', 27));
hit ('dckr_oat', 'dockerhub_pat', 'dck' + 'r_oat_' + rep('Zy8Xw7Vu6Ts5', 27));
miss('too short', 'dockerhub_pat', 'dck' + 'r_pat_short');

// Databricks
hit ('dapi', 'databricks_token', 'token = dap' + 'i' + rep('0123456789abcdef', 32));
miss('31 hex chars', 'databricks_token', 'dap' + 'i' + rep('0123456789abcdef', 31));

// Supabase
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sbJwt = (role) => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64u({ iss: 'supabase', ref: 'abcdefghijklmnop', role, iat: 1700000000, exp: 2000000000 }) + '.' + rep('x', 43);
hit ('sb_secret_', 'supabase_service_key', 'sb_' + 'secret_' + rep('Qw3Er5Ty7Ui9Op1As', 32));
hit ('service_role JWT', 'supabase_service_key', 'SUPABASE_SERVICE_ROLE_KEY=' + sbJwt('service_role'));
miss('anon JWT', 'supabase_service_key', 'SUPABASE_ANON_KEY=' + sbJwt('anon'));
check('jwt_token: anon JWT still detected', ids(sbJwt('anon')).includes('jwt_token'), true);

// Atlassian
hit ('ATATT3', 'atlassian_api_token', 'ATA' + 'TT3xFfGF0' + rep('Ab1_Cd2-Ef3', 180) + '=0A1B2C3D');
miss('too short', 'atlassian_api_token', 'ATA' + 'TT3' + rep('Ab1', 40));

// Linear
hit ('lin_api_', 'linear_api_key', 'lin' + '_api_' + rep('aB1cD2eF3g', 40));
miss('39 chars', 'linear_api_key', 'lin' + '_api_' + rep('aB1cD2eF3g', 39));

// Notion
hit ('secret_ (old)', 'notion_token', 'NOTION_KEY=sec' + 'ret_' + rep('Nt0aB1cD2eF3', 43));
hit ('ntn_ (new)', 'notion_token', 'nt' + 'n_' + rep('1234567890aBcDeF', 46));
miss('secret_ short', 'notion_token', 'the secret_sauce_recipe is here');

// Vercel
hit ('VERCEL_TOKEN=', 'vercel_token', 'VERCEL_TOKEN=' + rep('Vc1Xy2Zw3', 24));
hit ('vercelToken:', 'vercel_token', 'vercelToken: "' + rep('Vc1Xy2Zw3', 24) + '"');
miss('without assignment', 'vercel_token', 'Deploy läuft auf vercel, Projekt ' + rep('Vc1Xy2Zw3', 24));

// PuTTY / encrypted key
hit ('PPK v3', 'putty_private_key', 'PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\nComment: test\nPublic-Lines: 2\n');
miss('mention only', 'putty_private_key', 'Öffne die PuTTY-User-Key-File mit PuTTYgen');
hit ('ENCRYPTED PRIVATE KEY', 'encrypted_private_key', '-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFHDBOBgkqhkiG9w0BBQ0wQTApBgkqhkiG9w0BBQwwHAQI\n');
miss('PUBLIC KEY', 'encrypted_private_key', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n');

// Secret variables (.env)
hit ('TOKEN=', 'env_secret_assignment', 'SLACK_BOT_TOKEN=q8Zr2LmX9vKp4Tn7');
hit ('export ... PASSWORD', 'env_secret_assignment', 'export DB_PASSWORD="h7Gk2pQz9Lm4xW"');
hit ('placeholder before real value', 'env_secret_assignment', 'API_TOKEN=${API_TOKEN}\nCLIENT_SECRET=r4Nd0mV4lu3Xy9Qz');
miss('variable reference', 'env_secret_assignment', 'API_TOKEN=${API_TOKEN}\nNODE_ENV=production');
miss('placeholder', 'env_secret_assignment', 'SECRET_KEY=changeme-please-now');
miss('no entropy', 'env_secret_assignment', 'SESSION_TOKEN=aaaaaaaaaaaaaaaa');
miss('lowercase key', 'env_secret_assignment', 'my_token=q8Zr2LmX9vKp4Tn7');

// EU VAT ID (check digits)
for (const v of ['ATU13585627', 'BE0428759497', 'FR40303265045', 'IT00743110157', 'NL004495445B01', 'NL123456782B01', 'PL8567346215']) {
  hit(v, 'eu_vat_id', 'USt-ID: ' + v);
}
for (const v of ['ATU13585628', 'BE0428759498', 'FR41303265045', 'IT00743110158', 'NL004495446B01', 'PL8567346216']) {
  miss(v + ' wrong check digit', 'eu_vat_id', 'USt-ID: ' + v);
}

// NIR (FR)
hit ('compact', 'fr_nir', 'NIR 295109912611193');
hit ('with spaces', 'fr_nir', 'n° sécu : 1 85 05 78 006 084 91');
hit ('Corsica 2A', 'fr_nir', 'NIR ' + (() => { const b = '1850520006084'; const n = '18505' + '19' + b.slice(7); return b.slice(0, 5) + '2A' + b.slice(7) + String(97 - Number(n) % 97).padStart(2, '0'); })());
miss('wrong key', 'fr_nir', 'NIR 295109912611194');

// DNI/NIE (ES)
hit ('DNI', 'es_dni_nie', 'DNI 12345678Z');
hit ('DNI reference', 'es_dni_nie', 'DNI 54362315K');
hit ('NIE with hyphens', 'es_dni_nie', 'NIE X-1234567-L');
miss('wrong letter', 'es_dni_nie', 'DNI 12345678A');
miss('NIE wrong letter', 'es_dni_nie', 'NIE X1234567T');

// Existing rules, now with check digit
hit ('Steuer-IdNr valid', 'de_steuerid', 'Steuer-ID: 86095742719');
miss('Steuer-IdNr wrong check digit', 'de_steuerid', 'Steuer-ID: 86095742718');
miss('Steuer-IdNr without repeated digit', 'de_steuerid', 'Steuer-ID: 12345678903');
hit ('USt-IdNr DE valid', 'de_umsatzsteuer', 'USt-IdNr. DE136695976');
miss('USt-IdNr DE wrong check digit', 'de_umsatzsteuer', 'USt-IdNr. DE136695977');
hit ('RVNR compact', 'de_sozialversicherung', 'RV-Nr. 15070649C103');
hit ('RVNR with spaces', 'de_sozialversicherung', 'RV-Nr. 15 070649 C 103');
miss('RVNR wrong check digit', 'de_sozialversicherung', 'RV-Nr. 15070649C104');
miss('RVNR month 13', 'de_sozialversicherung', 'RV-Nr. 15071349C103');
hit ('Personalausweis valid', 'de_personalausweis', 'Personalausweis T220001293');
miss('Personalausweis wrong check digit', 'de_personalausweis', 'Personalausweis T220001294');
hit ('Reisepass valid', 'de_reisepass', 'Reisepass C01X00T478');
miss('Reisepass wrong check digit', 'de_reisepass', 'Reisepass C01X00T479');
hit ('mongodb+srv', 'db_connection', 'mongodb+srv://app:Pa55w0rdXy@cluster0.example.net/db');
hit ('rediss', 'db_connection', 'rediss://default:Pa55w0rdXy@cache.example.net:6380');
miss('without password', 'db_connection', 'mongodb+srv://cluster0.example.net/db');

// Validator rules now check further matches, not just the first
check('credit_card: invalid before valid number', ids('4111111111111112 and 4111111111111111').includes('credit_card'), true);

// ── Organization rules (custom-rules.js) ──────────────────────────
const srv = (o) => Object.assign({ rule_id: 'custom_1a2b3c4d', name: 'Customer number', description: 'Internal customer number', severity: 'high', pattern: 'KD-\\d{6}', flags: 'g' }, o);

let cr = CR.compileCustomRules([srv()]);
check('custom: valid rule compiled', cr.length, 1);
check('custom: g flag present', cr[0].pattern.flags, 'g');
check('custom: fields carried over', [cr[0].id, cr[0].name, cr[0].description, cr[0].severity, cr[0].custom], ['custom_1a2b3c4d', 'Customer number', 'Internal customer number', 'high', true]);
check('custom: g enforced for flags ""', CR.compileCustomRules([srv({ flags: '' })])[0].pattern.flags, 'g');
check('custom: flags gi', CR.compileCustomRules([srv({ flags: 'gi' })])[0].pattern.flags, 'gi');
check('custom: y/unknown flags dropped', CR.compileCustomRules([srv({ flags: 'gyx' })])[0].pattern.flags, 'g');
check('custom: invalid regex skipped, rest kept',
  CR.compileCustomRules([srv({ rule_id: 'custom_bad', pattern: '(' }), srv({ rule_id: 'custom_ok' })]).map((r) => r.id), ['custom_ok']);
check('custom: missing rule_id / pattern skipped',
  CR.compileCustomRules([srv({ rule_id: '' }), srv({ rule_id: 'custom_x', pattern: 42 }), srv({ rule_id: 'custom_y', pattern: '' }), null, 'x']).length, 0);
check('custom: rule_id > 64 chars skipped', CR.compileCustomRules([srv({ rule_id: 'c'.repeat(CR.MAX_RULE_ID_LEN + 1) }), srv({ rule_id: 'c'.repeat(CR.MAX_RULE_ID_LEN) })]).map((r) => r.id.length), [CR.MAX_RULE_ID_LEN]);
check('custom: duplicate rule_id only once', CR.compileCustomRules([srv(), srv({ pattern: 'foo' })]).length, 1);
check('custom: overly long pattern skipped', CR.compileCustomRules([srv({ pattern: 'a'.repeat(CR.MAX_PATTERN_LEN + 1) })]).length, 0);
check('custom: rule count capped',
  CR.compileCustomRules(Array.from({ length: CR.MAX_CUSTOM_RULES + 5 }, (_, i) => srv({ rule_id: 'custom_' + i }))).length, CR.MAX_CUSTOM_RULES);
check('custom: unknown severity -> medium', CR.compileCustomRules([srv({ severity: 'urgent' })])[0].severity, 'medium');
check('custom: missing name -> rule_id, description null -> ""',
  (([r]) => [r.name, r.description])(CR.compileCustomRules([srv({ name: null, description: null })])), ['custom_1a2b3c4d', '']);
check('custom: not an array -> []', CR.compileCustomRules(undefined), []);

const text = 'Please create customer KD-123456, ticket to follow.';
let f = scanText(text, cr).find((x) => x.id === 'custom_1a2b3c4d');
check('custom: finding with rule_id', !!f, true);
check('custom: finding fields', f && [f.name, f.description, f.severity, f.custom, f.match], ['Customer number', 'Internal customer number', 'high', true, 'KD-1****3456']);
check('custom: repeated scan (lastIndex reset)', scanText(text, cr).some((x) => x.id === 'custom_1a2b3c4d'), true);
check('custom: no match', ids('Please create customer KD-12, ticket to follow.', cr).includes('custom_1a2b3c4d'), false);
check('custom: gi case-insensitive', ids('please create customer kd-123456', CR.compileCustomRules([srv({ flags: 'gi' })])).includes('custom_1a2b3c4d'), true);
check('custom: without i case-sensitive', ids('please create customer kd-123456', cr).includes('custom_1a2b3c4d'), false);

// Empty matches must not hang and don't count as findings
const zero = CR.compileCustomRules([srv({ rule_id: 'custom_zero', pattern: 'x*' }), srv({ rule_id: 'custom_empty', pattern: '(?:)' }), srv({ rule_id: 'custom_look', pattern: '(?=a)' })]);
check('custom: only empty matches -> no finding', ids('abcabcabcabc nothing here', zero).filter((i) => i.startsWith('custom_')), []);
check('custom: empty matches skipped, later real match counts', ids('abcdefgh xxx', zero).includes('custom_zero'), true);

// Match limit per rule (validator is called at most MAX_MATCHES_PER_RULE times)
let calls = 0;
const capped = { pattern: /a/g, validator: () => { calls++; return false; } };
CR.findRuleMatch(capped, 'a'.repeat(1000));
check('findRuleMatch: match limit', calls, CR.MAX_MATCHES_PER_RULE);

// scanText's size limit also applies to organization rules
check('custom: match beyond MAX_SCAN_LEN ignored', ids('y'.repeat(MAX_SCAN_LEN) + ' KD-123456', cr).includes('custom_1a2b3c4d'), false);
check('custom: match before MAX_SCAN_LEN detected', ids('KD-123456 ' + 'y'.repeat(MAX_SCAN_LEN), cr).includes('custom_1a2b3c4d'), true);

// setCustomRules() -> default for scanText()
setCustomRules([srv(), srv({ rule_id: 'custom_invalid', pattern: '[' })]);
check('setCustomRules: active in default scan', scanText(text).filter((x) => x.custom).map((x) => x.id), ['custom_1a2b3c4d']);
setCustomRules(undefined);
check('setCustomRules(undefined): no organization rules', scanText(text).filter((x) => x.custom).length, 0);

// ── Result ────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
