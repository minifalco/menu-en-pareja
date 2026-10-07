import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredients } from '../src/domain/ingredients';

test('convierte una lista escrita en líneas en ingredientes con cantidad opcional', () => {
  assert.deepEqual(parseIngredients('Arroz — 200 g\nTomate\nLeche, 1 litro'), [
    { name: 'Arroz', quantity: 200, unit: 'g' },
    { name: 'Tomate' },
    { name: 'Leche', quantity: 1, unit: 'litro' },
  ]);
});
