import { expect, test, type Page } from '@playwright/test';

async function account(page: Page) {
  await page.route('https://ihambre-ui.invalid/**', route => {
    const url = route.request().url();
    if (url.includes('/logout')) return route.fulfill({ status: 204, body: '' });
    if (url.includes('/household_members')) return route.fulfill({ json: [{ household_id: 'house-a' }] });
    if (url.includes('/households')) return route.fulfill({ json: [{ id: 'house-a', name: 'Casa privada A', invite_code: 'ABCDEFGH' }] });
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('fixture-initialized')) {
      localStorage.setItem('sb-ihambre-ui-auth-token', JSON.stringify({ access_token: 'ui-fixture', refresh_token: 'ui-fixture', token_type: 'bearer', expires_at: 4102444800, user: { id: 'account-a', email: 'a@example.invalid' } }));
      sessionStorage.setItem('fixture-initialized', 'yes');
    }
  });
  await page.goto('/');
  await expect(page.getByText('Casa privada A · sincronizado')).toBeVisible();
}

test('main dropdown offers share, join and logout after creating a household', async ({ page }) => {
  await account(page);
  const options = page.getByRole('button', { name: 'Opciones de cuenta y casa', includeHidden: true });
  await options.click();
  await expect(options).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Compartir casa', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unirme a una casa', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unirme a una casa', exact: true }).click();
  await expect(page.getByPlaceholder('8 letras o números')).toBeVisible();
  await expect(page.getByText('Tu casa actual y sus datos se conservan.')).toBeVisible();
});

test('joining from an existing house switches scope, closes form and persists without deletions', async ({ page }) => {
  await account(page);
  const deletes: string[] = [];
  page.on('request', r => { if (r.method() === 'DELETE') deletes.push(r.url()); });
  await page.route('https://ihambre-ui.invalid/rest/v1/rpc/join_household', route => route.fulfill({ json: 'house-b' }));
  await page.route('https://ihambre-ui.invalid/rest/v1/households**', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('id')?.startsWith('eq.')
    ? { id: 'house-b', name: 'Casa B compartida', invite_code: 'BBBBBBBB' }
    : [{ id: 'house-a', name: 'Casa privada A', invite_code: 'ABCDEFGH' }, { id: 'house-b', name: 'Casa B compartida', invite_code: 'BBBBBBBB' }] }));
  await page.route('https://ihambre-ui.invalid/rest/v1/household_members**', route => route.fulfill({ json: [{ household_id: 'house-a' }, { household_id: 'house-b' }] }));
  await page.getByRole('button', { name: 'Opciones de cuenta y casa' }).click();
  await page.getByRole('button', { name: 'Unirme a una casa', exact: true }).click();
  await page.getByPlaceholder('8 letras o números').fill('bbbbbbbb');
  const request = page.waitForRequest(r => r.url().includes('/rpc/join_household'));
  await page.getByRole('button', { name: 'Unirme a la casa', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ p_code: 'BBBBBBBB' });
  await expect(page.getByPlaceholder('8 letras o números')).toHaveCount(0);
  await expect(page.getByText('Casa B compartida · sincronizado')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Casa B compartida · sincronizado')).toBeVisible();
  expect(deletes).toEqual([]);
});

test('account change discards a previous account join form and invitation draft', async ({ page }) => {
  await account(page);
  await page.getByRole('button', { name: 'Opciones de cuenta y casa' }).click();
  await page.getByRole('button', { name: 'Unirme a una casa', exact: true }).click();
  await page.getByPlaceholder('8 letras o números').fill('ABCDEFGH');
  await page.evaluate(() => {
    const channel = new BroadcastChannel('sb-ihambre-ui-auth-token');
    channel.postMessage({ event: 'SIGNED_IN', session: { access_token: 'b', refresh_token: 'b', expires_at: 4102444800, user: { id: 'account-b', email: 'b@example.invalid' } } });
    setTimeout(() => channel.close(), 300);
  });
  await expect(page.getByPlaceholder('8 letras o números')).toHaveCount(0);
  await page.getByRole('button', { name: 'Opciones de cuenta y casa' }).click();
  await expect(page.getByText('b@example.invalid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unirme a una casa', exact: true }).click();
  await expect(page.getByPlaceholder('8 letras o números')).toHaveValue('');
});

