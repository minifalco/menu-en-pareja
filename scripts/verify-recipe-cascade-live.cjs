// Final compiled web UI against live Supabase, run-tagged disposable accounts only.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { expect } = require('@playwright/test');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict'), { parseEnv } = require('util');
const root = path.resolve(__dirname, '..'), run = 'recipe-cascade-' + crypto.randomUUID(), short = run.slice(-8);
const dir = path.join(root, 'artifacts/recipe-sync'); fs.mkdirSync(dir, { recursive: true });
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
    if (process.env.RECIPE_SYNC_AUDIT) {
      const snapshot = {};
      for (const table of ['recipes', 'planned_meals', 'shopping_checks', 'manual_shopping_items']) {
        const read = await admin.from(table).select('*', { count: 'exact' }); assert(!read.error, read.error?.message); assert.equal(read.data.length, read.count, 'Snapshot truncated: ' + table); snapshot[table] = read.data;
      }
      if (process.env.RECIPE_SYNC_AUDIT === 'before') {
        fs.writeFileSync(path.join(dir, 'before-migration.json'), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
      } else {
        const before = JSON.parse(fs.readFileSync(path.join(dir, 'before-migration.json'), 'utf8'));
        for (const table of ['recipes', 'shopping_checks', 'manual_shopping_items']) assert.deepEqual(snapshot[table], before[table], table + ' changed unexpectedly');
        assert.equal(snapshot.planned_meals.length, before.planned_meals.length);
        let bound = 0, unchangedUnlinked = 0;
        for (const original of before.planned_meals) {
          const row = snapshot.planned_meals.find(m => m.id === original.id); assert(row, 'Meal removed');
          for (const field of ['household_id', 'week_start', 'day_date', 'slot', 'created_at']) assert.equal(row[field], original[field]);
          const matches = before.recipes.filter(r => r.household_id === original.household_id && r.title === original.title);
          if (matches.length === 1) { assert.equal(row.recipe_id, matches[0].id); assert.deepEqual(row.ingredients, matches[0].ingredients); bound++; }
          else { assert.equal(row.recipe_id, null); assert.deepEqual(row.ingredients, original.ingredients); unchangedUnlinked++; }
        }
        report.preservation = { mealCount: snapshot.planned_meals.length, legacyMealsBound: bound, unchangedUnlinked, recipesChecksManualUntouched: true, idsDatesSlotsPreserved: true };
      }
      report.audit = process.env.RECIPE_SYNC_AUDIT; record('Read-only migration backup/preservation audit'); return;
    }
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
    const initialIngredients = [{ name: 'Arroz', quantity: 100, unit: 'g' }, { name: 'Cebolla' }];
    const newIngredients = [{ name: 'Arroz', quantity: 250, unit: 'g' }, { name: 'Tomate', quantity: 2, unit: 'ud' }];
    const r = await clients[0].from('recipes').insert({ household_id: created.data, title: 'Original-' + short, ingredients: initialIngredients, note: '' }).select('id').single(); assert(!r.error, r.error?.message);
    const recipeId = r.data.id;
    // Deliberately use old-client INSERT shape, with no recipe_id.
    const planned = await clients[0].from('planned_meals').insert(['2026-10-05', '2026-10-12'].map(week => ({ household_id: created.data, week_start: week, day_date: week, slot: 'comida', title: 'Original-' + short, ingredients: initialIngredients }))).select('id,week_start,day_date,slot'); assert(!planned.error, planned.error?.message);
    const update = await clients[0].from('recipes').update({ title: 'Renamed-' + short, ingredients: newIngredients }).eq('id', recipeId).select('id').single(); assert(!update.error, update.error?.message);
    // First SELECT after the single UPDATE receipt must see a complete cascade.
    const changed = await clients[1].from('planned_meals').select('id,week_start,day_date,slot,title,ingredients').eq('household_id', created.data).order('week_start'); assert(!changed.error, changed.error?.message);
    assert.equal(changed.data.length, 2);
    for (const row of changed.data) {
      assert.deepEqual(row.ingredients, newIngredients, 'Saving a recipe must refresh every planned instance in the same transaction');
      assert.equal(row.title, 'Renamed-' + short);
      const original = planned.data.find(m => m.id === row.id); assert(original, 'Meal ID changed');
      for (const field of ['week_start', 'day_date', 'slot']) assert.equal(row[field], original[field]);
    }
    record('Single recipe UPDATE atomically cascades ingredients and renamed title to legacy meals across weeks; IDs/dates/slots preserved');
    // A new client can link explicitly; household boundary is validated server-side.
    const linked = await clients[0].from('planned_meals').insert({ household_id: created.data, recipe_id: recipeId, week_start: '2026-10-05', day_date: '2026-10-06', slot: 'cena', title: 'stale client title', ingredients: [] }).select('id,recipe_id,title,ingredients').single(); assert(!linked.error, linked.error?.message);
    assert.equal(linked.data.recipe_id, recipeId); assert.deepEqual(linked.data.ingredients, newIngredients); assert.equal(linked.data.title, 'Renamed-' + short);
    record('Explicit ID plans use canonical recipe payload, not stale client snapshots');
    // Two same-title recipes must never cause automatic linkage of a legacy row.
    const duplicates = await clients[0].from('recipes').insert([1, 2].map(() => ({ household_id: created.data, title: 'Duplicate-' + short, ingredients: [], note: '' }))).select('id'); assert(!duplicates.error);
    const ambiguous = await clients[0].from('planned_meals').insert({ household_id: created.data, week_start: '2026-10-05', day_date: '2026-10-07', slot: 'comida', title: 'Duplicate-' + short, ingredients: [{ name: 'Preservado' }] }).select('recipe_id,ingredients').single(); assert(!ambiguous.error); assert.equal(ambiguous.data.recipe_id, null); assert.deepEqual(ambiguous.data.ingredients, [{ name: 'Preservado' }]);
    record('Ambiguous legacy recipe titles retain original ingredients without guessing');
    const concurrentIngredients = [{ name: 'Arroz', quantity: 375, unit: 'g' }];
    const [concurrentEdit, concurrentPlan] = await Promise.all([
      clients[0].from('recipes').update({ ingredients: concurrentIngredients }).eq('id', recipeId),
      clients[1].from('planned_meals').insert({ household_id: created.data, recipe_id: recipeId, week_start: '2026-10-19', day_date: '2026-10-19', slot: 'comida', title: 'stale', ingredients: [] }).select('id').single(),
    ]);
    assert(!concurrentEdit.error, concurrentEdit.error?.message); assert(!concurrentPlan.error, concurrentPlan.error?.message);
    const concurrentRows = await clients[0].from('planned_meals').select('ingredients').eq('recipe_id', recipeId); assert(!concurrentRows.error);
    for (const row of concurrentRows.data) assert.deepEqual(row.ingredients, concurrentIngredients);
    const reset = await clients[0].from('recipes').update({ ingredients: newIngredients }).eq('id', recipeId); assert(!reset.error);
    record('Concurrent plan INSERT and recipe UPDATE finish with canonical ingredients on every linked meal');
    const privateHouse = await clients[1].rpc('create_household', { p_name: 'Private-' + short, p_code: 'P' + code }); assert(!privateHouse.error); houses.push({ id: privateHouse.data, name: 'Private-' + short });
    const privateRecipe = await clients[1].from('recipes').insert({ household_id: privateHouse.data, title: 'Private recipe', ingredients: [], note: '' }).select('id').single(); assert(!privateRecipe.error);
    const forbidden = await clients[0].from('planned_meals').insert({ household_id: created.data, recipe_id: privateRecipe.data.id, week_start: '2026-10-05', day_date: '2026-10-08', slot: 'comida', title: 'forbidden', ingredients: [] }); assert(forbidden.error, 'Cross-household recipe references must be rejected');
    const leaked = await clients[0].from('recipes').select('id').eq('id', privateRecipe.data.id); assert(!leaked.error); assert.equal(leaked.data.length, 0);
    record('Cross-household recipe references rejected; outsider cannot read private recipe');
    if (process.env.VERIFY_APP_URL) {
      const [a, b] = pages;
      await Promise.all(pages.map(p => p.goto(report.url)));
      await Promise.all(pages.map(p => p.getByText('Compra', { exact: true }).click()));
      await expect(a.getByText('500 g', { exact: true })).toBeVisible();
      await expect(b.getByText('500 g', { exact: true })).toBeVisible();
      await a.getByRole('checkbox', { name: 'Arroz', exact: true }).tap();
      await expect(b.getByRole('checkbox', { name: 'Arroz', exact: true })).toBeChecked({ timeout: 20000 });
      await a.getByRole('button', { name: 'Añadir artículo a la lista' }).click();
      await a.getByPlaceholder('p. ej. detergente').fill('Jabón');
      await a.getByRole('button', { name: 'Añadir a la compra' }).click();
      await expect(b.getByRole('checkbox', { name: 'Jabón', exact: true })).toBeVisible({ timeout: 20000 });
      await a.getByText('Platos', { exact: true }).click();
      await a.getByRole('button', { name: 'Editar Renamed-' + short, exact: true }).click();
      await a.getByRole('textbox', { name: 'Ingrediente 1', exact: true }).fill('Arroz — 300 g');
      await a.getByRole('textbox', { name: 'Ingrediente 2', exact: true }).fill('Calabacín — 3 ud');
      await a.getByPlaceholder('p. ej. Tortilla de patata').fill('Final-' + short);
      await a.getByRole('button', { name: 'Guardar cambios' }).click();
      await a.getByText('Compra', { exact: true }).click();
      for (const p of [a, b]) {
        await expect(p.getByText('600 g', { exact: true })).toBeVisible({ timeout: 20000 });
        await expect(p.getByText('6 ud', { exact: true })).toBeVisible();
        await expect(p.getByRole('checkbox', { name: 'Tomate', exact: true })).toHaveCount(0);
        await expect(p.getByRole('checkbox', { name: 'Jabón', exact: true })).toBeVisible();
        await expect(p.getByRole('checkbox', { name: 'Arroz', exact: true })).toBeChecked();
      }
      await a.screenshot({ path: path.join(dir, 'shopping-after-edit.png') });
      await a.getByText('Semana', { exact: true }).click();
      await expect(a.getByText('Final-' + short, { exact: true })).toHaveCount(2);
      await a.reload(); await a.getByText('Compra', { exact: true }).click();
      await expect(a.getByText('600 g', { exact: true })).toBeVisible();
      await a.getByText('Semana', { exact: true }).click();
      await a.getByText('Añadir menú', { exact: true }).first().click();
      const planRequest = a.waitForRequest(request => request.url().includes('/rest/v1/planned_meals') && request.method() === 'POST');
      await a.getByText('Duplicate-' + short, { exact: true }).last().click();
      const payload = (await planRequest).postDataJSON(); assert(duplicates.data.some(recipe => recipe.id === payload.recipe_id), 'New UI plans must send stable recipe_id even with duplicate titles');
      await expect(a.getByText('Menú añadido; la compra se ha actualizado.')).toBeVisible();
      const storedPlan = await clients[0].from('planned_meals').select('recipe_id').eq('id', payload.id).single(); assert(!storedPlan.error); assert.equal(storedPlan.data.recipe_id, payload.recipe_id);
      record('Actual new-client planning request preserves recipe_id for same-title recipes');
      record('Final compiled UI edit updates existing menus and both shopping clients together; quantities, manual items and matching check state preserved after reload');
    }
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
    fs.writeFileSync(path.join(dir, report.url.startsWith('https:') ? 'live-deployed-result.json' : process.env.VERIFY_APP_URL ? 'live-export-result.json' : 'live-backend-result.json'), JSON.stringify(report, null, 2)+'\n'); console.log(JSON.stringify(report, null, 2));
  }
})();