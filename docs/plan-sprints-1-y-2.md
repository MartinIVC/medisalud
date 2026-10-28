# Plan de mejora del Sprint 1 y ejecución del Sprint 2

Fecha: 28 de octubre de 2026.

Base: backlog «Jira Medisalud.md» y revisión estática del repositorio. Este documento propone trabajo; no acredita pruebas ejecutadas, despliegue cloud ni entregas reales de mensajes. Los estados y los 420 ms mencionados en el backlog no se consideran resultados verificados en esta revisión.

## 1. Alcance y diagnóstico

El backlog asigna al Sprint 1 RF-02/MED-11, RNF-02/MED-15 y RNF-01/MED-16. RF-01/MED-9 y RF-03/MED-10 no tienen sprint asignado allí, aunque el README y el código los incluyen en Sprint 1. Propuesta: formalizarlos como dependencias del núcleo ya implementadas y pendientes de validación, sin trasladarlas como funcionalidades nuevas al Sprint 2.

Sprint 2 conserva RF-04/MED-12, RF-05/MED-13 y RNF-03/MED-18. La capacitación y marcha blanca de RNF-04/MED-17 permanecen en Sprint 3.

| Área | Evidencia en el repositorio | Brecha |
| --- | --- | --- |
| Reserva web | `backend/src/routes/reservas.js`: validación de RUT, transacción y bloqueo de fila | No rechaza explícitamente citas pasadas o médicos inactivos; validación de contacto insuficiente |
| Concurrencia | `SELECT … FOR UPDATE` y unicidad por agenda | `BEGIN` no establece Serializable; unicidad de hora inicial no impide intervalos superpuestos |
| Confirmación por correo | `backend/src/utils/mailer.js`: SMTP opcional | Sin SMTP registra `DELIVERED` solo en memoria; la cita nace con `correo_enviado = TRUE`. Un fallo de envío posterior al COMMIT puede responder 500 aunque la cita exista |
| Secretaría | Panel y endpoints de agendas | No existe autenticación; los listados administrativos exponen datos de pacientes |
| Configuración de agenda | Generación de bloques de 15/20/30 minutos | Puede generar un primer bloque que exceda la jornada y crear solapamientos al cambiar duración. Feriados/licencias solo afectan bloques existentes |
| Staging | Docker Compose y scripts SQL iniciales | No hay evidencia en los archivos revisados de PostgreSQL cloud operativo; faltan migraciones para bases ya inicializadas |
| Interfaz | Portal paciente y panel de agendas en `App.jsx` | Refresca por acciones locales; no sincroniza otros navegadores. Muestra detalles técnicos del proyecto al paciente |
| Verificación | `backend/tests/verify-sprint1.js` prueba 40 reservas simultáneas | Fecha fija, modifica datos sin limpieza, no verifica entrega real ni carga concurrente de consultas |
| Preparación para Sprint 2 | Citas con estados CONFIRMADA/CANCELADA | `UNIQUE(agenda_id)` impide reservar otra vez un cupo cancelado conservando su historial |

## 2. Fase A: cerrar y mejorar Sprint 1

Orden recomendado: integridad y acceso → notificaciones fiables → entorno reproducible → experiencia y validación.

### A1. Integridad de reservas y agendas — prioridad crítica

Responsables sugeridos: Juan (MED-16), Diego (MED-11) y Martín (MED-10).

- Establecer aislamiento Serializable, bloqueo de fila, límites de espera y reintentos acotados ante errores de serialización. Diferenciar conflictos reales de fallos temporales.
- Impedir superposición de intervalos por médico desde PostgreSQL, no solo inicios iguales. Revisar datos existentes antes de aplicar la restricción mediante migración.
- Validar tipos, identificadores, longitud y formato de contacto, médico activo, fecha futura y jornada válida en backend. Usar America/Santiago para reglas locales y conversiones explícitas de tiempo.
- Generar únicamente bloques completos dentro de la jornada; conservar citas y bloqueos al reconfigurar. Registrar ausencias y feriados para que también restrinjan nuevas generaciones.
- Incorporar idempotencia en la creación de reservas para resolver reenvíos del formulario o pérdida de la respuesta.

Aceptación: ante 50 solicitudes al mismo bloque, exactamente una reserva y las demás rechazadas sin errores inesperados; dos intervalos parcialmente superpuestos tampoco pueden reservarse; bloquear/configurar/reservar concurrentemente mantiene la integridad. Entradas inválidas no modifican datos.

### A2. Acceso de secretaría — prioridad crítica

Responsables sugeridos: Martín con apoyo de Juan.

