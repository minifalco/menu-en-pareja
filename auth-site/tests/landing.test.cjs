const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

let server, browser, origin;
const root = path.resolve(__dirname, '..');
before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!['index.html', 'styles.css', 'logo.png'].includes(file)) {
      res.writeHead(404).end('Not found'); return;
    }
    try {
      const contents = await fs.readFile(path.join(root, file));
      res.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : file.endsWith('.css') ? 'text/css' : 'text/html' });
      res.end(contents);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function visit(suffix = '', viewport = { width: 1000, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  await page.goto(origin + '/' + suffix);
  return { context, page };
}

test('landing uses the supplied logo and warm orange/green brand palette', async () => {
  const { context, page } = await visit('', { width: 390, height: 844 });
  try {
    const logo = page.getByRole('img', { name: 'iHambre: compra y alimentación saludable' });
    assert.equal(await logo.count(), 1);
    assert.equal(await logo.getAttribute('src'), './logo.png');
    assert.ok(await logo.evaluate(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('.brand').evaluate(el => getComputedStyle(el).color), 'rgb(53, 110, 42)');
    assert.equal(await page.locator('.divider').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(238, 85, 35)');
    await page.screenshot({ path: path.join(__dirname, 'neutral-mobile.png'), fullPage: true });
  } finally { await context.close(); }
});

test('mobile notebook is readable, semantic and stays within the viewport', async () => {
  for (const width of [320, 390]) {
    for (const suffix of ['', '#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=signup', '#error=expired']) {
      const { context, page } = await visit(suffix, { width, height: 844 });
      try {
        assert.equal(await page.locator('html').getAttribute('lang'), 'es');
        assert.equal(await page.locator('main').getAttribute('aria-labelledby'), 'heading');
        assert.equal(await page.locator('#message').getAttribute('role'), 'status');
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('.brand').innerText(), 'iHambre');
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          fontSize: parseFloat(getComputedStyle(document.querySelector('#message')).fontSize),
          padding: parseFloat(getComputedStyle(document.querySelector('main')).paddingTop),
          notebook: getComputedStyle(document.body).backgroundImage,
        }));
        assert.equal(layout.overflow, false);
        assert.ok(layout.fontSize >= 16);
        assert.ok(layout.padding >= 24);
        assert.ok(layout.notebook.includes('gradient'));
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (width === 390 && suffix.includes('error')) {
          await page.addStyleTag({ content: 'html { font-size: 100% !important; }' });
          await page.screenshot({ path: path.join(__dirname, 'error-mobile.png'), fullPage: true });
        }
        if (width === 390 && suffix.includes('access_token')) {
          await page.addStyleTag({ content: 'html { font-size: 100% !important; }' });
          await page.screenshot({ path: path.join(__dirname, 'success-mobile.png'), fullPage: true });
        }
      } finally { await context.close(); }
    }
  }
});

test('callback is scrubbed immediately without leaking or persisting fake tokens', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [], consoleMessages = [];
  page.on('request', request => requests.push(request.url()));
  page.on('console', message => consoleMessages.push(message.text()));
  await context.addInitScript(() => {
    window.scrubs = [];
    const original = history.replaceState.bind(history);
    history.replaceState = (...args) => {
      window.scrubs.push(document.readyState);
      return original(...args);
    };
    document.addEventListener('DOMContentLoaded', () => { window.urlAtReady = location.href; });
  });
  try {
    await page.goto(origin + '/#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&refresh_token=FAKE_TEST_REFRESH_TOKEN&type=signup');
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.evaluate(() => window.scrubs[0]), 'loading');
    assert.equal(await page.evaluate(() => window.urlAtReady), origin + '/');
    assert.equal(await page.evaluate(() => history.length), 2);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(await context.cookies(), []);
    assert.ok(!(await page.content()).includes('FAKE_TEST_'));
    assert.ok(requests.every(url => url.startsWith(origin + '/') && !url.includes('FAKE_TEST_')));
    assert.deepEqual(consoleMessages, []);
    await page.reload();
    assert.equal(await page.locator('h1').textContent(), 'Te damos la bienvenida');
    for (const suffix of ['#error_description=expired', '?error=expired#type=signup', '#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=recovery']) {
      await page.goto('about:blank'); // A new callback document, not a same-document anchor jump.
      await page.goto(origin + '/' + suffix);
      assert.equal(new URL(page.url()).hash, '');
      assert.equal(new URL(page.url()).search, '');
    }
  } finally { await context.close(); }
});

test('errors in either URL component take precedence and never inject descriptions', async () => {
  const malicious = encodeURIComponent('<img src=x onerror="window.injected=true">');
  for (const suffix of [`#error=access_denied&error_description=${malicious}`, `?error=access_denied&error_description=${malicious}`, '#error_description=expired', '#error_code=otp_expired&access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=signup', '?error_code=otp_expired#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=signup', '?error_description=expired#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=signup', '#error=&access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=signup']) {
    const { context, page } = await visit(suffix);
    try {
      assert.equal(await page.locator('h1').textContent(), 'No se pudo confirmar el correo');
      assert.ok((await page.locator('#message').innerText()).includes('caducado'));
      assert.equal(await page.locator('img:not(.logo)').count(), 0);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      assert.ok(!(await page.locator('body').innerText()).includes('<img'));
    } finally { await context.close(); }
  }
});

test('direct and unproven visits stay neutral', async () => {
  for (const suffix of ['', '#type=signup', '#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL', '#access_token=&type=signup', '#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=recovery', '?access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=signup']) {
    const { context, page } = await visit(suffix);
    try {
      assert.equal(await page.locator('h1').textContent(), 'Te damos la bienvenida');
      assert.ok(!(await page.locator('body').innerText()).includes('¡Cuenta activada!'));
    } finally { await context.close(); }
  }
});

test('signup implicit redirect shows the Spanish confirmation', async () => {
  const { context, page } = await visit('#access_token=FAKE_TEST_TOKEN_NOT_A_CREDENTIAL&type=signup');
  try {
    assert.equal(await page.locator('h1').textContent(), '¡Cuenta activada!');
    assert.ok((await page.locator('body').innerText()).includes('Vuelve a la aplicación iHambre y empieza a disfrutar de una vida sana organizada con tu pareja o amigos.'));
  } finally { await context.close(); }
});
