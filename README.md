# iHambre · Menú y compra compartida

App para planificar la comida y la cena de la semana en pareja y hacer la compra sin duplicar. Android, iPhone y web (PWA). Interfaz en español, móvil primero.

## Qué hace

- **Platos:** colección compartida de recetas con ingredientes y cantidades opcionales (`Arroz — 200 g`).
- **Semana:** planificador de lunes a domingo, comida y cena.
- **Compra:** se calcula sola a partir de los platos de la semana. Junta ingredientes iguales y suma cantidades con la misma unidad; al quitar un plato desaparece lo que ya no hace falta. Se pueden añadir artículos a mano.
- **Casa compartida:** cada persona tiene su cuenta; una crea la casa y comparte un código de invitación de 8 caracteres. Las casillas de la compra se sincronizan en tiempo real.
- **Modo local:** sin Supabase configurado, funciona solo en el dispositivo.

## Arrancar en local

```bash
npm install
cp .env.example .env   # rellenar con la URL y la clave pública de Supabase
npm run web            # navegador
npx expo start         # móvil, con Expo Go
```

Sin `.env` la app arranca en modo local.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run check` | Typecheck + lint + tests unitarios |
| `npm run e2e` | Tests de navegador en modo local |
| `npm run e2e:fixtures` | Tests de navegador con Supabase simulado |
| `npm run export:web` | Genera la web/PWA en `dist/` |

## Estructura

Ver el mapa del código en [`AGENTS.md`](AGENTS.md). Cómo se trabaja con agentes de IA: [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md). Planes de cada tarea: [`docs/plans/`](docs/plans/).

## Supabase

La app lleva solo la clave pública (publishable/anon); los datos los protegen las políticas RLS de `supabase/schema.sql`, que limitan cada tabla a los miembros de la casa. La clave `service_role` nunca va en la app ni en el repositorio.

Para un proyecto nuevo: ejecutar `supabase/schema.sql` completo en el SQL Editor, dejar activado Email/Password con confirmación de correo y rellenar `.env`. El plan gratuito se pausa tras una semana sin uso y no tiene copias de seguridad automáticas.

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

## Web

Cada push a `main` ejecuta los tests y publica la PWA en GitHub Pages (`.github/workflows/pages.yml`). La página de confirmación de correo de `ihambre.top` está en `auth-site/`.
