import { expect, test, type Page } from '@playwright/test';

const user = { id: 'account-a', email: 'a@example.invalid', aud: 'authenticated', role: 'authenticated' };
const session = { access_token: 'fixture', refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user };

// Simulated Supabase (REST + Auth) for one account in one household with a second member.
async function backend(page: Page, { owner = true, signedIn = true } = {}) {
  const state = {
    member: true,
    inviteCode: 'ABCDEFGH',
    members: [
      { user_id: 'account-a', email: 'a@example.invalid', joined_at: '2026-10-01T10:00:00Z', is_owner: owner },
      { user_id: 'account-b', email: 'b@example.invalid', joined_at: '2026-10-02T10:00:00Z', is_owner: !owner },
    ],
    calls: [] as { path: string; body: unknown }[],
  };
  await page.route('https://ihambre-ui.invalid/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() ?? null;
    if (request.method() !== 'GET') state.calls.push({ path, body });
    if (path === '/rest/v1/household_members') return route.fulfill({ json: state.member ? [{ household_id: 'house-a' }] : [] });
    if (path === '/rest/v1/households') return route.fulfill({ json: state.member ? [{ id: 'house-a', name: 'Casa privada A', invite_code: state.inviteCode }] : [] });
    if (path === '/rest/v1/rpc/household_members_list') return route.fulfill({ json: state.members });
    if (path === '/rest/v1/rpc/regenerate_invite_code') { state.inviteCode = 'NUEVO234'; return route.fulfill({ json: state.inviteCode }); }
    if (path === '/rest/v1/rpc/remove_household_member') {
      state.members = state.members.filter(member => member.user_id !== (body as { p_user: string }).p_user);
      state.inviteCode = 'OTRO2345';
      return route.fulfill({ json: state.inviteCode });
    }
    if (path === '/rest/v1/rpc/leave_household' || path === '/rest/v1/rpc/delete_my_account') { state.member = false; return route.fulfill({ status: 204, body: '' }); }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (path === '/auth/v1/recover') return route.fulfill({ json: {} });
    if (path === '/auth/v1/verify') {
      if ((body as { token: string }).token !== '123456') return route.fulfill({ status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } });
      return route.fulfill({ json: session });
    }
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    return route.fulfill({ json: [] });
  });
  if (signedIn) await page.addInitScript(value => {
    if (!sessionStorage.getItem('fixture-initialized')) {
      localStorage.setItem('sb-ihambre-ui-auth-token', value);
      sessionStorage.setItem('fixture-initialized', 'yes');
    }
  }, JSON.stringify(session));
  await page.goto('/');
  return state;
}

async function openMenu(page: Page, item: string) {
  await expect(page.getByText('Casa privada A · sincronizado')).toBeVisible();
  await page.getByRole('button', { name: 'Opciones de cuenta y casa', includeHidden: true }).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}

test('owner sees members, rotates the invite code and removes a member', async ({ page }) => {
  const state = await backend(page);
  await openMenu(page, 'Gestionar casa');
  await expect(page).toHaveURL(/\/gestionar-casa$/);
  await expect(page.getByText('a@example.invalid (tú)')).toBeVisible();
  await expect(page.getByText('b@example.invalid', { exact: true })).toBeVisible();
  await expect(page.getByText('ABCDEFGH', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cambiar código' }).click();
  await expect(page.getByText('El código actual dejará de funcionar', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar código' }).click();
  await expect(page.getByText('NUEVO234', { exact: true })).toBeVisible();
  await expect(page.getByText('Código cambiado.')).toBeVisible();

  await page.getByRole('button', { name: 'Quitar a b@example.invalid' }).click();
  await page.getByRole('button', { name: 'Quitar de la casa' }).click();
  await expect(page.getByText('b@example.invalid ya no está en la casa. El código ha cambiado.')).toBeVisible();
  await expect(page.getByText('b@example.invalid', { exact: true })).toHaveCount(0);
  await expect(page.getByText('OTRO2345', { exact: true })).toBeVisible();
  expect(state.calls.find(call => call.path === '/rest/v1/rpc/remove_household_member')?.body).toEqual({ p_household: 'house-a', p_user: 'account-b' });
});

test('a member who did not create the house cannot change the code or remove people', async ({ page }) => {
  await backend(page, { owner: false });
  await openMenu(page, 'Gestionar casa');
  await expect(page.getByText('a@example.invalid (tú)')).toBeVisible();
  await expect(page.getByText('Creó la casa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar código' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Quitar a / })).toHaveCount(0);
});

test('leaving the only household returns to the create or join screen', async ({ page }) => {
  const state = await backend(page);
  await openMenu(page, 'Gestionar casa');
  await expect(page.getByText('La casa y sus datos seguirán para las demás personas.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Salir de la casa' }).click();
  await page.getByRole('button', { name: 'Salir de la casa' }).click();
  await expect(page.getByText('Con quién compartes')).toBeVisible();
  await expect(page.getByText('Has salido de Casa privada A.')).toBeVisible();
  expect(state.calls.some(call => call.path === '/rest/v1/rpc/leave_household')).toBe(true);
});

test('deleting the account asks for confirmation, signs out and explains what happened', async ({ page }) => {
  const state = await backend(page);
  await openMenu(page, 'Cuenta y privacidad');
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  await expect(page.getByText('Esto no se puede deshacer.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect(state.calls.some(call => call.path === '/rest/v1/rpc/delete_my_account')).toBe(false);
  await page.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  await page.getByRole('button', { name: 'Borrar mi cuenta para siempre' }).click();
  await expect(page.getByText('Inicia sesión', { exact: true })).toBeVisible();
  await expect(page.getByTestId('auth-feedback')).toContainText('Tu cuenta y tus datos se han borrado.');
  expect(state.calls.some(call => call.path === '/rest/v1/rpc/delete_my_account')).toBe(true);
  await page.reload();
  await expect(page.getByText('Inicia sesión', { exact: true })).toBeVisible();
});

test('password reset sends a code, rejects a wrong one and signs in with the new password', async ({ page }) => {
  const state = await backend(page, { signedIn: false });
  await page.getByText('¿Has olvidado tu contraseña?', { exact: true }).click();
  await page.getByPlaceholder('vosotros@correo.com').fill('a@example.invalid');
  await page.getByText('Enviar código', { exact: true }).click();
  await expect(page.getByTestId('auth-feedback')).toContainText('te hemos enviado un código');
  expect(state.calls.find(call => call.path === '/auth/v1/recover')?.body).toMatchObject({ email: 'a@example.invalid' });

  await page.getByRole('textbox', { name: 'Código del correo' }).fill('999999');
  await page.getByRole('textbox', { name: 'Contraseña nueva' }).fill('nueva-clave-segura');
  await page.getByText('Guardar y entrar', { exact: true }).click();
  await expect(page.getByTestId('auth-feedback')).toContainText('El código no es válido o ha caducado.');

  await page.getByRole('textbox', { name: 'Código del correo' }).fill('123456');
  await page.getByText('Guardar y entrar', { exact: true }).click();
  await expect(page.getByText('Casa privada A · sincronizado')).toBeVisible();
  expect(state.calls.filter(call => call.path === '/auth/v1/verify').at(-1)?.body).toMatchObject({ email: 'a@example.invalid', token: '123456', type: 'recovery' });
  expect(state.calls.find(call => call.path === '/auth/v1/user')?.body).toMatchObject({ password: 'nueva-clave-segura' });
});
