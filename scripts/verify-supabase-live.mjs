// Real, isolated Supabase verification. Never run against another project.
// Usage: SUPABASE_TEST_KEYS_FILE=<private JSON from management API> node scripts/verify-supabase-live.mjs [--security-only] [--out=path]
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';

const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env };
const url = env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'rfdpptoctjolnfiavtts.supabase.co', 'Unexpected project; refusing to write');
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const keys = JSON.parse(readFileSync(env.SUPABASE_TEST_KEYS_FILE, 'utf8'));
const service = keys.find(k => k.name === 'service_role')?.api_key;
assert.ok(service, 'Scoped account cleanup requires admin key');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, service, options);
const guest = createClient(url, anon, options);
const run = `live-${randomUUID()}`;
const report = { run, project: new URL(url).hostname, started: new Date().toISOString(), checks: [], cleanup: [] };
const users = [], clients = [], households = [];
const tables = ['recipes', 'planned_meals', 'shopping_checks', 'manual_shopping_items'];
function ok(result) { if (result.error) throw new Error(`${result.error.code ?? 'error'}: ${result.error.message}`); return result.data; }
async function check(name, fn) {
  try { const details = await fn(); report.checks.push({ name, status: 'PASS', ...(details ? { details } : {}) }); console.log(`PASS ${name}`); }
  catch (e) { report.checks.push({ name, status: 'FAIL', error: e.message }); console.log(`FAIL ${name}: ${e.message}`); }
}
function storedClient(storage = new Map()) {
  const adapter = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
  return { client: createClient(url, anon, { auth: { storage: adapter, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }), storage };
}
async function subscribe(client, household, filtered = true) {
  const events = [];
  const subscribePrivate = filtered ? (await import('../src/data/householdRealtime.ts')).subscribeHouseholdChanges : null;
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 20000);
    const statusChanged = status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } else if (['CHANNEL_ERROR','TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(new Error(`Realtime ${status}`)); } };
    if (filtered) {
      subscribePrivate(client, household, change => events.push({ table: change.table, eventType: change.operation, new: change, old: {} }), statusChanged);
    } else {
      const channel=client.channel(`${run}-${randomUUID()}`);
      for (const table of tables) channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => events.push(payload));
      channel.subscribe(statusChanged);
    }
  });
  return events;
}
async function eventAfter(events, from, table, eventType) {
  const deadline = Date.now() + 15000;
  do {
    // Private broadcast is an invalidation, not row data. Each assertion below
    // verifies the exact persisted state through the other authenticated client.
    const found = events.slice(from).find(e => e.table === table && e.eventType === eventType);
    if (found) return;
    await new Promise(r => setTimeout(r,100));
  } while (Date.now() < deadline);
  throw new Error(`Missing realtime ${table} ${eventType}`);
}
try {
  await check('anonymous RPC execute denied', async () => {
    for (const [rpc, args] of [
      ['is_household_member', { target_household: randomUUID() }],
      ['create_household', { p_name: run, p_code: randomBytes(8).toString('hex') }],
      ['join_household', { p_code: randomBytes(8).toString('hex') }],
    ]) {
      const result = await guest.rpc(rpc, args);
      assert.ok(result.error, `Anonymous caller could execute SECURITY DEFINER ${rpc}`);
      assert.ok(['42501','PGRST202'].includes(result.error.code), `Unexpected denial ${rpc} ${result.error.code}`);
    }
  });
  for (let i=0;i<3;i++) {
    const email = `${run}-${i}@example.net`, password = `Test!${randomBytes(24).toString('base64url')}`;
    const { client, storage } = storedClient(); clients.push(client);
    let signup = await client.auth.signUp({ email, password, options: { data: { backend_verification_run: run } } });
    if (signup.error) {
      report.checks.push({ name: `public registration client ${i+1}`, status: 'BLOCKED', error: `${signup.error.code}: ${signup.error.message}` });
      console.log(`BLOCKED public registration client ${i+1}: ${signup.error.code}`);
      const created = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { backend_verification_run: run } }));
      signup = { data: { user: created.user, session: null }, error: null };
      report.checks.push({ name: `admin-provisioned disposable client ${i+1}`, status: 'PASS' });
    } else report.checks.push({ name: `public registration client ${i+1}`, status: 'PASS' });
    assert.ok(signup.data.user?.id, 'Registration returned no user');
    const user = signup.data.user; users.push(user.id);
    report.checks.push({ name: `account identity client ${i+1}`, status: 'PASS', details: { sessionImmediately: Boolean(signup.data.session) } });
    if (!signup.data.session && !signup.data.user.email_confirmed_at) {
      ok(await admin.auth.admin.updateUserById(user.id, { email_confirm: true }));
      report.checks.push({ name: `test-only email confirmation client ${i+1}`, status: 'PASS', details: 'Admin confirmed this disposable account; email delivery not tested' });
    }
    ok(await client.auth.signInWithPassword({email,password}));
    await check(`login/session persistence/refresh client ${i+1}`, async () => {
      const restored = storedClient(storage).client; clients.push(restored);
      const session = ok(await restored.auth.getSession()); assert.equal(session.session.user.id,user.id);
      assert.equal(ok(await restored.auth.getUser()).user.id,user.id);
      assert.equal(ok(await restored.auth.refreshSession()).user.id,user.id);
    });
  }
  const [a,b,c] = [clients[0],clients[2],clients[4]];
  await check('weak invite code rejected', async () => {
    const result = await a.rpc('create_household',{p_name:run,p_code:''});
    if (result.data) households.push(result.data);
    assert.ok(result.error, 'Empty invite accepted; anyone can join with empty code');
  });
  if (!process.argv.includes('--security-only')) {
    const invite = randomBytes(8).toString('hex').toUpperCase();
    const household = ok(await a.rpc('create_household',{p_name:run,p_code:invite})); households.push(household);
    await check('create household membership', async () => {
      assert.equal(ok(await a.from('households').select('*').eq('id',household)).length,1);
      assert.equal(ok(await a.from('household_members').select('*').eq('household_id',household))[0].user_id, users[0]);
    });
    await check('wrong invite refused', async () => assert.ok((await b.rpc('join_household',{p_code:`NO-${invite}`})).error));
    await check('normalized invite join and idempotence', async () => {
      assert.equal(ok(await b.rpc('join_household',{p_code:` ${invite.toLowerCase()} `})), household);
      assert.equal(ok(await b.rpc('join_household',{p_code:invite})), household);
      assert.equal(ok(await b.from('household_members').select('*').eq('household_id',household)).length,2);
    });
    const other = ok(await c.rpc('create_household',{p_name:`${run}-outside`,p_code:randomBytes(8).toString('hex')})); households.push(other);
    await check('outsider cannot self-enroll directly', async () => assert.ok((await c.from('household_members').insert({household_id:household,user_id:users[2]})).error));
    await check('production cloud realtime adapter exists', async () => {
      const module = await import('../src/data/householdRealtime.ts').catch(() => null);
      assert.equal(typeof module?.subscribeHouseholdChanges, 'function', 'Missing reusable production private realtime adapter');
    });
    await check('outsider private broadcast subscription rejected', async () => {
      await assert.rejects(subscribe(c,household), /Realtime CHANNEL_ERROR/);
    });
    const ea = await subscribe(a,household), eb = await subscribe(b,household), ec = await subscribe(c,household,false);
    report.checks.push({name:'two independent member broadcast subscriptions and outsider raw observer',status:'PASS'});
    const week = '2035-01-01';
    const fixtures = {
      recipes: {id:randomUUID(),household_id:household,title:run,ingredients:[{name:'Arroz',quantity:200,unit:'g'}],note:'test'},
      planned_meals: {id:randomUUID(),household_id:household,week_start:week,day_date:week,slot:'comida',title:run,ingredients:[{name:'Arroz',quantity:200,unit:'g'}]},
      shopping_checks: {household_id:household,week_start:week,item_key:'arroz|g',checked:true},
      manual_shopping_items: {id:randomUUID(),household_id:household,week_start:week,name:run,quantity:1,unit:'ud',checked:false},
    };
    for (const table of tables) {
      const row = fixtures[table];
      const match = n => table === 'shopping_checks' ? n.item_key === row.item_key && n.household_id === household : n.id === row.id;
      await check(`${table}: A insert -> B realtime/read`, async () => {
        const start = eb.length; ok(await a.from(table).insert(row));
        await eventAfter(eb,start,table,'INSERT',match);
        const read = ok(await b.from(table).select('*').eq('household_id',household)); assert.equal(read.length,1); assert.ok(match(read[0]));
      });
      const change = ['shopping_checks','manual_shopping_items'].includes(table) ? {checked:!row.checked} : {title:`${run}-updated`};
      await check(`${table}: B update -> A realtime/read`, async () => {
        const start = ea.length; let q=b.from(table).update(change).eq('household_id',household);
        q = table === 'shopping_checks' ? q.eq('item_key',row.item_key).eq('week_start',week) : q.eq('id',row.id);
        ok(await q); await eventAfter(ea,start,table,'UPDATE', n => match(n) && Object.entries(change).every(([k,v]) => n[k]===v));
        const read=ok(await a.from(table).select('*').eq('household_id',household)); assert.equal(read.length,1);
        for (const [k,v] of Object.entries(change)) assert.equal(read[0][k],v);
      });
      await check(`${table}: outsider read/write/move/delete denied`, async () => {
        assert.equal(ok(await c.from(table).select('*').eq('household_id',household)).length,0);
        const hostile = {...row,...(row.id ? {id:randomUUID()} : {item_key:'unauthorized'})};
        assert.ok((await c.from(table).insert(hostile)).error);
        assert.deepEqual(ok(await c.from(table).update(change).eq('household_id',household).select('*')),[]);
        assert.deepEqual(ok(await c.from(table).delete().eq('household_id',household).select('*')),[]);
        assert.ok((await a.from(table).update({household_id:other}).eq('household_id',household)).error);
        assert.equal(ok(await a.from(table).select('*').eq('household_id',household)).length,1);
      });
    }
    await check('households/members hidden from outsider and anonymous', async () => {
      for (const client of [c,guest]) for (const table of ['households','household_members']) {
        const result = await client.from(table).select('*').eq(table === 'households' ? 'id' : 'household_id',household);
        if (result.error) assert.equal(result.error.code,'42501'); else assert.equal(result.data.length,0);
      }
      for (const table of tables) {
        const result=await guest.from(table).select('*').eq('household_id',household);
        if (result.error) assert.equal(result.error.code,'42501'); else assert.equal(result.data.length,0);
        assert.ok((await guest.from(table).insert(fixtures[table])).error);
      }
    });
    await check('realtime does not leak inserts/updates to outsider', async () => {
      await new Promise(r=>setTimeout(r,2000)); assert.equal(ec.length,0);
    });
    for (const table of ['planned_meals','manual_shopping_items']) {
      await check(`${table}: delete realtime/read`, async () => {
        const start=ea.length;
        ok(await b.from(table).delete().eq('household_id',household));
        await eventAfter(ea,start,table,'DELETE', (_n,old) => old.id===fixtures[table].id);
        assert.equal(ok(await a.from(table).select('*').eq('household_id',household)).length,0);
      });
    }
    await check('realtime does not leak deletes to outsider', async () => {
      await new Promise(r=>setTimeout(r,2000)); assert.equal(ec.length,0);
    });
    await check('shopping check upsert both directions', async () => {
      for (const [writer,reader,events,value] of [[a,b,eb,true],[b,a,ea,false]]) {
        const start=events.length; ok(await writer.from('shopping_checks').upsert({...fixtures.shopping_checks,checked:value},{onConflict:'household_id,week_start,item_key'}));
        await eventAfter(events,start,'shopping_checks','UPDATE',n=>n.checked===value && n.household_id===household);
        assert.equal(ok(await reader.from('shopping_checks').select('checked').eq('household_id',household))[0].checked,value);
      }
    });
    await check('logout invalidates stored session',async()=>{
      ok(await b.auth.signOut()); assert.equal(ok(await b.auth.getSession()).session,null);
    });
  }
} catch(e) { report.checks.push({name:'verification setup/runtime',status:'BLOCKED',error:e.message}); console.log(`BLOCKED ${e.message}`); }
finally {
  for (const client of clients) await client.removeAllChannels();
  for (const id of users) {
    try {
      const user=ok(await admin.auth.admin.getUserById(id)).user;
      assert.equal(user.user_metadata.backend_verification_run,run,'Cleanup scope mismatch');
      ok(await admin.auth.admin.deleteUser(id));
      const result=await admin.auth.admin.getUserById(id); assert.ok(result.error,'Deleted account still exists');
      report.cleanup.push({type:'test-user',id,status:'PASS'});
    } catch(e) {report.cleanup.push({type:'test-user',id,status:'FAIL',error:e.message});}
  }
  for (const id of households) {
    try {
      assert.equal(ok(await admin.from('households').select('id').eq('id',id)).length,0);
      for (const table of ['household_members',...tables]) assert.equal(ok(await admin.from(table).select('household_id').eq('household_id',id)).length,0);
      report.cleanup.push({type:'test-household-and-children',id,status:'PASS'});
    } catch(e) {report.cleanup.push({type:'test-household-and-children',id,status:'FAIL',error:e.message});}
  }
  report.finished=new Date().toISOString();
  report.summary={passed:report.checks.filter(x=>x.status==='PASS').length,failed:report.checks.filter(x=>x.status==='FAIL').length,blocked:report.checks.filter(x=>x.status==='BLOCKED').length,cleanupFailed:report.cleanup.filter(x=>x.status!=='PASS').length};
  const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'supabase/live-verification-result.json';
  writeFileSync(out,JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report.summary));
  process.exitCode=report.summary.failed||report.summary.blocked||report.summary.cleanupFailed?1:0;
}
