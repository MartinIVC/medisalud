# AGENTS.md — Medisalud

Aplicación académica de demostración para la consulta de disponibilidad horaria y reserva de citas médicas en tiempo real en el Centro Médico Medisalud, orientada a pacientes y personal de secretaría con prevención de sobreventa y notificaciones automatizadas.

## Stack y estructura

- **Runtime y Tooling**: Node.js `>=22.22.2 <27` (referencia `.nvmrc`: `22.22.2`), ESLint 10.13.0, Prettier 3.9.10.
- **Backend**: Express 4.21.2 (CommonJS), PostgreSQL 16 Alpine (`pg` 8.13.3), Nodemailer 6.10.0, CORS 2.8.5, Node.js native test runner (`node --test`).
- **Frontend**: React 18.3.1 (ESM), Vite 6.0.5, Tailwind CSS 3.4.19, PostCSS 8.5.32, React Testing Library 16.3.3, JSDOM 30.1.3, Node.js native test runner (`node --test`).
- **Base de datos e Infraestructura**: PostgreSQL 16 (`postgres:16-alpine`), Docker Compose v2 (servicios `db`, `backend`, `frontend`, y entorno de prueba descartable en `docker-compose.test.yml`).
- `backend/src/services/`: Lógica de negocio transaccional para agendamiento (`agenda.js`) y reservas con control de concurrencia (`reservas.js`).
- `backend/src/routes/`: Endpoints HTTP de Express (`agendas.js`, `disponibilidad.js`, `medicos.js`, `reservas.js`).
- `backend/src/db/transaction.js`: Utilidad para ejecutar transacciones en PostgreSQL (`withTransaction`) con soporte para niveles de aislamiento (`SERIALIZABLE`) y rollback automático.
- `backend/src/notifications/`: Cola de notificaciones en base de datos (`queue.js`), worker de despacho y proveedores para Email (SendGrid/SMTP) y WhatsApp (Twilio).
- `backend/src/utils/rutValidator.js` y `frontend/src/utils/rut.js`: Algoritmo canónico de validación (Módulo 11) y formateo de RUT chileno.
- `frontend/src/features/`: Componentes organizados por dominio: portal del paciente (`paciente/`), portal de secretaría (`secretaria/`) y comprobantes (`citas/`).
- `frontend/src/api/client.js`: Cliente de fetch centralizado con manejo de cabeceras, tokens Bearer, inyección de `Idempotency-Key` y normalización de errores con `ApiError`.
- `database/`: Esquema inicial (`01_init.sql`), datos semilla (`02_seed.sql`) y migraciones ordenadas en `database/migrations/`.
- `shared/rut-cases.json`: Batería canónica de casos de prueba para validación de RUT compartida entre frontend y backend.
- `API_CONTRACT.md`: Especificación de formatos estándar de respuestas de éxito, errores estructurados, semántica HTTP e idempotencia.
- `memory.md`: Registro del estado temporal del Sprint, decisiones vigentes y contexto de avance del proyecto.

## Comandos

- Instalar dependencias en raíz y subproyectos:
  ```bash
  npm ci && npm ci --prefix backend && npm ci --prefix frontend
  ```
- Ejecutar verificación completa (lint, formato, tests unitarios, chequeo sintaxis backend y build frontend):
  ```bash
  npm run check
  ```
- Linter y formato de código:
  ```bash
  npm run lint
  npm run format:check
  npm run format
  ```
- Pruebas unitarias de backend y frontend:
  ```bash
  npm test
  npm --prefix backend test
  npm --prefix frontend test
  ```
- Chequeo de sintaxis de arranque backend y compilación frontend:
  ```bash
  npm --prefix backend run check
  npm run build
  ```
- Entorno de desarrollo local con Docker Compose:
  ```bash
  docker compose up -d --build
  docker compose ps
  docker compose logs -f backend
  docker compose down
  # Reiniciar base de datos eliminando volúmenes:
  docker compose down -v
  ```
- Pruebas de aceptación y concurrencia (Sprint 1 y Sprint 3) en PostgreSQL descartable:
  ```bash
  docker compose -f docker-compose.test.yml down -v
  docker compose -f docker-compose.test.yml up -d --build
  docker compose -f docker-compose.test.yml exec -T backend-test npm run test:sprint1
  docker compose -f docker-compose.test.yml exec -T backend-test npm run test:sprint3
  docker compose -f docker-compose.test.yml down -v
  ```

## Convenciones

- **Nomenclatura y módulos**:
  - Backend: Módulos CommonJS (`require` / `module.exports`). Funciones y variables en `camelCase`, constantes en `UPPER_SNAKE_CASE`, tablas y columnas SQL en `snake_case`.
  - Frontend: Módulos ESM (`import` / `export`). Componentes React en `PascalCase.jsx`, hooks y utilitarios en `camelCase.js`.
  - Archivos: Estilo `kebab-case` para endpoints/utilidades y `PascalCase` para componentes React.
- **Idioma**:
  - Código, nombres de variables, funciones y rutas en inglés o términos de dominio chileno consolidados (`rut`, `medico_id`, `agendaId`, `createReservation`).
  - Mensajes de error al usuario, textos en pantalla (UI) y comentarios de código estrictamente en **español**.
- **Commits**:
  - Seguir el formato Conventional Commits observado en el repositorio (ej. `feat(reservas): validar disponibilidad` o `fix(ui): corregir estado del panel`).
