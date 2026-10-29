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

## Notificaciones

`ACEPTADO` significa que el proveedor aceptó la solicitud, no que el destinatario la recibió. Los errores del proveedor pueden reintentarse; una caída después de la aceptación puede producir duplicados si el proveedor no ofrece deduplicación. Las pruebas no envían mensajes a proveedores reales.

## Actualización de la base

Las instalaciones nuevas reciben el esquema actual desde `database/01_init.sql`. En instalaciones existentes, aplica las migraciones una vez y en este orden después de respaldar y revisar la base:

1. `20261028_sprint2.sql`
2. `20261028_medicos_rut_normalizado.sql`
3. `20261028_notifications_leases.sql`
4. `20261028_idempotency_response.sql`

La migración Sprint 2 no se puede repetir y requiere resolver solapamientos de agenda antes de ejecutarla.
