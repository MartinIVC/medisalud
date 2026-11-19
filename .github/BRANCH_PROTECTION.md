# Configuración recomendada de protección de ramas — MediSalud

> **Guía de aplicación manual. No demuestra que las reglas estén activadas.** A fecha de la auditoría (19-11-2026), GitHub informó `protected: false` para `main` y `develop`, y la consulta de rulesets no devolvió reglas. La integración conectada usada para esta corrección no dispone de permisos/herramientas para activar estas restricciones.

## Propuesta: reglas para `develop` y `main`

En el repositorio, entrar con una cuenta que tenga permisos de administración a **Settings → Rules → Rulesets → New branch ruleset**. La disponibilidad exacta de opciones puede depender del plan de GitHub y del tipo de repositorio.

Crear un ruleset activo dirigido a las ramas `develop` y `main` (o reglas separadas), con estas protecciones:

1. **Require a pull request before merging**.
2. **Required approvals: 1** como mínimo, de alguien distinto al autor.
3. **Dismiss stale pull request approvals when new commits are pushed**, si está disponible.
4. **Require status checks to pass before merging** y seleccionar el check exacto `verify` del workflow **CI**. Este check debe existir y ejecutarse en PR hacia ambas ramas.
5. **Block force pushes** y **restrict deletions**.
6. Evitar bypass injustificado de las reglas (incluidos administradores, si el equipo y el plan lo permiten).

Antes de activar, confirmar que existe al menos otra persona con permisos para revisar y aprobar los PR. Configurar un control imposible de cumplir podría bloquear entregas legítimas. En ningún caso se debe sustituir esa revisión con una aprobación inventada.

## Verificación del control

- Abrir un PR de prueba hacia `develop` desde una rama temática.
- Comprobar que **no puede fusionarse** antes de finalizar `CI / verify`.
- Comprobar que **no puede fusionarse** sin la aprobación real de otra persona.
- Confirmar que un nuevo commit invalida una aprobación antigua cuando esa opción esté activada.
- Repetir la comprobación para `main`, sin utilizar cambios productivos para el ensayo.

Guardar evidencia (captura de configuración y enlaces a ejecuciones) con fecha, evitando mostrar secretos o datos privados.

## Gestión de las ramas existentes

- `main` documenta el núcleo de Sprint 1; `develop` incluye implementaciones posteriores. **No es un error por sí mismo** mantener ambas distintas.
- Antes de llevar `develop` a `main`, estudiar el diff y resolver cambios exclusivos de `main` (por ejemplo, README) sin sobrescribirlos accidentalmente.
- Hacer esa integración en un PR explícito y aprobarla solo tras las verificaciones y la aceptación del equipo.

## Estado pendiente

- [ ] Ruleset de `develop` configurado y verificado.
- [ ] Ruleset de `main` configurado y verificado.
- [ ] Al menos una persona revisora distinta del autor disponible.
- [ ] Evidencia del bloqueo y posterior aprobación documentada.

Marcar estas casillas únicamente después de comprobar las protecciones en GitHub.
