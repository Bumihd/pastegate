#!/usr/bin/env node
// Pastegate — tests for locales (locales/*.js) and language resolution (i18n.js).
// Runs without a browser. Usage: node extension/tests/i18n.test.js   (exit code 1 on failures)

const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Locale list from manifest.json (content_scripts) – also catches forgotten registrations
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const csFiles  = manifest.content_scripts[0].js;
const localeFiles = csFiles.filter((f) => f.startsWith('locales/'));
for (const f of localeFiles) require(path.join(root, f));
const i18n = require('../i18n.js');
const L = globalThis.PG_LOCALES;

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}` + (ok ? '' : `  (expected ${e}, got ${a})`));
  ok ? pass++ : fail++;
}

// ── Registration ──────────────────────────────────────────────────
const onDisk = fs.readdirSync(path.join(root, 'locales')).filter((f) => f.endsWith('.js')).map((f) => `locales/${f}`).sort();
check('all locales/*.js in the manifest', [...localeFiles].sort(), onDisk);
check('locales loaded before i18n.js', localeFiles.every((f) => csFiles.indexOf(f) < csFiles.indexOf('i18n.js')), true);

const popupHtml = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
check('all locales in popup.html', localeFiles.filter((f) => !popupHtml.includes(`../${f}`)), []);
check('locales in popup.html before i18n.js', localeFiles.every((f) => popupHtml.indexOf(`../${f}`) < popupHtml.indexOf('../i18n.js')), true);

const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
check('all locales in background.js LOCALE_FILES', localeFiles.filter((f) => !bg.includes(`'${f}'`)), []);

check('at least de, en, fr, es', ['de', 'en', 'fr', 'es'].every((l) => l in L), true);
check('file code == registered code', Object.keys(L).sort(), localeFiles.map((f) => path.basename(f, '.js')).sort());

// ── Key parity against en ─────────────────────────────────────────
function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
const placeholders = (s) => (String(s).match(/\{[a-z_]+\}/gi) || []).sort();

const ref = flatten(L.en);
const refKeys = Object.keys(ref).sort();

// All rule ids from content.js RULES must be present in en.rules
const contentSrc = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const ruleIds = [...contentSrc.matchAll(/^\s+id:\s*'([^']+)'/gm)].map((m) => m[1]).sort();
check('en.rules == RULES ids from content.js', Object.keys(L.en.rules).sort(), ruleIds);

for (const [lang, dict] of Object.entries(L)) {
  const flat = flatten(dict);
  const keys = Object.keys(flat).sort();
  check(`${lang}: missing keys`, refKeys.filter((k) => !(k in flat)), []);
  check(`${lang}: extra keys`, keys.filter((k) => !(k in ref)), []);
  check(`${lang}: no empty/non-string values`,
    keys.filter((k) => typeof flat[k] !== 'string' || !flat[k].trim()), []);
  check(`${lang}: placeholders identical to en`,
    refKeys.filter((k) => k in flat && JSON.stringify(placeholders(flat[k])) !== JSON.stringify(placeholders(ref[k]))), []);
  check(`${lang}: every rule has name+desc`,
    Object.entries(dict.rules || {}).filter(([, r]) => Object.keys(r).sort().join() !== 'desc,name').map(([id]) => id), []);
}

// ── Lookup ────────────────────────────────────────────────────────
i18n.setI18nLang('fr');
check('t() fr', i18n.t('status_active'), 'Actif');
check('t() placeholders', i18n.t('queue_pending_plural', { n: 3 }), '3 événements en attente');
check('t() unknown key -> key', i18n.t('does_not_exist'), 'does_not_exist');
check('t() rules -> key', i18n.t('rules'), 'rules');
check('tRule() fr', i18n.tRule('iban').name, 'IBAN');
check('tRule() unknown -> fallback', i18n.tRule('new_rule', 'New', 'Desc'), { name: 'New', desc: 'Desc' });
i18n.setI18nLang('xx');
check('setI18nLang() ignores unknown language', i18n.getI18nLang(), 'fr');
i18n.setI18nLang('es');
check('t() es', i18n.t('btn_paste'), '⚠️ Pegar de todos modos');
i18n.setI18nLang('en');

// ── resolveLang ───────────────────────────────────────────────────
const S = ['de', 'en', 'fr', 'es'];
const r = (o) => i18n.resolveLang({ supported: S, ...o });

check('nothing set -> en', r({}), { org: 'en', effective: 'en' });
check('config.js only', r({ configLang: 'de' }), { org: 'de', effective: 'de' });
check('MDM before config.js', r({ managedLang: 'es', configLang: 'de' }), { org: 'es', effective: 'es' });
check('server before MDM/config.js', r({ serverLang: 'fr', managedLang: 'es', configLang: 'de' }), { org: 'fr', effective: 'fr' });
check('unknown server language -> next source', r({ serverLang: 'it', configLang: 'de' }), { org: 'de', effective: 'de' });
check('region/case normalized', r({ serverLang: ' FR-ca ' }), { org: 'fr', effective: 'fr' });
check('override en allowed', r({ serverLang: 'fr', override: 'en' }), { org: 'fr', effective: 'en' });
check('override = org language allowed', r({ serverLang: 'fr', override: 'fr' }), { org: 'fr', effective: 'fr' });
check('override third language ignored', r({ serverLang: 'fr', override: 'de' }), { org: 'fr', effective: 'fr' });
check('org language changed, old override ignored', r({ serverLang: 'es', configLang: 'de', override: 'de' }), { org: 'es', effective: 'es' });
check('org en, override de ignored', r({ serverLang: 'en', override: 'de' }), { org: 'en', effective: 'en' });
check('override garbage ignored', r({ configLang: 'de', override: 42 }), { org: 'de', effective: 'de' });
check('supported default = registered locales', i18n.resolveLang({ serverLang: 'es' }), { org: 'es', effective: 'es' });

// ── Result ────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
