const crypto = require('node:crypto');
const { pool: defaultPool } = require('../db');
const { withTransaction } = require('../db/transaction');
const { HttpError } = require('../middleware/errors');
const { buildCancellationNotice, buildRescheduleNotice } = require('../notifications/templates');

function isEmailProviderConfigured(env = process.env) {
  return Boolean((env.SENDGRID_API_KEY && env.SENDGRID_FROM) || env.SMTP_HOST);
}

function responseLink(publicWebUrl, token) {
  return `${publicWebUrl.replace(/\/$/, '')}/?cita_token=${token}`;
}

async function enqueueEmail(client, { citaId, tipo, message }) {
  await client.query(
    `INSERT INTO notificaciones
       (cita_id, canal, tipo, destinatario, asunto, contenido, estado)
     VALUES ($1, 'EMAIL', $2, $3, $4, $5, 'PENDIENTE')`,
    [citaId, tipo, message.to, message.subject, message.text],
  );
}

async function releaseReservedSlot(client, agendaId) {
  const released = await client.query(
    `UPDATE agendas a
     SET estado=CASE WHEN EXISTS (
           SELECT 1 FROM bloqueos_agenda ba
           WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
         ) THEN 'BLOQUEADO' ELSE 'DISPONIBLE' END,
         motivo_bloqueo=(SELECT ba.motivo FROM bloqueos_agenda ba
           WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
           ORDER BY ba.medico_id NULLS FIRST LIMIT 1),
         updated_at=NOW()
     WHERE a.id=$1 AND a.estado='RESERVADO'
     RETURNING a.id`,
    [agendaId],
  );
  if (!released.rowCount) {
    throw new HttpError(
      409,
      'APPOINTMENT_SLOT_CHANGED',
      'El horario de la cita cambió. Actualiza la agenda e inténtalo nuevamente.',
    );
  }
}

async function omitObsoleteNotifications(client, citaId, types) {
  await client.query(
    `UPDATE notificaciones
     SET estado='OMITIDA', claim_token=NULL, claimed_at=NULL, lease_until=NULL,
         reintentar_en=NULL
     WHERE cita_id=$1 AND tipo=ANY($2::varchar[])
       AND estado IN ('PENDIENTE','FALLIDA','ENVIANDO')`,
    [citaId, types],
  );
}

async function refreshReminderNotifications(client, {
  citaId,
  email,
  telefono,
  text,
  fecha,
  horaInicio,
}) {
  const channels = [
    { canal: 'EMAIL', asunto: 'Recordatorio de cita — Medisalud' },
    { canal: 'WHATSAPP', asunto: null },
  ];

  for (const { canal, asunto } of channels) {
    const updated = await client.query(
      `UPDATE notificaciones
       SET destinatario=$3, asunto=$4, contenido=$5,
           programado_en=((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours'),
           estado=CASE
             WHEN ((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours') <= NOW()
               THEN 'OMITIDA' ELSE 'PENDIENTE' END,
           intentos=0, error=NULL, proveedor=NULL, proveedor_id=NULL,
           reintentar_en=NULL, enviado_en=NULL, claim_token=NULL, claimed_at=NULL, lease_until=NULL
       WHERE cita_id=$1 AND canal=$2 AND tipo='RECORDATORIO'
       RETURNING id`,
      [citaId, canal, canal === 'EMAIL' ? email : telefono, asunto, text, fecha, horaInicio],
    );
    if (updated.rowCount) continue;

    await client.query(
      `INSERT INTO notificaciones
         (cita_id, canal, tipo, destinatario, asunto, contenido, programado_en, estado)
       VALUES ($1, $2, 'RECORDATORIO', $3, $4, $5,
         ((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours'),
         CASE
           WHEN ((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours') <= NOW()
             THEN 'OMITIDA' ELSE 'PENDIENTE' END)
       ON CONFLICT DO NOTHING`,
      [citaId, canal, canal === 'EMAIL' ? email : telefono, asunto, text, fecha, horaInicio],
    );
  }
}

