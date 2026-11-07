# ADR-0003: Desvinculación de profesionales con historial

- **Estado:** Aceptado
- **Fecha:** 2026-11-07

## Contexto

MED-24 requiere dejar de ofrecer horas de un profesional, conservar sus agendas y citas y registrar quién decidió desvincularlo. No se pueden cancelar automáticamente las citas futuras, y una reserva o reprogramación concurrente no debe quedar confirmada después de la desvinculación.

## Decisión

- Conservar el profesional y marcarlo inactivo. No borrar ni modificar sus agendas o citas durante la desvinculación.
- Guardar fecha, motivo y cuenta de secretaría en `desvinculaciones_medico`, dentro de la misma transacción que cambia el estado. La clave foránea conserva la referencia a la cuenta responsable; no se inventan datos para médicos que ya estaban inactivos.
- Con aislamiento `READ COMMITTED`, bloquear primero la fila del médico y luego contar las citas confirmadas cuyo inicio es futuro en `America/Santiago`. Si hay alguna, rechazar la operación con su cantidad. Las reservas, cambios de cita y configuración de agenda adquieren el mismo bloqueo antes de modificar sus datos; al terminar la espera el conteo observa las operaciones confirmadas previamente.
- La lista pública sigue filtrando profesionales activos. Secretaría consulta una lista protegida que incluye inactivos y su registro; las citas deben gestionarse mediante el flujo existente antes de desvincular.

## Consecuencias

- La operación serializa las escrituras por profesional y puede devolver un conflicto si el bloqueo tarda más de 1,5 segundos. No se introduce cancelación silenciosa ni envío de avisos.
- Se requiere una migración posterior a la de cuentas de secretaría; las instalaciones nuevas incluyen la tabla. No se habilita reactivación en esta historia.
- El registro es específico de desvinculaciones y no reemplaza la bitácora general de MED-27.
