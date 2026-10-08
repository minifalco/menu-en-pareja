import { expect, test } from '@playwright/test';

test('editing a planned recipe updates menu and aggregated shopping together without removing meals', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear primer plato' }).click();
  await page.getByPlaceholder('p. ej. Tortilla de patata').fill('Arroz familiar');
  await page.getByRole('textbox', { name: 'Ingrediente 1', exact: true }).fill('Arroz — 100 g');
  await page.getByRole('button', { name: 'Añadir ingrediente' }).click();
  await page.getByRole('textbox', { name: 'Ingrediente 2', exact: true }).fill('Cebolla');
  await page.getByRole('button', { name: 'Guardar plato' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByText('Añadir menú', { exact: true }).first().click();
    await page.getByText('Arroz familiar', { exact: true }).last().click();
    await expect(page.getByText('2 platos', { exact: true })).toHaveCount(i === 1 ? 1 : 0);
  }
  await page.getByText('Compra', { exact: true }).click();
  await expect(page.getByText('200 g', { exact: true })).toBeVisible();
  await page.getByText('Arroz', { exact: true }).click();
  await page.getByRole('button', { name: 'Añadir artículo a la lista' }).click();
  await page.getByPlaceholder('p. ej. detergente').fill('Jabón');
  await page.getByRole('button', { name: 'Añadir a la compra' }).click();
  await page.getByText('Platos', { exact: true }).click();
  await page.getByRole('button', { name: 'Editar Arroz familiar' }).click();
  await page.getByPlaceholder('p. ej. Tortilla de patata').fill('Arroz renovado');
  await page.getByRole('textbox', { name: 'Ingrediente 1', exact: true }).fill('Arroz — 250 g');
  await page.getByRole('textbox', { name: 'Ingrediente 2', exact: true }).fill('Tomate — 2 ud');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByText('Compra', { exact: true }).click();
  await expect(page.getByText('500 g', { exact: true })).toBeVisible();
  await expect(page.getByText('4 ud', { exact: true })).toBeVisible();
  await expect(page.getByText('Cebolla', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Jabón', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Arroz', exact: true })).toBeChecked();
  await page.getByText('Semana', { exact: true }).click();
  await expect(page.getByText('Arroz renovado', { exact: true })).toHaveCount(2);
  await expect(page.getByText('2 platos', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText('Compra', { exact: true }).click();
  await expect(page.getByText('500 g', { exact: true })).toBeVisible();
});

test('editing also repairs legacy local menus in an unopened week before a rename', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear primer plato' }).waitFor();
  // The app saves its empty initial state once after loading; seed only after that write.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('menu-pareja:local:recipes'))).not.toBeNull();
  await page.evaluate(() => {
    const date = new Date(); date.setDate(date.getDate() - (date.getDay() + 6) % 7 + 7);
    const week = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const recipe = { id: 'legacy-recipe', title: 'Antiguo', note: '', ingredients: [{ name: 'Patata', quantity: 100, unit: 'g' }] };
    localStorage.setItem('menu-pareja:local:recipes', JSON.stringify([recipe]));
    localStorage.setItem('menu-pareja:local:' + week, JSON.stringify({ recipes: [recipe], meals: [{ id: 'legacy-meal', title: recipe.title, ingredients: recipe.ingredients, day: week, slot: 'comida' }], checks: {}, manualItems: [] }));
  });
  await page.reload();
  await page.getByText('Platos', { exact: true }).click();
  await page.getByRole('button', { name: 'Editar Antiguo' }).click();
  await page.getByPlaceholder('p. ej. Tortilla de patata').fill('Renombrado');
  await page.getByRole('textbox', { name: 'Ingrediente 1', exact: true }).fill('Patata — 300 g');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByLabel('Semana siguiente', { exact: true }).click();
  await page.getByText('Compra', { exact: true }).click();
  await expect(page.getByText('300 g', { exact: true })).toBeVisible();
  await page.getByText('Semana', { exact: true }).click();
  await expect(page.getByText('Renombrado', { exact: true })).toHaveCount(1);
});
