const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { validateRut } = require('../utils/rutValidator');
const { enqueueConfirmationEmail } = require('../notifications/queue');
const { requireSecretary } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { parseReservation } = require('../schemas/inputs');
const { withTransaction } = require('../db/transaction');

const router = express.Router();

/**
 * GET /api/reservas
 * Lista las reservas confirmadas y los correos de confirmación emitidos (A-05)
 */
router.get('/reservas', requireSecretary, asyncHandler(async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.codigo_reserva,
        c.agenda_id,
        c.paciente_rut,
        c.paciente_nombre,
        c.paciente_email,
        c.paciente_telefono,
        c.estado,
        c.correo_enviado,
        c.created_at,
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
        TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
        m.nombre AS medico_nombre,
        m.box_atencion,
        e.nombre AS especialidad_nombre
      FROM citas_medicas c
      INNER JOIN agendas a ON a.id = c.agenda_id
      INNER JOIN medicos m ON m.id = c.medico_id
      INNER JOIN especialidades e ON e.id = m.especialidad_id
      ORDER BY c.created_at DESC
      LIMIT 50
    `);

    const notifications = await pool.query(`
      SELECT id, cita_id, canal, tipo, estado, proveedor, intentos, error, programado_en, enviado_en
      FROM notificaciones ORDER BY creado_en DESC LIMIT 20
    `);
    res.json({
      ok: true,
      total: result.rows.length,
      reservas: result.rows,
      notificaciones_recientes: notifications.rows,
    });
  } catch (err) {
    throw err;
  }
}));

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
    [tokenHash]
  );
  return result.rows[0] || null;
}

router.get('/citas/responder', asyncHandler(async (req, res) => {
  const token = String(req.query?.token || '');
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return res.status(400).json({ ok: false, error: 'El enlace no es válido.' });
  }
  try {
    const cita = await readAppointmentResponseDetails(token);
    if (!cita) return res.status(404).json({ ok: false, error: 'El enlace expiró o ya no es válido.' });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, cita });
  } catch {
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'No pudimos cargar el detalle de la cita.');
  }
}));

router.post('/citas/responder', asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '');
  const action = String(req.body?.accion || '').toUpperCase();
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token) || !['CONFIRMAR', 'CANCELAR'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'Token o acción inválida.' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const response = await withTransaction(pool, async (client) => {
    const found = await client.query(
      `SELECT id, agenda_id, estado, asistencia_estado FROM citas_medicas
       WHERE token_respuesta_hash=$1 AND token_respuesta_expira > NOW() FOR UPDATE`, [tokenHash]
    );
    if (!found.rowCount) {
      throw new HttpError(404, 'RESPONSE_LINK_NOT_FOUND', 'El enlace expiró o ya no es válido.');
    }
    const cita = found.rows[0];
    if (cita.estado === 'CANCELADA') {
      throw new HttpError(409, 'APPOINTMENT_CANCELLED', 'La cita ya fue cancelada.');
    }
    if (action === 'CANCELAR') {
      await client.query("UPDATE citas_medicas SET estado='CANCELADA', asistencia_estado='CANCELADA', token_respuesta_hash=NULL WHERE id=$1", [cita.id]);
      await client.query("UPDATE agendas SET estado='DISPONIBLE', updated_at=NOW() WHERE id=$1 AND estado='RESERVADO'", [cita.agenda_id]);
      await client.query("UPDATE notificaciones SET estado='OMITIDA' WHERE cita_id=$1 AND tipo='RECORDATORIO' AND estado='PENDIENTE'", [cita.id]);
    } else {
      await client.query("UPDATE citas_medicas SET asistencia_estado='ASISTIRA', token_respuesta_hash=NULL WHERE id=$1", [cita.id]);
    }
    return { ok: true, estado: action === 'CANCELAR' ? 'CANCELADA' : 'ASISTIRA' };
    });
    return res.json(response);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'No fue posible actualizar la cita.');
  }
}));

/**
 * POST /api/reservas
 * MED-11 (RF-02 / HU03 / CU-02: Actividades A-03, A-04, A-05, A-06)
 * MED-16 (RNF-01 / Riesgo R01): Bloqueo pesimista a nivel de fila (SELECT ... FOR UPDATE)
 * y aislamiento transaccional en PostgreSQL para garantizar 0% de overbooking.
 */
router.post('/reservas', (req, res, next) => {
  if (['PRESENCIAL', 'TELEFONO'].includes(req.body?.origen)) return requireSecretary(req, res, next);
  next();
}, asyncHandler(async (req, res) => {
  const startHr = process.hrtime.bigint();
  const parsed = parseReservation(req.body, (req.get('Idempotency-Key') || '').trim());
  if (Object.keys(parsed.errors).length) {
    return res.status(400).json({
      ok: false,
      jira: 'MED-11',
      codigo_error: parsed.errors.paciente_rut ? 'RUT_INVALIDO' : 'DATOS_INVALIDOS',
      code: 'VALIDATION_ERROR',
      error: 'Revisa los datos de la reserva.',
      mensaje: 'Revisa los datos de la reserva.',
      fields: parsed.errors,
    });
  }
  const { agendaId: agenda_id, rut: paciente_rut, nombre: paciente_nombre, email: paciente_email, telefono: paciente_telefono, origen: source, requestKey } = parsed.value;

  // 2. Actividad A-04: Validación algorítmica de RUT chileno (Módulo 11)
  const rutValidation = validateRut(paciente_rut);
  if (!rutValidation.valid) {
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
    return res.status(400).json({
      ok: false,
      jira: 'MED-11',
      criterio: 'CA-01 Conflicto / Superposición o RUT inválido',
      actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
      codigo_error: 'RUT_INVALIDO',
      latencia_ms: Number(elapsedMs.toFixed(2)),
      mensaje: `Reserva rechazada (A-06): ${rutValidation.reason}`,
    });
  }

  // 3. Actividad A-04 y MED-16: Transacción con Bloqueo Pesimista (SELECT ... FOR UPDATE)
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const target = await client.query('SELECT medico_id FROM agendas WHERE id=$1', [Number(agenda_id)]);
    if (!target.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, codigo_error: 'BLOQUE_NO_EXISTE', mensaje: 'El bloque horario seleccionado no existe.' });
    }
    // Las operaciones de configuración y reserva toman primero el bloqueo del médico
    // para mantener un orden común y evitar interbloqueos.
    await client.query('SELECT id FROM medicos WHERE id=$1 FOR UPDATE', [target.rows[0].medico_id]);

    // Bloquea la fila específica en la tabla agendas hasta que termine esta transacción (COMMIT/ROLLBACK)
    const lockQuery = await client.query(
      `
      SELECT
        a.id,
        a.medico_id,
        a.estado,
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
        TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
        m.nombre AS medico_nombre,
        m.box_atencion,
        e.nombre AS especialidad_nombre,
        m.activo
      FROM agendas a
      INNER JOIN medicos m ON m.id = a.medico_id
      INNER JOIN especialidades e ON e.id = m.especialidad_id
      WHERE a.id = $1
      FOR UPDATE OF a
      `,
      [Number(agenda_id)]
    );

    if (lockQuery.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        jira: 'MED-11',
        actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
        codigo_error: 'BLOQUE_NO_EXISTE',
        mensaje: 'El bloque horario seleccionado no existe en la agenda médica.',
      });
    }

    const bloque = lockQuery.rows[0];

    // Serializar reservas del mismo profesional y evitar reservar cualquier parte
    // de otro intervalo ya tomado, incluso si se cargaron datos históricos solapados.
    if (!bloque.activo || bloque.fecha < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, codigo_error: 'BLOQUE_NO_RESERVABLE', mensaje: 'El profesional o el horario ya no está disponible.' });
    }

    if (requestKey) {
      const previous = await client.query('SELECT id, codigo_reserva, agenda_id FROM citas_medicas WHERE solicitud_id = $1', [requestKey]);
      if (previous.rowCount) {
        await client.query('ROLLBACK');
        return res.status(200).json({ ok: true, repetida: true, reserva: previous.rows[0] });
      }
    }

    const conflicting = await client.query(
      `SELECT id FROM agendas
       WHERE medico_id = $1 AND fecha = $2::date AND id <> $3
         AND estado = 'RESERVADO'
         AND hora_inicio < $5::time AND hora_fin > $4::time
       LIMIT 1`,
      [bloque.medico_id, bloque.fecha, bloque.id, bloque.hora_inicio, bloque.hora_fin]
    );
    if (conflicting.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, codigo_error: 'BLOQUE_SUPERPUESTO', mensaje: 'El horario se superpone con otra cita reservada.' });
    }

    // Compuerta Exclusiva BPMN (X): ¿RUT válido y cupo disponible? -> Rama "No" (A-06)
    if (bloque.estado !== 'DISPONIBLE') {
      await client.query('ROLLBACK');
      const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      return res.status(409).json({
        ok: false,
        jira: 'MED-11 / MED-16',
        criterio: 'CA-01 Conflicto / Superposición o RUT inválido',
        actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
        codigo_error: 'CUPO_OCUPADO_CONCURRENCIA',
        estado_actual_cupo: bloque.estado,
        latencia_ms: Number(elapsedMs.toFixed(2)),
        mensaje: `Reserva rechazada (A-06): El bloque de ${bloque.hora_inicio} a ${bloque.hora_fin} con ${bloque.medico_nombre} ya fue ${bloque.estado.toLowerCase()}. Por favor, seleccione un nuevo horario disponible.`,
      });
    }

    // Compuerta Exclusiva BPMN (X): Rama "Sí" (A-05 Registrar reserva y enviar confirmación)
    await client.query(
      `
      UPDATE agendas
      SET estado = 'RESERVADO', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [bloque.id]
    );

    const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const codigoReserva = `MED-2026-${uniqueSuffix}`;
    const responseToken = crypto.randomBytes(32).toString('base64url');
    const responseTokenHash = crypto.createHash('sha256').update(responseToken).digest('hex');
    const responseUrl = `${process.env.PUBLIC_WEB_URL || 'http://localhost:5173'}/?cita_token=${responseToken}`;

    const insertCita = await client.query(
      `
      INSERT INTO citas_medicas (
        codigo_reserva,
        agenda_id,
        medico_id,
        paciente_rut,
        paciente_nombre,
        paciente_email,
        paciente_telefono,
        estado,
        correo_enviado,
        origen,
        solicitud_id,
        token_respuesta_hash,
        token_respuesta_expira,
        reminder_programado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMADA', FALSE, $8, $9, $10, NOW() + INTERVAL '30 days',
        ((($11::date + $12::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours'))
      RETURNING id, codigo_reserva, created_at
      `,
      [
        codigoReserva,
        bloque.id,
        bloque.medico_id,
        rutValidation.formatted,
        paciente_nombre.trim(),
        paciente_email.trim(),
        paciente_telefono.trim(),
        source,
        requestKey || null,
        responseTokenHash,
        bloque.fecha,
        bloque.hora_inicio,
      ]
    );

    // Registrar el correo en la misma transacción; un reinicio no pierde la cola.
    const emailComprobante = await enqueueConfirmationEmail({
      client,
      codigoReserva,
      pacienteNombre: paciente_nombre.trim(),
      pacienteRut: rutValidation.formatted,
      pacienteEmail: paciente_email.trim(),
      medicoNombre: bloque.medico_nombre,
      especialidadNombre: bloque.especialidad_nombre,
      boxAtencion: bloque.box_atencion,
      fecha: bloque.fecha,
      horaInicio: bloque.hora_inicio,
      horaFin: bloque.hora_fin,
    });
    const reminderText = `Medisalud: recuerda tu cita con ${bloque.medico_nombre} el ${bloque.fecha} a las ${bloque.hora_inicio}. Confirma o cancela aquí: ${responseUrl}`;
    for (const [channel, recipient, subject] of [
      ['EMAIL', paciente_email.trim(), 'Recordatorio de cita — Medisalud'],
      ['WHATSAPP', paciente_telefono.trim(), null],
    ]) {
      await client.query(
        `INSERT INTO notificaciones (cita_id, canal, tipo, destinatario, asunto, contenido, programado_en, estado)
         VALUES ($1, $2, 'RECORDATORIO', $3, $4, $5,
           ((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours'),
           CASE WHEN ((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours') <= NOW()
             THEN 'OMITIDA' ELSE 'PENDIENTE' END)
         ON CONFLICT (cita_id, canal, tipo) DO NOTHING`,
        [insertCita.rows[0].id, channel, recipient, subject, reminderText, bloque.fecha, bloque.hora_inicio]
      );
    }
    await client.query('COMMIT');

    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;

    return res.status(201).json({
      ok: true,
      jira: 'MED-11 / MED-16',
      criterio: 'CA-02 Sin conflicto (Recorrido exitoso)',
      actividad_bpmn: 'A-05 Registrar reserva y enviar confirmación',
      latencia_ms: Number(elapsedMs.toFixed(2)),
      mensaje: `Reserva confirmada exitosamente con código ${codigoReserva}. El comprobante quedó en cola de envío.`,
      reserva: {
        id: insertCita.rows[0].id,
        codigo_reserva: codigoReserva,
        agenda_id: bloque.id,
        paciente_rut: rutValidation.formatted,
        paciente_nombre: paciente_nombre.trim(),
        paciente_email: paciente_email.trim(),
        paciente_telefono: paciente_telefono.trim(),
        especialidad_nombre: bloque.especialidad_nombre,
        medico_nombre: bloque.medico_nombre,
        box_atencion: bloque.box_atencion,
        fecha: bloque.fecha,
        hora_inicio: bloque.hora_inicio,
        hora_fin: bloque.hora_fin,
        created_at: insertCita.rows[0].created_at,
      },
      comprobante_correo: emailComprobante,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;

    // Manejo de colisión por índice UNIQUE o serialización en PostgreSQL
    if (err.code === '23505' || err.code === '40001') {
      return res.status(409).json({
        ok: false,
        jira: 'MED-16',
        actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
        codigo_error: 'COLISION_TRANSACCIONAL',
        latencia_ms: Number(elapsedMs.toFixed(2)),
        mensaje: 'El bloque horario fue reservado simultáneamente por otro usuario. Por favor seleccione otro horario.',
      });
    }

    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
