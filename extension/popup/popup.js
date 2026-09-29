// Pastegate – popup.js
// No config panel. No configure button.
// The server URL comes from config.js (dashboard build) or MDM – never from the user.

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;
  await initI18n();

  const toggle    = document.getElementById('enable-toggle');
  const statusDot = document.getElementById('status-dot');
  const statusText= document.getElementById('status-text');
  const statToday = document.getElementById('stat-today');
  const statTotal = document.getElementById('stat-total');
  const serverDot = document.getElementById('server-dot');
  const serverLbl = document.getElementById('server-url-label');
  const queueLbl  = document.getElementById('queue-status');
  const lblToday  = document.getElementById('lbl-today');
  const lblTotal  = document.getElementById('lbl-total');
  const lblServer = document.getElementById('lbl-server');

  // ── i18n ──────────────────────────────────────────────────────
  if (lblToday)  lblToday.textContent  = t('stat_today');
  if (lblTotal)  lblTotal.textContent  = t('stat_total');
  if (lblServer) lblServer.textContent = t('section_server');

  // ── Lang-Switch ───────────────────────────────────────────────
  // Org language and English only. background.js resolves lang_override to ui_lang.
  const langSwitch = document.getElementById('lang-switch');
  let orgLang = (await chrome.storage.local.get(PG_ORG_LANG_KEY))[PG_ORG_LANG_KEY];
  if (!isSupportedLang(orgLang)) orgLang = PG_FALLBACK_LANG;

  function renderLangSwitch() {
    if (!langSwitch) return;
    langSwitch.textContent = '';
    langSwitch.hidden = orgLang === PG_FALLBACK_LANG;
    if (langSwitch.hidden) return;
    langSwitch.setAttribute('aria-label', t('lang_switch'));
    for (const code of [orgLang, PG_FALLBACK_LANG]) {
      const btn = document.createElement('button');
      btn.className = 'lang-btn' + (code === getI18nLang() ? ' active' : '');
      btn.textContent = psLocales()[code].lang_name;
      btn.lang = code;
      btn.addEventListener('click', async () => {
        setI18nLang(code);
        renderAll();
        await chrome.storage.sync.set({ [PG_OVERRIDE_KEY]: code });
      });
      langSwitch.appendChild(btn);
    }
  }

  // ── Load data ─────────────────────────────────────────────────
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get({
      enabled: true, totalBlocked: 0, todayBlocked: 0, lastDate: '',
    }),
    chrome.storage.local.get({ server_url: '', api_key: '' }),
  ]);

  // config.js always takes priority – apply directly
  if (typeof PASTEGATE_CONFIG !== 'undefined' && PASTEGATE_CONFIG.server_url) {
    local.server_url = PASTEGATE_CONFIG.server_url;
    local.api_key    = PASTEGATE_CONFIG.api_key;
    // Write to storage so background.js has it too
    chrome.storage.local.set({
      server_url: PASTEGATE_CONFIG.server_url,
      api_key:    PASTEGATE_CONFIG.api_key,
    });
  }

  // Daily reset
  const today = new Date().toDateString();
  if (sync.lastDate !== today) {
    sync.todayBlocked = 0;
    chrome.storage.sync.set({ todayBlocked: 0, lastDate: today });
  }

  // ── Render ────────────────────────────────────────────────────
  let queueStatus;
  let queueLoaded = false;

  function renderAll() {
    document.documentElement.lang = getI18nLang();
    renderLangSwitch();

    // Status
    toggle.checked = sync.enabled;
    statusDot.className = 'status-dot' + (sync.enabled ? '' : ' off');
    statusText.textContent = sync.enabled ? t('status_active') : t('status_inactive');

    // Stats
    statToday.textContent = sync.todayBlocked;
    statTotal.textContent = sync.totalBlocked;

    // Server
    const url = local.server_url || '';
    if (url) {
      serverDot.className = 'server-dot connected';
      serverLbl.textContent = url.replace(/^https?:\/\//, '');
    } else {
      serverDot.className = 'server-dot disconnected';
      serverLbl.textContent = t('server_unconfigured');
    }

    // Labels i18n
    if (lblToday)  lblToday.textContent  = t('stat_today');
    if (lblTotal)  lblTotal.textContent  = t('stat_total');
    if (lblServer) lblServer.textContent = t('section_server');

    // Queue
    if (queueLbl && queueLoaded) {
      if (queueStatus === undefined) {
        queueLbl.textContent = '';
      } else if (!queueStatus || queueStatus.queued === 0) {
        queueLbl.textContent = t('queue_none');
        queueLbl.style.color = '';
      } else {
        const key = queueStatus.queued === 1 ? 'queue_pending' : 'queue_pending_plural';
        queueLbl.textContent = t(key, { n: queueStatus.queued });
        queueLbl.style.color = '#f59e0b';
      }
    }
  }

  renderAll();

  // Language change from the popup or new org language from the server
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[PG_ORG_LANG_KEY] && isSupportedLang(changes[PG_ORG_LANG_KEY].newValue)) {
      orgLang = changes[PG_ORG_LANG_KEY].newValue;
    }
    if (changes[PG_LANG_KEY]) setI18nLang(changes[PG_LANG_KEY].newValue);
    if (changes[PG_ORG_LANG_KEY] || changes[PG_LANG_KEY]) renderAll();
  });

  // ── Toggle ────────────────────────────────────────────────────
  toggle.addEventListener('change', () => {
    sync.enabled = toggle.checked;
    chrome.storage.sync.set({ enabled: toggle.checked });
    renderAll();
  });

  // ── Queue-Status ──────────────────────────────────────────────
  try {
    chrome.runtime.sendMessage({ type: 'SYNC_CONFIG' }).catch(() => {});
    queueStatus = await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATUS' });
  } catch {
    queueStatus = undefined;
  }
  queueLoaded = true;
  renderAll();
});
