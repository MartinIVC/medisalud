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

## Reserva e idempotencia

`POST /api/reservas` acepta `Idempotency-Key` (hasta 100 caracteres). El cliente reutiliza la misma clave únicamente mientras repite el mismo payload tras un resultado incierto. La misma clave y payload devuelve el comprobante persistido; usar la clave con otro payload devuelve `409 IDEMPOTENCY_CONFLICT`.

Las reservas se ejecutan en PostgreSQL con aislamiento `SERIALIZABLE`, bloqueo pesimista y un límite de 1,5 s por espera de bloqueo. Los abortos de serialización se reintentan hasta cinco veces en total; si el conflicto persiste o vence la espera de bloqueo, la API devuelve `409 CONCURRENT_RESERVATION`.

## Gestión de citas por secretaría

`POST /api/reservas/:id/gestionar` requiere una sesión de secretaría vigente. Recibe un objeto JSON con `accion` (`CANCELAR` o `MOVER`) y `motivo` obligatorio de hasta 255 caracteres. `MOVER` requiere además `agenda_id` de un bloque distinto y disponible; `CANCELAR` no acepta `agenda_id`.

Solo se pueden gestionar citas activas cuya hora de inicio aún no haya pasado. Cancelar libera el cupo anterior, salvo que un bloqueo de agenda deba conservarlo como bloqueado. Mover reserva el cupo nuevo, libera el anterior y actualiza los recordatorios en una transacción. Un cupo ocupado, bloqueado, vencido o de un médico inactivo produce un conflicto `409` sin modificar la cita.

La respuesta exitosa incluye `estado`, `codigo_reserva`, `mensaje` y `correo_aviso`. `correo_aviso.estado: "PENDIENTE"` significa que el aviso quedó en cola; `proveedor_configurado` indica si hay SMTP o SendGrid configurado, pero no acredita envío ni entrega. La cancelación encola un aviso por correo y omite confirmaciones y recordatorios obsoletos. La reprogramación encola un aviso por correo con el horario anterior y el nuevo, y sustituye el enlace de respuesta del paciente.

## Foto de profesionales (MED-23)

`GET /api/medicos` y `GET /api/disponibilidad` incluyen `foto_url` para cada profesional o bloque. El valor es `null` cuando no hay foto. La URL apunta a `GET /api/medicos/:id/foto`, que devuelve la imagen PNG/JPEG del profesional activo con `Content-Type` y `X-Content-Type-Options: nosniff`; si no existe, responde `404 PHOTO_NOT_FOUND`. El portal muestra una imagen genérica si `foto_url` es nulo o la imagen no carga. La foto no bloquea la reserva.

`PUT /api/medicos/:id/foto` requiere `Authorization: Bearer <token>` de secretaría. Recibe el archivo binario como cuerpo, con `Content-Type: image/png` o `image/jpeg`, hasta 2 MiB. El servidor comprueba los bytes del formato y que coincidan con el tipo declarado. Responde `{ "ok": true, "foto_url": "..." }`; una imagen inválida devuelve `400 INVALID_PHOTO`, una demasiado grande `413 PHOTO_TOO_LARGE`, y un profesional inexistente o inactivo `404 DOCTOR_NOT_FOUND`. Un visitante o paciente sin token de secretaría recibe `401 UNAUTHORIZED`. No hay endpoint público de escritura.

La imagen se guarda en `medicos.foto_datos` (`BYTEA`) junto con su tipo y fecha de actualización. Cada reemplazo sobrescribe el valor anterior en PostgreSQL, por lo que no quedan archivos en el sistema. La base persiste en el volumen `medisalud_pgdata` de Compose. Se permite volver a cargar una foto si la vista previa falla.

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

La migración Sprint 2 no se puede repetir y requiere resolver solapamientos de agenda antes de ejecutarla.
