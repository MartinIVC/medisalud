# Manual rápido de secretaría

**Versión:** 0.1, borrador para validar en el entorno candidato  
**Alcance:** acceso, registro de médicos, agendas, reservas y recuperación de errores.

> Antes de capacitar, reemplaza los espacios de captura con imágenes de esta versión en el entorno de práctica. No uses datos reales de pacientes. La captura visual queda pendiente porque este entorno de trabajo no tiene los servicios de la aplicación disponibles.

## 1. Iniciar y cerrar sesión

1. Abre el portal Medisalud y selecciona **Secretaría**.
2. Ingresa tu usuario individual y contraseña, y selecciona **Iniciar sesión**.
3. Para salir, selecciona **Cerrar sesión**.

La sesión vence después de ocho horas. Si aparece el acceso nuevamente, inicia sesión otra vez. Si no recuerdas tu contraseña o la cuenta está bloqueada, solicita ayuda al administrador. Si falla la conexión al cerrar sesión, el sistema informa el problema y debes volver a intentarlo. Si estabas creando un médico, el formulario conserva sus datos mientras la página siga abierta. No recargues ni cierres la pestaña hasta retomarlo.

**Captura 1 pendiente:** acceso de secretaría y panel autenticado.

## 2. Crear un médico

1. En **Agenda del día**, abre **Profesionales** y selecciona **Registrar médico**.
2. Completa RUT chileno, nombre completo, correo, especialidad y box de atención.
3. Selecciona **Guardar médico** una sola vez y espera la confirmación.
4. Si un campo aparece marcado, corrígelo y vuelve a guardar. El sistema enfoca el primer campo que requiere corrección.
5. Si el RUT ya está registrado, revisa el registro existente. Esta pantalla no reactiva ni modifica médicos anteriores.
6. Después de la confirmación, selecciona **Configurar horarios** para continuar o **Crear otro médico** para iniciar otro registro.

El alta crea un médico activo, pero **no crea horarios**. Hasta configurar una agenda, no se ofrecerán cupos para reservar. Los puntos y el guion del RUT son opcionales; el dígito verificador debe ser correcto.

**Capturas 2 y 3 pendientes:** formulario nuevo, error de validación y confirmación de alta.

### Foto de un profesional existente

En **Agenda del día**, selecciona al profesional. En su ficha, elige **Añadir foto** o **Reemplazar foto**. Se admiten archivos PNG o JPEG de hasta 2 MiB. Revisa la vista previa y selecciona **Guardar foto**. Si la carga falla, la ficha y el catálogo muestran una imagen genérica y puedes volver a intentarlo; las reservas siguen disponibles. Solo una sesión de secretaría vigente permite guardar la foto.

### Desvincular un profesional

En **Agenda del día**, abre **Profesionales**. La lista muestra la foto, el estado y la cantidad de citas futuras confirmadas. Usa la búsqueda por nombre, RUT o especialidad, el filtro de especialidad y el filtro de estado para encontrar profesionales. Si no hay foto, se muestra una imagen genérica; puedes ampliarla cuando esté disponible. Si hay citas, usa **Gestionar citas en agenda** para abrir la fecha de la próxima cita y cancela o reprograma cada una siguiendo la sección 6; no se cancelan automáticamente. Vuelve a **Profesionales**, selecciona **Desvincular**, ingresa el motivo y confirma. La lista mostrará al profesional como inactivo, junto con la fecha, el motivo y el usuario responsable. Sus agendas y citas se conservan, pero no se ofrecen nuevos horarios ni reservas. Para revisar sus horarios y citas confirmadas, selecciona **Consultar agenda** en la ficha del profesional inactivo y elige la fecha; esta vista es de solo lectura. Para reactivarlo, selecciona **Revincular** y confirma: volverá a mostrarse en el catálogo público, y sus horarios disponibles se podrán reservar. No se modifican sus agendas, citas ni el registro de la última desvinculación. Si otra persona reserva mientras se realiza una actualización, el sistema serializa ambas operaciones por profesional.

## 3. Configurar horarios

1. Desde la confirmación del médico, selecciona **Configurar horarios**. También puedes volver al panel y usar el selector **Profesional**.
2. Selecciona la fecha, hora de inicio, hora de término y duración de 15, 20 o 30 minutos.
3. Selecciona **Guardar horarios** y revisa la agenda del día.
4. Los bloques disponibles podrán ofrecerse en el portal; los reservados y bloqueados no.

