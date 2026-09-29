// Pastegate – background.js

// Load config from config.js (only present if the extension was built by the dashboard)
try { importScripts('config.js'); } catch (_) { /* Fallback: no config.js (not a dashboard build) */ }

// Translations + resolveLang. Register new languages here, in manifest.json and in popup.html.
const LOCALE_FILES = ['locales/en.js', 'locales/de.js', 'locales/fr.js', 'locales/es.js'];
importScripts(...LOCALE_FILES, 'i18n.js', 'custom-rules.js');

// Queue system designed for organizations with mixed VPN coverage:
// IT staff on the VPN -> events go through immediately
// Sales/HR/management without VPN -> events are cached locally and
// delivered automatically on the next connection

const QUEUE_KEY      = 'report_queue';
const BACKOFF_KEY    = 'flush_backoff';
const CONFIG_KEY     = 'domain_rules';
const SERVER_LANG_KEY = 'org_lang_server'; // default_lang from the last /config response
const CUSTOM_RULES_KEY = 'custom_rules';   // organization rules from /config (compiled by content.js)
const FLUSH_ALARM    = 'pastegate_flush';
const CONFIG_ALARM   = 'pastegate_config';
const CONFIG_INTERVAL_MINUTES = 5;   // domain and detection rules, org language

// Queue limit: 5,000 events ~ 2.5MB – several months of buffer for non-VPN users
// The oldest events are dropped when the limit is reached (FIFO drop)
const QUEUE_MAX      = 5000;

// Flush interval: 30 seconds – low latency once a connection is available
const FLUSH_INTERVAL_MINUTES = 0.5;

// Exponential backoff on connection errors (in seconds)
// Keeps the extension from hammering an unreachable server
const BACKOFF_STEPS  = [30, 60, 300, 900, 1800]; // 30s, 1min, 5min, 15min, 30min
const BACKOFF_MAX    = 1800; // max. 30 minutes between attempts


// ── Installation / Startup ────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      enabled:        true,
      totalBlocked:   0,
      todayBlocked:   0,
      lastDate:       '',
      ignoredDomains: [],
    });
    await chrome.storage.local.set({
      server_url:    '',
      api_key:       '',
      device_id:     '',
      [QUEUE_KEY]:   [],
      [BACKOFF_KEY]: { failures: 0, next_attempt: 0 },
    });
  }

  // On EVERY install/update: ensure device ID, config and domain rules
  // Prevents config from never arriving after a reload (e.g. "Load unpacked")
  await ensureDeviceId();

  // Initialize backoff state if missing
  const local = await chrome.storage.local.get(BACKOFF_KEY);
  if (!local[BACKOFF_KEY]) {
    await chrome.storage.local.set({
      [BACKOFF_KEY]: { failures: 0, next_attempt: 0 },
    });
  }

  await applyMdmConfig();
  if (details.reason === 'update') await migrateLegacyLang();
  await applyLang();
  await syncConfig();

  chrome.alarms.create(FLUSH_ALARM,  { periodInMinutes: FLUSH_INTERVAL_MINUTES });
  chrome.alarms.create(CONFIG_ALARM, { periodInMinutes: CONFIG_INTERVAL_MINUTES });

  if (details.reason === 'install') {
    chrome.action.openPopup().catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDeviceId();
  // Re-apply config after a browser restart — important if config.js was only
  // deployed after the last browser start
  await applyMdmConfig();
  await applyLang();
  // Fetch rules right away instead of waiting for the next alarm
  syncConfig().catch(() => {});
  // Send pending events immediately — the user may have been offline at last shutdown
  flushQueue().catch(() => {});
  // Recreate alarms
  chrome.alarms.create(FLUSH_ALARM,  { periodInMinutes: FLUSH_INTERVAL_MINUTES });
  chrome.alarms.create(CONFIG_ALARM, { periodInMinutes: CONFIG_INTERVAL_MINUTES });
});


