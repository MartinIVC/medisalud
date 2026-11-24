const { pool: defaultPool } = require('../db');
const { HttpError } = require('../middleware/errors');
const { validateRut } = require('../utils/rutValidator');

async function getAppointmentsByRut({ database = defaultPool, rut }) {
  const rawRut = typeof rut === 'string' ? rut.trim() : '';
  if (!rawRut) {
    const message = 'Debes ingresar un RUT para consultar tus citas.';
    throw new HttpError(400, 'INVALID_RUT', message, { rut: message });
  }

  const validation = validateRut(rawRut);
  if (!validation.valid) {
    const message = validation.reason || 'El RUT ingresado no es válido.';
    throw new HttpError(400, 'INVALID_RUT', message, { rut: message });
  }

  const normalizedRut = validation.formatted;
  const result = await database.query(
    `SELECT c.id,
            c.codigo_reserva,
            TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
            TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
            TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
            m.nombre AS medico_nombre,
            e.nombre AS especialidad_nombre,
            m.box_atencion,
            c.estado,
            c.asistencia_estado,
            ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW() AS futuro
     FROM citas_medicas c
     INNER JOIN agendas a ON a.id = c.agenda_id
     INNER JOIN medicos m ON m.id = c.medico_id
     INNER JOIN especialidades e ON e.id = m.especialidad_id
     WHERE c.paciente_rut = $1
     ORDER BY
       CASE WHEN ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') >= NOW() THEN 0 ELSE 1 END ASC,
       CASE WHEN ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') >= NOW() THEN a.fecha END ASC,
       CASE WHEN ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') >= NOW() THEN a.hora_inicio END ASC,
       a.fecha DESC,
       a.hora_inicio DESC,
       c.created_at DESC`,
    [normalizedRut],
  );

  return {
    rut: normalizedRut,
    citas: result.rows,
  };
}

module.exports = { getAppointmentsByRut };
