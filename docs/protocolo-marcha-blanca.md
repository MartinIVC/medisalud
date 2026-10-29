# Protocolo de marcha blanca y UAT

**Versión:** 0.1, propuesta para revisión del PO  
**Duración propuesta:** cinco días hábiles; el PO puede ajustarla.  
**Inicio:** ____________________ · **Fin:** ____________________  
**Jefe de Recepción:** ____________________ · **Acompañamiento:** ____________________ · **Soporte:** ____________________

La publicación del código no completa RNF-04. El cierre depende de capacitar a todos los turnos, entregar el manual y aprobar la UAT con evidencia.

## Preparación de la capacitación

Antes de convocar:

- Confirmar con el PO la fecha, participantes, facilitador, ambiente y responsables de acompañamiento y soporte.
- Entregar la versión acordada del [manual rápido de secretaría](manual-secretaria.md) y reemplazar sus espacios de captura con imágenes de la versión candidata.
- Preparar médicos y agendas de práctica sin información real de pacientes.
- Verificar los flujos de agenda y reserva. Confirmar con el responsable técnico si email y WhatsApp están configurados; no prometer entrega de avisos sin comprobar al proveedor.
- Informar que la sesión dura 120 minutos lectivos por persona. Si se divide en grupos por turno, cada grupo recorre todos los ejercicios.

### Sesión práctica de 120 minutos

| Duración | Actividad |
| --- | --- |
| 10 min | Objetivo, acceso y navegación del panel |
| 20 min | Crear un médico y corregir errores o duplicados |
| 25 min | Configurar horarios y registrar bloqueos |
| 25 min | Registrar, consultar y cancelar reservas de recepción |
| 15 min | Confirmaciones, recordatorios e incidencias |
| 20 min | Ejercicios individuales de aceptación con lista de verificación |
| 5 min | Cierre, dudas y entrega de canales de apoyo |
| **120 min** | **Total por participante** |

Conservar fecha, turno, participantes, duración, facilitador y resultado de los ejercicios. La lista de asistencia no debe incluir información clínica.

## Ejecución por etapas

### Antes de iniciar

Registrar la versión candidata y comprobar que el manual fue entregado, todos los turnos fueron capacitados y los responsables están disponibles. Verificar que agenda y reservas funcionan. Documentar dependencias pendientes de email o WhatsApp antes de comprometer esos avisos.

| Versión candidata | Fecha de verificación | Responsable | Dependencias conocidas |
| --- | --- | --- | --- |
| ____________________ | ____________________ | ____________________ | ____________________ |

### Inicio controlado

El PO define la fecha y el turno inicial. Operar ese turno con acompañamiento y usar Medisalud como registro operativo desde la transición acordada. Las planillas anteriores quedan como consulta histórica; no mantener dos agendas activas.

### Ampliación

Incorporar los demás turnos cuando el turno inicial complete sus recorridos sin incidencias bloqueantes. Registrar qué turnos se incorporan y cuándo:

| Turno | Fecha de inicio | Acompañamiento | Observaciones |
| --- | --- | --- | --- |
| ____________________ | ____________________ | ____________________ | ____________________ |

### Seguimiento diario

Registrar cada incidente con impacto, responsable, resolución y escenario que se debe repetir. Comparar las agendas y reservas atendidas con los registros en Medisalud para detectar operaciones fuera del sistema.

| Fecha y turno | Incidencia / impacto | Responsable | Resolución y escenario repetido |
| --- | --- | --- | --- |
| ____________________ | ____________________ | ____________________ | ____________________ |

### Contingencia

Si una caída impide trabajar, usar solo el registro temporal acordado con el PO. Identificar cada operación pendiente y reconciliarla con los cupos reales antes de confirmar reservas. Al recuperar el servicio, ingresar y revisar las operaciones pendientes, documentar la conciliación y cerrar el registro temporal. No convertirlo en una planilla paralela permanente.

## Pruebas de aceptación de usuario

La práctica de capacitación prepara estos ejercicios; la aprobación final debe registrarse durante la marcha blanca. No usar datos reales de pacientes.

| ID | Ejercicio | Resultado esperado | Resultado real / evidencia | Participante / fecha | Aprobación PO |
| --- | --- | --- | --- | --- | --- |
| UAT-01 | Crear un médico válido y volver a intentar su RUT | Alta única y rechazo del duplicado | ____________________ | ____________________ | ____________________ |
| UAT-02 | Corregir un RUT inválido y un campo obligatorio | Corrección y guardado sin ayuda técnica | ____________________ | ____________________ | ____________________ |
| UAT-03 | Crear horarios para el nuevo médico y consultar disponibilidad | Los cupos aparecen solo después de configurar la agenda | ____________________ | ____________________ | ____________________ |
| UAT-04 | Bloquear una ausencia y consultar esa fecha | Los bloques afectados no se ofrecen para reserva | ____________________ | ____________________ | ____________________ |
| UAT-05 | Registrar una cita de recepción y consultar el mismo cupo desde el portal | Reserva registrada y cupo ocupado | ____________________ | ____________________ | ____________________ |
| UAT-06 | Cancelar una cita y volver a consultar | Estado y disponibilidad coherentes con bloqueos vigentes | ____________________ | ____________________ | ____________________ |
| UAT-07 | Resolver una sesión expirada y comunicar una incidencia | Se aplica el procedimiento del manual | ____________________ | ____________________ | ____________________ |

Para cada ejecución, conservar fecha, participante, resultado esperado y real, evidencia sin datos personales y aprobación del PO.

## Cierre

El PO y el Jefe de Recepción revisan la evidencia. Mantener visibles los escenarios pendientes y no declarar aprobado el UAT si falta alguno.

Condiciones de salida propuestas:

- Personal de todos los turnos capacitado y manual entregado.
- Todos los escenarios UAT aprobados.
- Ninguna incidencia bloqueante abierta.
- El 100 % de las agendas y reservas del período de observación acordado está registrado en Medisalud.
- Los registros temporales de contingencia están conciliados y las planillas locales fueron retiradas de la operación diaria.

El PO completa antes del inicio el período de observación: ____________________.  
Evidencia y aprobación del Jefe de Recepción: ____________________.  
Decisión del PO (aprobado / pendiente / rechazado): ____________________ · Fecha: ____________________.