- Añadir inicio/cierre de sesión y autorización de secretaría en backend y frontend, sin requerir cuenta al paciente para reservar.
- Proteger consulta de reservas y agendas administrativas, configuración, bloqueos y futuros flujos de recepción.
- Registrar actor y acción administrativa; limitar los datos personales en respuestas y registros.

Aceptación: solicitudes anónimas a operaciones administrativas reciben 401/403; la reserva y consulta pública continúan operativas.

### A3. Confirmación fiable — prioridad crítica

Responsables sugeridos: Diego y Juan; Martín reutiliza esta base en MED-13.

- Guardar cita y trabajo de notificación en la misma transacción mediante una tabla de salida persistente (outbox).
- Procesar envíos fuera de la transacción con un worker y reintentos. Mantener estados de notificación separados del estado de la cita.
- Distinguir pendiente, aceptado por proveedor, entregado y fallido según evidencia disponible. El modo de prueba debe identificarse como simulado.
- Un fallo del proveedor no debe convertir una reserva persistida en un rechazo para el usuario.
- Conectar el correo de confirmación con un proveedor real para cerrar el DoD de RF-02; la autenticación del dominio y evaluación de entrega se completan en MED-18.

Aceptación: la cita sobrevive a fallos de correo; el trabajo pendiente sobrevive al reinicio; el estado mostrado coincide con la evidencia real. Un registro en memoria no sirve como comprobante de entrega.

### A4. Entorno, interfaz y pruebas — prioridad alta

Responsables sugeridos: Juan (entorno), Diego (portal), Martín (QA).

- Añadir migraciones versionadas, configuración por entorno, archivo de ejemplo sin secretos y lockfiles para instalaciones reproducibles.
- Preparar staging con PostgreSQL cloud y documentar conexión y despliegue; separar datos de prueba. Verificar respaldo/restauración antes de migrar datos existentes.
- Dividir `App.jsx` en portal, formulario, panel y capa de acceso a API; mejorar errores de red, estados vacíos, navegación por teclado y vista móvil.
- Retirar etiquetas JIRA/BPMN y métricas de base de datos del flujo del paciente; conservarlas en documentación o diagnóstico administrativo.
- Corregir pruebas para usar fechas relativas, datos aislados y limpieza. Agregar casos de solapamiento, permisos, fallos de correo y configuración de 15/20/30 minutos.
- Medir latencia HTTP de consultas y reservas con 30–50 usuarios, incluyendo éxitos, conflictos y errores; no usar solo el tiempo reportado por SQL.

Puerta de salida: matriz de criterios MED-9/10/11/15/16 con evidencia; p95 ≤ 2 s en consultas y reservas bajo la carga acordada; cero dobles reservas; acceso administrativo protegido y confirmación real verificada. Actualizar README y backlog con lo efectivamente validado.

## 3. Fase B: ejecutar Sprint 2

### B1. Modelo de citas y notificaciones compartido

Responsables sugeridos: Juan y Martín. Dependencia: A1 y A3.

- Separar estado de reserva de confirmación de asistencia: una reserva vigente ocupa el cupo aunque la asistencia siga pendiente.
- Sustituir la unicidad absoluta de `agenda_id` por unicidad para citas activas; conservar canceladas en el historial.
- Cancelar cita y liberar cupo en una sola transacción, respetando ausencias/bloqueos vigentes. Confirmar asistencia no debe reactivar una cita cancelada.
- Registrar canal de origen WEB/PRESENCIAL/TELEFONO y funcionario cuando corresponda.
- Persistir notificaciones con cita, canal, tipo, fecha programada, intentos y referencia del proveedor; deduplicar la creación de trabajos.

Aceptación: reservar → cancelar → reservar nuevamente el mismo cupo funciona y conserva el historial; acciones repetidas son idempotentes.

### B2. MED-12 / RF-04: agendamiento presencial y telefónico

Responsable del backlog: Diego. Dependencias: A2 y B1.

- Añadir formulario rápido de recepción con selección de profesional/cupo, datos de paciente y canal de atención.
- Reutilizar el mismo servicio de reserva, validación de RUT y control transaccional del portal.
- Optimizar tabulación, foco, validación y autocompletado autorizado de pacientes existentes.
- Publicar cambios después del COMMIT mediante eventos al navegador; actualizar disponibilidad de otros clientes y refrescar al reconectar. No difundir datos de pacientes en eventos públicos.

Aceptación: medir con secretaría el flujo desde el inicio del ingreso hasta la confirmación, usando casos preparados y dejando explícito qué datos estaban disponibles. Cumplir menos de 15 s. Comprobar en dos navegadores que una reserva en recepción actualiza el portal sin recarga manual y que la competencia por el cupo produce un solo ganador. Propuesta de objetivo visual: actualización ≤ 2 s, a acordar con el PO.

### B3. MED-13 / RF-05: recordatorios y respuesta del paciente

