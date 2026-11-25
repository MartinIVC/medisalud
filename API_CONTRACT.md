# Contrato HTTP y datos de prueba

## Respuestas

Las respuestas exitosas mantienen el estado HTTP de la operación y un cuerpo con `ok: true`, además de los datos propios del recurso.

Los errores usan el estado HTTP como autoridad y un cuerpo compatible con los consumidores actuales:

```json
{
  "ok": false,
  "code": "VALIDATION_ERROR",
  "codigo_error": "VALIDATION_ERROR",
  "error": "Revisa los datos enviados.",
  "mensaje": "Revisa los datos enviados.",
  "fields": {
    "paciente_rut": "El RUT ingresado no es válido."
  }
}
```

`code` es el identificador estable para lógica nueva. `codigo_error`, `mensaje` y `error` se conservan por compatibilidad; `fields` aparece cuando hay errores por campo. Una respuesta `5xx` no confirma que la operación haya fallado antes de persistirse: los clientes de reserva deben conservar la clave de idempotencia para reintentar.

## RUT chileno

Backend y frontend validan el mismo formato: 7 u 8 dígitos de cuerpo, sin separadores o con puntos agrupados, un guion opcional y un dígito verificador `0–9` o `K`. Se quitan espacios al inicio y al final; texto mezclado, agrupaciones mal formadas y dígitos verificadores incorrectos se rechazan. El valor persistido se normaliza al formato `12.345.678-5` con `K` mayúscula.

Los casos de aceptación compartidos están en [shared/rut-cases.json](shared/rut-cases.json) y los prueban ambos runtimes. Los RUT de `database/02_seed.sql` son datos ficticios válidos para el demo.

## Acceso individual de secretaría (MED-25 y MED-26)

`POST /api/auth/secretaria` recibe `{ "username": "secretaria.demo", "password": "..." }`. Si la cuenta está activa y las credenciales son correctas, devuelve `200` con `ok`, `token` opaco, `expires_in` (28800 segundos) y `secretaria` con `id` y `usuario`. El token se envía como `Authorization: Bearer <token>` a las rutas administrativas. La respuesta lleva `Cache-Control: no-store`.

Credenciales incorrectas, una cuenta inexistente o inactiva y el límite temporal de intentos producen el mismo `401 UNAUTHORIZED` genérico. Se permiten cinco intentos por cuenta en ventanas de 15 minutos; no existe un límite por dirección de origen. Para evitar saturación, cada proceso admite hasta cuatro intentos de acceso simultáneos y responde `503 SERVICE_UNAVAILABLE` mientras ese límite está ocupado. Cada petición protegida comprueba la sesión y el estado de la cuenta en la base.

`POST /api/auth/secretaria/logout` requiere la sesión vigente, la revoca y devuelve `{ "ok": true }`. Una sesión ausente, vencida, revocada o de una cuenta inactiva devuelve `401 UNAUTHORIZED`. Restablecer una contraseña o cambiar el estado de la cuenta revoca sus sesiones. La contraseña compartida y los tokens anteriores ya no permiten entrar; no se habilita autorregistro público.

## Reserva e idempotencia

`POST /api/reservas` acepta `Idempotency-Key` (hasta 100 caracteres). El cliente reutiliza la misma clave únicamente mientras repite el mismo payload tras un resultado incierto. La misma clave y payload devuelve el comprobante persistido; usar la clave con otro payload devuelve `409 IDEMPOTENCY_CONFLICT`.

Para `origen: "WEB"` (por defecto), el payload exige `autorizacion_reserva` emitida por `POST /api/reservas/verificacion-correo/verificar` para exactamente el mismo par `(paciente_rut, paciente_email)` normalizado. Si falta, venció, ya fue usada o no coincide con el par, responde `403 EMAIL_VERIFICATION_REQUIRED`. La clave de idempotencia se vincula a la autorización: un reintento legítimo con la misma clave y autorización devuelve el comprobante previo aunque la autorización ya haya sido consumida; la clave sola sin autorización nunca devuelve el comprobante. Al confirmar una reserva `WEB`, el servidor crea o actualiza el vínculo en `vinculos_consulta_paciente`, asocia `citas_medicas.vinculo_consulta_id` y consume la autorización en la misma transacción; si ocurre un rollback (p. ej. `409 SLOT_TAKEN`), la autorización permanece vigente hasta su caducidad. Las reservas `PRESENCIAL` y `TELEFONO` exigen sesión de secretaría y quedan con `vinculo_consulta_id = NULL` (pendientes de vinculación para el portal).