**Captura 4 pendiente:** selector con el médico recién creado y controles de agenda.

## 4. Consultar agenda y registrar bloqueos

1. En **Agenda del día**, selecciona profesional y fecha. Usa **Anterior**, **Hoy** o **Siguiente** para moverte entre jornadas.
2. Revisa los estados **Disponible**, **Reservado** y **Bloqueado**.
3. Para una ausencia del profesional, abre **Configurar horarios y registrar ausencias**, indica el motivo y selecciona **Bloquear jornada del profesional**.
4. Para un feriado de toda la clínica, selecciona **Bloquear fecha para todos los profesionales**.
5. Para un bloque individual, usa **Bloquear**. Para liberar un bloque bloqueado, usa **Habilitar**.

Confirma la fecha y el alcance antes de guardar un bloqueo. Los horarios reservados no se liberan con el bloqueo.

**Captura 5 pendiente:** agenda con estados y acciones de bloqueo.

## 5. Registrar una cita presencial o telefónica

1. Elige el profesional y la fecha en **Agenda del día**.
2. Selecciona **Reservar recepción** en un bloque disponible o **Nueva reserva** para abrir la primera hora disponible.
3. Indica si la solicitud fue presencial o telefónica, completa los datos de la persona y selecciona **Reservar**.
4. Comprueba que el bloque cambie a **Reservado** y que la cita aparezca en la agenda.
5. La confirmación se prepara por correo. El enlace para que el paciente confirme o cancele está en el recordatorio, programado 24 horas antes. Para cancelar o mover una cita desde recepción, sigue la sección siguiente.

Si el cupo dejó de estar disponible, el sistema informa el conflicto. Selecciona otro bloque antes de registrar la cita.

**Captura 6 pendiente:** formulario de reserva de recepción y cita registrada.

## 6. Cancelar o mover una cita ante una contingencia

1. En **Agenda del día**, busca la cita futura reservada y selecciona **Cancelar** o **Mover**.
2. Para moverla, elige el profesional, la fecha y un horario disponible distinto del actual.
3. Indica el motivo y revisa los datos antes de confirmar la acción. Una cita ya iniciada o cancelada no se puede modificar.
4. Comprueba el mensaje de resultado y vuelve a revisar la agenda: al cancelar se libera el cupo; al mover se ocupa el nuevo y se libera el anterior. Un bloqueo vigente puede mantener bloqueado el cupo anterior.

Al guardar la acción se solicita el envío del aviso por correo. Este se procesa en segundo plano, por lo que el mensaje inicial no indica si el proveedor ya lo aceptó o si llegó al paciente. Si el sistema indica que falta configurar SMTP o SendGrid, coordina el aviso por el procedimiento de contingencia acordado con el responsable del entorno. No informes al paciente que recibió el correo solo porque la operación se guardó.

**Captura 7 pendiente:** diálogo de cancelación o cambio y mensaje de resultado.

## 7. Confirmaciones y recordatorios

La aplicación prepara confirmaciones por email y recordatorios por email y WhatsApp cuando el proveedor correspondiente está configurado. El recordatorio se programa para 24 horas antes e incluye un enlace para confirmar o cancelar la cita. La aceptación de un mensaje por el proveedor no garantiza su entrega final. Antes de usar estos avisos con pacientes, el responsable del entorno debe comprobar la configuración y el resultado del proveedor. No uses datos reales durante la capacitación o las pruebas.

## 8. Errores y soporte

- **RUT inválido o duplicado:** corrige el dígito verificador o pide revisar el registro existente. No intentes cambiar el RUT para eludir el aviso.
- **No carga el catálogo:** selecciona **Reintentar**. Si continúa, informa al responsable de soporte definido para la marcha blanca.
- **Error de conexión:** espera unos segundos y vuelve a intentar. Antes de repetir una reserva, revisa si el bloque ya quedó reservado.
- **Conflicto al mover una cita:** actualiza la agenda y elige otro horario. Comprueba que la cita original siga en su cupo antes de reintentar.
- **Sesión expirada:** vuelve a iniciar sesión. El borrador de creación de médico se conserva temporalmente en la página; no se guarda en el navegador.
- **Incidente que impide operar:** informa fecha, turno, pantalla, acción y texto del error al responsable designado. No incluyas datos de pacientes en mensajes o capturas.

El PO y el Jefe de Recepción deben completar antes de la capacitación: **responsable de soporte:** ____________________ · **canal:** ____________________.