Responsable del backlog: Martín. Dependencias: B1 y base de correo de A3.

- Programar recordatorios para 24 horas antes del inicio de la cita con un worker persistente. Acordar una tolerancia operativa medible, propuesta ≤ 1 minuto en condiciones normales.
- Integrar SendGrid y Twilio mediante adaptadores configurables; verificar los requisitos vigentes del proveedor al implementar, incluidas credenciales, remitente, plantillas y habilitación del canal.
- Ofrecer confirmar asistencia o cancelar con enlaces de token aleatorio, limitado a esa cita y con vencimiento. No usar RUT ni código de reserva como autorización.
- Evitar que una visita GET o una previsualización de correo cancele una cita; efectuar cambios mediante una acción explícita y validada.
- Validar callbacks del proveedor y deduplicar eventos. Descartar recordatorios de citas canceladas antes del envío y manejar reinicios, reintentos y respuestas tardías.
- Definir con el PO la política para reservas creadas a menos de 24 horas y mensajes atrasados por una caída. Propuesta inicial: confirmación inmediata, sin duplicar un recordatorio de 24 h ya vencido.

Aceptación: pruebas con reloj controlado verifican programación, zona horaria, cancelación y reinicio; pruebas reales verifican ambos canales. Repetir clics o callbacks no duplica efectos. Si solo un canal falla, reintentar ese canal y registrar el resultado. Documentar el riesgo residual de duplicados si el proveedor acepta un envío pero la respuesta se pierde.

### B4. MED-18 / RNF-03: dominio y entrega de correos

Responsable del backlog: Juan. Iniciar preparación al comienzo del Sprint 2, en paralelo al desarrollo.

- Confirmar dominio controlado, acceso a DNS y cuenta de SendGrid; configurar SPF, DKIM y DMARC según los valores y documentación vigentes del proveedor, preservando otros remitentes existentes.
- Homologar plantillas de confirmación y recordatorio; verificar autenticación en cabeceras de mensajes recibidos.
- Registrar rebotes y fallos con eventos del proveedor. Medir por separado aceptación, entrega reportada y llegada a bandeja principal.
- Preparar una muestra acordada de cuentas Gmail/Outlook y un período de medición para el objetivo > 95 % fuera de spam. DNS PASS por sí solo no acredita ese porcentaje.

Aceptación: evidencia de SPF/DKIM/DMARC PASS y reporte con muestra, período, resultados y porcentaje. Si faltan dominio o cuentas habilitadas, mantener el criterio pendiente aunque la integración simulada funcione.

## 4. Secuencia y estimación orientativa

Supuesto: equipo original de tres personas. Las siguientes son ventanas de trabajo, no compromisos de fecha; ajustar tras conocer dedicación y acceso a proveedores.

| Ventana | Trabajo | Resultado |
| --- | --- | --- |
| Mejora Sprint 1, días 1–3 | A1 y A2; preparar A3 | Reservas y administración protegidas |
| Mejora Sprint 1, días 4–6 | A3, A4 y regresión | Núcleo verificable y base persistente de correo |
| Sprint 2, días 1–2 | B1 y preparación externa B4 | Modelo migrado y dependencias externas encaminadas |
| Sprint 2, días 3–6 | B2 y B3 en paralelo | Recepción y recordatorios integrados |
| Sprint 2, días 7–8 | Integración real y B4 | Evidencia de envíos, respuestas y autenticación |
| Sprint 2, días 9–10 | Carga, regresión, UAT y correcciones | Demostración y criterios de cierre documentados |

La habilitación de proveedores, DNS o staging puede extender las ventanas. Preparar accesos temprano; no declarar completo un criterio externo basándose solo en mocks.

## 5. Demostración de cierre del Sprint 2

1. Secretaría autenticada reserva un cupo en menos de 15 s y otro navegador actualiza su disponibilidad.
2. Portal y recepción intentan tomar el mismo cupo: solo una reserva persiste.
3. Se verifica programación 24 h antes con reloj controlado y envío real por correo y WhatsApp.
4. El paciente confirma asistencia y el cupo sigue ocupado.
5. Otro paciente cancela; el cupo vuelve a ofrecerse si no existe bloqueo y puede reservarse otra vez.
6. Se repiten clics/callbacks y se reinicia el worker: no se repiten efectos sobre la cita ni se pierden trabajos pendientes.
7. Se presentan mediciones de latencia, pruebas de permisos y evidencia de autenticación/entrega de correo.

Entregables: migraciones, funcionalidades, pruebas automatizadas, reporte de aceptación por tarjeta y README actualizado. El manual y capacitación formal siguen en Sprint 3; las observaciones de esta UAT alimentarán ese trabajo.
