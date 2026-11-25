const DEFAULT_MAILPIT_URL = process.env.TEST_MAILPIT_URL || 'http://127.0.0.1:8025';

async function clearMailpit(mailpitUrl = DEFAULT_MAILPIT_URL) {
  const res = await fetch(`${mailpitUrl.replace(/\/$/, '')}/api/v1/messages`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`No se pudo limpiar Mailpit (${res.status}).`);
}

async function listMailpitMessages(mailpitUrl = DEFAULT_MAILPIT_URL, query = '') {
  const base = mailpitUrl.replace(/\/$/, '');
  const url = `${base}/api/v1/messages?limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error consultando Mailpit (${res.status}).`);
  const data = await res.json();
  const messages = Array.isArray(data.messages) ? data.messages : [];
  if (!query) return messages;
  const toMatch = query.match(/^to:(.+)$/i);
  if (toMatch) {
    const target = toMatch[1].trim().toLowerCase();
    return messages.filter((msg) =>
      (msg.To || []).some((entry) => entry.Address?.toLowerCase() === target),
    );
  }
  return messages;
}

async function readMailpitMessageText(mailpitUrl, id) {
  const res = await fetch(`${mailpitUrl.replace(/\/$/, '')}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`Error leyendo mensaje ${id} de Mailpit (${res.status}).`);
  const data = await res.json();
  return {
    id: data.ID,
    subject: data.Subject || '',
    text: data.Text || '',
    to: (data.To || []).map((entry) => entry.Address?.toLowerCase()),
  };
}

async function waitForVerificationCode({
  email,
  subjectIncludes = '',
  seenMessageIds = new Set(),
  timeoutMs = 10_000,
  mailpitUrl = DEFAULT_MAILPIT_URL,
}) {
  const targetEmail = email.trim().toLowerCase();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const messages = await listMailpitMessages(mailpitUrl, `to:${targetEmail}`);
    for (const summary of messages) {
      if (seenMessageIds.has(summary.ID)) continue;
      const full = await readMailpitMessageText(mailpitUrl, summary.ID);
      if (!full.to.includes(targetEmail)) continue;
      if (subjectIncludes && !full.subject.toLowerCase().includes(subjectIncludes.toLowerCase())) {
        continue;
      }
      const match = full.text.match(/\b(\d{6})\b/);
      if (match) {
        seenMessageIds.add(summary.ID);
        return {
          code: match[1],
          messageId: summary.ID,
          subject: full.subject,
          text: full.text,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`No llegó código de verificación a ${targetEmail} dentro de ${timeoutMs} ms.`);
}

async function authorizeWebBookingEmail({
  apiUrl,
  rut,
  correo,
  mailpitUrl = DEFAULT_MAILPIT_URL,
  seenMessageIds = new Set(),
}) {
  const reqRes = await fetch(`${apiUrl}/reservas/verificacion-correo/solicitudes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rut, correo }),
  });
  const reqData = await reqRes.json();
  if (reqRes.status !== 202 || !reqData.ok) {
    throw new Error(
      `No se pudo solicitar código de reserva: ${reqRes.status} ${JSON.stringify(reqData)}`,
    );
  }

  const received = await waitForVerificationCode({
    email: correo,
    subjectIncludes: 'reservar hora',
    seenMessageIds,
    mailpitUrl,
  });

  const verRes = await fetch(`${apiUrl}/reservas/verificacion-correo/verificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      solicitud_id: reqData.solicitud_id,
      codigo: received.code,
    }),
  });
  const verData = await verRes.json();
  if (!verRes.ok || !verData.autorizacion_reserva) {
    throw new Error(
      `No se pudo verificar código de reserva: ${verRes.status} ${JSON.stringify(verData)}`,
    );
  }

  return {
    solicitudId: reqData.solicitud_id,
    codigo: received.code,
    autorizacionReserva: verData.autorizacion_reserva,
  };
}

module.exports = {
  DEFAULT_MAILPIT_URL,
  clearMailpit,
  listMailpitMessages,
  readMailpitMessageText,
  waitForVerificationCode,
  authorizeWebBookingEmail,
};