test('invalid code is explained in the join form without changing the current house', async ({ page }) => {
  await account(page);
  await page.route('https://ihambre-ui.invalid/rest/v1/rpc/join_household', route => route.fulfill({ status: 400, json: { message: 'Código de casa no válido.' } }));
  await page.getByRole('button', { name: 'Opciones de cuenta y casa' }).click();
  await page.getByRole('button', { name: 'Unirme a una casa', exact: true }).click();
  const code = page.getByPlaceholder('8 letras o números');
  await code.fill('BADCODE1');
  await page.getByRole('button', { name: 'Unirme a la casa', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Código de casa no válido.');
  await expect(page.getByRole('button', { name: 'Unirme a la casa', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancelar unión a casa' }).click();
  await expect(page.getByText('Casa privada A · sincronizado')).toBeVisible();
});

test('main account panel shows email, logs out and stays logged out after reload', async ({ page }) => {
  await account(page);
  const button = page.getByRole('button', { name: 'Opciones de cuenta y casa' });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect(page.getByText('a@example.invalid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByText('Inicia sesión', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('menu-pareja:account:a@example.invalid:') || k === 'menu-pareja:active-household:a@example.invalid').length)).toBe(0);
  await page.reload();
  await expect(page.getByText('Inicia sesión', { exact: true })).toBeVisible();
  await expect(page.getByText('Casa privada A · sincronizado')).toHaveCount(0);
});

test('server logout errors explain the SDK local logout instead of hiding feedback', async ({ page }) => {
  await account(page);
  await page.route('https://ihambre-ui.invalid/auth/v1/logout**', route => route.fulfill({ status: 500, json: { message: 'fallo de prueba', code: 'unexpected_failure' } }));
  await page.getByRole('button', { name: 'Opciones de cuenta y casa' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sesión cerrada en este móvil. No se pudo confirmar');
  await expect(page.getByText('Inicia sesión', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Inicia sesión', { exact: true })).toBeVisible();
});

test('normal relaunch preserves automatic session login and sharing the actual invitation', async ({ page }) => {
  await account(page);
  await page.reload();
  await expect(page.getByText('Casa privada A · sincronizado')).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: (payload: unknown) => { (window as unknown as { shared: unknown }).shared = payload; return Promise.resolve(); } }));
  await page.getByRole('button', { name: 'Opciones de cuenta y casa' }).click();
  await page.getByRole('button', { name: 'Compartir casa', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared: { text: string } }).shared?.text)).toBe('Únete a Casa privada A en iHambre con este código: ABCDEFGH');
});

test('share uses a square and upward arrow vector with a 44px target', async ({ page }) => {
  await account(page);
  await page.getByRole('button', { name: 'Opciones de cuenta y casa' }).click();
  const share = page.getByRole('button', { name: 'Compartir casa', exact: true });
  await expect(share.locator('svg path')).toHaveCount(1);
  await expect(share).not.toContainText('↗');
  const box = await share.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('a direct account change hides the previous household and uses account-scoped caches', async ({ page }) => {
  await account(page);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('menu-pareja:account:a@example.invalid:')).length)).toBeGreaterThan(0);
  await page.route('https://ihambre-ui.invalid/rest/v1/household_members**', route => route.fulfill({ json: [] }));
  await page.evaluate(() => {
    const channel = new BroadcastChannel('sb-ihambre-ui-auth-token');
    channel.postMessage({ event: 'SIGNED_IN', session: { access_token: 'b', refresh_token: 'b', expires_at: 4102444800, user: { id: 'account-b', email: 'b@example.invalid' } } });
    setTimeout(() => channel.close(), 300);
  });
  await expect(page.getByText('b@example.invalid', { exact: true })).toBeVisible();
  await expect(page.getByText('Casa privada A · sincronizado')).toHaveCount(0);
});
