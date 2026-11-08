# ADR-0004: Bitácora de auditoría persistente de acciones de secretaría

- **Estado:** Propuesto
- **Fecha:** 2026-11-08
- **Historias:** MED-27

## Contexto

Con la incorporación de cuentas individuales de secretaría (MED-25 y MED-26, ADR-0002), la gestión transaccional de citas (MED-20, ADR-0001) y el ciclo de vida de profesionales con fotos y desvinculación protegida (MED-19, MED-23, MED-24, ADR-0003), cada operación administrativa se ejecuta bajo una sesión autenticada en el servidor.

Sin embargo, el sistema aún no cuenta con una bitácora unificada, inmutable y transaccional que permita consultar qué secretaria ejecutó cada cambio sobre médicos, agendas y citas, en qué instante ocurrió y cuáles fueron los valores anteriores y nuevos relevantes. Asimismo, existen operaciones históricas previas a la individualización de cuentas que no deben atribuirse falsamente a una persona sin evidencia.

## Decisión

1. **Tabla de auditoría append-only con invariantes en PostgreSQL**:
   - Crear la tabla `auditoria_acciones_secretaria` con las columnas:
     - `id BIGSERIAL PRIMARY KEY`
     - `secretaria_id BIGINT NULL REFERENCES secretarias(id) ON DELETE RESTRICT`
     - `origen_identidad VARCHAR(24) NOT NULL DEFAULT 'SESION_INDIVIDUAL'`
     - `accion VARCHAR(40) NOT NULL`
     - `entidad_tipo VARCHAR(20) NOT NULL`
     - `entidad_id VARCHAR(64) NOT NULL`
     - `detalles JSONB NOT NULL DEFAULT '{}'::jsonb`
     - `creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
   - Imponer restricciones `CHECK` en base de datos para:
     - Catálogo cerrado de acciones (`MEDICO_CREAR`, `MEDICO_ACTUALIZAR`, `MEDICO_FOTO_ACTUALIZAR`, `MEDICO_DESVINCULAR`, `MEDICO_REVINCULAR`, `AGENDA_CONFIGURAR`, `AGENDA_BLOQUEAR`, `AGENDA_DESBLOQUEAR`, `CITA_RESERVAR_MANUAL`, `CITA_CANCELAR`, `CITA_REPROGRAMAR`) y tipos de entidad (`MEDICO`, `AGENDA`, `CITA`).
     - Consistencia de atribución (`ck_auditoria_identidad`): `origen_identidad = 'SESION_INDIVIDUAL'` exige `secretaria_id IS NOT NULL`, mientras que `origen_identidad = 'ANTERIOR_O_DESCONOCIDO'` exige `secretaria_id IS NULL`.
     - Estructura y cota de tamaño del documento `detalles` (`jsonb_typeof(detalles) = 'object'` y `octet_length(detalles::text) <= 8192`).
   - Proteger la inmutabilidad del registro mediante un trigger `BEFORE UPDATE` que rechaza modificaciones sobre filas ya insertadas.

2. **Identidad exclusiva desde la sesión validada por el servidor**:
   - El identificador `secretaria_id` se toma únicamente de `req.secretary.id`, resuelto por el middleware `requireSecretary` a partir del hash SHA-256 del token Bearer activo.
   - Se rechaza o ignora cualquier intento del cliente de enviar identificadores de cuenta o usuario en el cuerpo, cabeceras o parámetros de las rutas de escritura.

3. **Atomicidad transaccional, orden de bloqueo e idempotencia**:
   - El asiento de auditoría se inserta usando el mismo cliente transaccional (`client`) de `withTransaction` que ejecuta la operación de dominio. Si la operación falla o revierte (`ROLLBACK`), no persiste ningún registro de auditoría.
   - Las operaciones sobre médicos que aún ejecutaban consultas sueltas (`POST /api/medicos`, `PUT /api/medicos/:id`, `PUT /api/medicos/:id/foto`) se encapsulan en `withTransaction` con `SET LOCAL lock_timeout = '1500ms'` y bloqueo jerárquico `SELECT ... FROM medicos WHERE id = $1 FOR UPDATE` antes de actualizar y auditar.
   - En reservas manuales (`PRESENCIAL` / `TELEFONO`) con `withSerializableRetry` e `Idempotency-Key`, el registro de auditoría se inserta solo tras superar la verificación de idempotencia; un reintento con la misma clave devuelve el comprobante previo sin duplicar el asiento de auditoría, y un aborto `40001` revierte el intento completo.

4. **Minimización de datos y defensa en profundidad (exclusión de secretos y PII innecesario)**:
   - En `MEDICO_ACTUALIZAR`, `detalles` almacena únicamente el diferencial mínimo (`anterior` y `nuevo` solo con los campos efectivamente modificados).
   - En `MEDICO_FOTO_ACTUALIZAR`, se registra únicamente metadato (`foto_mime`, `tamano_bytes`, `reemplazo`), excluyendo el binario `BYTEA`.
   - En operaciones sobre citas (`CITA_RESERVAR_MANUAL`, `CITA_CANCELAR`, `CITA_REPROGRAMAR`), se registran identificadores operativos (`codigo_reserva`, `agenda_id`, `medico_id`, `fecha`, `hora_inicio`, `hora_fin`, `origen`, `motivo`) y se excluyen datos personales innecesarios del paciente (`paciente_rut`, `paciente_nombre`, `paciente_email`, `paciente_telefono`) así como enlaces o tokens de confirmación (`response_url`, `cita_token`, `token_respuesta_hash`).
   - El servicio `registrarAuditoria` aplica además un validador recursivo que bloquea cualquier clave o valor con patrones de credenciales (`contrasena`, `password`, `token`, `hash`, `secret`, `Bearer `, `cita_token=`).

5. **Atribución histórica honesta**:
   - La migración traslada las desvinculaciones registradas en `desvinculaciones_medico` conservando su `secretaria_id` y fecha original, y registra las acciones previas sin cuenta individual identificable bajo `origen_identidad = 'ANTERIOR_O_DESCONOCIDO'` y `secretaria_id = NULL`.

6. **Consulta protegida, acotada y sin caché**:
   - Exponer `GET /api/secretaria/auditoria` protegido por `requireSecretary` con cabeceras `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`.
   - Soportar filtros validados estrictamente por `secretaria_id` (ID numérico o `'desconocido'`), `fecha_desde`, `fecha_hasta` (evaluadas en zona `America/Santiago`), `accion`, `entidad_tipo` y paginación acotada (`limit` 1..100, `offset` >= 0).

## Consecuencias

- Cada cambio administrativo exitoso queda asociado de forma atómica e inmutable a la cuenta de secretaría autenticada.
- Las operaciones fallidas, rechazadas por validación o revertidas por concurrencia no dejan falsos positivos en la bitácora.
- Se protege la privacidad de pacientes y credenciales del personal al impedir por diseño y por validación la filtración de secretos o PII innecesario en `detalles`.
- La actualización de `PUT /api/medicos/:id`, `POST /api/medicos` y `PUT /api/medicos/:id/foto` a transacciones explícitas unifica el uso de `req.app.locals.database || pool` y el orden de bloqueo en todo el backend.

## Referencias

- Ticket Jira: `MED-27` («Auditoría de acciones de secretaría»)
- `docs/adr/0001-gestion-atomica-citas-secretaria.md`
- `docs/adr/0002-cuentas-individuales-secretaria.md`
- `docs/adr/0003-desvinculacion-profesionales.md`
- `API_CONTRACT.md`
