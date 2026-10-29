const express = require('express');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { isValidDate, positiveInteger, parseAgendaConfiguration, parseAgendaBlockAction } = require('../schemas/inputs');

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
  if (Object.keys(fields).length) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', error: 'Revisa los filtros de agenda.', fields });
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
    return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', error: 'Revisa los datos de configuración de agenda.', fields: parsed.errors });
  }
  const { medicoId: medico_id, fecha, horaInicio: hora_inicio, horaFin: hora_fin, duracion } = parsed.value;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctor = await client.query('SELECT id FROM medicos WHERE id = $1 AND activo = TRUE FOR UPDATE', [medico_id]);
    if (!doctor.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, code: 'DOCTOR_NOT_FOUND', error: 'El médico no existe o está inactivo.' });
    }
    const blockedDay = await client.query(
      'SELECT 1 FROM bloqueos_agenda WHERE fecha=$1::date AND (medico_id IS NULL OR medico_id=$2) LIMIT 1',
      [fecha, medico_id]
    );
    if (blockedDay.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'La fecha está bloqueada por feriado o ausencia registrada.' });
    }

    // Eliminar bloques DISPONIBLES previos en ese rango que no tengan citas reservadas para regenerar con la nueva duración
    await client.query(
      `
      DELETE FROM agendas
      WHERE medico_id = $1
        AND fecha = $2::DATE
        AND hora_inicio >= $3::TIME
        AND hora_inicio < $4::TIME
        AND estado = 'DISPONIBLE'
      `,
      [medico_id, fecha, hora_inicio, hora_fin]
    );

    const insertResult = await client.query(
      `
      WITH RECURSIVE intervalos AS (
        SELECT $3::TIME AS h_ini, ($3::TIME + make_interval(mins => $5::INT))::TIME AS h_fin
        UNION ALL
        SELECT h_fin, (h_fin + make_interval(mins => $5::INT))::TIME
        FROM intervalos
        WHERE (h_fin + make_interval(mins => $5::INT))::TIME <= $4::TIME
      )
      INSERT INTO agendas (medico_id, fecha, hora_inicio, hora_fin, duracion_min, estado)
      SELECT $1::INT, $2::DATE, h_ini, h_fin, $5::INT, 'DISPONIBLE'
      FROM intervalos
      WHERE h_fin <= $4::TIME
        AND NOT EXISTS (
          SELECT 1 FROM agendas existente
          WHERE existente.medico_id = $1::INT AND existente.fecha = $2::DATE
            AND existente.hora_inicio < h_fin AND existente.hora_fin > h_ini
        )
      ON CONFLICT (medico_id, fecha, hora_inicio) DO NOTHING
      RETURNING id, TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio, TO_CHAR(hora_fin, 'HH24:MI') AS hora_fin, duracion_min, estado
      `,
      [medico_id, fecha, hora_inicio, hora_fin, duracion]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      jira: 'MED-10',
      criterio: 'CA-01 Parametrización de bloques (15, 20 o 30 min)',
      mensaje: `Se generaron ${insertResult.rowCount} bloques de ${duracion} minutos exitosamente.`,
      bloques_creados: insertResult.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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
    return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', error: 'Indica un bloque, un médico y fecha, o un feriado global y fecha.', fields });
  }
  const motivoNormalizado = typeof motivo === 'string' ? motivo.trim() : motivo;

  try {
    let result;

    if (agenda_id) {
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'BLOQUEADO', motivo_bloqueo = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND estado = 'DISPONIBLE'
        RETURNING id
        `,
        [agenda_id, motivoNormalizado]
      );
    } else if (es_feriado_global && fecha) {
      await pool.query('INSERT INTO bloqueos_agenda (medico_id, fecha, motivo) VALUES (NULL, $1::date, $2)', [fecha, motivoNormalizado]);
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'BLOQUEADO', motivo_bloqueo = $2, updated_at = CURRENT_TIMESTAMP
        WHERE fecha = $1::DATE AND estado = 'DISPONIBLE'
        RETURNING id
        `,
        [fecha, motivoNormalizado]
      );
    } else if (medico_id && fecha) {
      await pool.query('INSERT INTO bloqueos_agenda (medico_id, fecha, motivo) VALUES ($1, $2::date, $3)', [medico_id, fecha, motivoNormalizado]);
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'BLOQUEADO', motivo_bloqueo = $3, updated_at = CURRENT_TIMESTAMP
        WHERE medico_id = $1 AND fecha = $2::DATE AND estado = 'DISPONIBLE'
        RETURNING id
        `,
        [medico_id, fecha, motivoNormalizado]
      );
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Debe especificar agenda_id, o (medico_id + fecha), o (es_feriado_global + fecha).',
      });
    }

    res.json({
      ok: true,
      jira: 'MED-10',
      criterio: 'CA-02 Bloqueo de feriados/licencias',
      bloques_afectados: result.rowCount,
      mensaje: `Se bloquearon ${result.rowCount} bloques horarios (${motivo}). Ya no aparecerán disponibles en el Portal Web.`,
    });
  } catch (err) {
    throw err;
  }
}));

/**
 * POST /api/agendas/desbloquear
 * Permite a la secretaria rehabilitar un bloque bloqueado a estado DISPONIBLE
 */
router.post('/agendas/desbloquear', requireSecretary, asyncHandler(async (req, res) => {
  const parsed = parseAgendaBlockAction(req.body);
  const { agenda_id, medico_id, fecha } = parsed.value;
  const hasAgenda = agenda_id !== undefined;
  const hasDoctorDate = medico_id !== undefined && fecha !== undefined;
  if (Object.keys(parsed.errors).length || [hasAgenda, hasDoctorDate].filter(Boolean).length !== 1) {
    return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', error: 'Indica un bloque o un médico y fecha válidos.', fields: parsed.errors });
  }
  try {
    let result;
    if (agenda_id) {
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'DISPONIBLE', motivo_bloqueo = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND estado = 'BLOQUEADO'
        RETURNING id
        `,
        [agenda_id]
      );
    } else if (medico_id && fecha) {
      await pool.query('DELETE FROM bloqueos_agenda WHERE fecha=$2::date AND medico_id=$1', [medico_id, fecha]);
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'DISPONIBLE', motivo_bloqueo = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE medico_id = $1 AND fecha = $2::DATE AND estado = 'BLOQUEADO'
        RETURNING id
        `,
        [medico_id, fecha]
      );
    } else {
      return res.status(400).json({ ok: false, error: 'Indique agenda_id o (medico_id + fecha).' });
    }

    res.json({
      ok: true,
      jira: 'MED-10',
      bloques_habilitados: result.rowCount,
      mensaje: `${result.rowCount} bloque(s) rehabilitados como DISPONIBLE.`,
    });
  } catch (err) {
    throw err;
  }
}));

module.exports = router;