Las reservas se ejecutan en PostgreSQL con aislamiento `SERIALIZABLE`, bloqueo pesimista y un límite de 1,5 s por espera de bloqueo. Los abortos de serialización se reintentan hasta cinco veces en total; si el conflicto persiste o vence la espera de bloqueo, la API devuelve `409 CONCURRENT_RESERVATION`.

## Verificación de correo, consulta de citas y recuperación asistida (MED-29)

El antiguo endpoint `GET /api/reservas/mis-citas?rut=...` fue eliminado; no existe consulta pública solo por RUT. Todas las operaciones siguientes responden con `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`, mantienen RUT, correo y secretos fuera de las URL y los logs, y aplican normalización compartida de RUT (`XX.XXX.XXX-X`, `K` mayúscula) y correo (minúsculas, conservando puntos y alias `+`).

### Verificación de correo previa a reserva web
- `POST /api/reservas/verificacion-correo/solicitudes`: recibe `{ "rut", "correo" }` (admite pares nuevos). Valida RUT (`400 INVALID_RUT` / `codigo_error: "RUT_INVALIDO"`) y correo (`400 VALIDATION_ERROR`). Encola el envío de un código de 6 dígitos (vigencia 10 min, almacenado solo como HMAC-SHA256 con contexto) y responde `202` con `{ "ok": true, "jira": "MED-29", "solicitud_id", "rut", "correo", "expira_en", "reenvio_disponible_en", "mensaje" }`. Reenvíos dentro de la espera de 60 s o por encima de cuotas responden `429 RATE_LIMITED` sin invalidar el código vigente.
- `POST /api/reservas/verificacion-correo/verificar`: recibe `{ "solicitud_id", "codigo" }`. Consume el código atómicamente y responde `200` con `{ "ok": true, "jira": "MED-29", "autorizacion_reserva", "expira_en", "rut", "correo" }` (autorización opaca de un solo uso válida por 10 minutos).

### Consulta de citas por RUT y correo verificado
- `POST /api/reservas/mis-citas/solicitudes`: recibe `{ "rut", "correo" }`. Valida formato de RUT (`400 INVALID_RUT` / `RUT_INVALIDO`) y correo (`400 VALIDATION_ERROR`). Para cualquier entrada válida responde siempre `202` con mensaje genérico indistinguible («Si los datos coinciden, recibirás un código para consultar tus citas.») e ID opaco del mismo formato, tanto para pares conocidos como desconocidos o suprimidos por cuota; solo programa el correo si existe un vínculo activo.
- `POST /api/reservas/mis-citas/verificar`: recibe `{ "solicitud_id", "codigo" }`. Valida y consume el código atómicamente, comprueba la versión vigente del vínculo y devuelve `200` con `{ "ok": true, "jira": "MED-29", "rut", "total": N, "citas": [...] }` filtrando estrictamente por `vinculo_consulta_id` (ordenado con próximas citas primero en `America/Santiago`). Un historial vacío tras verificar es válido (`total: 0, citas: []`).
- Errores de código: códigos incorrectos, vencidos, consumidos, revocados, de otro propósito o con intentos agotados (5 por solicitud / 10 por par en 15 min) devuelven el mismo error público `400 VERIFICATION_CODE_INVALID`.

### Recuperación asistida por secretaría
- `POST /api/secretaria/recuperacion-citas/buscar`: exige sesión vigente de secretaría (`Authorization: Bearer <token>`). Recibe `{ "rut" }` y devuelve las citas del paciente (con estado de vinculación actual) y las solicitudes de recuperación vigentes.
- `POST /api/secretaria/recuperacion-citas/solicitudes`: exige sesión de secretaría. Recibe `{ "rut", "correo_destino", "citas_ids", "motivo" }`. Fija las citas concretas y el destino, encola el código de recuperación al nuevo correo, registra auditoría `CITA_RECUPERACION_INICIAR` (sin RUT, correo ni código) y responde `202`.
- `POST /api/secretaria/recuperacion-citas/solicitudes/:id/revocar`: exige sesión de secretaría. Revoca una solicitud pendiente y registra auditoría `CITA_RECUPERACION_REVOCAR`.
- `POST /api/reservas/mis-citas/recuperacion/confirmar`: operación pública que recibe únicamente `{ "solicitud_id", "codigo" }`. En una transacción revalida RUT y citas fijadas, crea o actualiza el vínculo destino, actualiza `vinculo_consulta_id` solo en esas citas (preservando `paciente_email` original), incrementa la versión e invalida solicitudes de consulta pendientes de los vínculos afectados y registra auditoría `CITA_RECUPERACION_COMPLETAR`.

