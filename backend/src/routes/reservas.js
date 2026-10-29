const express = require('express');
const crypto = require('node:crypto');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { asyncHandler, sendError, HttpError } = require('../middleware/errors');
const { parseReservation } = require('../schemas/inputs');
const { withTransaction } = require('../db/transaction');
const { createReservation } = require('../services/reservas');

const router = express.Router();

router.get(
  '/reservas',
  requireSecretary,
  asyncHandler(async (_req, res) => {
    const result = await pool.query(`
    SELECT c.id, c.codigo_reserva, c.agenda_id, c.paciente_rut, c.paciente_nombre,
      c.paciente_email, c.paciente_telefono, c.estado, c.correo_enviado, c.created_at,
      TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
      TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
      TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
      m.nombre AS medico_nombre, m.box_atencion, e.nombre AS especialidad_nombre
    FROM citas_medicas c
    INNER JOIN agendas a ON a.id=c.agenda_id
    INNER JOIN medicos m ON m.id=c.medico_id
    INNER JOIN especialidades e ON e.id=m.especialidad_id
    ORDER BY c.created_at DESC
    LIMIT 50
  `);
    const notifications = await pool.query(`
    SELECT id, cita_id, canal, tipo, estado, proveedor, intentos, error, programado_en, enviado_en
    FROM notificaciones ORDER BY creado_en DESC LIMIT 20
  `);
    return res.json({
      ok: true,
      total: result.rows.length,
      reservas: result.rows,
      notificaciones_recientes: notifications.rows,
    });
  }),
);

async function readAppointmentResponseDetails(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await pool.query(
    `SELECT c.codigo_reserva, c.estado,
       TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
       TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
       TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
       m.nombre AS medico_nombre, e.nombre AS especialidad_nombre, m.box_atencion
     FROM citas_medicas c
     JOIN agendas a ON a.id=c.agenda_id
     JOIN medicos m ON m.id=c.medico_id
     JOIN especialidades e ON e.id=m.especialidad_id
     WHERE c.token_respuesta_hash=$1 AND c.token_respuesta_expira > NOW()`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

router.get(
  '/citas/responder',
  asyncHandler(async (req, res) => {
    const token = typeof req.query?.token === 'string' ? req.query.token : '';
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token))
      throw new HttpError(400, 'INVALID_RESPONSE_LINK', 'El enlace no es válido.');
    const cita = await readAppointmentResponseDetails(token);
    if (!cita)
      throw new HttpError(404, 'RESPONSE_LINK_NOT_FOUND', 'El enlace expiró o ya no es válido.');
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, cita });
  }),
);

router.post(
  '/citas/responder',
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const action = typeof req.body?.accion === 'string' ? req.body.accion.toUpperCase() : '';
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token) || !['CONFIRMAR', 'CANCELAR'].includes(action)) {
      throw new HttpError(400, 'INVALID_RESPONSE_ACTION', 'Token o acción inválida.');
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const response = await withTransaction(pool, async (client) => {
      const candidate = await client.query(
        `SELECT id, medico_id FROM citas_medicas
       WHERE token_respuesta_hash=$1 AND token_respuesta_expira > NOW()`,
        [tokenHash],
      );
      if (!candidate.rowCount)
        throw new HttpError(404, 'RESPONSE_LINK_NOT_FOUND', 'El enlace expiró o ya no es válido.');
      // Mantiene el mismo orden médico → cita → agenda que las operaciones de agenda y reserva.
      await client.query('SELECT id FROM medicos WHERE id=$1 FOR UPDATE', [
        candidate.rows[0].medico_id,
      ]);
      const found = await client.query(
        `SELECT id, agenda_id, estado FROM citas_medicas
       WHERE id=$1 AND token_respuesta_hash=$2 AND token_respuesta_expira > NOW() FOR UPDATE`,
        [candidate.rows[0].id, tokenHash],
      );
      if (!found.rowCount)
        throw new HttpError(404, 'RESPONSE_LINK_NOT_FOUND', 'El enlace expiró o ya no es válido.');
      const cita = found.rows[0];
      if (cita.estado === 'CANCELADA')
        throw new HttpError(409, 'APPOINTMENT_CANCELLED', 'La cita ya fue cancelada.');

      if (action === 'CANCELAR') {
        await client.query(
          "UPDATE citas_medicas SET estado='CANCELADA', asistencia_estado='CANCELADA', token_respuesta_hash=NULL WHERE id=$1",
          [cita.id],
        );
        await client.query(
          `UPDATE agendas a
         SET estado=CASE WHEN EXISTS (
               SELECT 1 FROM bloqueos_agenda ba
               WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
             ) THEN 'BLOQUEADO' ELSE 'DISPONIBLE' END,
             motivo_bloqueo=(SELECT ba.motivo FROM bloqueos_agenda ba
               WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
               ORDER BY ba.medico_id NULLS FIRST LIMIT 1),
             updated_at=NOW()
         WHERE a.id=$1 AND a.estado='RESERVADO'`,
          [cita.agenda_id],
        );
        await client.query(
          "UPDATE notificaciones SET estado='OMITIDA', claim_token=NULL, claimed_at=NULL, lease_until=NULL WHERE cita_id=$1 AND tipo='RECORDATORIO' AND estado IN ('PENDIENTE','FALLIDA')",
          [cita.id],
        );
        return { ok: true, estado: 'CANCELADA' };
      }

      await client.query(
        "UPDATE citas_medicas SET asistencia_estado='ASISTIRA', token_respuesta_hash=NULL WHERE id=$1",
        [cita.id],
      );
      return { ok: true, estado: 'ASISTIRA' };
    });
    return res.json(response);
  }),
);

router.post(
  '/reservas',
  (req, res, next) => {
    if (['PRESENCIAL', 'TELEFONO'].includes(req.body?.origen))
      return requireSecretary(req, res, next);
    return next();
  },
  asyncHandler(async (req, res) => {
    const parsed = parseReservation(req.body, (req.get('Idempotency-Key') || '').trim());
    if (Object.keys(parsed.errors).length) {
      const invalidRut = Boolean(parsed.errors.paciente_rut);
      const message = invalidRut
        ? `Reserva rechazada: ${parsed.errors.paciente_rut}`
        : 'Revisa los datos de la reserva.';
      return sendError(
        res,
        400,
        invalidRut ? 'INVALID_RUT' : 'VALIDATION_ERROR',
        message,
        parsed.errors,
        invalidRut ? 'RUT_INVALIDO' : 'DATOS_INVALIDOS',
      );
    }

    const startHr = process.hrtime.bigint();
    const result = await createReservation({ pool, values: parsed.value });
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
    if (result.repeated) {
      return res.status(200).json({ ...result.response, repetida: true });
    }
    return res.status(201).json({ ...result.response, latencia_ms: Number(elapsedMs.toFixed(2)) });
  }),
);

module.exports = router;
