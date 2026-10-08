# Plan: partir App.tsx y pasar a Expo Router

- Estado: Hecho
- Rama: expo-router (sale de `reglas-comunes`)

## Objetivo
`App.tsx` (638 líneas, ~27.000 tokens) contiene toda la app. Partirlo en pantallas, estado compartido y componentes para que cada cambio toque y lea solo lo necesario, y preparar la navegación para las pantallas nuevas del paso 4. **La app debe verse y comportarse igual.**

## Diseño
- `src/app/_layout.tsx`: arranque (fuente, splash), proveedor de estado y navegación con rutas protegidas (`Stack.Protected`): sin sesión → `login`; con sesión pero sin casa → `casa`; con casa (o en modo local) → pestañas.
- `src/app/(tabs)/_layout.tsx`: el "marco" común: cabecera, avisos, selector de semana, barra de pestañas propia y las ventanas emergentes. Solo se monta la pestaña activa, como hasta ahora. No se usan las pestañas experimentales de `expo-router/ui`.
- `src/app/(tabs)/index.tsx` (Semana), `compra.tsx`, `platos.tsx`: una pantalla por fichero.
- `src/state/AppState.tsx`: todo el estado y las acciones que hoy viven en `AppContent`, movidos sin cambiar la lógica (las protecciones contra respuestas desordenadas de la red son delicadas).
- `src/components/`: cabecera, barra de pestañas, selector de semana, botones, avisos y una ventana emergente por fichero.
- `src/theme.ts`: colores y estilos comunes. `src/domain/format.ts`: textos de fechas y cantidades. `src/lib/errors.ts`: mensajes de error.

## Pasos
- [x] Instalar Expo Router con `npx expo install` y cambiar la entrada de la app a `expo-router/entry`.
- [x] Crear tema, utilidades y componentes básicos.
- [x] Mover el estado a `AppState.tsx`.
- [x] Crear las rutas y el marco de pestañas; borrar `App.tsx` e `index.ts`.
- [x] Sustituir los tests que leían el texto de `App.tsx` por tests de funciones reales (`buildManualItem`).
- [x] Web publicada: copiar `index.html` como `404.html` para que recargar `/compra` funcione en GitHub Pages.
- [x] Comprobar: `npm run check`, los 30 tests de navegador, export web y bundle de Android.
- [x] Actualizar `AGENTS.md` (mapa del código).

## Cambios respecto a lo previsto
- `expo lint` solo revisaba `src/`, `app/` y `components/`: el antiguo `App.tsx` de la raíz nunca se había revisado. Al moverlo salió un error real (se modificaba un valor devuelto por `useMemo` en las casillas de la compra), corregido guardando las escrituras pendientes en un `useRef` por ámbito, con la misma lógica.
- La prueba sobre la web exportada no arrancaba (usaba `python`, que no existe en este equipo): ahora usa `scripts/serve-dist.mjs`, que imita a GitHub Pages, y hay atajo `npm run e2e:export`.
- Se descubrió que ihambre.top se sirve de la rama `gh-pages` (confirmación en `/`, app en `/app/`) y que `.github/workflows/pages.yml` estaba roto y podía sustituir la página de confirmación: se retiró y se documentó la publicación manual en el README. Comprobado que las pestañas funcionan bajo `/app/`.
- `.claude/launch.json`: configuración `web-local` para ver la app sin nube en el navegador integrado de Claude.

## Riesgos
- Cambiar sin querer el comportamiento → los 30 tests de navegador son el árbitro; no se cambia ningún test de navegador.
- Expo Router añade módulos nativos (`react-native-screens`, `expo-linking`, `expo-constants`) → el APK instalado hay que recompilarlo; Expo Go ya los incluye.
- En la web la dirección cambia por pestaña (`/compra`) → `404.html` en GitHub Pages.

## Cómo comprobarlo
Tests en verde. El dueño: `npm run web` y `npx expo start` con Expo Go; todo debe verse como antes.

## Fuera de alcance
Funciones nuevas (paso 4) y cambios visuales.