async function manageReservation({
  database = defaultPool,
  reservationId,
  action,
  agendaId,
  motivo,
  publicWebUrl = process.env.PUBLIC_WEB_URL || 'http://localhost:5173',
  randomBytes = crypto.randomBytes,
}) {
  if (!['CANCELAR', 'MOVER'].includes(action)) {
    throw new HttpError(400, 'INVALID_APPOINTMENT_ACTION', 'La acción solicitada no es válida.');
  }

  const reason = String(motivo || '').trim();
  if (!reason || reason.length > 255) {
    throw new HttpError(400, 'INVALID_APPOINTMENT_REASON', 'Indica un motivo de hasta 255 caracteres.');
  }

  return withTransaction(database, async (client) => {
    const candidate = await client.query(
      'SELECT id, agenda_id, medico_id FROM citas_medicas WHERE id=$1',
      [reservationId],
    );
    if (!candidate.rowCount)
      throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'La cita ya no existe.');

    const targetCandidate =
      action === 'MOVER'
        ? await client.query('SELECT medico_id FROM agendas WHERE id=$1', [agendaId])
        : null;
    if (targetCandidate && !targetCandidate.rowCount) {
      throw new HttpError(404, 'TARGET_SLOT_NOT_FOUND', 'El nuevo horario ya no existe.');
    }

    const initialAppointment = candidate.rows[0];
    const doctorIds = [initialAppointment.medico_id, targetCandidate?.rows[0]?.medico_id]
      .filter((id) => id !== undefined && id !== null)
      .map(Number);
    const uniqueDoctorIds = [...new Set(doctorIds)].sort((a, b) => a - b);
    const doctors = await client.query(
      'SELECT id FROM medicos WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',
      [uniqueDoctorIds],
    );
    if (doctors.rowCount !== uniqueDoctorIds.length) {
      throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Un profesional de la cita ya no existe.');
    }

    const found = await client.query(
      `SELECT c.id, c.codigo_reserva, c.agenda_id, c.medico_id, c.estado,
              c.paciente_nombre, c.paciente_email, c.paciente_telefono,
              TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
              TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
              TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
              m.nombre AS medico_nombre,
              ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW() AS futuro
       FROM citas_medicas c
       JOIN agendas a ON a.id=c.agenda_id
       JOIN medicos m ON m.id=c.medico_id
       WHERE c.id=$1
       FOR UPDATE OF c`,
      [reservationId],
    );
    if (!found.rowCount)
      throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'La cita ya no existe.');
    const appointment = found.rows[0];

    if (
      Number(appointment.medico_id) !== Number(initialAppointment.medico_id) ||
      Number(appointment.agenda_id) !== Number(initialAppointment.agenda_id)
    ) {
      throw new HttpError(
        409,
        'APPOINTMENT_CHANGED',
        'La cita cambió mientras se procesaba. Actualiza la agenda e inténtalo nuevamente.',
      );
    }
    if (appointment.estado !== 'CONFIRMADA') {
      throw new HttpError(409, 'APPOINTMENT_NOT_ACTIVE', 'La cita ya fue cancelada o modificada.');
    }
    if (!appointment.futuro) {
      throw new HttpError(409, 'APPOINTMENT_PAST', 'No se pueden modificar citas que ya comenzaron.');
    }
    if (!appointment.paciente_email) {
      throw new HttpError(409, 'PATIENT_EMAIL_MISSING', 'La cita no tiene un correo para avisar al paciente.');
    }

    if (action === 'CANCELAR') {
      await releaseReservedSlot(client, appointment.agenda_id);
      await client.query(
        `UPDATE citas_medicas
         SET estado='CANCELADA', asistencia_estado='CANCELADA',
             token_respuesta_hash=NULL, token_respuesta_expira=NULL, reminder_programado=NULL
         WHERE id=$1`,
        [reservationId],
      );
      await omitObsoleteNotifications(client, reservationId, [
        'CONFIRMACION',
        'RECORDATORIO',
        'REPROGRAMACION',
      ]);

      const message = buildCancellationNotice({
        pacienteNombre: appointment.paciente_nombre,
        pacienteEmail: appointment.paciente_email,
        codigoReserva: appointment.codigo_reserva,
        fecha: appointment.fecha,
        horaInicio: appointment.hora_inicio,
        horaFin: appointment.hora_fin,
        motivo: reason,
        publicWebUrl: publicWebUrl.replace(/\/$/, ''),
      });
      await enqueueEmail(client, {
        citaId: reservationId,
        tipo: 'CANCELACION',
        message,
      });
      return {
        ok: true,
        estado: 'CANCELADA',
        codigo_reserva: appointment.codigo_reserva,
        correo_aviso: {
          estado: 'PENDIENTE',
          destinatario: appointment.paciente_email,
          proveedor_configurado: isEmailProviderConfigured(),
        },
        mensaje: isEmailProviderConfigured()
          ? `La cita ${appointment.codigo_reserva} fue cancelada. El aviso está en proceso de envío.`
          : `La cita ${appointment.codigo_reserva} fue cancelada. El aviso quedó pendiente: configura SMTP o SendGrid para enviarlo.`,
      };
    }

    if (Number(agendaId) === Number(appointment.agenda_id)) {
      throw new HttpError(400, 'SAME_APPOINTMENT_SLOT', 'Selecciona un horario diferente al actual.');
    }

    const targetResult = await client.query(
      `SELECT a.id, a.medico_id, a.estado,
              TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
              TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
              TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
              m.nombre AS medico_nombre, m.box_atencion, m.activo AS medico_activo,
              ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW() AS futuro,
              EXISTS (
                SELECT 1 FROM bloqueos_agenda ba
                WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
              ) AS bloqueado
       FROM agendas a
       JOIN medicos m ON m.id=a.medico_id
       WHERE a.id=$1
       FOR UPDATE OF a`,
      [agendaId],
    );
    if (!targetResult.rowCount)
      throw new HttpError(404, 'TARGET_SLOT_NOT_FOUND', 'El nuevo horario ya no existe.');
    const target = targetResult.rows[0];
    if (Number(target.medico_id) !== Number(targetCandidate.rows[0].medico_id)) {
      throw new HttpError(409, 'TARGET_SLOT_CHANGED', 'El nuevo horario cambió. Actualiza la agenda.');
    }
    if (
      !target.medico_activo ||
      target.estado !== 'DISPONIBLE' ||
      target.bloqueado ||
      !target.futuro
    ) {
      throw new HttpError(
        409,
        'TARGET_SLOT_UNAVAILABLE',
        'El nuevo horario ya no está disponible. Elige otro bloque.',
      );
    }

    const targetReserved = await client.query(
      `UPDATE agendas SET estado='RESERVADO', updated_at=NOW()
       WHERE id=$1 AND estado='DISPONIBLE' RETURNING id`,
      [agendaId],
    );
    if (!targetReserved.rowCount) {
      throw new HttpError(409, 'TARGET_SLOT_UNAVAILABLE', 'El nuevo horario ya fue tomado.');
    }

    const responseToken = randomBytes(32).toString('base64url');
    const responseTokenHash = crypto.createHash('sha256').update(responseToken).digest('hex');
    await client.query(
      `UPDATE citas_medicas
       SET agenda_id=$2, medico_id=$3, asistencia_estado='PENDIENTE',
           token_respuesta_hash=$4, token_respuesta_expira=NOW() + INTERVAL '30 days',
           reminder_programado=((($5::date + $6::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours')
       WHERE id=$1`,
      [reservationId, agendaId, target.medico_id, responseTokenHash, target.fecha, target.hora_inicio],
    );
    await releaseReservedSlot(client, appointment.agenda_id);
    await omitObsoleteNotifications(client, reservationId, ['CONFIRMACION', 'REPROGRAMACION']);

    const responseUrl = responseLink(publicWebUrl, responseToken);
    const reminderText = `Medisalud: tu cita ${appointment.codigo_reserva} con ${target.medico_nombre} es el ${target.fecha} a las ${target.hora_inicio}. Confirma o cancela aquí: ${responseUrl}`;
    await refreshReminderNotifications(client, {
      citaId: reservationId,
      email: appointment.paciente_email,
      telefono: appointment.paciente_telefono,
      text: reminderText,
      fecha: target.fecha,
      horaInicio: target.hora_inicio,
    });

    const message = buildRescheduleNotice({
      pacienteNombre: appointment.paciente_nombre,
      pacienteEmail: appointment.paciente_email,
      codigoReserva: appointment.codigo_reserva,
      motivo: reason,
      citaAnterior: {
        fecha: appointment.fecha,
        horaInicio: appointment.hora_inicio,
        horaFin: appointment.hora_fin,
        medicoNombre: appointment.medico_nombre,
      },
      citaNueva: {
        fecha: target.fecha,
        horaInicio: target.hora_inicio,
        horaFin: target.hora_fin,
        medicoNombre: target.medico_nombre,
        boxAtencion: target.box_atencion,
      },
      responseUrl,
    });
    await enqueueEmail(client, {
      citaId: reservationId,
      tipo: 'REPROGRAMACION',
      message,
    });

    return {
      ok: true,
      estado: 'CONFIRMADA',
      codigo_reserva: appointment.codigo_reserva,
      agenda_id: Number(agendaId),
      fecha: target.fecha,
      hora_inicio: target.hora_inicio,
      hora_fin: target.hora_fin,
      medico_nombre: target.medico_nombre,
      correo_aviso: {
        estado: 'PENDIENTE',
        destinatario: appointment.paciente_email,
        proveedor_configurado: isEmailProviderConfigured(),
      },
      mensaje: isEmailProviderConfigured()
        ? `La cita ${appointment.codigo_reserva} fue movida. El aviso está en proceso de envío.`
        : `La cita ${appointment.codigo_reserva} fue movida. El aviso quedó pendiente: configura SMTP o SendGrid para enviarlo.`,
    };
  });
}

module.exports = { manageReservation };
