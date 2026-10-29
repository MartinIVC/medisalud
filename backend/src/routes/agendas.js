const express = require('express');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { asyncHandler, sendError } = require('../middleware/errors');
const { isValidDate, positiveInteger, parseAgendaConfiguration, parseAgendaBlockAction } = require('../schemas/inputs');
const { configureAgenda, blockAgenda, unblockAgenda } = require('../services/agenda');

const router = express.Router();

/**
 * GET /api/agendas
 * Consulta administrativa para secretarias (MED-10): muestra TODOS los bloques
 * (DISPONIBLE, RESERVADO y BLOQUEADO) para un médico y fecha.
 */
router.get('/agendas', requireSecretary, asyncHandler(async (req, res) => {
  const { medico_id, fecha } = req.query;
  const fields = {};
  if (medico_id !== undefined && !/^\d+$/.test(medico_id)) fields.medico_id = 'Indica un médico válido.';
  if (medico_id !== undefined && (!positiveInteger(Number(medico_id)))) fields.medico_id = 'Indica un médico válido.';
  if (fecha !== undefined && !isValidDate(fecha)) fields.fecha = 'Indica una fecha real con formato AAAA-MM-DD.';
  if (Object.keys(fields).length) return sendError(res, 400, 'VALIDATION_ERROR', 'Revisa los filtros de agenda.', fields);
  try {
    const params = [];
    const conditions = [];

    if (medico_id) {
      params.push(Number(medico_id));
      conditions.push(`a.medico_id = $${params.length}`);
    }

    if (fecha) {
      params.push(fecha);
      conditions.push(`a.fecha = $${params.length}::DATE`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        a.id AS agenda_id,
        a.medico_id,
        m.nombre AS medico_nombre,
        m.box_atencion,
        e.nombre AS especialidad_nombre,
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
        TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
        a.duracion_min,
        a.estado,
        a.motivo_bloqueo,
        c.codigo_reserva,
        c.paciente_rut,
        c.paciente_nombre
      FROM agendas a
      INNER JOIN medicos m ON m.id = a.medico_id
      INNER JOIN especialidades e ON e.id = m.especialidad_id
      LEFT JOIN citas_medicas c ON c.agenda_id = a.id AND c.estado = 'CONFIRMADA'
      ${whereSql}
      ORDER BY a.fecha ASC, a.hora_inicio ASC, m.id ASC
      LIMIT 300
      `,
      params
    );

    res.json({
      ok: true,
      jira: 'MED-10',
      total: result.rows.length,
      bloques: result.rows,
    });
  } catch (err) {
    throw err;
  }
}));

/**
 * POST /api/agendas/configurar
 * MED-10 (RF-03 / HU02 - CA-01): Parametrizar bloques horarios de 15, 20 o 30 minutos
 * para un médico activo registrado en el sistema.
 */
router.post('/agendas/configurar', requireSecretary, asyncHandler(async (req, res) => {
  const parsed = parseAgendaConfiguration(req.body);
  if (Object.keys(parsed.errors).length) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos de configuración de agenda.', parsed.errors);
  }
  const { duracion } = parsed.value;
  const result = await configureAgenda(pool, parsed.value);
  return res.status(201).json({
    ok: true,
    jira: 'MED-10',
    criterio: 'CA-01 Parametrización de bloques (15, 20 o 30 min)',
    mensaje: `Se generaron ${result.blocks.length} bloques de ${duracion} minutos exitosamente. Se conservaron ${result.historyCount} bloques con historial de citas.`,
    bloques_creados: result.blocks,
    bloques_con_historial_conservados: result.historyCount,
    bloques_reemplazados: result.deletedCount,
  });
}));

/**
 * POST /api/agendas/bloquear
 * MED-10 (RF-03 / HU02 - CA-02): Bloquear días festivos, licencias médicas o bloques específicos
 */
router.post('/agendas/bloquear', requireSecretary, asyncHandler(async (req, res) => {
  const parsed = parseAgendaBlockAction(req.body);
  const {
    medico_id,
    fecha,
    agenda_id,
    es_feriado_global = false,
    motivo = 'Licencia médica / Día festivo (MED-10)',
  } = parsed.value;
  const fields = parsed.errors;
  const bodyIsValid = Object.keys(fields).length === 0;
  const hasAgenda = parsed.value.agenda_id !== undefined;
  const hasGlobalDate = parsed.value.es_feriado_global === true && parsed.value.fecha !== undefined;
  const hasDoctorDate = parsed.value.es_feriado_global !== true && parsed.value.medico_id !== undefined && parsed.value.fecha !== undefined;
  if (!bodyIsValid || [hasAgenda, hasGlobalDate, hasDoctorDate].filter(Boolean).length !== 1 ||
      (parsed.value.es_feriado_global !== undefined && typeof parsed.value.es_feriado_global !== 'boolean')) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Indica un bloque, un médico y fecha, o un feriado global y fecha.', fields);
  }
  const result = await blockAgenda(pool, {
    agendaId: agenda_id,
    medicoId: medico_id,
    fecha,
    global: es_feriado_global,
    motivo: motivo.trim(),
  });
  return res.json({
    ok: true,
    jira: 'MED-10',
    criterio: 'CA-02 Bloqueo de feriados/licencias',
    bloques_afectados: result.affected,
    mensaje: `Se bloquearon ${result.affected} bloques horarios (${motivo.trim()}). Ya no aparecerán disponibles en el Portal Web.`,
  });
}));

/**
 * POST /api/agendas/desbloquear
 * Permite a la secretaria rehabilitar un bloque bloqueado a estado DISPONIBLE
 */
router.post('/agendas/desbloquear', requireSecretary, asyncHandler(async (req, res) => {
  const parsed = parseAgendaBlockAction(req.body);
  const { agenda_id, medico_id, fecha, es_feriado_global } = parsed.value;
  const hasAgenda = agenda_id !== undefined;
  const hasGlobalDate = es_feriado_global === true && fecha !== undefined;
  const hasDoctorDate = es_feriado_global !== true && medico_id !== undefined && fecha !== undefined;
  if (Object.keys(parsed.errors).length || [hasAgenda, hasGlobalDate, hasDoctorDate].filter(Boolean).length !== 1 ||
      (es_feriado_global !== undefined && typeof es_feriado_global !== 'boolean')) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Indica un bloque o un médico y fecha válidos.', parsed.errors);
  }
  const result = await unblockAgenda(pool, { agendaId: agenda_id, medicoId: medico_id, fecha, global: es_feriado_global });
  return res.json({
    ok: true,
    jira: 'MED-10',
    bloques_habilitados: result.affected,
    mensaje: `${result.affected} bloque(s) habilitados después de reevaluar los bloqueos de fecha.`,
  });
}));

module.exports = router;
