import { expect, test } from '@playwright/test';

test('tap a saved recipe edits in place, preserves exact quantities and persists without duplicates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Crear primer plato' })).toBeVisible();
  // The app saves its empty initial state once after loading; seed only after that write.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('menu-pareja:local:recipes'))).not.toBeNull();
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('menu-pareja:local:recipes', JSON.stringify([{ id: 'existing-recipe', title: 'Arroz original', note: 'Reposar', ingredients: [{ name: 'Arroz', quantity: 0.125, unit: 'kg' }, { name: 'Sal' }] }]));
  });
  await page.reload();
  await page.getByText('Platos', { exact: true }).click();
  await page.getByText('Arroz original', { exact: true }).click();
  await expect(page.getByPlaceholder('p. ej. Tortilla de patata')).toHaveValue('Arroz original');
  await page.getByPlaceholder('p. ej. Tortilla de patata').fill('Arroz editado');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Arroz editado', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('menu-pareja:local:recipes')!))).toEqual([{ id: 'existing-recipe', title: 'Arroz editado', note: 'Reposar', ingredients: [{ name: 'Arroz', quantity: 0.125, unit: 'kg' }, { name: 'Sal' }] }]);
  await page.reload();
  await page.getByText('Platos', { exact: true }).click();
  await expect(page.getByText('Arroz editado', { exact: true })).toHaveCount(1);
});

test('individual ingredient rows add with plus, remove without shifting values and reopen for editing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear primer plato' }).click();
  await page.getByPlaceholder('p. ej. Tortilla de patata').fill('Lentejas');
  await page.getByRole('textbox', { name: 'Ingrediente 1', exact: true }).fill('Lentejas — 125,5 g');
  await page.getByRole('button', { name: 'Añadir ingrediente', exact: true }).click();
  await page.getByRole('textbox', { name: 'Ingrediente 2', exact: true }).fill('Agua — 1 l');
  await page.getByRole('button', { name: 'Añadir ingrediente', exact: true }).click();
  await page.getByRole('textbox', { name: 'Ingrediente 3', exact: true }).fill('Sal');
  await page.getByRole('button', { name: 'Quitar ingrediente 2', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ingrediente 2', exact: true })).toHaveValue('Sal');
  await page.getByRole('button', { name: 'Guardar plato' }).click();
  await page.getByText('Platos', { exact: true }).click();
  await page.getByRole('button', { name: 'Editar Lentejas', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ingrediente 1', exact: true })).toHaveValue('Lentejas — 125.5 g');
  await expect(page.getByRole('textbox', { name: 'Ingrediente 2', exact: true })).toHaveValue('Sal');
  await page.getByRole('button', { name: 'Cerrar receta' }).click();
  await page.getByRole('button', { name: 'Añadir plato', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ingrediente 1', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Ingrediente 2', exact: true })).toHaveCount(0);
});
