/**
 * MED-11 (RF-02 / Actividad A-05): Despacho automático de confirmación por correo electrónico
 * En ambiente Staging Docker registra el comprobante transaccional y soporta SMTP/SendGrid.
 */

const nodemailer = require('nodemailer');

const sentEmailsLog = [];

async function sendConfirmationEmail({
  codigoReserva,
  pacienteNombre,
  pacienteRut,
  pacienteEmail,
  medicoNombre,
  especialidadNombre,
  boxAtencion,
  fecha,
  horaInicio,
  horaFin,
}) {
  const timestamp = new Date().toISOString();
  const subject = `[Medisalud] Confirmación de Cita Médica — Código ${codigoReserva}`;

  const textBody = [
    `Estimado(a) ${pacienteNombre} (RUT: ${pacienteRut}):`,
    ``,
    `Su reserva de cita médica en Centro Médico Medisalud ha sido CONFIRMADA exitosamente.`,
    ``,
    `DETALLE DE LA RESERVA (A-05):`,
    `- Código Único de Reserva : ${codigoReserva}`,
    `- Especialidad            : ${especialidadNombre}`,
    `- Profesional Médico      : ${medicoNombre}`,
    `- Fecha                   : ${fecha}`,
    `- Bloque Horario          : ${horaInicio} a ${horaFin} hrs`,
    `- Lugar / Box de Atención : ${boxAtencion} (Atención 100% presencial)`,
    ``,
    `Recuerde presentarse 10 minutos antes en recepción para el pago de su bono Fonasa/Isapre o particular.`,
    `Centro Médico Medisalud`,
  ].join('\n');

  const emailRecord = {
    id: sentEmailsLog.length + 1,
    to: pacienteEmail,
    subject,
    codigoReserva,
    pacienteRut,
    medicoNombre,
    especialidadNombre,
    fecha,
    horario: `${horaInicio} - ${horaFin}`,
    body: textBody,
    sentAt: timestamp,
    provider: process.env.SMTP_HOST ? 'SMTP/SendGrid' : 'Staging Transactional Outbox',
    status: 'DELIVERED',
  };

  if (process.env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transporter.sendMail({
      from: '"Centro Médico Medisalud" <no-reply@medisalud.cl>',
      to: pacienteEmail,
      subject,
      text: textBody,
    });
  }

  sentEmailsLog.unshift(emailRecord);
  if (sentEmailsLog.length > 100) {
    sentEmailsLog.pop();
  }

  return emailRecord;
}

function getSentEmails() {
  return sentEmailsLog;
}

module.exports = {
  sendConfirmationEmail,
  getSentEmails,
};
