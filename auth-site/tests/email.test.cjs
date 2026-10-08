const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

test('Spanish signup email uses a backend verification link with a fixed public redirect', async () => {
  const html = await fs.readFile(path.join(root, 'email/signup.html'), 'utf8').catch(() => '');
  assert.ok(html.includes('Para activar tu cuenta, pulsa el botón de empezar a comer saludable.'), 'email activation instructions are missing');
  const subject = await fs.readFile(path.join(root, 'email/subject.txt'), 'utf8');
  assert.equal(subject.trim(), 'Activa tu cuenta de iHambre y empieza a comer saludable');
  assert.ok(!/<(?:script|style|link)\b/i.test(html));
  // Plain dot-field Go actions only; no unsupported helper functions or inherited redirect.
  assert.deepEqual([...html.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(m => m[1].trim()), ['.TokenHash']);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 390, 900]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.route('https://ihambre.top/logo.png', route => route.fulfill({ path: path.join(root, 'logo.png'), contentType: 'image/png' }));
      await page.setContent(html.replace('{{ .TokenHash }}', 'FAKE_TEST_HASH_NOT_A_CREDENTIAL'));
      const cta = page.getByRole('link', { name: '¡Empieza a comer saludable!', exact: true });
      assert.equal(await cta.count(), 1);
      const link = new URL(await cta.getAttribute('href'));
      assert.equal(link.origin, 'https://rfdpptoctjolnfiavtts.supabase.co');
      assert.equal(link.pathname, '/auth/v1/verify');
      assert.equal(link.searchParams.get('token'), 'FAKE_TEST_HASH_NOT_A_CREDENTIAL');
      assert.equal(link.searchParams.get('type'), 'signup');
      assert.equal(link.searchParams.get('redirect_to'), 'https://ihambre.top/');
      assert.deepEqual([...link.searchParams.keys()], ['token', 'type', 'redirect_to']);
      assert.equal(await page.locator('html').getAttribute('lang'), 'es');
      assert.equal(await page.locator('img').getAttribute('src'), 'https://ihambre.top/logo.png');
      assert.ok(await page.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
      assert.ok(await page.locator('table[role="presentation"]').count() >= 2);
      assert.equal(await page.locator('table:not([style]), td:not([style]), a:not([style])').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok(await cta.evaluate(el => el.getBoundingClientRect().height >= 44));
      if (width === 390) await page.screenshot({ path: path.join(__dirname, 'email-mobile.png'), fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});
