# iHambre · Menú y compra compartida

App para planificar la comida y la cena de la semana en pareja y hacer la compra sin duplicar. Android, iPhone y web (PWA). Interfaz en español, móvil primero.

## Qué hace

- **Platos:** colección compartida de recetas con ingredientes y cantidades opcionales (`Arroz — 200 g`).
- **Semana:** planificador de lunes a domingo, comida y cena.
- **Compra:** se calcula sola a partir de los platos de la semana. Junta ingredientes iguales y suma cantidades con la misma unidad; al quitar un plato desaparece lo que ya no hace falta. Se pueden añadir artículos a mano.
- **Casa compartida:** cada persona tiene su cuenta; una crea la casa y comparte un código de invitación de 8 caracteres. Las casillas de la compra se sincronizan en tiempo real. Quien crea la casa puede quitar miembros y cambiar el código; cualquiera puede salir.
- **Cuenta:** recuperar la contraseña con un código por correo, cambiarla, consultar la política de privacidad y borrar la cuenta desde la app.
- **Modo local:** sin Supabase configurado, funciona solo en el dispositivo.

## Arrancar en local

```bash
npm install
cp .env.example .env   # URL y clave pública del Supabase de PRUEBAS (staging)
npm run web            # navegador
npx expo start         # móvil, con Expo Go
```

Sin `.env` la app arranca en modo local. Los valores de producción van en `.env.production` (ver `.env.example`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run check` | Typecheck + lint + tests unitarios |
| `npm run e2e` | Tests de navegador en modo local |
| `npm run e2e:fixtures` | Tests de navegador con Supabase simulado |
| `npm run e2e:export` | Exporta la web y repite los tests sobre ella |
| `npm run export:web` | Genera la web/PWA de producción en `dist/` |

## Estructura

Ver el mapa del código en [`AGENTS.md`](AGENTS.md). Cómo se trabaja con agentes de IA: [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md). Planes de cada tarea: [`docs/plans/`](docs/plans/).

## Supabase

Hay dos proyectos: **producción** (`ihambre`, datos reales) y **staging** (`ihambre-staging`, pruebas). Todo cambio se prueba primero en staging.

La app lleva solo la clave pública (publishable/anon); los datos los protegen las políticas RLS, que limitan cada tabla a los miembros de la casa. La clave `service_role` nunca va en la app ni en el repositorio.

- **Esquema:** los ficheros de `supabase/migrations/`, aplicados en orden, crean la base de datos completa. Para un proyecto nuevo, ejecutarlos en orden en el SQL Editor.
- **Pruebas:** `supabase/tests/*.sql` se ejecutan en staging y se deshacen solas; terminan con el mensaje `TODAS LAS PRUEBAS OK`.
- **Auth:** Email/Password con confirmación de correo. Plantillas de correo (registro y recuperar contraseña) en `auth-site/email/`; la de recuperar contraseña es obligatoria para que funcione desde la app.
- El plan gratuito se pausa tras una semana sin uso y no tiene copias de seguridad automáticas.

## Android

APK release local (firmado con la clave de desarrollo, no apto para Google Play):

```bash
npx expo prebuild --platform android --no-install --clean
ANDROID_HOME="$HOME/Android/Sdk" NODE_ENV=production ./android/gradlew -p android assembleRelease \
  -PreactNativeArchitectures=arm64-v8a,x86_64 --max-workers=4 --console=plain --no-daemon
```

Salida: `android/app/build/outputs/apk/release/app-release.apk`. Las variables `EXPO_PUBLIC_*` del `.env` quedan dentro del APK.

## iPhone

Dos opciones:

- **PWA:** `npm run export:web`, publicar `dist/` en HTTPS y en Safari usar Compartir → Añadir a pantalla de inicio.
- **App nativa:** se compila en la nube con EAS (`npx eas-cli@latest build --platform ios`); no hace falta Mac, pero sí una cuenta de Apple Developer.

## Web (ihambre.top)

Cada push a cualquier rama ejecuta los tests en GitHub Actions (`.github/workflows/ci.yml`); no se publica nada automáticamente.

`ihambre.top` se sirve con GitHub Pages desde la rama `gh-pages`:

| Ruta | Contenido |
|---|---|
| `/` | Confirmación de correo y política de privacidad: `index.html`, `privacidad.html`, `styles.css` y `logo.png` de `auth-site/`, más `CNAME` y `.nojekyll` |
| `/app/` | La app web (PWA) |
| `/404.html` | Copia de la app, para que recargar una pestaña (`/app/compra`) funcione |

Publicar es manual: `PAGES_BASE_PATH=/app npm run export:web` (toma los valores de `.env.production`); después copiar `dist/` a `app/` y `dist/404.html` a la raíz de la rama `gh-pages`. Para probar el resultado en local: `node scripts/serve-dist.mjs 8945 /app` y abrir `http://127.0.0.1:8945/app/`.