// ── Device-ID ─────────────────────────────────────────────────────
// UUID generated once and persisted locally.
// The server turns it into an anonymous hash via HMAC-SHA256 + salt –
// the extension itself only knows the raw UUID.

async function ensureDeviceId() {
  const local = await chrome.storage.local.get('device_id');
  if (local.device_id) return local.device_id;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ device_id: id });
  return id;
}

// Device identity: MDM value (user_identity) > browser profile e-mail.
// The server only stores it encrypted; only itsec/infosec see the plaintext.
async function getIdentity() {
  try {
    if (chrome.storage.managed) {
      const managed = await chrome.storage.managed.get('user_identity');
      if (managed.user_identity) return String(managed.user_identity).trim().slice(0, 254);
    }
  } catch { /* no MDM */ }
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    return (info?.email || '').slice(0, 254);
  } catch { return ''; }
}


// ── Badge & Icon ──────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  if (changes.todayBlocked !== undefined) {
    const count = changes.todayBlocked.newValue;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  }

  if (changes.enabled !== undefined) {
    const on = changes.enabled.newValue;
    chrome.action.setIcon({
      path: {
        '16':  on ? 'icons/icon16.png'  : 'icons/icon16_off.png',
        '48':  on ? 'icons/icon48.png'  : 'icons/icon48_off.png',
        '128': on ? 'icons/icon128.png' : 'icons/icon128_off.png',
      },
    });
  }
});


// ── Message Handler ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PASTE_EVENT') {
    enqueue(msg.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_CONFIG') {
    chrome.storage.local.get(['server_url', 'api_key', 'device_id'], sendResponse);
    return true;
  }
  if (msg.type === 'SYNC_CONFIG') {
    // Popup opened → refresh rules immediately
    syncConfig().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'FLUSH_NOW') {
    flushQueue().catch(() => {});
    return;
  }
  if (msg.type === 'GET_QUEUE_STATUS') {
    getQueueStatus().then(sendResponse);
    return true;
  }
});


// ── Event-Queue ───────────────────────────────────────────────────

// Debounce timer for the immediate flush — keeps many rapid enqueues from
// triggering a swarm of parallel flushQueue calls
let _flushDebounceTimer = null;

async function enqueue(payload) {
  const local = await chrome.storage.local.get(QUEUE_KEY);
  const queue = local[QUEUE_KEY] || [];

  queue.push(payload);

  // FIFO drop: when the queue limit is reached, discard the oldest events
  if (queue.length > QUEUE_MAX) {
    queue.splice(0, queue.length - QUEUE_MAX);
  }

  await chrome.storage.local.set({ [QUEUE_KEY]: queue });

  // Immediate flush for realtime display — debounced (only one scheduled flush at a time).
  // 250ms lets several rapid pastes accumulate and go out in one batch.
  if (_flushDebounceTimer) clearTimeout(_flushDebounceTimer);
  _flushDebounceTimer = setTimeout(() => {
    _flushDebounceTimer = null;
    flushQueue().catch(() => {});
  }, 250);
}

async function getQueueStatus() {
  const local = await chrome.storage.local.get([QUEUE_KEY, BACKOFF_KEY]);
  const queue   = local[QUEUE_KEY]   || [];
  const backoff = local[BACKOFF_KEY] || { failures: 0, next_attempt: 0 };
  return {
    queued:    queue.length,
    failures:  backoff.failures,
    next_attempt: backoff.next_attempt,
  };
}


// ── Alarm: flush queue ───────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FLUSH_ALARM)  await flushQueue();
  if (alarm.name === CONFIG_ALARM) await syncConfig();
});


// Mutex against parallel flushQueue calls.
// Service workers can wake up after idle and flush from alarm + enqueue at the same time.
let _flushInProgress = false;

async function flushQueue() {
  if (_flushInProgress) return;
  _flushInProgress = true;
  try {
    return await _flushQueueInner();
  } finally {
    _flushInProgress = false;
  }
}

