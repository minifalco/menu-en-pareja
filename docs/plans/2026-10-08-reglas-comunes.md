# Plan: reglas comunes para los agentes

- Estado: Hecho
- Rama: reglas-comunes (sale de `orden-repo`)

## Objetivo
Que Claude Code, Codex y Hermes trabajen con las mismas reglas, sepan qué es "terminado" y gasten menos tokens; y que el dueño tenga una guía para dirigirlos.

## Pasos
- [x] Reescribir `AGENTS.md` en español: qué es la app, mapa del código, comandos, definición de terminado, flujo plan + rama, reglas de Supabase, cómo hablar con el dueño. El anterior era la plantilla genérica de Expo y pedía Expo Router, que la app no usaba.
- [x] Unificar los tests de navegador: 3 configuraciones de "Supabase simulado" (`auth`, `account`, `shopping`) pasan a una sola, `playwright.fixtures.config.ts`.
- [x] Atajos en `package.json`: `npm run check` (typecheck + lint + unitarios) y `npm run e2e:fixtures`.
- [x] Subagentes en `.claude/agents/`: `Explore` (búsquedas, Haiku, solo lectura; sustituye al explorador incorporado, que usa el modelo caro de la conversación) y `revisor` (Sonnet, esfuerzo alto, solo lectura).
- [x] Carpeta `docs/plans/` con formato y plantilla.
- [x] `docs/flujo-de-trabajo.md`: guía para el dueño (ciclo de cada tarea, modelos, comandos, glosario).
- [x] Reescribir el README: qué es, cómo arrancarla, comandos y estructura. El registro de verificaciones de Hermes queda en el historial de git.
- [x] CI en GitHub Actions (`.github/workflows/ci.yml`): en cada push a cualquier rama, `npm run check` y los dos grupos de tests de navegador.

## Riesgos
- Que los tests unificados se comporten distinto → se ejecutaron: 20/20, igual que por separado.
- Que la CI falle por diferencias con este ordenador → se comprueba en el primer push.

## Cómo comprobarlo
`npm run check`, `npm run e2e`, `npm run e2e:fixtures` en verde; la CI en verde en GitHub (pestaña Actions).

## Fuera de alcance
Cambios en la app.
