async function deliverEmail({ to, subject, text, signal }, env = process.env) {
  if (env.SENDGRID_API_KEY && env.SENDGRID_FROM) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: env.SENDGRID_FROM },
        subject,
        content: [{ type: 'text/plain', value: text }],
      }),
      signal,
    });
    if (!response.ok) throw new Error(`SendGrid respondió HTTP ${response.status}`);
    return {
      status: 'ACEPTADO',
      provider: 'SendGrid',
      providerId: response.headers.get('x-message-id') || null,
    };
  }

  if (env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === 'true',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 15_000,
    });
    let result;
    try {
      result = await transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to,
        subject,
        text,
      });
    } finally {
      transporter.close();
    }
    return { status: 'ACEPTADO', provider: 'SMTP', providerId: result.messageId || null };
  }

  throw new Error('No hay un proveedor de correo configurado.');
}

module.exports = { deliverEmail };
