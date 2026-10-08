import { expect, test } from '@playwright/test';

test('signup sends confirmation to the public HTTPS landing page, not the current browser origin', async ({ page }) => {
  await page.route('https://ihambre-ui.invalid/auth/v1/signup**', route => route.fulfill({
    json: { id: 'ui-signup', email: 'ui@example.invalid', identities: [] },
  }));
  await page.goto('/');
  await page.getByText('¿Primera vez? Crea una cuenta', { exact: true }).click();
  await page.getByPlaceholder('vosotros@correo.com').fill('ui@example.invalid');
  await page.getByPlaceholder('Al menos 6 caracteres').fill('ui-fixture-password');
  const request = page.waitForRequest(r => r.url().includes('/auth/v1/signup'));
  await page.getByText('Crear cuenta', { exact: true }).click();
  expect(new URL((await request).url()).searchParams.get('redirect_to')).toBe('https://ihambre.top/');
});

test('signup confirmation is prominent above a keyboard-sized viewport without scrolling', async ({ page }) => {
  await page.route('https://ihambre-ui.invalid/auth/v1/signup**', route => route.fulfill({
    json: { id: 'ui-signup', email: 'ui@example.invalid', identities: [{ id: 'ui-signup' }] },
  }));
  await page.goto('/');
  await page.getByText('¿Primera vez? Crea una cuenta', { exact: true }).click();
  await page.getByPlaceholder('vosotros@correo.com').fill('ui@example.invalid');
  await page.getByPlaceholder('Al menos 6 caracteres').fill('ui-fixture-password');
  await page.setViewportSize({ width: 390, height: 300 });
  await page.getByText('Crear cuenta', { exact: true }).click();
  const feedback = page.getByTestId('auth-feedback');
  await expect(feedback).toContainText('¡Correo de verificación enviado!');
  await expect(feedback).toContainText('Entra en tu correo y verifícalo. No olvides comprobar la carpeta de spam o correo no deseado.');
  const box = await feedback.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(300);
  // Supabase cross-tab signed-out events must not discard confirmation feedback.
  await page.evaluate(async () => {
    const channel = new BroadcastChannel('sb-ihambre-ui-auth-token');
    channel.postMessage({ event: 'SIGNED_OUT', session: null });
    await new Promise(resolve => setTimeout(resolve, 100));
    channel.close();
  });
  await expect(feedback).toContainText('spam o correo no deseado');
  await page.screenshot({ path: 'artifacts/ui/signup-feedback-keyboard.png' });
});

test('obfuscated duplicate signup does not claim a new email was sent', async ({ page }) => {
  await page.route('https://ihambre-ui.invalid/auth/v1/signup**', route => route.fulfill({
    json: { id: 'ui-duplicate', email: 'ui@example.invalid', identities: [] },
  }));
  await page.goto('/');
  await page.getByText('¿Primera vez? Crea una cuenta', { exact: true }).click();
  await page.getByPlaceholder('vosotros@correo.com').fill('ui@example.invalid');
  await page.getByPlaceholder('Al menos 6 caracteres').fill('ui-fixture-password');
  await page.getByText('Crear cuenta', { exact: true }).click();
  await expect(page.getByTestId('auth-feedback')).toContainText('Solicitud de registro aceptada');
  await expect(page.getByTestId('auth-feedback')).not.toContainText('Correo de activación enviado');
});

for (const scenario of [
  { code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded', visible: 'Demasiados intentos' },
  { code: 'email_not_confirmed', status: 400, message: 'Email not confirmed', visible: 'Activa tu cuenta' },
  { code: 'validation_failed', status: 422, message: 'Unable to validate email address: invalid format', visible: 'Revisa el correo electrónico' },
]) {
  test(`pending and ${scenario.code} feedback remain visible above the keyboard`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('https://ihambre-ui.invalid/auth/v1/signup**', async route => {
      await gate;
      await route.fulfill({ status: scenario.status, json: { error_code: scenario.code, msg: scenario.message } });
    });
    await page.goto('/');
    await page.getByText('¿Primera vez? Crea una cuenta', { exact: true }).click();
    await page.getByPlaceholder('vosotros@correo.com').fill('ui@example.invalid');
    await page.getByPlaceholder('Al menos 6 caracteres').fill('ui-fixture-password');
    await page.setViewportSize({ width: 390, height: 300 });
    await page.getByText('Crear cuenta', { exact: true }).click();
    const feedback = page.getByTestId('auth-feedback');
    await expect(feedback).toContainText('Creando tu cuenta');
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'Un momento…' })).toBeDisabled();
    release();
    await expect(feedback).toContainText(scenario.visible);
    await expect(feedback).not.toContainText('Correo de activación enviado');
    const box = await feedback.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(300);
    await page.screenshot({ path: `artifacts/ui/signup-${scenario.code}-keyboard.png` });
    await expect(page.getByRole('button', { name: 'Crear cuenta', exact: true })).toBeEnabled();
  });
}

test('login password stays reachable when the viewport shrinks for a keyboard', async ({ page }) => {
  await page.goto('/');
  const password = page.getByPlaceholder('Al menos 6 caracteres');
  await expect(password).toBeVisible();
  await page.screenshot({ path: 'artifacts/ui/auth-mobile.png' });
  await password.focus();
  await page.setViewportSize({ width: 390, height: 300 });
  await password.scrollIntoViewIfNeeded();
  const box = await password.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(300);
  const title = page.getByText('Menú & compra', { exact: true });
  await title.scrollIntoViewIfNeeded();
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await password.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/ui/auth-keyboard.png' });
});

test('household invitation stays reachable with a keyboard-sized viewport', async ({ page }) => {
  // This is a UI-only session fixture, NOT evidence of backend authentication/sync.
  await page.route('https://ihambre-ui.invalid/**', route => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    localStorage.setItem('sb-ihambre-ui-auth-token', JSON.stringify({
      access_token: 'ui-fixture', refresh_token: 'ui-fixture', token_type: 'bearer',
      expires_at: 4102444800,
      user: { id: 'ui-fixture', email: 'ui@example.invalid' },
    }));
  });
  await page.goto('/');
  await page.getByText('Unirme', { exact: true }).click();
  const code = page.getByPlaceholder('8 letras o números');
  await page.screenshot({ path: 'artifacts/ui/household-mobile.png' });
  await code.focus();
  await page.setViewportSize({ width: 390, height: 280 });
  await code.fill('ABCDEFGH');
  await code.scrollIntoViewIfNeeded();
  const box = await code.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(280);
  const title = page.getByText('Con quién compartes', { exact: true });
  await title.scrollIntoViewIfNeeded();
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await code.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/ui/household-keyboard.png' });
});
