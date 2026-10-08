# iHambre — instrucciones para agentes

Este fichero lo leen Claude Code, Codex y Hermes al empezar cada sesión. Mantenlo corto y verdadero: si cambias la estructura, los comandos o las reglas, actualízalo en el mismo commit.

## Qué es

App móvil (Expo / React Native, también web PWA) para planificar la comida y la cena de la semana en pareja y generar una lista de la compra compartida en tiempo real. Interfaz en español, móvil primero. Backend en Supabase: login con email y contraseña, Postgres con RLS por "casa" (`households`) y avisos realtime por canales privados.

## Con quién trabajas

El dueño del proyecto lo dirige pero no es programador profesional.

- Escribe en español de España, claro y sin jerga; define cada término técnico la primera vez que salga.
- Antes de cambiar algo, explica qué vas a cambiar y por qué. Al terminar, qué ha cambiado y cómo comprobarlo.
- Las decisiones de producto, de dinero y todo lo irreversible (publicar, borrar datos, tocar producción) las toma el dueño.

## Mapa del código

| Ruta | Qué hay |
|---|---|
| `src/app/` | Pantallas (Expo Router): cada fichero es una ruta. `_layout.tsx` decide qué se puede ver (login → casa → pestañas); `(tabs)/_layout.tsx` es el marco común (cabecera, semana, barra inferior, ventanas emergentes) |
| `src/state/AppState.tsx` | Estado compartido y acciones (sesión, casa, semana, recetas, compra). Las pantallas lo leen con `useAppState()`. Contiene protecciones contra respuestas de red desordenadas (`createAsyncBoundary`): no las quites |
| `src/components/` | Piezas de interfaz; `modals/` tiene una ventana emergente por fichero |
| `src/domain/` | Lógica pura, sin React ni red: fechas, formato, ingredientes, agregación de la compra. Tests en `tests/` |
| `src/data/` | Acceso a Supabase, caché local (`cloud.ts`) y realtime |
| `src/theme.ts` | Colores y estilos compartidos; los estilos propios de una pantalla van en su fichero |
| `supabase/` | Esquema de base de datos y migraciones |
| `e2e/` | Tests de navegador (Playwright) |
| `auth-site/` | Web estática de ihambre.top (confirmación de correo) |
| `scripts/` | Export web y verificaciones contra Supabase real / emulador Android |
| `docs/` | Guía de trabajo para el dueño y planes de cada tarea |

## Comandos

El proyecto usa npm (`package-lock.json`).

```bash
npm run check               # typecheck + lint + tests unitarios (rápido; siempre)
npm run e2e                 # tests de navegador en modo local, sin nube
npm run e2e:fixtures        # tests de navegador con Supabase simulado
npm run e2e:export          # exporta la web y repite los tests locales sobre ella
npm run web                 # arrancar la app en el navegador
npx expo install <paquete>  # SIEMPRE en vez de npm install <paquete>: elige versiones compatibles con el SDK
npx expo-doctor             # diagnosticar dependencias y configuración
```

## Cuándo una tarea está terminada

1. `npm run check`, `npm run e2e` y `npm run e2e:fixtures` en verde.
2. Si cambia algo que el usuario ve o hace, hay un test que lo cubre.
3. Si cambia la base de datos, hay una migración nueva (nunca se edita una ya aplicada).
4. Este fichero y el README siguen siendo verdad.
5. Commit en la rama de la tarea con mensaje en español: `tipo: descripción` (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`).

## Cómo se trabaja

- **Una tarea = un plan + una rama.** El plan vive en `docs/plans/AAAA-MM-DD-nombre.md` (formato en `docs/plans/README.md`). Marca sus casillas según avances: si te quedas sin contexto o te releva otro agente, se continúa desde el plan.
- **Nunca hagas push a `main` ni a `gh-pages`.** `main` es lo aprobado; `gh-pages` es la web pública (ihambre.top). El dueño decide cuándo se junta una rama y cuándo se publica.
- **Revisión cruzada:** al acabar, otro modelo revisa la rama (subagente `revisor` o `/review` de Codex) antes de juntarla.
- **Nada de evidencias en el repo.** Capturas, logs e informes de verificación van a `artifacts/` (ignorado). La prueba de que algo funciona son los tests.
- **El repositorio es público.** Nunca escribas claves, contraseñas ni datos personales en ficheros.

## Supabase

- **Producción** (proyecto `rfdpptoctjolnfiavtts`) tiene datos reales. No ejecutes SQL, migraciones ni scripts contra producción sin permiso explícito del dueño en esa misma conversación.
- La app solo lleva la clave pública; la seguridad depende de RLS. Toda tabla nueva lleva RLS activado y políticas por pertenencia a la casa (`public.is_household_member`). Las funciones `security definer` fijan `search_path` y revocan `execute` a `public` y `anon`.
- La clave `service_role` jamás va en el cliente ni en ficheros del repo.

## Expo cambia: no te fíes de tu memoria

Expo rompe APIs en cada versión del SDK. Antes de escribir código que toque Expo, EAS o React Native:

1. Mira la versión mayor de `expo` en `package.json`.
2. Lee la documentación de esa versión: `https://docs.expo.dev/versions/v<mayor>.0.0/`
3. Para lo demás, empieza por https://docs.expo.dev/llms.txt (índice con correcciones a errores típicos de los LLM) y sigue sus enlaces.

- `ios/` y `android/` se generan (Continuous Native Generation) y están ignorados: no los edites; configura en `app.json` y plugins.
- Tras añadir una librería con código nativo hay que recompilar la app (development build): `npx expo run:android` o `npx eas-cli@latest build --profile development`.
- Prefiere módulos oficiales de Expo antes que librerías de terceros.
- `npx expo lint` solo revisa `src/`, `app/` y `components/`: el código de la app va siempre dentro de `src/`.

## Ahorra tokens

- Lee solo los ficheros que necesites; para búsquedas amplias usa el subagente `Explore`.
- No lances bucles autónomos ni verificaciones repetidas que nadie ha pedido.
