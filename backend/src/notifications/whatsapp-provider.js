async function deliverWhatsApp({ to, text, signal }, env = process.env) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error('No hay un proveedor de WhatsApp configurado.');
  }
  const body = new URLSearchParams({ From: TWILIO_WHATSAPP_FROM, To: `whatsapp:${to.replace(/^whatsapp:/, '')}`, Body: text });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Twilio respondió HTTP ${response.status}`);
  return { status: 'ACEPTADO', provider: 'Twilio', providerId: result.sid || null };
}

module.exports = { deliverWhatsApp };
