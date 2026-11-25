const express = require('express');
const crypto = require('node:crypto');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { asyncHandler, sendError, HttpError } = require('../middleware/errors');
const { parseReservation, parseReservationManagement } = require('../schemas/inputs');
const { withTransaction } = require('../db/transaction');
const { createReservation } = require('../services/reservas');
const { manageReservation } = require('../services/gestionar-reserva');
const {
  requestBookingVerification,
  verifyBookingCode,
  requestLookupVerification,
  verifyLookupCode,
  searchRecoveryAppointments,
  createRecoveryRequest,
  revokeRecoveryRequest,
  confirmRecoveryCode,
} = require('../services/verificacion-correo');
const { processNotificationQueue } = require('../notifications/queue');
const { processVerificationQueue } = require('../notifications/verification-worker');

const router = express.Router();

function setPrivateNoStoreHeaders(res) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
}

function triggerNotifications(req) {
  const worker = req?.app?.locals?.notificationWorker || processNotificationQueue;
  setImmediate(() => {
    worker().catch((error) => {
      console.error('[Notificaciones] Error en despacho inmediato:', error.message);
    });
  });
}

function triggerVerificationEmails(req) {
  const worker = req?.app?.locals?.verificationWorker || processVerificationQueue;
  setImmediate(() => {
    worker().catch((error) => {
      console.error('[Verificación] Error en despacho inmediato:', error.message);
    });
  });
}

function handleVerificationError(res, error) {
  if (error instanceof HttpError && error.code === 'INVALID_RUT') {
    return sendError(res, 400, 'INVALID_RUT', error.message, error.fields, 'RUT_INVALIDO');
  }
  throw error;
}

router.post(
  '/reservas/verificacion-correo/solicitudes',
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    try {
      const result = await requestBookingVerification({
        database,
        rut: req.body?.rut,
        correo: req.body?.correo,
        clientIp: req.ip,
      });
      triggerVerificationEmails(req);
      return res.status(202).json({ ok: true, jira: 'MED-29', ...result });
    } catch (error) {
      return handleVerificationError(res, error);
    }
  }),
);

router.post(
  '/reservas/verificacion-correo/verificar',
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    const result = await verifyBookingCode({
      database,
      solicitudId: req.body?.solicitud_id,
      codigo: req.body?.codigo,
    });
    return res.json({
      ok: true,
      jira: 'MED-29',
      autorizacion_reserva: result.autorizacion_reserva,
      expira_en: result.expira_en,
      rut: result.rut,
      correo: result.correo,
    });
  }),
);

router.post(
  '/reservas/mis-citas/solicitudes',
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    try {
      const result = await requestLookupVerification({
        database,
        rut: req.body?.rut,
        correo: req.body?.correo,
        clientIp: req.ip,
      });
      if (result._enqueued) triggerVerificationEmails(req);
      return res.status(202).json({
        ok: true,
        jira: 'MED-29',
        solicitud_id: result.solicitud_id,
        expira_en: result.expira_en,
        reenvio_disponible_en: result.reenvio_disponible_en,
        mensaje: result.mensaje,
      });
    } catch (error) {
      return handleVerificationError(res, error);
    }
  }),
);

router.post(
  '/reservas/mis-citas/verificar',
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    const { rut, citas } = await verifyLookupCode({
      database,
      solicitudId: req.body?.solicitud_id,
      codigo: req.body?.codigo,
    });
    return res.json({
      ok: true,
      jira: 'MED-29',
      rut,
      total: citas.length,
      citas,
    });
  }),
);

router.post(
  '/reservas/mis-citas/recuperacion/confirmar',
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    const result = await confirmRecoveryCode({
      database,
      solicitudId: req.body?.solicitud_id,
      codigo: req.body?.codigo,
    });
    return res.json({ ok: true, jira: 'MED-29', ...result });
  }),
);

router.post(
  '/secretaria/recuperacion-citas/buscar',
  requireSecretary,
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    try {
      const result = await searchRecoveryAppointments({
        database,
        rut: req.body?.rut,
      });
      return res.json({ ok: true, jira: 'MED-29', ...result });
    } catch (error) {
      return handleVerificationError(res, error);
    }
  }),
);

router.post(
  '/secretaria/recuperacion-citas/solicitudes',
  requireSecretary,
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    try {
      const result = await createRecoveryRequest({
        database,
        rut: req.body?.rut,
        correoDestino: req.body?.correo_destino,
        citasIds: req.body?.citas_ids,
        motivo: req.body?.motivo,
        secretary: req.secretary,
      });
      triggerVerificationEmails(req);
      return res.status(202).json({ ok: true, jira: 'MED-29', ...result });
    } catch (error) {
      return handleVerificationError(res, error);
    }
  }),
);

router.post(
  '/secretaria/recuperacion-citas/solicitudes/:id/revocar',
  requireSecretary,
  asyncHandler(async (req, res) => {
    setPrivateNoStoreHeaders(res);
    const database = req.app.locals.database || pool;
    const result = await revokeRecoveryRequest({
      database,
      solicitudId: req.params.id,
      secretary: req.secretary,
    });
    return res.json({ ok: true, jira: 'MED-29', ...result });
  }),
);

router.get(
  '/reservas',
  requireSecretary,
  asyncHandler(async (_req, res) => {
    const result = await pool.query(`
    SELECT c.id, c.codigo_reserva, c.agenda_id, c.paciente_rut, c.paciente_nombre,
      c.paciente_email, c.paciente_telefono, c.estado, c.asistencia_estado, c.correo_enviado, c.created_at,
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
    triggerNotifications(req);
    return res.json(response);
  }),
);

router.post(
  '/reservas/:id/gestionar',
  requireSecretary,
  asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica una cita válida.', {
        id: 'Indica una cita válida.',
      });
    }
    const reservationId = Number(req.params.id);
    if (!Number.isSafeInteger(reservationId) || reservationId <= 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica una cita válida.', {
        id: 'Indica una cita válida.',
      });
    }

    const parsed = parseReservationManagement(req.body);
    if (Object.keys(parsed.errors).length) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Revisa los datos de la cancelación o reprogramación.',
        parsed.errors,
      );
    }

    const database = req.app.locals.database || pool;
    const result = await manageReservation({
      database,
      reservationId,
      action: parsed.value.action,
      agendaId: parsed.value.agendaId,
      motivo: parsed.value.motivo,
      secretary: req.secretary,
    });
    triggerNotifications(req);
    return res.json(result);
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
    const database = req.app.locals.database || pool;
    const result = await createReservation({
      database,
      values: parsed.value,
      secretary: req.secretary,
    });
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
    triggerNotifications(req);
    if (result.repeated) {
      return res.status(200).json({ ...result.response, repetida: true });
    }
    return res.status(201).json({ ...result.response, latencia_ms: Number(elapsedMs.toFixed(2)) });
  }),
);

module.exports = router;
