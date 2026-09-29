// Pastegate – i18n.js
// Lookup for the translations in locales/<code>.js. Each locale file registers
// itself on globalThis.PG_LOCALES and must be loaded BEFORE i18n.js.
//
// Adding a new language:
//   1. copy locales/en.js to locales/<code>.js and translate it (same keys, lang_name = native name)
//   2. register it in manifest.json (content_scripts, before i18n.js), popup/popup.html
//      and LOCALE_FILES in background.js
//   3. node extension/tests/i18n.test.js
//
// Language: background.js computes it (resolveLang) and stores it as ui_lang in
// chrome.storage.local. Content scripts and the popup only read ui_lang.

const PG_FALLBACK_LANG = 'en';
const PG_LANG_KEY      = 'ui_lang';        // storage.local, effective language
const PG_ORG_LANG_KEY  = 'org_lang';       // storage.local, organization language
const PG_OVERRIDE_KEY  = 'lang_override';  // storage.sync, user's choice (org language or en only)

function psLocales() {
  return globalThis.PG_LOCALES || {};
}

function supportedLangs() {
  return Object.keys(psLocales());
}

// 'de-DE', ' FR ' -> 'de', 'fr'; anything else -> null
function normLang(lang) {
  if (typeof lang !== 'string') return null;
  const code = lang.trim().toLowerCase().split(/[-_]/)[0];
  return code || null;
}

function isSupportedLang(lang, supported = supportedLangs()) {
  const code = normLang(lang);
  return !!code && supported.includes(code);
}

// No chrome.* access, so it is testable in node (tests/i18n.test.js).
// Org language: /config default_lang > MDM lang > config.js lang > en.
// The override only counts if it is the org language or en.
function resolveLang({ serverLang, managedLang, configLang, override, supported = supportedLangs() } = {}) {
  const pick = (l) => (isSupportedLang(l, supported) ? normLang(l) : null);
  const org = pick(serverLang) || pick(managedLang) || pick(configLang) || PG_FALLBACK_LANG;
  const ov  = pick(override);
  const effective = ov && (ov === org || ov === PG_FALLBACK_LANG) ? ov : org;
  return { org, effective };
}

let _lang = PG_FALLBACK_LANG;
let _i18nReady = null;

function initI18n() {
  if (_i18nReady) return _i18nReady;
  _i18nReady = new Promise((resolve) => {
    try {
      chrome.storage.local.get([PG_LANG_KEY, PG_ORG_LANG_KEY], (data) => {
        setI18nLang((data && (data[PG_LANG_KEY] || data[PG_ORG_LANG_KEY])) || PG_FALLBACK_LANG);
        resolve();
      });
      // A language change (popup or new org language from the server) applies on the next render
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[PG_LANG_KEY]) setI18nLang(changes[PG_LANG_KEY].newValue);
      });
    } catch {
      resolve();
    }
  });
  return _i18nReady;
}

function setI18nLang(lang) {
  if (isSupportedLang(lang)) _lang = normLang(lang);
}

function getI18nLang() {
  return _lang;
}

function t(key, vars = {}) {
  const locales = psLocales();
  const dict = locales[_lang] || {};
  const ref  = locales[PG_FALLBACK_LANG] || {};
  let str = typeof dict[key] === 'string' && dict[key] ? dict[key] : ref[key];
  // Objects (e.g. rules) or missing keys -> return the key (rules go through tRule)
  if (typeof str !== 'string' || !str) return key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.split(`{${k}}`).join(String(v));
  }
  return str;
}

// Translates a detection rule. Fallback: en, then name/desc from the RULES object.
function tRule(ruleId, fallbackName, fallbackDesc) {
  const locales = psLocales();
  const own = locales[_lang] && locales[_lang].rules && locales[_lang].rules[ruleId];
  const ref = locales[PG_FALLBACK_LANG] && locales[PG_FALLBACK_LANG].rules && locales[PG_FALLBACK_LANG].rules[ruleId];
  return {
    name: (own && own.name) || (ref && ref.name) || fallbackName || ruleId,
    desc: (own && own.desc) || (ref && ref.desc) || fallbackDesc || '',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PG_FALLBACK_LANG, PG_LANG_KEY, PG_ORG_LANG_KEY, PG_OVERRIDE_KEY,
    supportedLangs, normLang, isSupportedLang, resolveLang,
    initI18n, setI18nLang, getI18nLang, t, tRule,
  };
}
