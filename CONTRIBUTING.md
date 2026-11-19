# Guía de contribución — MediSalud

> **Política propuesta para las contribuciones futuras.** Este documento se incorpora como mejora del proceso. Su existencia no demuestra que todas estas prácticas se aplicaran anteriormente; las reglas obligatorias de GitHub deben configurarse por separado.

## Estrategia de ramas

- `main`: versión de hito o entrega validada. No es necesariamente la versión más reciente mientras un sprint está en desarrollo.
- `develop`: integración del trabajo en curso; es la base de nuevas funcionalidades y correcciones.
- `feature/MED-XX-descripcion`: desarrollo asociado con una historia de Jira.
- `fix/MED-XX-descripcion`: corrección vinculada con una incidencia.
- `docs/descripcion` o `chore/descripcion`: documentación y mantenimiento.

Crear cada rama desde `develop` actualizado. Los cambios que llegan a `main` deben proceder de una integración explícita y comprobada para un hito o entrega. No utilizar `git push --force` ni modificar el historial compartido como método habitual de corrección.

## Flujo propuesto para cada cambio

1. Revisar la historia/incidencia, sus criterios de aceptación y el alcance acordado.
2. Crear una rama temática pequeña y mantener los cambios relacionados en ella.
3. Usar mensajes de commit descriptivos siguiendo Conventional Commits, por ejemplo `feat(reservas): impedir doble agendamiento (MED-20)`.
4. Antes de solicitar integración, ejecutar `npm ci`, `npm ci --prefix backend`, `npm ci --prefix frontend` y `npm run check`. Ejecutar pruebas de aceptación adicionales cuando se modifica lógica crítica, usando una base de datos descartable.
5. Abrir un **pull request hacia `develop`**, completar la plantilla e incluir evidencia verificable de pruebas. Solicitar revisión a otra persona del equipo.
6. **Esperar la finalización exitosa del check `verify` de CI y obtener al menos una revisión independiente que apruebe los cambios antes de fusionar.** Si CI falla, corregir la causa y repetir la ejecución; no integrar por conveniencia.
7. Atender observaciones y resolver conversaciones. Si cambió código relevante después de la aprobación, solicitar una nueva revisión.
8. Fusionar con el método acordado por el equipo, preservar el enlace al PR y actualizar Jira sin declarar completadas pruebas o aceptaciones que no se realizaron.

> Hasta que los rulesets se configuren en GitHub, los pasos 5 y 6 son **un acuerdo recomendado, no una restricción técnica ya activa**. Ver [configuración propuesta](.github/BRANCH_PROTECTION.md).

## Buenas prácticas para revisores

- Quien abre el PR no se aprueba a sí mismo. La aprobación debe representar una revisión real, preferentemente por alguien que no escribió el cambio.
- Revisar alcance, regresiones, seguridad, validaciones, migraciones, accesibilidad y documentación según corresponda.
- Dejar observaciones concretas en GitHub y explicar cómo se resolvieron.
- No añadir revisiones, fechas de aprobación ni evidencias ficticias a PR históricos.

## Tamaño y trazabilidad

- Preferir PR limitados a una funcionalidad o corrección. Si el cambio es grande, explicar la razón y delimitar archivos o componentes a revisar.
- Relacionar PR, commits y documentación con la clave de Jira (`MED-XX`) cuando exista.
- Identificar participantes por su contribución efectiva y no asignar autoría basada únicamente en el rol del sprint.
- Mantener el README alineado con la versión real. Separar claramente **implementado**, **probado**, **pendiente** y **fuera de alcance**.
- Para cambios en arquitectura, concurrencia o seguridad, registrar decisiones en `docs/adr/` si corresponde.

## Calidad, datos y seguridad

- No subir archivos `.env`, credenciales, tokens, datos de pacientes reales ni fotografías personales sin autorización.
- Usar exclusivamente datos de demostración ficticios. Las contraseñas del entorno de pruebas o ejemplos locales no son credenciales de producción.
- El sistema es una **demostración académica**, no un servicio clínico productivo.
- Si se emplean herramientas de IA en el desarrollo, respetar las normas de la asignatura, verificar los cambios y poder explicar personalmente lo entregado. Nunca presentar revisiones automatizadas como si las hubiera realizado un compañero.

## Preparación de una entrega

Para preparar una entrega del sprint, comprobar que `develop` está en verde, revisar las diferencias con `main` y abrir un PR de integración hacia `main` si el equipo acuerda ese alcance. Esperar la revisión y CI, y etiquetar el hito solo después de validarlo. **No fusionar automáticamente ramas divergentes ni sustituir el historial existente.**

## Evidencia histórica de contribuciones

Ver [CONTRIBUCIONES.md](CONTRIBUCIONES.md), que distingue lo documentado en el historial de las prácticas propuestas en esta guía.
