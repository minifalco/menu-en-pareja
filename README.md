# iHambre · Menú y compra compartida

App de planificación semanal y lista de la compra compartida entre Android y iPhone. UI en español, móvil primero.

## Qué hace

- Colección compartida de platos con ingredientes y cantidades opcionales (una línea por ingrediente; por ejemplo `Arroz — 200 g`).
- Planificador de lunes a domingo, comida y cena.
- La compra se calcula desde los platos de esa semana: junta nombres iguales ignorando mayúsculas y suma cantidades cuando también coincide la unidad. Al quitar un plato, desaparecen los ingredientes que ya no estén en otro plato.
- Casillas de compra compartidas en tiempo real entre quienes pertenecen a la casa.
- Artículos extra añadidos a mano, también compartidos y marcables.
- Persistencia local por semana como caché.

## Desarrollo local

```bash
npm install
npm run typecheck
npm test
npm run e2e
npm run web
```

## Sincronización gratuita con Supabase

La app necesita su propio proyecto Supabase para compartir datos. No se incrusta ninguna clave `service_role` ni contraseña de base de datos en la app. El cliente lleva solo la clave pública/publishable; el acceso a las tablas se limita con RLS y la pertenencia al hogar.

1. Crear un proyecto personal en Supabase (elige una región europea si te resulta conveniente).
2. En el SQL Editor del proyecto, ejecutar `supabase/schema.sql` completo.
3. En Authentication, conservar habilitado Email/Password. Si la confirmación por correo está activa, confirmar cada cuenta antes de iniciar sesión.
4. Copiar `.env.example` a `.env` y rellenar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` con los valores públicos del proyecto.
5. Recompilar el APK y exportar la web después de configurar el `.env`.
6. Cada persona crea una cuenta dentro de la app. La primera crea la casa y comparte el código de invitación de 8 caracteres; la segunda elige «Unirme» e introduce el código.

No usar ni publicar la clave `service_role`. Las claves públicas son visibles en una aplicación cliente; la seguridad depende de las políticas RLS del SQL incluido. El código de invitación permite entrar en la casa: compartidlo solo entre vosotros.

El nivel gratuito de Supabase es suficiente para un hogar pequeño, pero tiene límites y el proyecto puede pausarse tras una semana de inactividad. El plan gratuito no ofrece copias de seguridad automáticas. Consulta [precios y límites actuales](https://supabase.com/pricing).

## Android

APK release local:

```bash
npx expo prebuild --platform android --no-install --clean
ANDROID_HOME="$HOME/Android/Sdk" NODE_ENV=production ./android/gradlew -p android assembleRelease \
  -PreactNativeArchitectures=arm64-v8a,x86_64 --max-workers=4 --console=plain --no-daemon
```

Salida: `android/app/build/outputs/apk/release/app-release.apk`. Está firmado para instalación y pruebas, no con una clave de Google Play. Al crear un APK con `.env`, las variables EXPO_PUBLIC quedan dentro del paquete (la clave es pública y está protegida por RLS).

## iPhone y PWA

El proyecto exporta una web instalable (PWA) para Safari; no requiere compilar una app nativa iOS ni pagar Apple Developer. Necesita publicar la carpeta `dist/` en una URL HTTPS estable, configurar las variables EXPO_PUBLIC en la compilación, abrir la URL en Safari y usar Compartir → Añadir a pantalla de inicio. La compilación nativa iOS solo se puede generar con macOS/Xcode.

`npm run export:web` genera `dist/`, incluye icono y manifiesto PWA, y prepara la pantalla de instalación. La publicación en una plataforma gratuita aún requiere autenticar una cuenta del proveedor elegido.

## Estado de pruebas

- Unitarias: `npm test`.
- Flujo de navegador: `npm run e2e` prueba guardar un plato, planificarlo, generar/ marcar ingredientes y conservar cambios al recargar.
- `npm run typecheck` revisa los tipos.
- APK release compilado en Ubuntu con SDK/Gradle.
- Sincronización real comprobada: 12/12 pruebas de interfaz con dos clientes independientes contra Supabase; 37 pruebas del backend pasan, con 3 bloqueos de registro público por SMTP.
- Teclado Android comprobado con Gboard en emulador: campo y botones accesibles mediante scroll sin cerrar el teclado. Receta y compra se ejercitaron en una compilación local aislada; no equivalen a sesión nativa autenticada.
- Estética de cuaderno, fuente Patrick Hand local y logo proporcionado.
- Corregidos UUID de menús/artículos, duplicados por realtime, respuestas antiguas entre semanas y recuperación de casillas tras fallo de red.

### Registro y correo: verificación del 7 de octubre

La confirmación de email sigue obligatoria. SMTP personalizado de Resend está habilitado y se leyó de nuevo en el panel: `smtp.resend.com:465`, usuario `resend`, remitente `cuentas@ihambre.top` / `iHambre`. Site URL y la única Redirect URL se guardaron como `https://ihambre.top/`.

Se ejercitó un registro público desde la UI real con una cuenta desechable: cuenta sin confirmar y sin sesión, rechazo del login previo y correo recibido realmente en Gmail. **El correo llegó a spam**, con SPF y DKIM válidos. Se corrigió con prueba RED→GREEN que el alta especifique el destino HTTPS; sin ello el email tomaba el origen de la web de desarrollo. El APK actualizado conserva paquete y certificado de firma y se instaló/lanzó en el emulador.

**Bloqueo pendiente:** GitHub Pages aún presenta un certificado que no corresponde a `ihambre.top`. No se ignoró TLS, no se consumió el enlace ni se dio por probado confirmación→login. `https_enforced` no se activó sin certificado válido. La cuenta de prueba se eliminó y la auditoría final encontró 0 cuentas restantes. Véanse `supabase/public-signup-20261007.json`, `supabase/auth-web-20261007.json` y `supabase/CRON-20261007.md`. Las pruebas anteriores confirmadas administrativamente siguen siendo evidencia de sync/RLS, no de entrega de email.

### Alcance de entrega

APK firmado con la clave Android de desarrollo existente, no destinado a Google Play. iPhone queda pendiente de la siguiente fase. Persisten avisos de npm audit en dependencias de herramientas; no se forzó una degradación incompatible de Expo para ocultarlos.
