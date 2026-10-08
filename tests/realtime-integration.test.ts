import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('la app usa el adaptador privado verificado y no la publicación retirada', () => {
  const source = readFileSync(new URL('../src/state/AppState.tsx', import.meta.url), 'utf8');
  assert.match(source, /subscribeHouseholdChanges\(client, household\.id,/);
  assert.doesNotMatch(source, /\.on\('postgres_changes'/);
  assert.match(source, /client\.removeChannel\(channel\)/);
});
