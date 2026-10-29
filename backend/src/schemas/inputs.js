const { validateRut } = require('../utils/rutValidator');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function parseReservation(body, requestKey) {
  const errors = {};
  const data = isPlainObject(body) ? body : {};
  if (!isPlainObject(body)) errors.form = 'La solicitud debe contener un objeto JSON.';
  if (!positiveInteger(data.agenda_id)) errors.agenda_id = 'Selecciona un bloque horario válido.';

  const fields = ['paciente_rut', 'paciente_nombre', 'paciente_email', 'paciente_telefono'];
  for (const field of fields) {
    if (typeof data[field] !== 'string' || !data[field].trim())
      errors[field] = 'Este dato es obligatorio.';
  }

  const rut = typeof data.paciente_rut === 'string' ? validateRut(data.paciente_rut) : null;
  if (rut && !rut.valid) errors.paciente_rut = rut.reason;

  const nombre = typeof data.paciente_nombre === 'string' ? data.paciente_nombre.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (nombre && (nombre.length > 150 || /[\u0000-\u001f<>]/.test(nombre))) {
    errors.paciente_nombre =
      'El nombre no puede superar 150 caracteres ni incluir caracteres de control.';
  }
  const email = typeof data.paciente_email === 'string' ? data.paciente_email.trim() : '';
  if (email && (email.length > 150 || !/^\S+@\S+\.\S+$/.test(email))) {
    errors.paciente_email = 'Ingresa un correo válido de hasta 150 caracteres.';
  }
  const telefono = typeof data.paciente_telefono === 'string' ? data.paciente_telefono.trim() : '';
  if (telefono && !/^\+?[0-9 ()-]{8,30}$/.test(telefono)) {
    errors.paciente_telefono = 'Ingresa un teléfono válido de hasta 30 caracteres.';
  }

  const origen = data.origen === undefined ? 'WEB' : data.origen;
  if (!['WEB', 'PRESENCIAL', 'TELEFONO'].includes(origen))
    errors.origen = 'El origen de la reserva no es válido.';
  if (requestKey && (typeof requestKey !== 'string' || requestKey.length > 100)) {
    errors.idempotency_key = 'La clave de idempotencia no puede superar 100 caracteres.';
  }

  return {
    errors,
    value: {
      agendaId: data.agenda_id,
      rut: rut?.formatted,
      nombre,
      email,
      telefono,
      origen,
      requestKey: requestKey || null,
    },
  };
}

function parseAgendaConfiguration(body) {
  const errors = {};
  const data = isPlainObject(body) ? body : {};
  if (!isPlainObject(body)) errors.form = 'La solicitud debe contener un objeto JSON.';
  if (!positiveInteger(data.medico_id)) errors.medico_id = 'Selecciona un médico válido.';
  if (!isValidDate(data.fecha)) errors.fecha = 'Ingresa una fecha real con formato AAAA-MM-DD.';
  const horaInicio = data.hora_inicio === undefined ? '09:00' : data.hora_inicio;
  const horaFin = data.hora_fin === undefined ? '13:00' : data.hora_fin;
  const duracion = data.duracion_min === undefined ? 30 : data.duracion_min;
  const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(horaInicio)) errors.hora_inicio = 'Ingresa una hora válida con formato HH:MM.';
  if (!validTime(horaFin)) errors.hora_fin = 'Ingresa una hora válida con formato HH:MM.';
  if (validTime(horaInicio) && validTime(horaFin) && horaInicio >= horaFin) {
    errors.hora_fin = 'La hora de término debe ser posterior a la hora de inicio.';
  }
  if (![15, 20, 30].includes(duracion))
    errors.duracion_min = 'La duración debe ser 15, 20 o 30 minutos.';
  return {
    errors,
    value: { medicoId: data.medico_id, fecha: data.fecha, horaInicio, horaFin, duracion },
  };
}

function parseAgendaBlockAction(body) {
  const errors = {};
  const data = isPlainObject(body) ? body : {};
  if (!isPlainObject(body)) errors.form = 'La solicitud debe contener un objeto JSON.';
  const hasAgenda = data.agenda_id !== undefined;
  const hasDate = data.fecha !== undefined;
  if (hasAgenda && !positiveInteger(data.agenda_id))
    errors.agenda_id = 'Selecciona un bloque válido.';
  if (hasDate && !isValidDate(data.fecha))
    errors.fecha = 'Ingresa una fecha real con formato AAAA-MM-DD.';
  if (data.medico_id !== undefined && !positiveInteger(data.medico_id))
    errors.medico_id = 'Selecciona un médico válido.';
  if (
    typeof data.motivo !== 'undefined' &&
    (typeof data.motivo !== 'string' || !data.motivo.trim() || data.motivo.trim().length > 255)
  ) {
    errors.motivo = 'El motivo debe contener texto y no superar 255 caracteres.';
  }
  return { errors, value: data };
}

module.exports = {
  isPlainObject,
  isValidDate,
  positiveInteger,
  parseReservation,
  parseAgendaConfiguration,
  parseAgendaBlockAction,
};
