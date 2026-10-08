import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, fail = false) {
  const manual = [{ id: 'a', name: 'Arroz', checked: false }, { id: 'b', name: 'Berenjena', checked: false }, { id: 'c', name: 'Cebolla', checked: false }];
  const writes: string[] = [];
  await page.route('https://ihambre-ui.invalid/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.endsWith('/household_members')) return route.fulfill({ json: [{ household_id: 'house-a' }] });
    if (url.pathname.endsWith('/households')) return route.fulfill({ json: [{ id: 'house-a', name: 'Compra pruebas', invite_code: 'ABCDEFGH' }] });
    if (url.pathname.endsWith('/manual_shopping_items')) {
      if (request.method() === 'PATCH') {
        const id = url.searchParams.get('id')!.slice(3); writes.push(id);
        await new Promise(resolve => setTimeout(resolve, 1200));
        if (fail && id === 'a') return route.fulfill({ status: 500, json: { message: 'fallo controlado' } });
        manual.find(r => r.id === id)!.checked = request.postDataJSON().checked;
        return route.fulfill({ status: 204 });
      }
      if (request.method() === 'DELETE') { manual.splice(manual.findIndex(r => r.id === url.searchParams.get('id')!.slice(3)), 1); return route.fulfill({ status: 204 }); }
      return route.fulfill({ json: manual });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(() => localStorage.setItem('sb-ihambre-ui-auth-token', JSON.stringify({ access_token: 'fixture', refresh_token: 'fixture', token_type: 'bearer', expires_at: 4102444800, user: { id: 'fixture', email: 'fixture@example.invalid' } })));
  await page.goto('/');
  await expect(page.getByText('Compra pruebas · sincronizado')).toBeVisible();
  await page.getByText('Compra', { exact: true }).click();
  await expect(page.getByText('Arroz', { exact: true })).toBeVisible();
  return writes;
}

test('two adjacent taps show immediate feedback and both persist despite slow network without moving rows', async ({ page }) => {
  const writes = await fixture(page);
  const arroz = page.getByText('Arroz', { exact: true }); const berenjena = page.getByText('Berenjena', { exact: true });
  const before = await berenjena.boundingBox();
  await arroz.tap();
  await expect(page.getByText('1 de 3 comprados')).toBeVisible({ timeout: 400 });
  await berenjena.tap();
  await expect(page.getByText('2 de 3 comprados')).toBeVisible({ timeout: 400 });
  expect(await berenjena.boundingBox()).toEqual(before);
  await expect.poll(() => writes).toEqual(['a', 'b']);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('menu-pareja:account:fixture'))!) || '{}').manualItems?.filter((r: {checked: boolean}) => r.checked).length)).toBe(2);
  await expect(page.getByRole('checkbox', { name: 'Cebolla', exact: true })).not.toBeChecked();
  await page.screenshot({ path: 'artifacts/recipe-shopping/adjacent-taps.png' });
});

test('failed checkbox rolls back while another row succeeds', async ({ page }) => {
  await fixture(page, true);
  await page.getByText('Arroz', { exact: true }).tap();
  await page.getByText('Berenjena', { exact: true }).tap();
  await expect(page.getByText('No se pudo sincronizar esta casilla:', { exact: false })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Arroz', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Berenjena', exact: true })).toBeChecked();
});

test('manual delete is not nested in checkbox and does not toggle any row', async ({ page }) => {
  const writes = await fixture(page);
  await page.getByRole('button', { name: 'Eliminar añadido a mano' }).first().click();
  await expect(page.getByText('Arroz', { exact: true })).toHaveCount(0);
  await expect(page.getByText('0 de 2 comprados')).toBeVisible();
  expect(writes).toEqual([]);
});
