# Contexto de trabajo — Medisalud

> Snapshot del 7 de noviembre de 2026. Este archivo conserva decisiones de trabajo, no reemplaza Jira ni el código. Antes de iniciar una tarea, comprobar el estado actual del tablero y `git status`; actualizar este archivo cuando cambie el alcance.

## Objetivo actual

Completar el Sprint 3 del proyecto académico Medisalud. Jira muestra el sprint activo, del 26 de octubre al 15 de noviembre, con el objetivo: **«Completar y validar en un entorno de pruebas la gestión de médicos y de citas por secretaría»**.

### Historias comprometidas en Sprint 3

| Ticket | Alcance                                       | Puntos Jira | Nota de trabajo                                                                                                                                                                 |
| ------ | --------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MED-19 | Gestión de médicos                            |           3 | Está En curso. Revisar criterios de aceptación y evidencia antes de cerrar.                                                                                                     |
| MED-20 | Cancelar o reprogramar citas por secretaría   |           5 | Finalizado en Jira; la validación ampliada fue integrada en `develop` mediante el PR #2. |
| MED-23 | Foto de perfil de profesionales               |           5 | Implementación terminada y registrada en Git: foto persistente, carga protegida, fallback y ampliación desde el catálogo/resumen de reserva. Jira no se modificó en esta tarea. |
| MED-24 | Desvincular profesional conservando historial |           5 | No borrar agendas ni citas históricas; bloquear la acción si hay citas futuras hasta gestionarlas.                                                                              |
| MED-25 | Acceso individual de secretarías              |           8 | Finalizado en Jira; integrado en `develop` mediante el PR #3 junto con MED-26.                                                                      |

Total visible en Jira: **26 puntos**. MED-20, MED-23 y MED-25 (18 puntos) están Finalizados; MED-19 y MED-24 (8 puntos) siguen En curso. Los puntos son estimaciones del tamaño de cada historia, no horas ni una garantía de capacidad.

### Subtareas

- **MED-21**, hija de MED-20: prueba de cancelación y reprogramación con PostgreSQL descartable. Finalizada en Jira el 7 de noviembre. La prueba pasó y cubre acceso, motivos, cupos bloqueados/ocupados/vencidos, profesional inactivo, liberación conservando bloqueos y avisos pendientes.
- **MED-22**, hija de MED-20: manual, contrato API y UAT. Finalizada en Jira el 7 de noviembre. El manual aclara que el aviso está pendiente, el contrato incluye `20261030_gestion_reservas.sql` y UAT-08 comprueba ambos cupos y el aviso pendiente.
- **MED-26**, hija de MED-25: provisión inicial y migración de cuentas. Finalizada en Jira; no se habilitó autorregistro público.

**MED-27** queda pendiente como historia independiente de 8 puntos para asociar y auditar las acciones administrativas por cuenta. Depende de MED-25: la identidad de sesión prepara esa integración, pero no implementa la bitácora.

No sumar por segunda vez los puntos de las subtareas si el esfuerzo ya está incluido en los puntos de su historia padre.

## Decisiones y límites del producto

