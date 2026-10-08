export function authErrorText(e: unknown) {
  const code = e && typeof e === 'object' && 'code' in e ? e.code : '';
  const status = e && typeof e === 'object' && 'status' in e ? e.status : 0;
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo. Revisa también tu correo y Spam por si ya recibiste la activación.';
  if (code === 'email_not_confirmed') return 'Activa tu cuenta antes de iniciar sesión: abre el enlace del correo de activación. Revisa también Spam.';
  if (code === 'validation_failed' || code === 'email_address_invalid') return 'Revisa el correo electrónico: escribe una dirección válida.';
  if (code === 'otp_expired') return 'El código no es válido o ha caducado. Pide uno nuevo.';
  if (code === 'same_password') return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (code === 'weak_password') return 'Esa contraseña es demasiado débil. Prueba con una más larga.';
  return `No se pudo completar la solicitud. ${errorText(e)}`;
}

export function errorText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message;
  return 'Ha ocurrido un problema. Inténtalo de nuevo.';
}