- **Patrones y archivos de referencia**:
  - **Manejo transaccional y prevención de overbooking**: Uso de transacciones `SERIALIZABLE` con límite de espera de bloqueo (`SET LOCAL lock_timeout = '1500ms'`), reintentos exponenciales ante fallos de serialización (`40001`) y bloqueo jerárquico estricto (`SELECT ... FOR UPDATE` primero del médico y luego del bloque de agenda). Archivo de referencia: `backend/src/services/reservas.js`.
  - **Respuestas de error uniformes**: Retornar errores estructurados mediante `HttpError` y `sendError` con formato `{ ok: false, code, codigo_error, error, mensaje, fields? }`. Archivo de referencia: `backend/src/middleware/errors.js`.
  - **Consumo de API en cliente**: Manejo de peticiones asíncronas, estado local e idempotencia en hooks React. Archivo de referencia: `frontend/src/features/paciente/usePatientPortal.js`.

## Reglas de dominio / trampas conocidas

- **Contexto académico y datos ficticios**: El proyecto no está conectado a una clínica real. No incluir datos de pacientes reales, credenciales reales ni RUTs auténticos en código, pruebas o commits.
- **Orden de bloqueo en BD (Deadlocks)**: En cualquier operación que involucre reservas, bloqueos o reconfiguración de horarios, se debe adquirir el lock del médico (`medicos`) antes del bloque (`agendas`). Invertir este orden genera deadlocks bajo concurrencia.
- **Manejo de RUT chileno**: El RUT se recibe en formato libre (con/sin puntos, con/sin guion, `k` o `K`), pero en la base de datos se almacena normalizado a `XX.XXX.XXX-X` con `K` mayúscula. La unicidad en base de datos se comprueba sobre el valor alfanumérico limpio (`uq_medicos_rut_normalizado`). Todo cambio debe superar `shared/rut-cases.json`.
- **Idempotencia en reservas**: `POST /api/reservas` debe procesar la cabecera `Idempotency-Key` (hasta 100 caracteres). Si la clave coincide con el mismo payload hash, devuelve el comprobante previo sin duplicar la reserva; si la clave se repite con un payload diferente, responde `409 IDEMPOTENCY_CONFLICT`.
- **Zona horaria**: El sistema opera bajo `America/Santiago`. Toda consulta o cálculo de bloques futuros (`NOW()`) y expiración de tokens debe forzar la zona horaria de Santiago para evitar desfases de horario de invierno/verano.
- **Notificaciones asíncronas**: El estado `ACEPTADO` en la tabla `notificaciones` significa aceptación por el proveedor (SendGrid, Twilio o SMTP), no entrega confirmada al destinatario. Los workers utilizan `claim_token` y `lease_until` para asegurar toma exclusiva y reintentar fallos sin duplicación. No presentar una notificación encolada o aceptada como si su entrega estuviera confirmada.

## Forma de trabajar

- **Planificación**: Presenta un plan conciso antes de escribir código si la tarea requiere modificar tablas/migraciones de base de datos, altera endpoints existentes en `API_CONTRACT.md` o toca la lógica de concurrencia de reservas.
- **Memoria y seguimiento**: Consultar y actualizar `memory.md` para coordinar el estado temporal de los sprints y las decisiones técnicas vigentes.
- **Tamaño de los cambios**: Realiza cambios pequeños, atómicos y progresivos, verificando que cada paso compile y no introduzca regresiones.
- **Cierre y explicación**: Al finalizar, detalla los archivos modificados, los comandos ejecutados para validar la solución y el estado de las pruebas.

## Límites

- ✅ Siempre: Ejecutar linters y pruebas unitarias (`npm run check`) tras modificar código; respetar las convenciones de formato Prettier y validar que la respuesta HTTP cumpla `API_CONTRACT.md`.
- ⚠️ Pregunta antes: Agregar dependencias npm a cualquier `package.json`, alterar esquemas en `database/01_init.sql`, crear nuevas migraciones SQL (que deben llevar prefijo de fecha en `database/migrations/`) o modificar `docker-compose.yml`.
- 🚫 Nunca: Exponer credenciales reales o secretos en `.env` (usar únicamente valores para entorno local/demo), eliminar migraciones previas de base de datos, o ejecutar pruebas destructivas de aceptación (`test:sprint1` / `test:sprint3`) contra una base de datos que no termine en `_test`.

## Verificación

- Comprobar que no existan errores de linting, discrepancias de formato, fallas en pruebas unitarias o errores de sintaxis/build ejecutando:
  ```bash
  npm run check
  ```
- Si se modificó lógica de RUT, asegurar que tanto backend como frontend pasen las pruebas de contrato:
  ```bash
  node --test backend/tests/rut-contract.test.js
  node --test frontend/tests/rut-contract.test.js
  ```
- Si se modificaron endpoints, transacciones o esquemas de base de datos, validar concurrencia y aceptación en contenedores aislados:
  ```bash
  docker compose -f docker-compose.test.yml down -v
  docker compose -f docker-compose.test.yml up -d --build
  docker compose -f docker-compose.test.yml exec -T backend-test npm run test:sprint1
  docker compose -f docker-compose.test.yml exec -T backend-test npm run test:sprint3
  docker compose -f docker-compose.test.yml down -v
  ```
