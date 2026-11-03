# AGENTS.md — Medisalud

## Contexto del proyecto

Medisalud es una aplicación académica de demostración para consultar disponibilidad y reservar citas médicas. Incluye un portal público para pacientes y un panel protegido para secretaría. La pila es React 18 con Vite, Node.js con Express y PostgreSQL 16.

Para el estado temporal del Sprint 3 y las decisiones de implementación vigentes, consulta [`memory.md`](memory.md). Jira y el repositorio son la fuente actual para estados y código; actualiza el snapshot cuando cambien.

El proyecto no está conectado a una clínica real. Usa datos ficticios y servicios externos de correo o WhatsApp solo cuando se configuran credenciales. No presentes una notificación encolada o aceptada por un proveedor como si su entrega estuviera confirmada.

## Organización del código

- `backend/src/routes/`: endpoints HTTP, validación de entrada y control de acceso.
- `backend/src/services/`: reglas de negocio y operaciones de reservas, agendas y notificaciones.
- `backend/src/db/`: transacciones y utilidades de base de datos.
- `backend/src/middleware/`: autenticación y tratamiento de errores.
- `frontend/src/features/`: pantallas y lógica agrupadas por paciente, secretaría y citas.
- `frontend/src/api/client.js`: comunicación del frontend con la API.
- `database/01_init.sql`: esquema para bases nuevas; `database/02_seed.sql`: datos ficticios iniciales.
- `database/migrations/`: cambios para bases existentes. `shared/`: contratos y datos compartidos entre runtimes.
- `API_CONTRACT.md`: contrato HTTP, errores, reservas, RUT y migraciones.

Mantén las responsabilidades en sus módulos actuales. Usa consultas SQL parametrizadas y la utilidad `withTransaction` para operaciones que deban actualizar de forma atómica citas, agendas o notificaciones. Conserva el formato de errores y las compatibilidades descritas en `API_CONTRACT.md`.

## Convenciones

- Mantén la interfaz, mensajes para usuarios y documentación en español, siguiendo el vocabulario y el tono existentes.
- Sigue el formato Prettier configurado en `.prettierrc.json` y las reglas de ESLint del repositorio.
- Valida entradas tanto en el límite de la API como en la interfaz cuando corresponda. Para RUT, reutiliza las reglas y casos compartidos en `shared/rut-cases.json`.
- Si cambias un endpoint, una respuesta, una validación o una regla de persistencia, actualiza `API_CONTRACT.md` y la documentación de usuario afectada.
- Si cambias el esquema, añade una migración nueva con prefijo de fecha en `database/migrations/`, actualiza el esquema inicial cuando corresponda y documenta el orden de aplicación en README y contrato API. Las migraciones existentes se consideran de ejecución única salvo que indiquen lo contrario.
- No introduzcas dependencias externas de correo, WhatsApp, almacenamiento de imágenes u otros servicios como requisito para ejecutar la demo local.
- No incluyas credenciales, secretos, datos reales de pacientes ni RUT reales en código, pruebas, documentación o commits. Usa `.env` local (ignorado por Git) y los datos ficticios existentes.

## Comandos habituales

Usa Node.js `22.13` (de acuerdo con `.nvmrc`; los paquetes admiten Node `>=22.13 <27`). Desde la raíz:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run check
```

`npm run check` ejecuta lint, formato, pruebas unitarias, revisión de sintaxis del backend y build del frontend. También puedes ejecutar partes concretas:

```bash
npm run lint
npm run format:check
npm test
npm --prefix backend run check
npm run build
```

Las pruebas de aceptación requieren PostgreSQL y API de prueba descartables. Sigue el flujo de `README.md` con `docker-compose.test.yml`; las variables `TEST_DATABASE_URL` y `TEST_API_URL` deben apuntar al entorno aislado, y el nombre de la base debe terminar en `_test`. No ejecutes suites que mutan datos contra una base de desarrollo compartida o una instancia real. `docker compose down -v` elimina el volumen: úsalo solo con el compose de pruebas cuando quieras borrar esa base descartable.

Antes de modificar o aplicar SQL en una base existente, revisa la migración y los pasos documentados. No apliques migraciones ni comandos destructivos a una instancia real como parte de una tarea local.

## Cambios y commits

Haz cambios acotados al objetivo solicitado y conserva modificaciones previas del usuario. Los mensajes de commit siguen el estilo Conventional Commits observado en el repositorio, por ejemplo: `feat(reservas): validar disponibilidad` o `fix(ui): corregir estado del panel`.
