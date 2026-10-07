import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateShopping } from '../src/domain/shopping';
import type { PlannedMeal, ShoppingItem } from '../src/domain/types';

const plans: PlannedMeal[] = [
  {
    id: 'meal-1', title: 'Arroz con verduras', day: '2026-10-12', slot: 'comida',
    ingredients: [{ name: 'Arroz', quantity: 100, unit: 'g' }, { name: 'Pimiento' }],
  },
  {
    id: 'meal-2', title: 'Ensalada de arroz', day: '2026-10-13', slot: 'cena',
    ingredients: [{ name: ' arroz ', quantity: 200, unit: 'G' }],
  },
];

test('suma ingredientes repetidos sin distinguir mayúsculas y conserva unidades', () => {
  const result = aggregateShopping(plans, {}, []);
  const rice = result.find(item => item.key === 'arroz|g');
  assert.equal(rice?.quantity, 300);
  assert.equal(rice?.unit, 'g');
  assert.deepEqual(rice?.sources, ['Arroz con verduras', 'Ensalada de arroz']);
});

test('conserva el marcado del mismo artículo y añade artículos manuales', () => {
  const result = aggregateShopping(plans, { 'arroz|g': true }, [
    { id: 'manual-1', name: 'Café', quantity: 1, unit: 'paquete' },
  ]);
  assert.equal(result.find(item => item.key === 'arroz|g')?.checked, true);
  assert.equal(result.find(item => item.key === 'café|paquete')?.manual, true);
});

test('elimina de la lista los ingredientes de menús retirados', () => {
  const result = aggregateShopping([plans[1]], {}, []);
  assert.equal(result.some(item => item.key === 'pimiento|'), false);
  assert.equal(result.some(item => item.key === 'arroz|g'), true);
});
