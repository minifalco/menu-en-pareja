// Ad-hoc real two-browser UI verification; sessions are supplied via a private scratch JSON.
// UI sessions must belong to disposable accounts created and cleaned up by the caller.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
const env = parseEnv(readFileSync('.env', 'utf8'));
assert.equal(new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname, 'rfdpptoctjolnfiavtts.supabase.co');
const fixture = JSON.parse(readFileSync(process.env.SUPABASE_UI_SESSIONS_FILE, 'utf8'));
const report = { run: fixture.run, started: new Date().toISOString(), checks: [], scope: 'Real web UI with two separate browser contexts and disposable admin-confirmed sessions; NOT public signup or Android SecureStore.' };
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
const pages = [];
const db = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${fixture.users[0].session.access_token}` } } });
const ok = r => { if (r.error) throw r.error; return r.data; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, fn) { try { const details = await fn(); report.checks.push({ name, status: 'PASS', details }); console.log('PASS', name); } catch (e) { const ui = await Promise.all(pages.map(async p => (await p.locator('body').innerText()).slice(0,8000))); report.checks.push({ name, status: 'FAIL', error: e.message, ui }); console.log('FAIL', name, e.message); console.log('UI', JSON.stringify(ui)); } }
async function until(fn, timeout = 15000) { const deadline = Date.now() + timeout; do { if (await fn()) return; await pause(100); } while (Date.now() < deadline); throw new Error('UI assertion timeout'); }
async function tab(p, label) { await p.getByText(label, { exact: true }).click(); }
async function ready(p) { await p.reload(); await until(async () => (await p.locator('body').innerText()).includes('sincronizado')); await pause(1500); }
async function saved(p, fn) { await until(async () => { const text = await p.locator('body').innerText(); const error = text.match(/invalid input syntax for type uuid: [^\n]+/); if (error) throw new Error(error[0]); return fn(); }); }
let household;
try {
  for (const user of fixture.users.slice(0, 2)) {
    const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await context.addInitScript(({ key, session }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session)); }, { key: fixture.storageKey, session: user.session });
    const p = await context.newPage(); await p.goto(process.env.SUPABASE_UI_URL ?? 'http://127.0.0.1:8099'); pages.push(p);
    await until(async () => (await p.locator('body').innerText()).includes('Con quién compartes') || (await p.locator('body').innerText()).includes('sincronizado'));
  }
  const [a, b] = pages;
  await pause(1500); // Existing memberships may load after the initial household screen.
  await check('A creates household through UI and B joins through invitation UI', async () => {
    const existing = ok(await db.from('households').select('id,name,invite_code'));
    if (existing.length) household = existing[0];
    else {
      await a.getByPlaceholder('Nuestra casa').fill(fixture.run);
      await a.getByRole('button', { name: 'Crear casa compartida', exact: true }).click();
      await until(async () => (await a.locator('body').innerText()).includes('sincronizado'));
      household = ok(await db.from('households').select('id,name,invite_code')).find(h => h.name === fixture.run); assert.ok(household);
    }
    if ((await b.locator('body').innerText()).includes('Con quién compartes')) {
      await b.getByText('Unirme', { exact: true }).click(); await b.getByPlaceholder('8 letras o números').fill(household.invite_code);
      await b.getByRole('button', { name: 'Unirme a la casa', exact: true }).click();
    }
    await until(async () => (await b.locator('body').innerText()).includes('sincronizado'));
    assert.equal(ok(await db.from('household_members').select('user_id').eq('household_id', household.id)).length, 2);
  });
  assert.ok(household, 'Missing disposable household');
  assert.equal(household.name, fixture.run, 'Refusing to reset a household outside this disposable run');
  for (const table of ['planned_meals', 'shopping_checks', 'manual_shopping_items', 'recipes']) ok(await db.from(table).delete().eq('household_id', household.id));
  for (const p of pages) { await p.reload(); await until(async () => (await p.locator('body').innerText()).includes('sincronizado')); }
  await pause(2500);
  const recipe = `${fixture.run}-recipe`, manual = `${fixture.run}-manual`;
  await check('Recipe created in A appears in B without refresh', async () => {
    await tab(b, 'Platos');
    await a.getByRole('button', { name: 'Crear primer plato', exact: true }).click();
    await a.getByPlaceholder('p. ej. Tortilla de patata').fill(recipe);
    await a.locator('textarea').fill('Arroz — 200 g');
    await a.getByRole('button', { name: 'Guardar plato', exact: true }).click();
    await until(async () => await b.getByText(recipe, { exact: true }).count() === 1);
    await tab(a, 'Platos'); await pause(1000); assert.equal(await a.getByText(recipe, { exact: true }).count(), 1);
  });
  await check('Menu planned in B appears in A and both shopping lists', async () => {
    await tab(a, 'Semana'); await tab(b, 'Semana');
    await b.getByText('Añadir menú', { exact: true }).first().click(); await b.getByText(recipe, { exact: true }).click();
    await saved(b, async () => !await b.getByText('PLANIFICAR', { exact: true }).count());
    await until(async () => await a.getByText(recipe, { exact: true }).count() === 1);
    for (const p of pages) { await tab(p, 'Compra'); await until(async () => await p.getByText('Arroz', { exact: true }).count() === 1); }
  });
  await check('Manual item created in A appears in B; B checkbox updates A', async () => {
    for (const p of pages) { await ready(p); await tab(p, 'Compra'); }
    await a.getByRole('button', { name: 'Añadir artículo a la lista', exact: true }).click();
    await a.getByPlaceholder('p. ej. detergente').fill(manual); await a.getByPlaceholder('p. ej. 2 botellas').fill('2 ud');
    await a.getByRole('button', { name: 'Añadir a la compra', exact: true }).click();
    await saved(a, async () => !await a.getByPlaceholder('p. ej. detergente').count());
    await until(async () => await b.getByText(manual, { exact: true }).count() === 1);
    await b.getByText(manual, { exact: true }).click();
    const mealCount = ok(await db.from('planned_meals').select('id').eq('household_id', household.id)).length;
    await until(async () => (await a.locator('body').innerText()).includes(`1 de ${mealCount ? 2 : 1} comprados`));
  });
  await check('Manual deletion and menu deletion propagate between real UI clients', async () => {
    for (const p of pages) { await ready(p); await tab(p, 'Compra'); }
    await b.getByLabel('Eliminar añadido a mano', { exact: true }).click(); await until(async () => await a.getByText(manual, { exact: true }).count() === 0);
    await tab(a, 'Semana'); await tab(b, 'Semana'); await a.getByLabel(`Quitar ${recipe}`, { exact: true }).click();
    await until(async () => await b.getByText(recipe, { exact: true }).count() === 0);
  });
  // Hold only the successful INSERT response; Broadcast and subsequent SELECTs still arrive.
  // This deterministically tests the legitimate ordering: realtime reload before local append.
  async function delayedInsert(p, table, action) {
    const pattern = `**/rest/v1/${table}*`;
    await p.route(pattern, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch(); await pause(2000); await route.fulfill({ response });
    });
    try { await action(); await pause(500); } finally { await p.unroute(pattern); }
  }
  const raceRecipe = `${fixture.run}-race-recipe`;
  await check('Delayed recipe INSERT response does not duplicate UI after Broadcast reload', async () => {
    await tab(a, 'Semana'); await a.getByText('Añadir menú', { exact: true }).first().click();
    await a.getByText('＋  Crear un plato nuevo', { exact: true }).click();
    await a.getByPlaceholder('p. ej. Tortilla de patata').fill(raceRecipe); await a.locator('textarea').fill('Arroz — 100 g');
    await delayedInsert(a, 'recipes', async () => { await a.getByRole('button', { name: 'Guardar plato', exact: true }).click(); await until(async () => !(await a.getByPlaceholder('p. ej. Tortilla de patata').count())); });
    await tab(a, 'Platos'); assert.equal(ok(await db.from('recipes').select('id').eq('household_id', household.id).eq('title', raceRecipe)).length, 1);
    assert.equal(await a.getByText(raceRecipe, { exact: true }).count(), 1, 'One persisted recipe must yield exactly one UI card');
  });
  await check('Delayed menu INSERT response does not duplicate meal count or ingredient amounts', async () => {
    // Reload removes any duplicate introduced by the preceding independent assertion.
    await a.reload(); await until(async () => (await a.locator('body').innerText()).includes('sincronizado')); await pause(2500); await tab(a, 'Semana');
    await a.getByText('Añadir menú', { exact: true }).first().click();
    await delayedInsert(a, 'planned_meals', async () => { await a.getByText(raceRecipe, { exact: true }).click(); await saved(a, async () => !(await a.getByText('PLANIFICAR', { exact: true }).count())); });
    assert.equal(ok(await db.from('planned_meals').select('id').eq('household_id', household.id)).length, 1);
    assert.ok((await a.locator('body').innerText()).includes('1 platos'), 'One persisted meal must yield count 1, not 2');
  });
  await check('Delayed manual INSERT response does not double shopping quantity', async () => {
    await a.reload(); await until(async () => (await a.locator('body').innerText()).includes('sincronizado')); await pause(2500); await tab(a, 'Compra');
    const raceManual = `${fixture.run}-race-manual`; await a.getByRole('button', { name: 'Añadir artículo a la lista', exact: true }).click();
    await a.getByPlaceholder('p. ej. detergente').fill(raceManual); await a.getByPlaceholder('p. ej. 2 botellas').fill('2 ud');
    await delayedInsert(a, 'manual_shopping_items', async () => { await a.getByRole('button', { name: 'Añadir a la compra', exact: true }).click(); await saved(a, async () => !(await a.getByPlaceholder('p. ej. detergente').count())); });
    assert.equal(ok(await db.from('manual_shopping_items').select('id').eq('household_id', household.id).eq('name', raceManual)).length, 1);
    const row = a.getByText(raceManual, { exact: true }).locator('..').locator('..');
    const text = await row.innerText(); assert.ok(text.includes('2 ud'), `One persisted item of 2 ud must remain 2 ud; actual row: ${text}`);
  });
  await check('Failed manual checkbox is refetched and never left falsely checked', async () => {
    await ready(a); await tab(a, 'Compra');
    const name = `${fixture.run}-race-manual`;
    await until(async () => await a.getByText(name, { exact: true }).count() === 1);
    const row = ok(await db.from('manual_shopping_items').select('id,checked').eq('household_id', household.id).eq('name', name))[0];
    assert.equal(row.checked, false);
    const pattern = '**/rest/v1/manual_shopping_items*';
    await a.route(pattern, route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Forced checkbox denial', code: '42501' }) }) : route.continue());
    try {
      await a.getByText(name, { exact: true }).click();
      await until(async () => (await a.locator('body').innerText()).includes('No se pudo sincronizar esta casilla'));
      assert.ok((await a.locator('body').innerText()).includes('0 de 2 comprados'));
      assert.equal(ok(await db.from('manual_shopping_items').select('checked').eq('id', row.id))[0].checked, false);
    } finally { await a.unroute(pattern); }
  });
  await check('Failed ingredient checkbox remains consistent with persisted data', async () => {
    await ready(a); await tab(a, 'Compra');
    const pattern = '**/rest/v1/shopping_checks*';
    await a.route(pattern, route => route.request().method() === 'POST'
      ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Forced checkbox denial', code: '42501' }) }) : route.continue());
    try {
      await a.getByText('Arroz', { exact: true }).click();
      await until(async () => (await a.locator('body').innerText()).includes('No se pudo sincronizar esta casilla'));
      assert.ok((await a.locator('body').innerText()).includes('0 de 2 comprados'));
      assert.equal(ok(await db.from('shopping_checks').select('checked').eq('household_id', household.id)).filter(row => row.checked).length, 0);
    } finally { await a.unroute(pattern); }
  });
  await check('Delayed old-week Broadcast reload cannot contaminate next-week UI or cache', async () => {
    await ready(a); await tab(a, 'Semana');
    const week = ok(await db.from('planned_meals').select('week_start').eq('household_id', household.id))[0].week_start;
    const manualRow = ok(await db.from('manual_shopping_items').select('id').eq('household_id', household.id))[0];
    const pattern = '**/rest/v1/planned_meals*';
    let release, held;
    const barrier = new Promise(resolve => { release = resolve; });
    const captured = new Promise(resolve => { held = resolve; });
    let intercepted = false;
    await a.route(pattern, async route => {
      if (route.request().method() !== 'GET' || !route.request().url().includes(week) || intercepted) return route.continue();
      intercepted = true; const response = await route.fetch(); held(); await barrier; await route.fulfill({ response });
    });
    try {
      ok(await db.from('manual_shopping_items').update({ checked: true }).eq('id', manualRow.id));
      await Promise.race([captured, pause(15000).then(() => { throw new Error('Broadcast did not start a held old-week reload'); })]);
      await a.getByLabel('Semana siguiente', { exact: true }).click();
      await until(async () => !(await a.locator('body').innerText()).includes('Cargando vuestra semana'));
      release(); await pause(2500);
      assert.ok((await a.locator('body').innerText()).includes('0 platos'));
      assert.equal(await a.getByText(raceRecipe, { exact: true }).count(), 0);
      const cached = await a.evaluate(id => Object.entries(localStorage).filter(([key]) => key.startsWith(`menu-pareja:${id}:`)).map(([key,value]) => ({ key, value: JSON.parse(value) })), household.id);
      for (const cache of cached.filter(entry => !entry.key.endsWith(week))) {
        assert.equal(cache.value.meals.length, 0); assert.equal(cache.value.manualItems.length, 0);
      }
    } finally { release(); await a.unroute(pattern); }
    await a.getByLabel('Semana anterior', { exact: true }).click();
    await until(async () => (await a.locator('body').innerText()).includes('1 platos'));
  });
  await check('Delayed save response from old week cannot append into the newly selected week', async () => {
    await tab(a, 'Compra');
    const name = `${fixture.run}-scope-manual`;
    await a.getByRole('button', { name: 'Añadir artículo a la lista', exact: true }).click();
    await a.getByPlaceholder('p. ej. detergente').fill(name); await a.getByPlaceholder('p. ej. 2 botellas').fill('3 ud');
    const pattern = '**/rest/v1/manual_shopping_items*';
    let held, release;
    const captured = new Promise(resolve => { held = resolve; });
    const barrier = new Promise(resolve => { release = resolve; });
    await a.route(pattern, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch(); held(); await barrier; await route.fulfill({ response });
    });
    try {
      await a.getByRole('button', { name: 'Añadir a la compra', exact: true }).click();
      await captured;
      await a.getByLabel('Cerrar artículo', { exact: true }).click();
      await a.getByLabel('Semana siguiente', { exact: true }).click();
      await until(async () => !(await a.locator('body').innerText()).includes('Cargando vuestra semana'));
      release(); await pause(2500);
      assert.equal(await a.getByText(name, { exact: true }).count(), 0);
      assert.ok((await a.locator('body').innerText()).includes('0 de 0 comprados'));
      assert.equal(ok(await db.from('manual_shopping_items').select('id').eq('household_id', household.id).eq('name', name)).length, 1);
    } finally { release(); await a.unroute(pattern); }
    await a.getByLabel('Semana anterior', { exact: true }).click();
    await until(async () => await a.getByText(name, { exact: true }).count() === 1);
  });
} catch (e) { report.checks.push({ name: 'UI setup/runtime', status: 'FAIL', error: e.message }); console.log('FAIL UI setup/runtime', e.message); }
finally {
  await browser.close(); report.finished = new Date().toISOString(); report.householdId = household?.id;
  report.summary = { passed: report.checks.filter(c => c.status === 'PASS').length, failed: report.checks.filter(c => c.status === 'FAIL').length };
  report.cleanup = 'Disposable accounts remain temporarily for coordinated native verification; caller must delete scoped accounts and verify household cascade.';
  writeFileSync('supabase/live-ui-verification-result.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report.summary)); process.exitCode = report.summary.failed ? 1 : 0;
}