## Configuración y bloqueo de agendas (MED-10)

`GET /api/agendas` requiere una sesión de secretaría vigente (`Authorization: Bearer <token>`). Retorna la lista de bloques de un médico y fecha (`DISPONIBLE`, `RESERVADO`, `BLOQUEADO`). Para bloques en estado `RESERVADO`, incluye los datos de la cita médica confirmada (`cita_id`, `codigo_reserva`, `paciente_rut`, `paciente_nombre`, `paciente_email`, `paciente_telefono`) y el estado de confirmación de asistencia del paciente (`asistencia_estado`: `"PENDIENTE"` o `"ASISTIRA"`).

`POST /api/agendas/configurar`, `POST /api/agendas/bloquear` y `POST /api/agendas/desbloquear` requieren una sesión de secretaría vigente y evalúan la vigencia temporal en `America/Santiago`:

- `POST /api/agendas/configurar` exige que `((fecha + hora_inicio) AT TIME ZONE 'America/Santiago') > NOW()`; si la fecha u hora de inicio ya transcurrió, responde `409 AGENDA_PAST`.
- `POST /api/agendas/bloquear` y `POST /api/agendas/desbloquear` sobre un `agenda_id` exigen que la hora de inicio del bloque sea futura (`> NOW()`); si ya pasó, responden `409 SLOT_PAST`.
- Cuando se bloquea o desbloquea una jornada por `fecha` (para un médico o como feriado global), las fechas anteriores al día actual en `America/Santiago` responden `409 AGENDA_DATE_PAST`. Si la fecha corresponde al día actual, la actualización sobre `agendas` modifica únicamente los bloques futuros (`> NOW()`), preservando el estado histórico de los bloques cuya hora ya pasó.

## Gestión de citas por secretaría

`POST /api/reservas/:id/gestionar` requiere una sesión de secretaría vigente. Recibe un objeto JSON con `accion` (`CANCELAR` o `MOVER`) y `motivo` obligatorio de hasta 255 caracteres. `MOVER` requiere además `agenda_id` de un bloque distinto y disponible; `CANCELAR` no acepta `agenda_id`.

Solo se pueden gestionar citas activas cuya hora de inicio aún no haya pasado. Cancelar libera el cupo anterior, salvo que un bloqueo de agenda deba conservarlo como bloqueado. Mover reserva el cupo nuevo, libera el anterior y actualiza los recordatorios en una transacción. Un cupo ocupado, bloqueado, vencido o de un médico inactivo produce un conflicto `409` sin modificar la cita.

La respuesta exitosa incluye `estado`, `codigo_reserva`, `mensaje` y `correo_aviso`. `correo_aviso.estado: "PENDIENTE"` significa que el aviso quedó en cola; `proveedor_configurado` indica si hay SMTP o SendGrid configurado, pero no acredita envío ni entrega. La cancelación encola un aviso por correo y omite confirmaciones y recordatorios obsoletos. La reprogramación encola un aviso por correo con el horario anterior y el nuevo, y sustituye el enlace de respuesta del paciente.

## Gestión y edición de profesionales (MED-19)

`POST /api/medicos` exige sesión de secretaría (`Authorization: Bearer <token>`) y registra un nuevo profesional médico. Recibe `{ rut, nombre, email, especialidad_id, box_atencion }`. Valida formato y dígito verificador del RUT (Módulo 11), longitud de campos, formato de correo y existencia de la especialidad. Responde `201 CREATED` con `{ "ok": true, "medico": { "id": 1, ... } }`. Si el RUT ya existe, responde `409 DUPLICATE_RUT`.

`PUT /api/medicos/:id` exige sesión de secretaría y permite actualizar los datos de un profesional existente (`rut`, `nombre`, `email`, `especialidad_id`, `box_atencion`). Aplica las mismas validaciones de formato, Módulo 11 y existencia de especialidad. Si el RUT ingresado ya pertenece a otro profesional, responde `409 DUPLICATE_RUT`. Si el profesional no existe, responde `404 DOCTOR_NOT_FOUND`. Responde `200 OK` con `{ "ok": true, "medico": { ... } }`.