async function _flushQueueInner() {
  // Step 1: quick check whether there is any work at all
  const local = await chrome.storage.local.get([
    QUEUE_KEY, BACKOFF_KEY, 'server_url', 'api_key', 'device_id',
  ]);
  const sync = await chrome.storage.sync.get({ enabled: true });

  const queue      = local[QUEUE_KEY]   || [];
  const backoff    = local[BACKOFF_KEY] || { failures: 0, next_attempt: 0 };
  const server_url = (local.server_url || '').trim();
  const api_key    = (local.api_key    || '').trim();
  const device_id  = (local.device_id  || '');

  // Don't send if: disabled, queue empty, not configured
  if (!sync.enabled)           return;
  if (queue.length === 0)      return;
  if (!server_url || !api_key) return;

  // Step 2: check backoff – don't retry more often than allowed
  const now = Date.now();
  if (backoff.next_attempt > now) return;

  // Step 3: navigator.onLine as a quick check
  // Avoids pointless TCP connection attempts when the browser already knows it is offline
  if (!self.navigator?.onLine) return;

  // Step 4: send batch to the server
  // At most 100 events per request – server limit (BatchIn.events); more returns 422
  // and would clear the queue. 5,000 events → 50 requests over several flush cycles.
  const BATCH_SIZE = 100;
  const batch = queue.slice(0, BATCH_SIZE);

  const endpoint = `${server_url.replace(/\/$/, '')}/api/v1/events/batch`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    api_key,
      },
      body: JSON.stringify({ device_id, identity: (await getIdentity()) || undefined, events: batch }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok || res.status === 202) {
      // Success: remove sent events from the queue, reset backoff
      const remaining = queue.slice(batch.length);
      await chrome.storage.local.set({
        [QUEUE_KEY]:   remaining,
        [BACKOFF_KEY]: { failures: 0, next_attempt: 0 },
      });
      return;
    }

    if (res.status >= 400 && res.status < 500) {
      // Client error (wrong API key, 422 etc.): clear the queue to avoid an endless loop
      // The admin has to fix the configuration
      await chrome.storage.local.set({
        [QUEUE_KEY]:   [],
        [BACKOFF_KEY]: { failures: 0, next_attempt: 0 },
      });
      return;
    }

    // 5xx or unexpected status: increase backoff, keep queue
    await applyBackoff(backoff, now);

  } catch {
    // Network error (server unreachable, DNS error, timeout):
    // keep queue, increase backoff
    // This is the normal case for non-VPN users
    await applyBackoff(backoff, now);
  }
}


async function applyBackoff(current, now) {
  const failures    = (current.failures || 0) + 1;
  const stepIndex   = Math.min(failures - 1, BACKOFF_STEPS.length - 1);
  const waitSeconds = BACKOFF_STEPS[stepIndex] || BACKOFF_MAX;
  const next_attempt = now + waitSeconds * 1000;

  await chrome.storage.local.set({
    [BACKOFF_KEY]: { failures, next_attempt },
  });
}


// ── Config-Sync ───────────────────────────────────────────────────
// Fetches the domain rules from the server and stores them locally.
// content.js reads domain_rules and custom_rules from chrome.storage.local.
// domain_rules: [{ pattern: "*.chatgpt.com", mode: "hard_block" }, ...]
// custom_rules: [{ rule_id, name, description, severity, pattern, flags }, ...]

