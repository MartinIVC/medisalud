const express = require('express');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/agendas
 * Consulta administrativa para secretarias (MED-10): muestra TODOS los bloques
 * (DISPONIBLE, RESERVADO y BLOQUEADO) para un médico y fecha.
 */
router.get('/agendas', requireSecretary, async (req, res) => {
  try {
    const { medico_id, fecha } = req.query;
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
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/agendas/configurar
 * MED-10 (RF-03 / HU02 - CA-01): Parametrizar bloques horarios de 15, 20 o 30 minutos
 * para un médico activo registrado en el sistema.
 */
router.post('/agendas/configurar', requireSecretary, async (req, res) => {
  const {
    medico_id,
    fecha,
    hora_inicio = '09:00',
    hora_fin = '13:00',
    duracion_min = 30,
  } = req.body;

  const duracion = Number(duracion_min);
  if (!medico_id || !fecha) {
    return res.status(400).json({
      ok: false,
      error: 'Debe indicar medico_id y fecha para parametrizar la agenda.',
    });
  }

  const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!Number.isInteger(Number(medico_id)) || Number(medico_id) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      ![15, 20, 30].includes(duracion) || !validTime(hora_inicio) || !validTime(hora_fin) || hora_inicio >= hora_fin) {
    return res.status(400).json({
      ok: false,
      error: 'Según RF-03 (MED-10), la duración del bloque debe ser estrictamente 15, 20 o 30 minutos.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM medicos WHERE id = $1 AND activo = TRUE FOR UPDATE', [Number(medico_id)]);
    const blockedDay = await client.query(
      'SELECT 1 FROM bloqueos_agenda WHERE fecha=$1::date AND (medico_id IS NULL OR medico_id=$2) LIMIT 1',
      [fecha, Number(medico_id)]
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
      [Number(medico_id), fecha, hora_inicio, hora_fin]
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
      [Number(medico_id), fecha, hora_inicio, hora_fin, duracion]
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
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/agendas/bloquear
 * MED-10 (RF-03 / HU02 - CA-02): Bloquear días festivos, licencias médicas o bloques específicos
 */
router.post('/agendas/bloquear', requireSecretary, async (req, res) => {
  const {
    medico_id,
    fecha,
    agenda_id,
    es_feriado_global = false,
    motivo = 'Licencia médica / Día festivo (MED-10)',
  } = req.body;

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
        [Number(agenda_id), motivo]
      );
    } else if (es_feriado_global && fecha) {
      await pool.query('INSERT INTO bloqueos_agenda (medico_id, fecha, motivo) VALUES (NULL, $1::date, $2)', [fecha, motivo]);
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'BLOQUEADO', motivo_bloqueo = $2, updated_at = CURRENT_TIMESTAMP
        WHERE fecha = $1::DATE AND estado = 'DISPONIBLE'
        RETURNING id
        `,
        [fecha, motivo]
      );
    } else if (medico_id && fecha) {
      await pool.query('INSERT INTO bloqueos_agenda (medico_id, fecha, motivo) VALUES ($1, $2::date, $3)', [Number(medico_id), fecha, motivo]);
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'BLOQUEADO', motivo_bloqueo = $3, updated_at = CURRENT_TIMESTAMP
        WHERE medico_id = $1 AND fecha = $2::DATE AND estado = 'DISPONIBLE'
        RETURNING id
        `,
        [Number(medico_id), fecha, motivo]
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
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/agendas/desbloquear
 * Permite a la secretaria rehabilitar un bloque bloqueado a estado DISPONIBLE
 */
router.post('/agendas/desbloquear', requireSecretary, async (req, res) => {
  const { agenda_id, medico_id, fecha } = req.body;
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
        [Number(agenda_id)]
      );
    } else if (medico_id && fecha) {
      await pool.query('DELETE FROM bloqueos_agenda WHERE fecha=$2::date AND medico_id=$1', [Number(medico_id), fecha]);
      result = await pool.query(
        `
        UPDATE agendas
        SET estado = 'DISPONIBLE', motivo_bloqueo = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE medico_id = $1 AND fecha = $2::DATE AND estado = 'BLOQUEADO'
        RETURNING id
        `,
        [Number(medico_id), fecha]
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
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