## Foto de profesionales (MED-23)

`GET /api/medicos` y `GET /api/disponibilidad` incluyen `foto_url` para cada profesional o bloque. El valor es `null` cuando no hay foto. La URL apunta a `GET /api/medicos/:id/foto`, que devuelve la imagen PNG/JPEG del profesional activo con `Content-Type` y `X-Content-Type-Options: nosniff`; si no existe, responde `404 PHOTO_NOT_FOUND`. El portal muestra una imagen genérica si `foto_url` es nulo o la imagen no carga. La foto no bloquea la reserva.

`PUT /api/medicos/:id/foto` requiere `Authorization: Bearer <token>` de secretaría. Recibe el archivo binario como cuerpo, con `Content-Type: image/png` o `image/jpeg`, hasta 2 MiB. El servidor comprueba los bytes del formato y que coincidan con el tipo declarado. Responde `{ "ok": true, "foto_url": "..." }`; una imagen inválida devuelve `400 INVALID_PHOTO`, una demasiado grande `413 PHOTO_TOO_LARGE`, y un profesional inexistente o inactivo `404 DOCTOR_NOT_FOUND`. Un visitante o paciente sin token de secretaría recibe `401 UNAUTHORIZED`. No hay endpoint público de escritura.

La imagen se guarda en `medicos.foto_datos` (`BYTEA`) junto con su tipo y fecha de actualización. Cada reemplazo sobrescribe el valor anterior en PostgreSQL, por lo que no quedan archivos en el sistema. La base persiste en el volumen `medisalud_pgdata` de Compose. Se permite volver a cargar una foto si la vista previa falla.

## Desvinculación de profesionales (MED-24)

`GET /api/secretaria/medicos` exige sesión de secretaría y devuelve `{ "ok": true, "medicos": [...] }` con profesionales activos e inactivos, `especialidad_id`, especialidad, RUT, `citas_futuras` (confirmadas y con inicio posterior al instante actual en Santiago), `proxima_cita_fecha` (fecha de la primera cita futura o `null`), `foto_url` y, cuando existe, `motivo`, `desvinculado_en` y `responsable` (usuario de la cuenta). Lleva `Cache-Control: no-store`. Un profesional inactivo anterior a esta funcionalidad puede carecer de registro de desvinculación. Para los activos, `foto_url` utiliza la ruta pública de fotos; para los inactivos, apunta a `GET /api/secretaria/medicos/:id/foto`, que exige sesión vigente y devuelve la imagen con `Cache-Control: private, no-store`. Sin foto, `foto_url` es `null` y la interfaz usa una imagen genérica.

`POST /api/secretaria/medicos/:id/desvincular` exige sesión vigente y recibe únicamente `{ "motivo": "..." }`, con texto no vacío de hasta 255 caracteres. Devuelve `200` con `{ "ok": true, "desvinculacion": { "medico_id": 1, "motivo": "...", "desvinculado_en": "..." } }`. Registra la cuenta responsable y marca al profesional inactivo en la misma transacción, sin borrar agendas ni citas. La desvinculación no cancela citas. La consulta pública excluye a los inactivos y las operaciones de configuración y reserva los rechazan.

El servidor devuelve `400 VALIDATION_ERROR` para ID o motivo inválidos, `401 UNAUTHORIZED` sin sesión, `404 DOCTOR_NOT_FOUND` para un ID inexistente, `409 DOCTOR_INACTIVE` si ya estaba inactivo y `409 DOCTOR_BUSY` si vence la espera del bloqueo. Si hay citas futuras confirmadas, responde `409 DOCTOR_HAS_FUTURE_APPOINTMENTS` con la cantidad numérica en `fields.citas_futuras` y la primera fecha en `fields.proxima_cita_fecha`; la operación no cambia datos. El conteo se verifica nuevamente dentro de la transacción, por lo que puede diferir de la lista consultada antes. Se conserva el registro de la última desvinculación mientras el profesional está activo; una desvinculación posterior actualiza ese registro.

`POST /api/secretaria/medicos/:id/revincular` exige sesión vigente y no recibe cuerpo. Marca como activo al profesional inactivo y devuelve `200` con `{ "ok": true, "revinculacion": { "medico_id": 1, "activo": true } }`. No altera sus agendas, citas ni el último registro de desvinculación; el profesional vuelve al catálogo público y sus horarios disponibles se pueden reservar. El servidor devuelve `400 VALIDATION_ERROR` para un ID inválido, `401 UNAUTHORIZED` sin sesión, `404 DOCTOR_NOT_FOUND` para un ID inexistente, `409 DOCTOR_ALREADY_ACTIVE` si ya estaba activo y `409 DOCTOR_BUSY` si vence la espera del bloqueo. La actualización bloquea primero al profesional y se serializa con reservas y cambios de agenda.