async function syncConfig() {
  const local = await chrome.storage.local.get(['server_url', 'api_key']);
  const server_url = (local.server_url || '').trim();
  const api_key    = (local.api_key    || '').trim();

  if (!server_url || !api_key) return;

  const endpoint = `${server_url.replace(/\/$/, '')}/api/v1/config`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(endpoint, {
      headers: { 'X-API-Key': api_key },
      signal:  controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return;

    const data = await res.json();
    const rules = Array.isArray(data.domain_rules) ? data.domain_rules : [];

    // If custom_rules is missing (older server), there are no organization rules
    const customRules = Array.isArray(data.custom_rules) ? data.custom_rules.slice(0, PSCustomRules.MAX_CUSTOM_RULES) : [];

    await chrome.storage.local.set({ [CONFIG_KEY]: rules, [CUSTOM_RULES_KEY]: customRules });

    // Org language from the dashboard. If missing (older server), MDM/config.js apply.
    if (isSupportedLang(data.default_lang)) {
      await chrome.storage.local.set({ [SERVER_LANG_KEY]: normLang(data.default_lang) });
    } else {
      await chrome.storage.local.remove(SERVER_LANG_KEY);
    }
    await applyLang();
  } catch {
    // Network error – keep existing config
  }
}



// Upgrade http:// to https:// for production URLs (everything except localhost/127.x/192.168.x).
// Hintergrund: Reverse-Proxies (Cloudflare, nginx) terminieren TLS, .env hat oft http://,
// but MV3 service workers cannot reliably follow the 301 redirect.
function upgradeHttpToHttps(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('http://')) return url;
  // Lokale URLs bleiben http://
  const host = url.slice(7).split('/')[0].split(':')[0];
  if (host === 'localhost'
      || host === '127.0.0.1'
      || host.startsWith('192.168.')
      || host.startsWith('10.')
      || host.startsWith('172.16.')
      || host.endsWith('.local')) {
    return url;
  }
  return 'https://' + url.slice(7);
}

// ── MDM-Config ────────────────────────────────────────────────────
// Reads configuration from chrome.storage.managed (set by MDM).
// Fields: server_url, api_key, lang
// Only overwrites if not already configured manually.

async function applyMdmConfig() {
  try {
    const local = await chrome.storage.local.get(['server_url', 'api_key']);
    const updates_local = {};

    // Priority 1: embedded config.js (dashboard build / MDM package)
    if (typeof PASTEGATE_CONFIG !== 'undefined') {
      // config.js always takes priority – overwrites storage
      if (PASTEGATE_CONFIG.server_url)
        updates_local.server_url = upgradeHttpToHttps(PASTEGATE_CONFIG.server_url);
      if (PASTEGATE_CONFIG.api_key)
        updates_local.api_key = PASTEGATE_CONFIG.api_key;
    }

    // Also upgrade an existing server_url in storage if http:// and not localhost
    if (!updates_local.server_url && local.server_url) {
      const upgraded = upgradeHttpToHttps(local.server_url);
      if (upgraded !== local.server_url) {
        updates_local.server_url = upgraded;
      }
    }

    // Priority 2: MDM managed storage (Intune/Jamf policy)
    try {
      if (chrome.storage.managed) {
        const managed = await chrome.storage.managed.get(['server_url', 'api_key']);
        if (managed.server_url && !local.server_url && !updates_local.server_url)
          updates_local.server_url = managed.server_url;
        if (managed.api_key && !local.api_key && !updates_local.api_key)
          updates_local.api_key = managed.api_key;
      }
    } catch { /* no MDM */ }

    if (Object.keys(updates_local).length > 0) await chrome.storage.local.set(updates_local);
  } catch { /* ignore */ }
}


// ── Language ──────────────────────────────────────────────────────
// Org language: /config default_lang > MDM lang > config.js lang > en.
// Users may only choose between the org language and en (storage.sync lang_override).
// The result goes to storage.local (org_lang, ui_lang) – i18n.js reads ui_lang.

async function getManagedLang() {
  try {
    if (!chrome.storage.managed) return undefined;
    const managed = await chrome.storage.managed.get(['lang']);
    return managed.lang;
  } catch {
    return undefined; // no MDM
  }
}

function getConfigLang() {
  return typeof PASTEGATE_CONFIG !== 'undefined' ? PASTEGATE_CONFIG.lang : undefined;
}

