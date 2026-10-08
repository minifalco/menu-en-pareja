// Final compiled web UI against live Supabase, run-tagged disposable accounts only.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { expect } = require('@playwright/test');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict'), { parseEnv } = require('util');
const root = path.resolve(__dirname, '..'), run = 'recipe-shopping-' + crypto.randomUUID(), short = run.slice(-8);
const dir = path.join(root, 'artifacts/recipe-shopping'); fs.mkdirSync(dir, { recursive: true });
const tmp = fs.mkdtempSync('/home/nacho/.hermes/cache/scratch/recipe-shopping-auth-'); fs.chmodSync(tmp, 0o700);
const report = { run, started: new Date().toISOString(), url: process.env.VERIFY_APP_URL || 'http://127.0.0.1:8944/app/', provisioning: 'Admin-confirmed disposable users; not public signup/email-delivery evidence', checks: [] };
const users = [], clients = [], houses = []; let dashboard, browser, admin;
const record = check => report.checks.push({ check, status: 'PASS' });
(async () => {
  try {
    const src = '/home/nacho/.config/Hermes/Partitions/hermes-preview', dst = path.join(tmp, 'Default'); fs.mkdirSync(dst);
    for (const n of ['Local Storage', 'IndexedDB', 'Session Storage', 'Cookies', 'Cookies-journal', 'Network']) if (fs.existsSync(path.join(src, n))) fs.cpSync(path.join(src, n), path.join(dst, n), { recursive: true });
    dashboard = await chromium.launchPersistentContext(tmp, { headless: true, args: ['--no-sandbox'] });
    const d = await dashboard.newPage();
    const response = d.waitForResponse(r => new URL(r.url()).pathname === '/v1/projects/rfdpptoctjolnfiavtts/api-keys' && r.status() === 200, { timeout: 30000 });
    await d.goto('https://supabase.com/dashboard/project/rfdpptoctjolnfiavtts/settings/api-keys/legacy', { waitUntil: 'domcontentloaded' });
    const kd = await (await response).json(), keys = Array.isArray(kd) ? kd : kd.keys || kd.api_keys || [];
    const service = keys.find(k => k.name === 'service_role')?.api_key; assert(service, 'Missing authorized cleanup access');
    const env = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
    admin = createClient(env.EXPO_PUBLIC_SUPABASE_URL, service, { auth: { persistSession: false, autoRefreshToken: false } });
    await dashboard.close(); dashboard = null;
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const pages = [];
    for (const suffix of ['a', 'b']) {
      const email = `i.fernandezramos95+rs-${short}-${suffix}@gmail.com`, password = crypto.randomBytes(18).toString('hex');
      const r = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { backend_verification_run: run } }); assert(!r.error, r.error?.message); users.push(r.data.user.id);
      const c = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(c);
      const login = await c.auth.signInWithPassword({ email, password }); assert(!login.error, login.error?.message);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: 'sb-rfdpptoctjolnfiavtts-auth-token', session: login.data.session });
      pages.push(await context.newPage());
    }
    const code = short.toUpperCase(), houseName = 'RecipeShopping-' + short;
    const created = await clients[0].rpc('create_household', { p_name: houseName, p_code: code }); assert(!created.error, created.error?.message); houses.push({ id: created.data, name: houseName });
    const joined = await clients[1].rpc('join_household', { p_code: code }); assert(!joined.error, joined.error?.message);
    const [a, b] = pages;
    await Promise.all(pages.map(p => p.goto(report.url)));
    await expect(a.getByText(houseName + ' · sincronizado')).toBeVisible(); await expect(b.getByText(houseName + ' · sincronizado')).toBeVisible();
    await a.getByRole('button', { name: 'Crear primer plato' }).click();
    await a.getByPlaceholder('p. ej. Tortilla de patata').fill('Receta-' + short);
    for (const [i, value] of ['Arroz — 125,5 g', 'Berenjena — 2 ud', 'Cebolla'].entries()) {
      if (i) await a.getByRole('button', { name: 'Añadir ingrediente', exact: true }).click();
      await a.getByRole('textbox', { name: `Ingrediente ${i + 1}`, exact: true }).fill(value);
    }
    await a.getByPlaceholder('Algún truco o detalle…').fill('Nota de prueba');
    await a.getByRole('button', { name: 'Guardar plato' }).click();
    await expect(a.getByText('Plato guardado en vuestra colección.')).toBeVisible();
    const initial = await clients[0].from('recipes').select('*').eq('household_id', created.data); assert(!initial.error); assert.equal(initial.data.length, 1); const id = initial.data[0].id;
    record('Create recipe via individual input rows (+) stores correct quantity/unit schema');
    await a.getByText('Platos', { exact: true }).click(); await b.getByText('Platos', { exact: true }).click();
    await expect(b.getByRole('button', { name: 'Editar Receta-' + short, exact: true })).toBeVisible({ timeout: 20000 });
    await a.getByRole('button', { name: 'Editar Receta-' + short, exact: true }).click();
    await expect(a.getByRole('textbox', { name: 'Ingrediente 1', exact: true })).toHaveValue('Arroz — 125.5 g');
    await a.getByPlaceholder('p. ej. Tortilla de patata').fill('Editada-' + short);
    await a.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(b.getByRole('button', { name: 'Editar Editada-' + short, exact: true })).toBeVisible({ timeout: 20000 });
    const updated = await clients[1].from('recipes').select('id,title,note,ingredients').eq('household_id', created.data); assert(!updated.error); assert.equal(updated.data.length, 1); assert.equal(updated.data[0].id, id); assert.equal(updated.data[0].title, 'Editada-' + short); assert.deepEqual(updated.data[0].ingredients, [{ name: 'Arroz', quantity: 125.5, unit: 'g' }, { name: 'Berenjena', quantity: 2, unit: 'ud' }, { name: 'Cebolla' }]);
    record('Editing updates same recipe ID without duplicates; second authenticated UI receives realtime update');
    await a.screenshot({ path: path.join(dir, 'live-recipes.png') });
    await a.getByText('Semana', { exact: true }).click(); await a.getByText('Añadir menú', { exact: true }).first().click(); await a.getByText('Editada-' + short, { exact: true }).last().click();
    await expect(a.getByText('Menú añadido; la compra se ha actualizado.')).toBeVisible();
    await a.getByText('Compra', { exact: true }).click(); await b.getByText('Compra', { exact: true }).click();
    await expect(a.getByRole('checkbox', { name: 'Arroz', exact: true })).toBeVisible(); await expect(b.getByRole('checkbox', { name: 'Arroz', exact: true })).toBeVisible({ timeout: 20000 });
    await a.route(env.EXPO_PUBLIC_SUPABASE_URL + '/rest/v1/shopping_checks**', async route => { if (route.request().method() === 'POST') await new Promise(r => setTimeout(r, 700)); await route.continue(); });
    const before = await a.getByRole('checkbox', { name: 'Berenjena', exact: true }).boundingBox();
    await a.getByRole('checkbox', { name: 'Arroz', exact: true }).tap(); await expect(a.getByText('1 de 3 comprados')).toBeVisible({ timeout: 400 });
    await a.getByRole('checkbox', { name: 'Berenjena', exact: true }).tap(); await expect(a.getByText('2 de 3 comprados')).toBeVisible({ timeout: 400 });
    assert.deepEqual(await a.getByRole('checkbox', { name: 'Berenjena', exact: true }).boundingBox(), before);
    await expect(b.getByText('2 de 3 comprados')).toBeVisible({ timeout: 20000 });
    await expect(a.getByRole('checkbox', { name: 'Cebolla', exact: true })).not.toBeChecked();
    await b.getByRole('checkbox', { name: 'Berenjena', exact: true }).tap();
    await expect(a.getByText('1 de 3 comprados')).toBeVisible({ timeout: 20000 });
    const checks = await clients[0].from('shopping_checks').select('item_key,checked').eq('household_id', created.data); assert(!checks.error); assert.equal(checks.data.find(r => r.item_key === 'arroz|g').checked, true); assert.equal(checks.data.find(r => r.item_key === 'berenjena|ud').checked, false);
    record('Adjacent taps give immediate feedback, keep row positions, persist and sync in both directions over real cloud writes');
    await a.reload(); await a.getByText('Compra', { exact: true }).click(); await expect(a.getByText('1 de 3 comprados')).toBeVisible(); await a.screenshot({ path: path.join(dir, 'live-shopping.png') });
    record('Cloud recipe and checkbox persistence after reloading final compiled /app');
  } catch (e) { report.error = e.message; process.exitCode = 1; }
  finally {
    if (browser) await browser.close(); if (dashboard) await dashboard.close();
    if (admin) {
      for (const h of houses) {
        const before = await admin.from('households').select('id,name').eq('id', h.id).single(); assert.equal(before.data?.name, h.name);
        const members = await admin.from('household_members').select('user_id').eq('household_id', h.id); assert(members.data.every(m => users.includes(m.user_id)));
        const removed = await admin.from('households').delete().eq('id', h.id); assert(!removed.error); const after = await admin.from('households').select('id').eq('id', h.id); assert.equal(after.data.length, 0);
      }
      for (const id of users) { const before = await admin.auth.admin.getUserById(id); assert.equal(before.data.user.user_metadata.backend_verification_run, run); const removed = await admin.auth.admin.deleteUser(id); assert(!removed.error); const after = await admin.auth.admin.getUserById(id); assert(!after.data.user); }
      report.cleanup = { taggedAccountsDeleted: users.length, taggedHouseholdsDeleted: houses.length, verifiedReadback: true };
    }
    fs.rmSync(tmp, { recursive: true, force: true }); report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(dir, report.url.startsWith('https:') ? 'live-deployed-result.json' : 'live-export-result.json'), JSON.stringify(report, null, 2)+'\n'); console.log(JSON.stringify(report, null, 2));
  }
})();
