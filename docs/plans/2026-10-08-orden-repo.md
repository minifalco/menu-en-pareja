# Plan: ordenar el repositorio

- Estado: Hecho
- Rama: orden-repo

## Objetivo
Guardar en git todo el trabajo acumulado (solo había 2 commits) sin meter basura ni claves en un repositorio público.

## Pasos
- [x] Añadir a `.gitignore`: `artifacts/` (806 MB de APKs, capturas y logs), `__pycache__/`, capturas y logs que generan los tests de `auth-site`, y `_archivo/`.
- [x] Mover las evidencias de verificación de Hermes (14 JSON de `supabase/`, `CRON-20261007.md`, `VERIFICATION.md`) a `_archivo/hermes-evidencias/`: siguen en el disco local, fuera de git.
- [x] Buscar claves y contraseñas en todo lo que se iba a guardar: 0 coincidencias. Solo aparece el ID del proyecto Supabase, que es público.
- [x] Comprobar antes de guardar: typecheck, lint, 19 tests unitarios y 30 de navegador en verde.
- [x] 8 commits por tema: reglas git, base de datos, app, marca/PWA, tests, web de confirmación, scripts, README.
- [x] Subir a la rama `orden-repo`, no a `main`.

## Riesgos
- Un push a `main` publica la web automáticamente → se subió a una rama.
- La configuración global de git apuntaba a un `gh` temporal de Hermes que ya no existía → se subió con un ajuste puntual. Arreglo permanente: ejecutar `gh auth setup-git`.

## Cómo comprobarlo
`git status` limpio y la rama visible en GitHub. La app no cambia.

## Fuera de alcance
Cambios de código o de base de datos.
