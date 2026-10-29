function buildConfirmation({ codigoReserva, pacienteNombre, pacienteRut, pacienteEmail, medicoNombre, especialidadNombre, boxAtencion, fecha, horaInicio, horaFin }) {
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

module.exports = { buildConfirmation };
