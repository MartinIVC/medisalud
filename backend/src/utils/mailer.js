const { pool } = require('../db');

function buildConfirmation({ codigoReserva, pacienteNombre, pacienteRut, pacienteEmail, medicoNombre, especialidadNombre, boxAtencion, fecha, horaInicio, horaFin }) {
  const subject = `[Medisalud] Confirmación de cita — ${codigoReserva}`;
  const text = [
    `Estimado(a) ${pacienteNombre} (RUT: ${pacienteRut}):`,
    'Su reserva en Centro Médico Medisalud está confirmada.',
    `Código: ${codigoReserva}`,
    `Especialidad: ${especialidadNombre}`,
    `Profesional: ${medicoNombre}`,
    `Fecha y hora: ${fecha}, ${horaInicio} a ${horaFin}`,
    `Lugar: ${boxAtencion}`,
  ].join('\n');
  return { to: pacienteEmail, subject, text, codigoReserva };
}

async function enqueueConfirmationEmail({ client = pool, ...details }) {
  const message = buildConfirmation(details);
  const result = await client.query(
    `INSERT INTO notificaciones (cita_id, canal, tipo, destinatario, asunto, contenido, estado)
     SELECT id, 'EMAIL', 'CONFIRMACION', $1, $2, $3, 'PENDIENTE'
     FROM citas_medicas WHERE codigo_reserva = $4
     RETURNING id`,
    [message.to, message.subject, message.text, message.codigoReserva]
  );
  return { id: result.rows[0]?.id, status: 'PENDING', provider: process.env.SENDGRID_API_KEY ? 'SendGrid' : 'unconfigured' };
}

async function deliverEmail(to, subject, text) {
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: process.env.SENDGRID_FROM }, subject, content: [{ type: 'text/plain', value: text }] }),
    });
    if (!response.ok) throw new Error(`SendGrid respondió HTTP ${response.status}`);
    return 'ACCEPTED';
  }
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
    return 'ACCEPTED';
  }
  throw new Error('Configura SendGrid o SMTP; no se simula una entrega real.');
}

async function deliverWhatsApp(to, text) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error('Configura TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM.');
  }
  const body = new URLSearchParams({ From: TWILIO_WHATSAPP_FROM, To: `whatsapp:${to.replace(/^whatsapp:/, '')}`, Body: text });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Twilio respondió HTTP ${response.status}`);
  return { status: 'ACCEPTED', id: data.sid };
}

async function processEmailQueue() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query(
      `WITH lote AS (
         SELECT n.id FROM notificaciones n
         JOIN citas_medicas c ON c.id=n.cita_id AND c.estado='CONFIRMADA'
         WHERE (n.estado IN ('PENDIENTE','FALLIDA') OR (n.estado='ENVIANDO' AND n.creado_en < NOW() - INTERVAL '5 minutes'))
           AND n.intentos < 5
           AND n.programado_en <= NOW() AND (n.reintentar_en IS NULL OR n.reintentar_en <= NOW())
         ORDER BY n.creado_en LIMIT 10 FOR UPDATE OF n SKIP LOCKED
       )
       UPDATE notificaciones n SET estado='ENVIANDO'
       FROM lote WHERE n.id=lote.id
       RETURNING n.id, n.cita_id, n.canal, n.tipo, n.destinatario, n.asunto, n.contenido`
    );
    await client.query('COMMIT');
    for (const row of pending.rows) {
      try {
        const result = row.canal === 'EMAIL'
          ? { status: await deliverEmail(row.destinatario, row.asunto, row.contenido), provider: process.env.SENDGRID_API_KEY ? 'SendGrid' : 'SMTP' }
          : { ...await deliverWhatsApp(row.destinatario, row.contenido), provider: 'Twilio' };
        await pool.query(`UPDATE notificaciones SET estado = $2, enviado_en = NOW(), proveedor = $3, proveedor_id = $4 WHERE id = $1`, [row.id, result.status, result.provider, result.id || null]);
        if (row.tipo === 'CONFIRMACION' && row.canal === 'EMAIL') {
          await pool.query('UPDATE citas_medicas SET correo_enviado = TRUE WHERE id = $1', [row.cita_id]);
        }
      } catch (error) {
        await pool.query(`UPDATE notificaciones SET estado='FALLIDA', intentos=intentos+1, error=$2,
          reintentar_en=NOW()+LEAST(POWER(2, intentos+1), 60) * INTERVAL '1 minute' WHERE id=$1`, [row.id, error.message.slice(0, 500)]);
      }
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

module.exports = { enqueueConfirmationEmail, processEmailQueue };
