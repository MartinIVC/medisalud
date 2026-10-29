const crypto = require('node:crypto');
const { pool: defaultPool } = require('../db');
const { withTransaction } = require('../db/transaction');
const { HttpError } = require('../middleware/errors');
const { enqueueConfirmationEmail } = require('../notifications/queue');

async function createReservation({
  database = defaultPool,
  values,
  publicWebUrl = process.env.PUBLIC_WEB_URL || 'http://localhost:5173',
  enqueueConfirmation = enqueueConfirmationEmail,
  randomBytes = crypto.randomBytes,
}) {
  try {
    return await withTransaction(database, async (client) => {
      const target = await client.query('SELECT medico_id FROM agendas WHERE id=$1', [values.agendaId]);
      if (!target.rowCount) throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario seleccionado no existe.');

      // Reservas, bloqueos y configuración bloquean primero al médico y después sus bloques.
      const doctor = await client.query('SELECT id, activo FROM medicos WHERE id=$1 FOR UPDATE', [target.rows[0].medico_id]);
      if (!doctor.rowCount) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'El profesional seleccionado ya no existe.');

      const slotResult = await client.query(
        `SELECT a.id, a.medico_id, a.estado,
                TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
                TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
                TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
                m.nombre AS medico_nombre, m.box_atencion,
                e.nombre AS especialidad_nombre,
                m.activo,
                ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW() AS futuro,
                EXISTS (
                  SELECT 1 FROM bloqueos_agenda ba
                  WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
                ) AS bloqueado
         FROM agendas a
         INNER JOIN medicos m ON m.id=a.medico_id
         INNER JOIN especialidades e ON e.id=m.especialidad_id
         WHERE a.id=$1
         FOR UPDATE OF a`,
        [values.agendaId]
      );
      if (!slotResult.rowCount) throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario seleccionado no existe en la agenda médica.');
      const slot = slotResult.rows[0];

      if (values.requestKey) {
        const previous = await client.query(
          `SELECT id, codigo_reserva, agenda_id
           FROM citas_medicas WHERE solicitud_id=$1`,
          [values.requestKey]
        );
        if (previous.rowCount) return { repeated: true, reserva: previous.rows[0] };
      }

      if (!slot.activo || !slot.futuro || slot.bloqueado) {
        throw new HttpError(409, 'SLOT_NOT_BOOKABLE', 'El profesional o el horario ya no está disponible.');
      }

      const conflicting = await client.query(
        `SELECT id FROM agendas
         WHERE medico_id=$1 AND fecha=$2::date AND id<>$3
           AND estado='RESERVADO' AND hora_inicio < $5::time AND hora_fin > $4::time
         LIMIT 1`,
        [slot.medico_id, slot.fecha, slot.id, slot.hora_inicio, slot.hora_fin]
      );
      if (conflicting.rowCount) throw new HttpError(409, 'SLOT_OVERLAP', 'El horario se superpone con otra cita reservada.');

      if (slot.estado !== 'DISPONIBLE') {
        throw new HttpError(409, 'SLOT_TAKEN', `El bloque de ${slot.hora_inicio} a ${slot.hora_fin} ya no está disponible.`);
      }

      const reserved = await client.query(
        `UPDATE agendas SET estado='RESERVADO', updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND estado='DISPONIBLE' RETURNING id`,
        [slot.id]
      );
      if (!reserved.rowCount) throw new HttpError(409, 'SLOT_TAKEN', 'El horario fue reservado por otra persona.');

      const codigoReserva = `MED-${new Date().getFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`;
      const responseToken = randomBytes(32).toString('base64url');
      const responseTokenHash = crypto.createHash('sha256').update(responseToken).digest('hex');
      const responseUrl = `${publicWebUrl}/?cita_token=${responseToken}`;
      const insertCita = await client.query(
        `INSERT INTO citas_medicas (
           codigo_reserva, agenda_id, medico_id, paciente_rut, paciente_nombre,
           paciente_email, paciente_telefono, estado, correo_enviado, origen,
           solicitud_id, token_respuesta_hash, token_respuesta_expira, reminder_programado
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMADA', FALSE, $8, $9, $10,
                   NOW() + INTERVAL '30 days',
                   ((($11::date + $12::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours'))
         RETURNING id, codigo_reserva, created_at`,
        [codigoReserva, slot.id, slot.medico_id, values.rut, values.nombre, values.email, values.telefono,
          values.origen, values.requestKey, responseTokenHash, slot.fecha, slot.hora_inicio]
      );

      const appointment = insertCita.rows[0];
      const emailComprobante = await enqueueConfirmation({
        client,
        codigoReserva,
        pacienteNombre: values.nombre,
        pacienteRut: values.rut,
        pacienteEmail: values.email,
        medicoNombre: slot.medico_nombre,
        especialidadNombre: slot.especialidad_nombre,
        boxAtencion: slot.box_atencion,
        fecha: slot.fecha,
        horaInicio: slot.hora_inicio,
        horaFin: slot.hora_fin,
      });

      const reminderText = `Medisalud: recuerda tu cita con ${slot.medico_nombre} el ${slot.fecha} a las ${slot.hora_inicio}. Confirma o cancela aquí: ${responseUrl}`;
      for (const [channel, recipient, subject] of [
        ['EMAIL', values.email, 'Recordatorio de cita — Medisalud'],
        ['WHATSAPP', values.telefono, null],
      ]) {
        await client.query(
          `INSERT INTO notificaciones (cita_id, canal, tipo, destinatario, asunto, contenido, programado_en, estado)
           VALUES ($1, $2, 'RECORDATORIO', $3, $4, $5,
             ((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours'),
             CASE WHEN ((($6::date + $7::time) AT TIME ZONE 'America/Santiago') - INTERVAL '24 hours') <= NOW()
               THEN 'OMITIDA' ELSE 'PENDIENTE' END)
           ON CONFLICT (cita_id, canal, tipo) DO NOTHING`,
          [appointment.id, channel, recipient, subject, reminderText, slot.fecha, slot.hora_inicio]
        );
      }

      return {
        repeated: false,
        reserva: {
          id: appointment.id,
          codigo_reserva: codigoReserva,
          agenda_id: slot.id,
          paciente_rut: values.rut,
          paciente_nombre: values.nombre,
          paciente_email: values.email,
          paciente_telefono: values.telefono,
          especialidad_nombre: slot.especialidad_nombre,
          medico_nombre: slot.medico_nombre,
          box_atencion: slot.box_atencion,
          fecha: slot.fecha,
          hora_inicio: slot.hora_inicio,
          hora_fin: slot.hora_fin,
          created_at: appointment.created_at,
        },
        emailComprobante,
      };
    });
  } catch (error) {
    if (error.code === '40001') throw new HttpError(409, 'CONCURRENT_RESERVATION', 'El horario cambió durante la reserva. Selecciona otro horario.');
    if (error.code === '23505') throw new HttpError(409, 'CONCURRENT_RESERVATION', 'El horario fue reservado por otra persona. Selecciona otro horario.');
    throw error;
  }
}

module.exports = { createReservation };
