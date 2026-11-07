# ADR-0001: Gestión transaccional de citas por secretaría

- **Estado:** Aceptado
- **Fecha:** 2026-11-07

## Contexto

Cancelar o reprogramar una cita cambia la cita, uno o dos bloques de agenda, sus recordatorios y los avisos pendientes. Si esos cambios se guardan por separado, un fallo puede dejar el horario disponible con una cita activa, o mantener bloqueado un cupo que debería liberarse. Las operaciones concurrentes también deben conservar el orden de bloqueo usado por reservas y agendas.

## Decisión

- Ejecutar cada cancelación o reprogramación en una sola transacción PostgreSQL.
- Bloquear primero todos los médicos involucrados, en orden ascendente de ID; después bloquear la cita y los bloques de agenda necesarios.
- Al mover una cita, validar y reservar el nuevo bloque antes de liberar el anterior. Al cancelar o liberar el bloque anterior, conservar el estado `BLOQUEADO` si sigue vigente un bloqueo de jornada.
- Actualizar la cita, invalidar enlaces y avisos obsoletos, recalcular recordatorios y encolar el aviso al paciente dentro de la misma transacción.
- Informar `correo_aviso.estado: "PENDIENTE"` mientras el aviso está en cola. La aceptación del proveedor y la entrega al destinatario son estados distintos.

## Consecuencias

- Un error en cualquier actualización revierte el cambio completo de cita, agenda y notificaciones.
- El bloqueo por médico serializa modificaciones de su agenda; ordenar los bloqueos evita invertir el orden al mover una cita entre profesionales.
- Las pruebas de aceptación deben comprobar tanto la integridad de los cupos como el estado pendiente del aviso, usando únicamente la base PostgreSQL descartable.
- El despacho sigue siendo asíncrono. Esta decisión no garantiza entrega de correo.

## Referencias

- `backend/src/services/gestionar-reserva.js`
- `backend/tests/verify-gestion-reservas.js`
- `API_CONTRACT.md`, sección «Gestión de citas por secretaría»
