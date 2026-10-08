# Planes de trabajo

Cada tarea que lleve más de un paso tiene aquí su plan, escrito **antes** de tocar código y aprobado por el dueño.

## Para qué sirven

- **Revisar el qué antes del cómo:** el dueño aprueba o corrige el plan antes de que se escriba código.
- **Memoria entre sesiones:** los agentes no recuerdan conversaciones anteriores. Si una sesión se acaba (límite de uso, `/clear`), otro agente — Claude o Codex — continúa leyendo el plan y la rama.
- **Historial de decisiones:** dentro de unos meses se puede saber por qué se hizo algo.

## Cómo se usa

1. El dueño describe la tarea. El agente investiga en **modo plan** (solo lectura) y propone un plan.
2. El dueño lo aprueba o pide cambios. El plan se guarda aquí como `AAAA-MM-DD-nombre-corto.md`.
3. El agente crea la rama y va marcando las casillas `[x]` a medida que completa pasos, en los mismos commits que el trabajo.
4. Al terminar: estado `Hecho`, y debajo de cada paso lo que haya cambiado respecto a lo previsto.

## Plantilla

```markdown
# Plan: <título>

- Estado: Propuesto | Aprobado | En curso | Hecho
- Rama: <nombre-de-rama>

## Objetivo
Qué se consigue y por qué, en dos o tres frases.

## Pasos
- [ ] Paso concreto y comprobable
- [ ] ...

## Riesgos
Qué puede salir mal y cómo se evita.

## Cómo comprobarlo
Qué tests deben pasar y qué puede probar el dueño en el móvil.

## Fuera de alcance
Lo que NO se hace en esta tarea.
```
