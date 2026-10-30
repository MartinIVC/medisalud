function buildConfirmation({
  codigoReserva,
  pacienteNombre,
  pacienteRut,
  pacienteEmail,
  medicoNombre,
  especialidadNombre,
  boxAtencion,
  fecha,
  horaInicio,
  horaFin,
}) {
  const subject = `[Medisalud] Confirmación de cita — ${codigoReserva}`;
  const text = [
    `Estimado(a) ${pacienteNombre} (RUT: ${pacienteRut}):`,
    'Su reserva en Centro Médico Medisalud está confirmada.',
    `Código: ${codigoReserva}`,
    `Especialidad: ${especialidadNombre}`,
    `Profesional: ${medicoNombre}`,
    `Fecha y hora: ${fecha}, ${horaInicio} a ${horaFin}`,
    `Lugar: ${boxAtencion}`,
  ].join('\n');
  return { to: pacienteEmail, subject, text, codigoReserva };
}

function buildCancellationNotice({
  pacienteNombre,
  pacienteEmail,
  codigoReserva,
  fecha,
  horaInicio,
  horaFin,
  motivo,
  publicWebUrl,
}) {
  return {
    to: pacienteEmail,
    subject: `[Medisalud] Aviso de cancelación — ${codigoReserva}`,
    text: [
      `Hola ${pacienteNombre}:`,
      'Te informamos que el equipo de Medisalud canceló tu cita.',
      `Código de reserva: ${codigoReserva}`,
      `Horario cancelado: ${fecha}, ${horaInicio} a ${horaFin}`,
      `Motivo: ${motivo}`,
      `Puedes reservar otra hora en ${publicWebUrl}`,
      'Si necesitas ayuda, responde este correo o comunícate con la clínica.',
    ].join('\n'),
  };
}

function buildRescheduleNotice({
  pacienteNombre,
  pacienteEmail,
  codigoReserva,
  motivo,
  citaAnterior,
  citaNueva,
  responseUrl,
}) {
  return {
    to: pacienteEmail,
    subject: `[Medisalud] Aviso de cambio de cita — ${codigoReserva}`,
    text: [
      `Hola ${pacienteNombre}:`,
      'Por una contingencia, el equipo de Medisalud movió tu cita.',
      `Código de reserva: ${codigoReserva}`,
      `Horario anterior: ${citaAnterior.fecha}, ${citaAnterior.horaInicio} a ${citaAnterior.horaFin} · ${citaAnterior.medicoNombre}`,
      `Nuevo horario: ${citaNueva.fecha}, ${citaNueva.horaInicio} a ${citaNueva.horaFin} · ${citaNueva.medicoNombre}`,
      `Lugar: ${citaNueva.boxAtencion}`,
      `Motivo: ${motivo}`,
      `Si necesitas confirmar o cancelar la nueva hora, usa este enlace: ${responseUrl}`,
      'Si necesitas ayuda, responde este correo o comunícate con la clínica.',
    ].join('\n'),
  };
}

module.exports = { buildConfirmation, buildCancellationNotice, buildRescheduleNotice };
