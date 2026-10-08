import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { buildManualItem } from '../src/domain/shopping';

test('manual form preserves hyphens, commas and digits in the name independently of amount', () => {
  for (const name of ['ui-e74efee8-ab43-4f1f-ae5c-32b38dad5906-manual', 'Vitamina-12', 'Leche, 2%']) {
    const item = buildManualItem(name, '2 ud', randomUUID());
    assert.equal(item.name, name);
    assert.equal(item.quantity, 2);
    assert.equal(item.unit, 'ud');
    assert.equal(item.checked, false);
  }
  assert.deepEqual(buildManualItem('  Pan ', '', 'id-1'), { name: 'Pan', id: 'id-1', checked: false });
});
import * as cloudState from '../src/domain/cloudState';

for (const change of ['household', 'week', 'account']) {
  test(`pending read and save completions cannot leak across a ${change} change`, async () => {
    const oldScope = cloudState.createAsyncBoundary();
    const readIsCurrent = oldScope.beginRead();
    let resolveRead!: (value: string) => void;
    let resolveSave!: (value: string) => void;
    const read = new Promise<string>(resolve => { resolveRead = resolve; });
    const save = new Promise<string>(resolve => { resolveSave = resolve; });
    let state = 'new scope';
    const readTask = read.then(value => { if (readIsCurrent()) state = value; });
    const saveTask = save.then(value => { if (oldScope.active()) state = value; });
    oldScope.close();
    resolveSave('old saved row'); resolveRead('old snapshot');
    await Promise.all([readTask, saveTask]);
    assert.equal(state, 'new scope');
  });
}

test('out-of-order asynchronous SELECTs retain the latest-started snapshot', async () => {
  const scope = cloudState.createAsyncBoundary();
  let resolveOld!: (value: string) => void;
  const old = new Promise<string>(resolve => { resolveOld = resolve; });
  const oldIsCurrent = scope.beginRead();
  let state = 'initial';
  const task = old.then(value => { if (oldIsCurrent()) state = value; });
  const latest = scope.beginRead();
  await Promise.resolve().then(() => { if (latest()) state = 'latest'; });
  resolveOld('old'); await task;
  assert.equal(state, 'latest');
});

test('async boundary discards old scope and out-of-order reload completions', async () => {
  assert.equal(typeof cloudState.createAsyncBoundary, 'function', 'scope ownership must guard asynchronous completions');
  const scope = cloudState.createAsyncBoundary();
  const first = scope.beginRead();
  const second = scope.beginRead();
  assert.equal(first(), false);
  assert.equal(second(), true);
  scope.invalidateReads();
  assert.equal(second(), false, 'SELECT begun before a committed write cannot overwrite it');
  const pending = scope.beginRead();
  scope.close();
  assert.equal(scope.active(), false);
  assert.equal(pending(), false, 'old household/week cannot update data, errors or cache');
  const next = cloudState.createAsyncBoundary();
  assert.equal(next.beginRead()(), true);
});

test('checkbox failure waits for partial writes and refetches authoritative state', async () => {
  assert.equal(typeof cloudState.persistCheckbox, 'function');
  const events: string[] = [];
  let finish!: () => void;
  const delayed = new Promise<void>(resolve => { finish = () => { events.push('persisted'); resolve(); }; });
  const failure = new Error('denied');
  const result = cloudState.persistCheckbox([Promise.reject(failure), delayed], async () => { events.push('refetched'); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, []);
  finish();
  await assert.rejects(result, /denied/);
  assert.deepEqual(events, ['persisted', 'refetched']);
});

test('all generated IDs are RFC4122 v4 UUIDs accepted by cloud UUID columns', () => {
  const helper = readFileSync(new URL('../src/domain/ids.ts', import.meta.url), 'utf8');
  const expression = helper.match(/(?:const makeId =|return)\s*(.+?);/g)?.find(line => line.includes('randomUUID') || line.includes('Date.now'));
  assert.ok(expression);
  const body = expression.replace(/^const makeId = \(\) => /, 'return ');
  const generate = new Function('randomUUID', body);
  const ids = Array.from({ length: 1000 }, () => generate(randomUUID));
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(helper, /from 'expo-crypto'/, 'native Android uses Expo crypto, not an optional browser global');
});

test('merge is idempotent when Broadcast SELECT beats save response for every collection', async () => {
  const { mergeById } = await import('../src/domain/cloudState');
  for (const collection of ['recipes', 'meals', 'manualItems']) {
    const saved = { id: 'persisted', title: collection, quantity: 2 };
    assert.deepEqual(mergeById([saved], saved), [saved]);
    assert.deepEqual(mergeById([{ ...saved, quantity: 1 }, saved], saved), [saved]);
    assert.deepEqual(mergeById([], saved), [saved]);
    const newer = { ...saved, checked: true };
    assert.deepEqual(mergeById([newer], saved), [newer], 'a later Broadcast checkbox must survive a delayed INSERT receipt');
  }
});
