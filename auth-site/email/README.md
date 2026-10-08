# Plantillas de correo · iHambre

Se pegan en Supabase → Authentication → Emails → Templates. No se publican en la web.

| Plantilla de Supabase | Asunto | Cuerpo |
|---|---|---|
| **Confirm signup** | `subject.txt` | `signup.html` |
| **Reset password** | `recovery-subject.txt` | `recovery.html` |

**Reset password es obligatoria para recuperar la contraseña desde la app:** la app pide el código de 6 cifras (`{{ .Token }}`) y no usa el enlace por defecto de Supabase. Instálala en producción y en staging; si se cambia la duración o la longitud del código en Supabase (Auth → Providers → Email), la app acepta entre 6 y 10 cifras.

HTML con tablas de presentación y estilos inline; sin JavaScript, CSS externo ni fuentes remotas.

No se ha guardado esta plantilla en el panel, enviado un correo ni desplegado estos cambios. Solo se prepararon y probaron archivos locales.

## Confirmación y destino

El botón usa el endpoint de verificación de **este proyecto**:

`https://rfdpptoctjolnfiavtts.supabase.co/auth/v1/verify?token={{ .TokenHash }}&type=signup&redirect_to=https%3A%2F%2Fihambre.top%2F`

El HTML codifica los separadores como `&amp;`. `{{ .TokenHash }}` es una acción Go de campo válida documentada por Supabase. El servidor de Auth verifica el token y genera el resultado del redirect; el botón **no** enlaza directamente a una página que finja activar la cuenta.

Se construye el enlace en vez de usar `{{ .ConfirmationURL }}` porque este último puede conservar un `redirect_to` antiguo solicitado por un cliente, como `127.0.0.1:8933`. No se concatena otro `redirect_to` a ConfirmationURL: produciría parámetros duplicados. Tampoco se usa `{{ .RedirectTo }}`. El destino público se fija explícitamente para no depender de localhost. Site URL y la allowlist deben seguir admitiendo `https://ihambre.top/`; no se han cambiado aquí. El origen de Supabase queda fijado al proyecto y debe actualizarse si se migra.

Logo público requerido: `https://ihambre.top/logo.png`. Se incluye `../logo.png`, copia del artwork suministrado `assets/icon.png`, para una publicación futura limitada a los assets web. **No publicar esta carpeta `email/`, los tests ni los README.** Antes de instalar la plantilla, comprobar que la web y el logo tengan HTTPS válido; los emails ya emitidos no cambian y habrá que solicitar uno nuevo.

La landing interpreta el resultado habitual del redirect implícito (`access_token` no vacío y `type=signup`), con prioridad absoluta para `error`, `error_description` y `error_code` en consulta o fragmento. No es validación criptográfica: un fragmento escrito manualmente puede imitar la señal. Visitas directas, callbacks sin señal y recargas permanecen neutrales. La aplicación debe continuar gestionando el login. No se utiliza `token_hash` en la landing, almacenamiento de sesiones ni llamadas al backend.

## Verificación local

Desde la raíz del repositorio:

`node --test auth-site/tests/*.test.cjs`

La prueba renderiza únicamente el marcador falso `FAKE_TEST_HASH_NOT_A_CREDENTIAL`, inspecciona el href como URL, exige un único destino público y usa Chromium a 320, 390 y 900 px. El logo se intercepta localmente para no depender de la TLS de producción. Esta es una prueba de HTML y contrato de enlace, no de entrega SMTP, renderizado en todos los clientes de correo, ejecución de Go en el panel ni activación de una cuenta real.

Documentación oficial consultada:

- https://supabase.com/docs/guides/auth/auth-email-templates — variables y construcción del enlace de verificación con TokenHash.
- https://supabase.com/docs/guides/auth/redirect-urls — destinos autorizados y errores del callback.