- Es una **demo académica**, no una instalación de una clínica. Usar datos ficticios; no afirmar despliegue productivo, capacitación de personal real o entrega real de notificaciones.
- MED-17 (capacitación y marcha blanca) está en el backlog para un sprint posterior. Adaptar la actividad a capacitación y UAT simuladas con evidencia verificable.
- MED-18 / RNF-03 está Por hacer en el backlog. La configuración real de SPF/DKIM/DMARC y la meta de entrega >95 % dependen de dominio y proveedor externos, que el equipo probablemente no contratará. No incluir esa validación real en el alcance ni reportarla como cumplida. Si se retoma, acordar una alternativa académica explícita.
- MED-24 depende de una regla ya acordada: si el profesional tiene citas futuras, no desvincularlo silenciosamente; secretaría debe gestionar esas citas con el flujo MED-20.
- MED-23 guarda las imágenes en PostgreSQL (`BYTEA`); el volumen `medisalud_pgdata` de Docker Compose mantiene los datos al reiniciar los servicios. No requiere almacenamiento externo. La API valida PNG/JPEG, tamaño y contenido, permite reemplazo a secretaría autenticada y conserva el fallback genérico.
- MED-25 sustituye la contraseña compartida por cuentas con hash `scrypt`, sesiones opacas revocables, límite de intentos y provisión administrativa. La transición y el ADR están integrados en `develop`.
- El aviso de cancelación o cambio se encola para su envío; la interfaz indica que se solicitó el envío, no que llegó. La aceptación por un proveedor no prueba entrega.
- ADR-0001 registra la transacción y el orden de bloqueo de las operaciones de secretaría: `docs/adr/0001-gestion-atomica-citas-secretaria.md`.
- En la agenda de secretaría, las acciones del horario aparecen debajo del detalle de la fila seleccionada, sin repetir sus datos; si una cita o un horario pasado no se puede gestionar ni modificar, se ocultan los botones de acción y se explica el motivo. En fechas pasadas (`secFecha < hoy`), la agenda permanece consultable en modo de solo lectura (con «Configurar horarios» y «Registrar ausencia o feriado» deshabilitados), y el backend rechaza con `409` (`SLOT_PAST`, `AGENDA_DATE_PAST`, `AGENDA_PAST`) cualquier intento de configurar, bloquear o desbloquear horarios o fechas vencidas. Pueden cerrarse al volver a seleccionar la fila.
- En el portal de pacientes, el horario seleccionado abre el formulario en un diálogo; al cerrarlo o elegir «Cambiar hora», una franja junto a ese grupo conserva la hora seleccionada para retomarla. «Elegir otra hora» después de un conflicto sí limpia la selección.

## Estado conocido del repositorio

- El volumen local de PostgreSQL tenía el esquema previo de notificaciones; se aplicó `20261030_gestion_reservas.sql` tras respaldarlo para habilitar cancelaciones y reprogramaciones. Otros volúmenes existentes requieren revisar sus migraciones por separado.
- MED-25 y MED-26 están integradas en `develop` mediante el PR #3 (`8c179b9`).
- `dfaa4d3 feat(ui): redesign Medisalud with Swiss Signal` establece el diseño visual editorial («Swiss Signal») en los portales de paciente y secretaría.
- `7a05953 feat(citas): gestionar reservas por secretaria` incorpora para MED-20 el servicio, flujo de secretaría, contrato API, manual/protocolo y prueba de aceptación `backend/tests/verify-gestion-reservas.js`.
- `AGENTS.md` contiene convenciones y comandos del proyecto; leerlo antes de modificar código.
- MED-23 está implementada y adaptada al diseño Swiss Signal (`880f866`, `55cf4a9`, `efa2343`). Incluye la migración `20261103_medicos_foto.sql`, carga de secretaría (`DoctorPhotoEditor`), fallback y ampliación de fotos en la experiencia paciente (`DoctorPhoto`). Jira no se modificó ni se verificó su estado de cierre en esta tarea.
- MED-24 sigue pendiente; MED-25 está integrada en `develop`.

## Verificación segura

- Para cambios rutinarios, `npm run check` ejecuta lint, Prettier, pruebas unitarias, revisión de sintaxis del backend y build del frontend.
- Las pruebas de aceptación modifican datos: usar exclusivamente el entorno descartable descrito en `README.md` y `docker-compose.test.yml`. `TEST_DATABASE_URL` debe apuntar a una base local cuyo nombre termine en `_test`; nunca apuntarlas a una base compartida o real.
- La suite de gestión de citas se invoca en el servicio aislado con `npm run test:gestion-reservas` desde backend. No confundir que el script exista con evidencia de que se volvió a ejecutar después de cambios posteriores.
- Las cuentas individuales se validan con `npm run test:secretarias` sobre PostgreSQL descartable; la migración debe probarse tanto en bases nuevas como anteriores.
- Cuando cambie API, persistencia o comportamiento de usuario, mantener al día `API_CONTRACT.md`, el README y los manuales relevantes.
