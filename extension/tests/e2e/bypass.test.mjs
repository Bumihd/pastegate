// End-to-end test in real Chromium with the extension loaded:
// the overlay appears, "Paste anyway" pastes, "Block" does not,
// and the next paste is detected again afterwards.
//
//   cd extension/tests/e2e && npm ci && npx playwright install chromium && npm test

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_SRC = path.resolve(HERE, '../..');
const TESTS_DIR = path.resolve(HERE, '..');
const SECRET = 'AKIAIOSFODNN7EXAMPLE';
const FIELDS = ['ed-input', 'ed-textarea', 'ed-ce', 'ed-pm', 'ed-lex', 'ed-slate',
                'ed-cm', 'ed-monaco', 'ed-quill', 'ed-draft'];

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else    { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

// Copy the extension without tests/ into a temp directory (like the builder)
const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-ext-'));
fs.cpSync(EXT_SRC, extDir, { recursive: true, filter: src => !src.startsWith(TESTS_DIR) });

const pmBundle = (await build({
  entryPoints: [path.join(HERE, 'prosemirror-entry.js')], bundle: true, write: false, logLevel: 'silent',
})).outputFiles[0].text;

const server = http.createServer((req, res) => {
  if (req.url === '/harness.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(TESTS_DIR, 'editor-harness.html')));
  }
  if (req.url === '/prosemirror.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><div id="pm" style="min-height:60px"></div><script>${pmBundle}</script>`);
  }
  res.statusCode = 404; res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--headless=new'],
  permissions: ['clipboard-read', 'clipboard-write'],
});

try {
  await new Promise(r => setTimeout(r, 1500));
  const page = await ctx.newPage();

  const paste = async (selector, text) => {
    await page.click(selector);
    await page.evaluate(t => navigator.clipboard.writeText(t), text);
    await page.keyboard.press('Control+V');
    try { await page.waitForSelector('#__ps_paste__', { timeout: 3000 }); return true; }
    catch { return false; }
  };
  const valueOf = sel => page.locator(sel).evaluate(e => ('value' in e ? e.value : e.innerText) || '');

  console.log('Editor-Harness');
  await page.goto(`${base}/harness.html`);
  await page.waitForTimeout(800);
  for (const id of FIELDS) {
    const sel = '#' + id;
    const shown = await paste(sel, `a ${SECRET} b`);
    if (shown) { await page.click('#__ps_paste__'); await page.waitForTimeout(600); }
    const value = await valueOf(sel);
    check(`${id}: overlay + paste anyway`, shown && value.includes(SECRET), `(value="${value}")`);
  }

  console.log('Block / re-detection');
  await page.reload(); await page.waitForTimeout(800);
  await paste('#ed-textarea', SECRET);
  await page.click('#__ps_block__'); await page.waitForTimeout(300);
  check('Block pastes nothing', (await valueOf('#ed-textarea')) === '');
  await paste('#ed-textarea', SECRET);
  await page.click('#__ps_paste__'); await page.waitForTimeout(600);
  const again = await paste('#ed-textarea', 'ghp_' + 'a'.repeat(36));
  if (again) await page.click('#__ps_block__');
  check('Next paste after bypass is detected again', again);
  await page.waitForTimeout(300);
  check('Harmless text without overlay', !(await paste('#ed-textarea', ' hallo')));

  console.log('Real ProseMirror');
  await page.goto(`${base}/prosemirror.html`);
  await page.waitForTimeout(800);
  await page.click('.ProseMirror');
  await page.keyboard.type('Start ');
  await paste('.ProseMirror', `key ${SECRET} end`);
  await page.click('#__ps_paste__'); await page.waitForTimeout(600);
  await page.keyboard.type(' weiter');
  const doc = await page.evaluate(() => window.view.state.doc.textContent);
  check('Text in document model, cursor after it', doc === `Start key ${SECRET} end weiter`, `(doc="${doc}")`);
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(extDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
