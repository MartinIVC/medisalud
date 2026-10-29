const express = require('express');
const { pool } = require('../db');
const { asyncHandler, sendError } = require('../middleware/errors');
const { isValidDate, positiveInteger } = require('../schemas/inputs');

const router = express.Router();

/**
 * GET /api/especialidades
 * Lista las especialidades médicas con conteo de profesionales activos
 */
router.get(
  '/especialidades',
  asyncHandler(async (_req, res) => {
    const result = await pool.query(`
      SELECT
        e.id,
        e.nombre,
        e.descripcion,
        COUNT(m.id)::INT AS total_medicos
      FROM especialidades e
      LEFT JOIN medicos m ON m.especialidad_id = e.id AND m.activo = TRUE
      GROUP BY e.id, e.nombre, e.descripcion
      ORDER BY e.id ASC
    `);
    res.json({ ok: true, especialidades: result.rows });
  }),
);

/**
 * GET /api/medicos?especialidad_id=
 * Lista los médicos activos (filtrables por especialidad)
 */
router.get(
  '/medicos',
  asyncHandler(async (req, res) => {
    const { especialidad_id } = req.query;
    if (
      especialidad_id !== undefined &&
      (typeof especialidad_id !== 'string' ||
        !/^\d+$/.test(especialidad_id) ||
        !positiveInteger(Number(especialidad_id)))
    ) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica una especialidad válida.', {
        especialidad_id: 'Selecciona una especialidad válida.',
      });
    }
    const params = [];
    let whereClause = 'WHERE m.activo = TRUE';

    if (especialidad_id) {
      params.push(Number(especialidad_id));
      whereClause += ` AND m.especialidad_id = $${params.length}`;
    }

    const result = await pool.query(
      `
      SELECT
        m.id,
        m.rut,
        m.nombre,
        m.email,
        m.box_atencion,
        m.especialidad_id,
        e.nombre AS especialidad_nombre
      FROM medicos m
      INNER JOIN especialidades e ON e.id = m.especialidad_id
      ${whereClause}
      ORDER BY e.id ASC, m.nombre ASC
      `,
      params,
    );
    res.json({ ok: true, medicos: result.rows });
  }),
);

/**
 * GET /api/disponibilidad
 * MED-9 (RF-01 / HU01 / CU-01: Actividades A-01 y A-02)
 * Filtra bloques con estado = 'DISPONIBLE' (excluyendo RESERVADO y BLOQUEADO - CA-02)
 * Mide explícitamente la latencia en PostgreSQL para certificar el umbral < 2,0 s (CA-01).
 */
router.get(
  '/disponibilidad',
  asyncHandler(async (req, res) => {
    const startHr = process.hrtime.bigint();
    const { especialidad_id, medico_id, fecha_desde, fecha_hasta, fecha } = req.query;
    const fields = {};
    for (const [field, value] of [
      ['especialidad_id', especialidad_id],
      ['medico_id', medico_id],
    ]) {
      if (
        value !== undefined &&
        (typeof value !== 'string' || !/^\d+$/.test(value) || !positiveInteger(Number(value)))
      )
        fields[field] = 'Selecciona una opción válida.';
    }
    for (const [field, value] of [
      ['fecha', fecha],
      ['fecha_desde', fecha_desde],
      ['fecha_hasta', fecha_hasta],
    ]) {
      if (value !== undefined && !isValidDate(value))
        fields[field] = 'Ingresa una fecha real con formato AAAA-MM-DD.';
    }
    if (fecha !== undefined && (fecha_desde !== undefined || fecha_hasta !== undefined))
      fields.fecha = 'Usa fecha o un rango de fechas, no ambos.';
    if (fecha_desde && fecha_hasta && fecha_desde > fecha_hasta)
      fields.fecha_hasta = 'La fecha de término debe ser igual o posterior al inicio.';
    if (Object.keys(fields).length)
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Revisa los filtros de disponibilidad.',
        fields,
      );
    const params = [];
    const conditions = [
      `a.estado = 'DISPONIBLE'`,
      `m.activo = TRUE`,
      `((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW()`,
      `NOT EXISTS (SELECT 1 FROM bloqueos_agenda ba WHERE ba.fecha = a.fecha AND (ba.medico_id IS NULL OR ba.medico_id = a.medico_id))`,
    ];

    if (especialidad_id) {
      params.push(Number(especialidad_id));
      conditions.push(`m.especialidad_id = $${params.length}`);
    }

    if (medico_id) {
      params.push(Number(medico_id));
      conditions.push(`a.medico_id = $${params.length}`);
    }

    if (fecha) {
      params.push(fecha);
      conditions.push(`a.fecha = $${params.length}::DATE`);
    } else {
      const desde =
        fecha_desde ||
        new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
      params.push(desde);
      conditions.push(`a.fecha >= $${params.length}::DATE`);

      if (fecha_hasta) {
        params.push(fecha_hasta);
        conditions.push(`a.fecha <= $${params.length}::DATE`);
      }
    }

    const sql = `
      SELECT
        a.id AS agenda_id,
        a.medico_id,
        m.nombre AS medico_nombre,
        m.rut AS medico_rut,
        m.box_atencion,
        e.id AS especialidad_id,
        e.nombre AS especialidad_nombre,
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
        TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
        a.duracion_min,
        a.estado
      FROM agendas a
      INNER JOIN medicos m ON m.id = a.medico_id
      INNER JOIN especialidades e ON e.id = m.especialidad_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.fecha ASC, a.hora_inicio ASC, m.nombre ASC
    `;

    const result = await pool.query(sql, params);
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;

    res.json({
      ok: true,
      jira: 'MED-9',
      requisito: 'RF-01 (CU-01: A-01, A-02)',
      latencia_ms: Number(elapsedMs.toFixed(2)),
      cumple_umbral_2s: elapsedMs < 2000,
      total_cupos_libres: result.rows.length,
      bloques: result.rows,
    });
  }),
);

module.exports = router;
