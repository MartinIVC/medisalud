# Contexto de trabajo — Medisalud

> Snapshot del 3 de noviembre de 2026. Este archivo conserva decisiones de trabajo, no reemplaza Jira ni el código. Antes de iniciar una tarea, comprobar el estado actual del tablero y `git status`; actualizar este archivo cuando cambie el alcance.

## Objetivo actual

Completar el Sprint 3 del proyecto académico Medisalud. Jira muestra el sprint activo, del 26 de octubre al 15 de noviembre, con el objetivo: **«Completar y validar en un entorno de pruebas la gestión de médicos y de citas por secretaría»**.

### Historias comprometidas en Sprint 3

| Ticket | Alcance | Puntos Jira | Nota de trabajo |
| --- | --- | ---: | --- |
| MED-19 | Gestión de médicos | 3 | Está En curso. Revisar criterios de aceptación y evidencia antes de cerrar. |
| MED-20 | Cancelar o reprogramar citas por secretaría | 5 | Implementación ya está en la rama. MED-21 y MED-22 siguen Por hacer en Jira. |
| MED-23 | Foto de perfil de profesionales | 5 | Implementación terminada y registrada en Git: foto persistente, carga protegida, fallback y ampliación desde el catálogo/resumen de reserva. Jira no se modificó en esta tarea. |
| MED-24 | Desvincular profesional conservando historial | 5 | No borrar agendas ni citas históricas; bloquear la acción si hay citas futuras hasta gestionarlas. |
| MED-25 | Acceso individual de secretarías | 8 | Requiere autenticación por cuenta; incluir la provisión inicial de MED-26. |

Total visible en Jira: **26 puntos**. El tablero agrupa actualmente los 26 puntos como En curso y 0 como Done. Los puntos son estimaciones del tamaño de cada historia, no horas ni una garantía de capacidad.

### Subtareas

- **MED-21**, hija de MED-20: prueba de cancelación y reprogramación con PostgreSQL descartable. Estado Por hacer y sin responsable. El código de prueba existe; conservar el estado hasta que se revise y se registre la evidencia de aceptación.
- **MED-22**, hija de MED-20: manual, contrato API y UAT. Estado Por hacer y sin responsable. La documentación correspondiente ya está en la rama; falta revisar el entregable UAT y acordar el cierre.
- **MED-26**, hija de MED-25: provisión inicial y migración de cuentas. Estado Por hacer y sin responsable. No implementar MED-25 suponiendo que se habilitará autorregistro público.

No sumar por segunda vez los puntos de las subtareas si el esfuerzo ya está incluido en los puntos de su historia padre.

## Decisiones y límites del producto

- Es una **demo académica**, no una instalación de una clínica. Usar datos ficticios; no afirmar despliegue productivo, capacitación de personal real o entrega real de notificaciones.
- MED-17 (capacitación y marcha blanca) está en el backlog para un sprint posterior. Adaptar la actividad a capacitación y UAT simuladas con evidencia verificable.
- MED-18 / RNF-03 está Por hacer en el backlog. La configuración real de SPF/DKIM/DMARC y la meta de entrega >95 % dependen de dominio y proveedor externos, que el equipo probablemente no contratará. No incluir esa validación real en el alcance ni reportarla como cumplida. Si se retoma, acordar una alternativa académica explícita.
- MED-24 depende de una regla ya acordada: si el profesional tiene citas futuras, no desvincularlo silenciosamente; secretaría debe gestionar esas citas con el flujo MED-20.
- MED-23 guarda las imágenes en PostgreSQL (`BYTEA`); el volumen `medisalud_pgdata` de Docker Compose mantiene los datos al reiniciar los servicios. No requiere almacenamiento externo. La API valida PNG/JPEG, tamaño y contenido, permite reemplazo a secretaría autenticada y conserva el fallback genérico.
- MED-25 debe dejar de depender de la contraseña compartida `SECRETARY_PASSWORD`; contempla hashes seguros, protección de intentos repetidos, sesiones con expiración/revocación, alta administrativa y transición documentada. La configuración compartida todavía existe en el código actual.
- Mantener las respuestas de correo en estado «pendiente» cuando solo se encolan. La aceptación por un proveedor no prueba entrega.

## Estado conocido del repositorio

- Rama: `develop` (diseño Swiss Signal integrado con cambios funcionales).
- `dfaa4d3 feat(ui): redesign Medisalud with Swiss Signal` establece el diseño visual editorial («Swiss Signal») en los portales de paciente y secretaría.
- `7a05953 feat(citas): gestionar reservas por secretaria` incorpora para MED-20 el servicio, flujo de secretaría, contrato API, manual/protocolo y prueba de aceptación `backend/tests/verify-gestion-reservas.js`.
- `AGENTS.md` contiene convenciones y comandos del proyecto; leerlo antes de modificar código.
- MED-23 está implementada y adaptada al diseño Swiss Signal (`880f866`, `55cf4a9`, `efa2343`). Incluye la migración `20261103_medicos_foto.sql`, carga de secretaría (`DoctorPhotoEditor`), fallback y ampliación de fotos en la experiencia paciente (`DoctorPhoto`). Jira no se modificó ni se verificó su estado de cierre en esta tarea.
- MED-24 y MED-25 siguen sin implementar en el código conocido.

## Verificación segura

- Para cambios rutinarios, `npm run check` ejecuta lint, Prettier, pruebas unitarias, revisión de sintaxis del backend y build del frontend.
- Las pruebas de aceptación modifican datos: usar exclusivamente el entorno descartable descrito en `README.md` y `docker-compose.test.yml`. `TEST_DATABASE_URL` debe apuntar a una base local cuyo nombre termine en `_test`; nunca apuntarlas a una base compartida o real.
- La suite de gestión de citas se invoca en el servicio aislado con `npm run test:gestion-reservas` desde backend. No confundir que el script exista con evidencia de que se volvió a ejecutar después de cambios posteriores.
- Cuando cambie API, persistencia o comportamiento de usuario, mantener al día `API_CONTRACT.md`, el README y los manuales relevantes.
