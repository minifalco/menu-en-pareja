# Cómo trabajar en iHambre con agentes de IA

Guía para el dueño del proyecto. Las reglas que siguen los agentes están en `AGENTS.md`; esta guía explica cómo dirigirlos tú.

## El equipo

| Papel | Quién | Para qué |
|---|---|---|
| Director | Tú | Decides qué se hace, apruebas planes, pruebas en el móvil y decides cuándo se junta una rama |
| Planificador y profesor | Claude Code en modo plan (Opus) | Investiga el código, propone el plan y te explica lo que no entiendas |
| Implementador | Claude Code (Sonnet) o Codex | Ejecuta el plan en una rama |
| Revisor | El *otro* modelo | Si lo escribió Claude, revisa Codex, y al revés |
| Ayudantes | Subagentes `Explore` (Haiku) y `revisor` (Sonnet) | Búsquedas baratas y revisión dentro de Claude Code |
| Operaciones | GitHub Actions y EAS, sin IA | Tests automáticos en cada push; builds y publicación en tiendas |

## El ciclo de una tarea

1. **Pide un plan.** En Claude Code, elige el modo **Plan** (selector junto a la caja de texto; en terminal, `Shift+Tab`) y escribe algo como:
   > Quiero que se pueda borrar la cuenta desde el menú de opciones. Investiga y propón un plan siguiendo docs/plans/README.md.
2. **Revisa el plan.** Pregunta lo que no entiendas ("¿qué es una migración?", "¿por qué hace falta esto?"). Pide cambios hasta que te convenza y apruébalo. El plan se guarda en `docs/plans/`.
3. **Implementación.** El agente crea una rama, trabaja y va marcando el plan. Puedes seguir haciendo otras cosas.
4. **Revisión cruzada.** Con la tarea terminada:
   - En Codex: abre `codex` en la carpeta del proyecto, escribe `/review` y elige revisar contra la rama `main`.
   - O en Claude Code: "usa el subagente revisor".
   Pásale al implementador lo que salga y que lo corrija.
5. **Prueba tú.** Mira que la CI esté en verde (GitHub → pestaña *Actions*) y prueba la app (ver abajo).
6. **Junta la rama.** Cuando estés conforme, pide: "junta la rama X en main". Juntar no publica nada: publicar la web (ver README) o una versión de la app en las tiendas es un paso aparte que decides tú.

**Relevo entre agentes.** Si a Claude se le acaba la cuota a mitad de tarea, abre Codex y escribe:
> Continúa el plan docs/plans/<fichero>.md en la rama <rama>. Lee AGENTS.md primero.

**Máximo dos tareas a la vez**, cada una en su rama. Con más, el cuello de botella eres tú revisando.

## Qué modelo usar

Tienes dos bolsas de uso independientes (cada una con límite cada 5 horas y otro semanal): **Claude Pro** (claude.ai y Claude Code) y **ChatGPT Plus** (Codex; Hermes también gasta de aquí).

| Tarea | Modelo | Esfuerzo |
|---|---|---|
| Planificar, decisiones de diseño, bugs difíciles | Opus | medium; high solo si se atasca |
| Implementar un plan aprobado | Sonnet, o `/model opusplan` (planifica con Opus y ejecuta con Sonnet automáticamente) | medium |
| Revisar, o seguir cuando se acaba Claude | Codex (GPT-6.1 Sol) | medium |
| Búsquedas y tareas mecánicas | Subagente `Explore` (Haiku), automático | low |
| Dudas de negocio, textos de la tienda | Chat de claude.ai | — |

Evita **Fable** (en Pro puede cobrarse aparte) y el **fast mode** de Codex (gasta 2,5×). Consulta lo que te queda con `/usage` (Claude Code) o `/status` (Codex).

**Para que dure más:** una sesión por tarea y `/clear` al terminarla; tareas pequeñas y concretas; no dejes agentes en bucles automáticos.

## Probar la app

```bash
npm run web          # en el navegador del ordenador
npx expo start       # en el móvil: escanea el QR con la app Expo Go
```

Para el APK de Android instalable, ver el README. Antes de juntar una rama, los tests automáticos deben estar en verde:

```bash
npm run check        # rápido: tipos, estilo y tests unitarios
npm run e2e          # tests de navegador sin nube
npm run e2e:fixtures # tests de navegador con Supabase simulado
```

## Glosario

- **Repositorio (repo):** la carpeta del proyecto con todo su historial de cambios (git).
- **Commit:** un punto de guardado con nombre en el historial. Se puede volver a cualquiera.
- **Rama:** una línea de trabajo paralela. Se trabaja en una rama sin tocar `main` hasta que está lista.
- **`main`:** la rama principal; lo que está ahí es "lo publicado".
- **Push:** subir commits a GitHub. **Juntar (merge):** incorporar una rama a otra.
- **Pull request (PR):** petición en GitHub para juntar una rama, con su revisión y comentarios.
- **CI:** comprobaciones automáticas que GitHub ejecuta en cada push (los tests).
- **Test:** programa que comprueba que algo funciona. Unitario = una función; de navegador (e2e) = la app entera como la usaría una persona.
- **Componente:** una pieza de interfaz (un botón, una pantalla). **Hook:** una pieza de lógica reutilizable de React (empieza por `use…`).
- **Ruta:** una pantalla con su propia dirección (`/compra`). Con Expo Router, cada fichero de `src/app/` es una ruta.
- **Migración:** un fichero con un cambio de la base de datos; se aplican en orden y nunca se editan después.
- **RLS:** reglas de Postgres que deciden qué filas puede ver o cambiar cada usuario. Es lo que protege los datos de cada casa.
- **Staging / producción:** copia de pruebas / la versión real con datos de usuarios.
- **Token / contexto:** los modelos leen y escriben en tokens (trozos de palabra); el contexto es todo lo que el modelo tiene "en la cabeza" en una sesión. Más contexto = más gasto.