async function applyLang() {
  try {
    const [local, sync, managedLang] = await Promise.all([
      chrome.storage.local.get([SERVER_LANG_KEY, PG_ORG_LANG_KEY, PG_LANG_KEY]),
      chrome.storage.sync.get([PG_OVERRIDE_KEY]),
      getManagedLang(),
    ]);
    const { org, effective } = resolveLang({
      serverLang: local[SERVER_LANG_KEY],
      managedLang,
      configLang: getConfigLang(),
      override:   sync[PG_OVERRIDE_KEY],
    });
    if (local[PG_ORG_LANG_KEY] !== org || local[PG_LANG_KEY] !== effective) {
      await chrome.storage.local.set({ [PG_ORG_LANG_KEY]: org, [PG_LANG_KEY]: effective });
    }
  } catch { /* ignore */ }
}

// Up to v1.5.3 the language lived in storage.sync.lang – set by DE/EN buttons,
// but also automatically from config.js/MDM. Only an 'en' differing from config/MDM
// was definitely a user choice and is migrated as the override.
async function migrateLegacyLang() {
  try {
    const sync = await chrome.storage.sync.get(['lang', PG_OVERRIDE_KEY]);
    if (sync.lang === undefined) return;
    const managedLang = await getManagedLang();
    const orgHint = normLang(managedLang) || normLang(getConfigLang());
    if (sync.lang === 'en' && orgHint !== 'en' && !sync[PG_OVERRIDE_KEY]) {
      await chrome.storage.sync.set({ [PG_OVERRIDE_KEY]: 'en' });
    }
    await chrome.storage.sync.remove('lang');
  } catch { /* ignore */ }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' && changes[PG_OVERRIDE_KEY]) || (area === 'managed' && changes.lang)) {
    applyLang();
  }
});


// ────────────────────────────────────────────────────────────────────
// Diagnostic helper for the DevTools console
// Call from the service worker DevTools:
//   await pgDiagnose()
// Returns a summarized status report.
// ────────────────────────────────────────────────────────────────────

self.pgDiagnose = async function() {
  const local = await chrome.storage.local.get([
    'server_url', 'api_key', 'device_id',
    'report_queue', 'flush_backoff', 'domain_rules', CUSTOM_RULES_KEY,
  ]);
  const sync = await chrome.storage.sync.get(['enabled', PG_OVERRIDE_KEY]);
  const lang = await chrome.storage.local.get([SERVER_LANG_KEY, PG_ORG_LANG_KEY, PG_LANG_KEY]);

  const result = {
    config: {
      server_url:     local.server_url || '(MISSING!)',
      server_url_ok:  !!local.server_url && local.server_url.startsWith('https://'),
      api_key_set:    !!local.api_key,
      api_key_prefix: local.api_key ? local.api_key.slice(0, 6) + '...' : null,
      device_id:      local.device_id || '(MISSING!)',
      lang:           lang[PG_LANG_KEY] || '(not resolved)',
      org_lang:       lang[PG_ORG_LANG_KEY] || null,
      org_lang_server: lang[SERVER_LANG_KEY] || null,
      lang_override:  sync[PG_OVERRIDE_KEY] || null,
      config_lang:    getConfigLang() || null,
      enabled:        sync.enabled !== false,
    },
    queue: {
      pending:      (local.report_queue || []).length,
      backoff:      local.flush_backoff || { failures: 0, next_attempt: 0 },
    },
    domain_rules: (local.domain_rules || []).length,
    custom_rules: {
      received: (local[CUSTOM_RULES_KEY] || []).length,
      active:   compileCustomRules(local[CUSTOM_RULES_KEY]).length, // excluding invalid patterns
    },
  };

  // Live test: can the extension reach the server?
  if (local.server_url && local.api_key) {
    try {
      const url = local.server_url.replace(/\/$/, '') + '/api/v1/health';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, {
        headers: { 'X-API-Key': local.api_key },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      result.connection = {
        ok:     res.ok,
        status: res.status,
        url,
      };
    } catch (e) {
      result.connection = {
        ok:    false,
        error: e.name + ': ' + e.message,
      };
    }
  } else {
    result.connection = { ok: false, error: 'config missing' };
  }

  console.log('═══ Pastegate Diagnostics ═══');
  console.log(JSON.stringify(result, null, 2));
  return result;
};
