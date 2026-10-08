import { expect, test } from '@playwright/test';

test('un plato planificado genera una compra marcada y persiste localmente', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText('Menú & compra', { exact: true })).toBeVisible();
  await expect(page.getByText('Sincronización compartida se activa', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Crear primer plato' }).click();
  await page.getByPlaceholder('p. ej. Tortilla de patata').fill('Tortilla de patata');
  await page.getByRole('textbox', { name: 'Ingrediente 1', exact: true }).fill('Patatas — 500 g');
  await page.getByRole('button', { name: 'Añadir ingrediente' }).click();
  await page.getByRole('textbox', { name: 'Ingrediente 2', exact: true }).fill('Huevos — 4 ud');
  await page.getByRole('button', { name: 'Añadir ingrediente' }).click();
  await page.getByRole('textbox', { name: 'Ingrediente 3', exact: true }).fill('Cebolla');
  await page.getByRole('button', { name: 'Guardar plato' }).click();
  await page.getByText('Semana', { exact: true }).click();
  await page.getByText('Añadir menú', { exact: true }).first().click();
  await page.getByText('Tortilla de patata', { exact: true }).last().click();
  await page.getByText('Compra', { exact: true }).click();

  await expect(page.getByText('Patatas', { exact: true })).toBeVisible();
  await expect(page.getByText('500 g', { exact: true })).toBeVisible();
  await page.getByText('Patatas', { exact: true }).click();
  await expect(page.getByText('1 de 3 comprados')).toBeVisible();
  await page.getByRole('button', { name: 'Añadir artículo a la lista' }).click();
  await page.getByPlaceholder('p. ej. detergente').fill('detergente');
  await page.getByPlaceholder('p. ej. 2 botellas').fill('2 botellas');
  await page.getByRole('button', { name: 'Añadir a la compra' }).click();
  await expect(page.getByText('detergente', { exact: true })).toBeVisible();
  await page.getByText('detergente', { exact: true }).click();
  await expect(page.getByText('2 de 4 comprados')).toBeVisible();
  await page.reload();
  await page.getByText('Compra', { exact: true }).click();
  await expect(page.getByText('2 de 4 comprados')).toBeVisible();
  await page.screenshot({ path: 'artifacts/ui/shopping-populated.png' });
  await page.getByText('Platos', { exact: true }).click();
  await page.screenshot({ path: 'artifacts/ui/recipes-populated.png' });
  await page.getByText('Semana', { exact: true }).click();
  await page.screenshot({ path: 'artifacts/ui/week-populated.png' });
});
