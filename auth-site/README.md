# iHambre · Web de ihambre.top

Páginas estáticas de la raíz de ihambre.top (rama `gh-pages`): confirmación de correo (`index.html`) y política de privacidad (`privacidad.html`, con la sección `#borrar-cuenta` que pide Google Play). Plantillas de correo en `email/`.

**Antes de publicar `privacidad.html`, rellenar los campos marcados entre corchetes** (responsable y correo de contacto).

## Archivos y publicación aislada

Publicar únicamente `index.html`, `privacidad.html`, `styles.css` y `logo.png`, juntos en la raíz de la web. No publicar `email/`, `tests/`, sus logs/capturas ni los README. Los archivos existentes de configuración del hosting (`CNAME`, `.nojekyll`) se gestionan por separado. No requiere build, claves, librerías ni fuentes remotas.

`logo.png` es una copia exacta del icono suministrado en `assets/icon.png`, inspeccionado visualmente. Colores: verde vegetal `#356e2a`, naranja cesta `#ee5523`, marrón cálido `#492f23` y fondo crema `#faf7ef`. El email comparte esta paleta; su botón es verde oscuro con texto blanco para mantener contraste.

La plantilla de **Confirm signup** y el asunto están en `email/signup.html` y `email/subject.txt`. Véase `email/README.md` para el enlace de verificación Supabase que fija `https://ihambre.top/` y evita heredar localhost.

## Estados

- El redirect implícito habitual con `access_token` no vacío y `type=signup` muestra **«¡Cuenta activada!»** y **«Vuelve a la aplicación iHambre y empieza a disfrutar de una vida sana organizada con tu pareja o amigos.»**
- `error`, `error_description` o `error_code` en fragmento o consulta tienen prioridad, incluso ante una señal de éxito. Muestran «No se pudo confirmar el correo» y solicitan volver a iHambre para pedir otro email. Los valores recibidos nunca se interpolan.
- Una visita directa, un callback sin señal y una recarga permanecen neutrales: no se guarda ninguna sesión ni prueba de confirmación.
- El primer script, antes de la hoja de estilos y del logo, reduce el callback a booleanos y elimina fragmento y consulta mediante `history.replaceState`. No guarda ni imprime tokens ni los transmite a recursos secundarios. No hace llamadas a Supabase, no usa cookies ni almacenamiento web.
- Esto interpreta el resultado normal del backend, **no verifica criptográficamente un token ni autentica una sesión**. Un fragmento escrito manualmente puede imitar la señal. Supabase sigue verificando el correo y la aplicación debe gestionar el login.
- Sin JavaScript se conserva el texto neutral; esta página no sustituye la confirmación del servidor.

## Pruebas

Desde `/home/nacho/Proyectos/compra-menu`:

```sh
node --test auth-site/tests/*.test.cjs
```

Chromium real con Playwright de `node_modules`. El servidor escucha solo en loopback, usa puerto libre y sirve exclusivamente los tres archivos web. Todos los tokens/hash son marcadores falsos. No se verifica la cuenta de ningún usuario.

Cobertura: copy de éxito, visitas neutrales, errores en consulta/fragmento y su prioridad, `otp_expired`, descripción maliciosa sin inyección, limpieza antes de DOMContentLoaded, historial sin nueva entrada, ausencia de almacenamiento/cookies/consola/transmisión del token, recarga neutral, logo real, semántica y estados a 320/390 px con texto al 200 %. Email: asunto, instrucciones, CTA, estilo inline/tablas, href de backend con redirect fijo y único, logo y responsive a 320/390/900 px.

Capturas a 390 × 844: `tests/success-mobile.png`, `tests/neutral-mobile.png`, `tests/error-mobile.png`, `tests/email-mobile.png`. Son previews locales, no evidencia de publicación ni de entrega de email.

## Evidencia TDD

Se conservan los logs anteriores `01`–`12`. Para esta revisión:

- `13-copy-red.log` → `14-copy-green.log`: texto de cuenta activada.
- `15-expired-red.log` → `16-expired-green.log`: `error_code=otp_expired` vence la señal de éxito.
- `17-email-red.log` y `18-brand-red.log` → `19-brand-email-green.log`: plantilla de registro y artwork/paleta.
- `20-final-green.log`: suite final completa.

## Gates pendientes

Probar HTTPS válido y el logo en producción; publicar solo los assets autorizados; instalar la plantilla y el asunto en Supabase; solicitar un email nuevo; probar entrega/clic/confirmación/login. Ninguno de esos gates queda demostrado por los tests locales. No se ha tocado ningún servicio en esta revisión.