## Bitácora de auditoría de secretaría (MED-27)

`GET /api/secretaria/auditoria` exige sesión vigente de secretaría (`Authorization: Bearer <token>`) y responde con `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`. Devuelve `200` con `{ "ok": true, "jira": "MED-27", "total": N, "limit": L, "offset": O, "secretarias": [...], "registros": [...] }`.

Parámetros de consulta opcionales:
- `secretaria_id`: ID numérico de una cuenta de secretaría, o `'desconocido'` para consultar acciones de origen anterior o no atribuibles individualmente.
- `fecha_desde` / `fecha_hasta`: fechas en formato `AAAA-MM-DD`, evaluadas bajo la zona horaria `America/Santiago`.
- `accion`: código de acción exacto (`MEDICO_CREAR`, `MEDICO_ACTUALIZAR`, `MEDICO_FOTO_ACTUALIZAR`, `MEDICO_DESVINCULAR`, `MEDICO_REVINCULAR`, `AGENDA_CONFIGURAR`, `AGENDA_BLOQUEAR`, `AGENDA_DESBLOQUEAR`, `CITA_RESERVAR_MANUAL`, `CITA_CANCELAR`, `CITA_REPROGRAMAR`, `CITA_RECUPERACION_INICIAR`, `CITA_RECUPERACION_REVOCAR`, `CITA_RECUPERACION_COMPLETAR`).
- `entidad_tipo`: `'MEDICO'`, `'AGENDA'` o `'CITA'`.
- `limit`: cantidad máxima de registros (1 a 100, valor por defecto: 50).
- `offset`: desplazamiento inicial para paginación (entero `>= 0`, valor por defecto: 0).

Cada elemento de `registros` incluye `id`, `creado_en`, `fecha_santiago`, `hora_santiago`, `origen_identidad` (`'SESION_INDIVIDUAL'` o `'ANTERIOR_O_DESCONOCIDO'`), `secretaria` (`{ "id": ..., "usuario": "..." }` o `null`), `responsable`, `accion`, `entidad_tipo`, `entidad_id` y `detalles` (objeto JSON con valores anteriores y nuevos relevantes, sin contraseñas, tokens ni PII sensible innecesario).

Errores estructurados:
- `401 UNAUTHORIZED`: Si la petición no incluye cabecera `Authorization` con sesión válida.
- `400 VALIDATION_ERROR`: Si los parámetros de filtro son inválidos (formato de fecha no canónico, `fecha_desde > fecha_hasta`, IDs o acciones fuera de catálogo), detallando el motivo en `fields`.

Todas las operaciones administrativas de escritura registran su asiento de auditoría en la misma transacción (`withTransaction`). Si la operación falla, se interrumpe o hace rollback, el registro de auditoría también se revierte. Reintentos con la misma `Idempotency-Key` devuelven el comprobante original sin duplicar el registro de auditoría. Los registros confirmados son inmutables a nivel de base de datos.

## Notificaciones

`ACEPTADO` significa que el proveedor aceptó la solicitud, no que el destinatario la recibió. Los errores del proveedor pueden reintentarse; una caída después de la aceptación puede producir duplicados si el proveedor no ofrece deduplicación. Las pruebas no envían mensajes a proveedores reales.

## Actualización de la base

Las instalaciones nuevas reciben el esquema actual desde `database/01_init.sql`. En instalaciones existentes, aplica las migraciones una vez y en este orden después de respaldar y revisar la base:

1. `20261028_sprint2.sql`
2. `20261028_medicos_rut_normalizado.sql`
3. `20261028_notifications_leases.sql`
4. `20261028_idempotency_response.sql`
5. `20261030_gestion_reservas.sql`
6. `20261103_medicos_foto.sql`
7. `20261107_cuentas_secretaria.sql`
8. `20261107_desvinculaciones_medico.sql`
9. `20261108_auditoria_acciones_secretaria.sql`
10. `20261125_verificacion_correo_mis_citas.sql`

La migración Sprint 2 no se puede repetir y requiere resolver solapamientos de agenda antes de ejecutarla.
