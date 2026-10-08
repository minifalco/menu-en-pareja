import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
test('Android resizes the app window instead of covering focused forms', () => {
  assert.equal(config.android.softwareKeyboardLayoutMode, 'resize');
});
test('installed and web app names use exact iHambre brand casing', () => {
  assert.equal(config.name, 'iHambre');
  assert.equal(config.web.name, 'iHambre');
  assert.equal(config.web.shortName, 'iHambre');
  assert.equal(JSON.parse(readFileSync('public/manifest.json', 'utf8')).name, 'iHambre');
});
test('Android identity remains compatible with existing installations', () => {
  assert.equal(config.android.package, 'es.nacho.menuenpareja');
  assert.equal(config.scheme, 'menuenpareja');
});
