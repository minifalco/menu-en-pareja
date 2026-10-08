import { expect, test } from '@playwright/test';

async function openLocal(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Crear primer plato' })).toBeVisible();
}

test('brand uses exact iHambre casing and the supplied logo', async ({ page }) => {
  await openLocal(page);
  await expect(page.getByText('iHambre', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Logo iHambre' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/ui/week-mobile.png' });
});

test('recipe form remains scrollable and saveable in a keyboard-sized viewport', async ({ page }) => {
  await openLocal(page);
  await page.getByRole('button', { name: 'Crear primer plato' }).click();
  await page.getByPlaceholder('p. ej. Tortilla de patata').fill('Arroz de prueba');
  // RN Modal's slide transition lasts 300ms; capture the settled sheet.
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'artifacts/ui/recipe-mobile.png' });
  await page.getByPlaceholder('Algún truco o detalle…').focus();
  await page.setViewportSize({ width: 390, height: 340 });
  const note = page.getByPlaceholder('Algún truco o detalle…');
  await note.fill('Una nota con el teclado abierto');
  const save = page.getByRole('button', { name: 'Guardar plato' });
  await save.scrollIntoViewIfNeeded();
  const box = await save.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(340);
  await page.screenshot({ path: 'artifacts/ui/recipe-keyboard.png' });
  await save.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Plato guardado en vuestra colección.')).toBeVisible();
});

test('manual shopping form remains scrollable above a keyboard-sized viewport', async ({ page }) => {
  await openLocal(page);
  await page.getByText('Compra', { exact: true }).click();
  await page.getByRole('button', { name: 'Añadir artículo a la lista' }).click();
  await page.getByPlaceholder('p. ej. detergente').fill('Jabón');
  await page.getByPlaceholder('p. ej. 2 botellas').focus();
  await page.setViewportSize({ width: 390, height: 260 });
  await page.getByPlaceholder('p. ej. 2 botellas').fill('2 botellas');
  const save = page.getByRole('button', { name: 'Añadir a la compra', exact: true });
  await save.scrollIntoViewIfNeeded();
  const box = await save.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(260);
  await page.screenshot({ path: 'artifacts/ui/manual-keyboard.png' });
  await save.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Jabón', { exact: true })).toBeVisible();
});

test('recipe validation is visible inside the open sheet', async ({ page }) => {
  await openLocal(page);
  await page.getByRole('button', { name: 'Crear primer plato' }).click();
  await page.getByRole('button', { name: 'Guardar plato' }).click();
  const error = page.getByText('Ponle un nombre al plato.', { exact: true });
  await expect(error).toBeVisible();
  const visibleAtCenter = await error.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  expect(visibleAtCenter).toBe(true);
});

test('manual sheet close control stays inside a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openLocal(page);
  await page.getByText('Compra', { exact: true }).click();
  await page.getByRole('button', { name: 'Añadir artículo a la lista' }).click();
  await page.waitForTimeout(350);
  const close = page.getByRole('button', { name: 'Cerrar artículo' });
  const box = await close.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await close.click();
});
