const express = require('express');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { queryAuditLogs } = require('../services/auditoria');

const router = express.Router();

/**
 * GET /api/secretaria/auditoria
 * MED-27: Consulta de bitácora persistente de acciones de secretaría
 * Permite filtrar por secretaría, rango de fechas, acción y tipo de entidad.
 */
router.get(
  '/secretaria/auditoria',
  requireSecretary,
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');

    const database = req.app.locals.database || pool;
    const { secretaria_id, fecha_desde, fecha_hasta, accion, entidad_tipo, limit, offset } =
      req.query;

    const result = await queryAuditLogs(database, {
      secretaria_id,
      fecha_desde,
      fecha_hasta,
      accion,
      entidad_tipo,
      limit,
      offset,
    });

    return res.json({
      ok: true,
      jira: 'MED-27',
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      secretarias: result.secretarias,
      registros: result.registros,
    });
  }),
);

module.exports = router;
