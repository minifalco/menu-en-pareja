import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonday, formatISODate, addDays, getWeekDates } from '../src/domain/dates';

test('calcula el lunes correspondiente incluso si la fecha es domingo', () => {
  assert.equal(getMonday(new Date(2026, 9, 11)), '2026-10-05');
});

test('devuelve siete fechas locales consecutivas desde el lunes', () => {
  const days = getWeekDates('2026-10-05');
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-10-05');
  assert.equal(days[6], '2026-10-11');
  assert.equal(addDays(days[6], 1), '2026-10-12');
});
