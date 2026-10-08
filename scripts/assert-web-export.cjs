const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const origin = process.env.WEB_EXPORT_ORIGIN || 'http://127.0.0.1:8944';
test('isolated /app export loads branding, font, signup and PWA without resource errors', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const failures = [];
    page.on('response', r => { if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() }); });
    page.on('pageerror', e => failures.push({ error: e.message }));
    await page.goto(origin + '/app/');
    await page.getByText('Inicia sesión', { exact: true }).waitFor();
    await page.getByText('¿Primera vez? Crea una cuenta', { exact: true }).click();
    await page.getByText('Crea tu cuenta', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.fonts.check('16px Notebook')), true, 'Notebook font must load from /app/assets');
    assert(await page.getByRole('img', { name: 'Logo iHambre' }).evaluate(async el => { await el.decode(); return el.complete && el.naturalWidth > 0; }), 'real logo must load');
    const manifestURL = await page.locator('link[rel=manifest]').evaluate(el => el.href);
    assert.equal(manifestURL, origin + '/app/manifest.json');
    const response = await page.request.get(manifestURL); assert.equal(response.status(), 200);
    const manifest = await response.json();
    assert.equal(new URL(manifest.start_url, manifestURL).pathname, '/app/');
    assert.equal(new URL(manifest.scope, manifestURL).pathname, '/app/');
    for (const icon of manifest.icons) assert.equal((await page.request.get(new URL(icon.src, manifestURL).href)).status(), 200);
    assert.deepEqual(failures, []);
    fs.mkdirSync('artifacts/web-deploy', { recursive: true });
    await page.screenshot({ path: 'artifacts/web-deploy/' + (origin.startsWith('https') ? 'live' : 'local') + '-signup.png' });
  } finally { await browser.close(); }
});
