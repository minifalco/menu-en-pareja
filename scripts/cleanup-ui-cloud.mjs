// Run only after both web and native workers have finished using the disposable UI sessions.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
const env = parseEnv(readFileSync('.env', 'utf8'));
assert.equal(new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname, 'rfdpptoctjolnfiavtts.supabase.co');
const sessionFile = process.env.SUPABASE_UI_SESSIONS_FILE;
const keysFile = process.env.SUPABASE_TEST_KEYS_FILE;
const fixture = JSON.parse(readFileSync(sessionFile, 'utf8'));
assert.ok(fixture.run.startsWith('ui-'));
const keys = JSON.parse(readFileSync(keysFile, 'utf8'));
const admin = createClient(env.EXPO_PUBLIC_SUPABASE_URL, keys.find(k => k.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = r => { if (r.error) throw r.error; return r.data; };
const report = { run: fixture.run, started: new Date().toISOString(), cleanup: [] };
const houses = ok(await admin.from('households').select('id').eq('name', fixture.run));
// Validate every target before deleting any account.
for (const user of fixture.users) {
  const target = ok(await admin.auth.admin.getUserById(user.id)).user;
  assert.equal(target.user_metadata.backend_verification_run, fixture.run, 'Account outside cleanup scope');
}
for (const user of fixture.users) {
  ok(await admin.auth.admin.deleteUser(user.id));
  assert.ok((await admin.auth.admin.getUserById(user.id)).error, 'Account still exists');
  report.cleanup.push({ type: 'test-user', id: user.id, status: 'PASS' });
}
for (const house of houses) {
  for (const table of ['households', 'household_members', 'recipes', 'planned_meals', 'shopping_checks', 'manual_shopping_items']) {
    const column = table === 'households' ? 'id' : 'household_id';
    assert.equal(ok(await admin.from(table).select(column).eq(column, house.id)).length, 0, `Cascade incomplete: ${table}`);
  }
  report.cleanup.push({ type: 'household-and-children', id: house.id, status: 'PASS' });
}
report.finished = new Date().toISOString();
writeFileSync('supabase/live-ui-cleanup-result.json', JSON.stringify(report, null, 2) + '\n');
unlinkSync(sessionFile); unlinkSync(keysFile);
console.log('UI_CLEANUP=ok; deleted scoped accounts, verified cascades, removed private session and key files.');
