const crypto = require('node:crypto');
const { pool: defaultPool } = require('../db');
const { withTransaction } = require('../db/transaction');
const { buildConfirmation } = require('./templates');
const { deliverEmail } = require('./email-provider');
const { deliverWhatsApp } = require('./whatsapp-provider');

const BATCH_SIZE = 10;
const LEASE_MS = 60_000;
const DELIVERY_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 5;

async function enqueueConfirmationEmail({ client, ...details }) {
  const message = buildConfirmation(details);
  const result = await client.query(
    `INSERT INTO notificaciones (cita_id, canal, tipo, destinatario, asunto, contenido, estado)
     SELECT id, 'EMAIL', 'CONFIRMACION', $1, $2, $3, 'PENDIENTE'
     FROM citas_medicas WHERE codigo_reserva = $4
     RETURNING id`,
    [message.to, message.subject, message.text, message.codigoReserva],
  );
  return { id: result.rows[0]?.id, status: 'PENDIENTE', provider: 'configured-at-delivery' };
}

async function claimBatch(pool, claimToken, { batchSize = BATCH_SIZE, leaseMs = LEASE_MS } = {}) {
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `WITH lote AS (
         SELECT n.id
         FROM notificaciones n
         JOIN citas_medicas c ON c.id=n.cita_id AND c.estado='CONFIRMADA'
         WHERE (n.estado IN ('PENDIENTE','FALLIDA')
                OR (n.estado='ENVIANDO' AND (n.lease_until IS NULL OR n.lease_until <= NOW())))
           AND n.intentos < $3
           AND n.programado_en <= NOW()
           AND (n.reintentar_en IS NULL OR n.reintentar_en <= NOW())
         ORDER BY n.programado_en, n.creado_en
         LIMIT $4
         FOR UPDATE OF n SKIP LOCKED
       )
       UPDATE notificaciones n
       SET estado='ENVIANDO', claim_token=$1, claimed_at=NOW(), lease_until=NOW() + ($2 * INTERVAL '1 millisecond')
       FROM lote WHERE n.id=lote.id
       RETURNING n.id, n.cita_id, n.canal, n.tipo, n.destinatario, n.asunto, n.contenido, n.claim_token`,
      [claimToken, leaseMs, MAX_ATTEMPTS, batchSize],
    );
    return result.rows;
  });
}

async function markAccepted(pool, notification, result) {
  return withTransaction(pool, async (client) => {
    const updated = await client.query(
      `UPDATE notificaciones
       SET estado='ACEPTADO', enviado_en=NOW(), proveedor=$3, proveedor_id=$4,
           error=NULL, claim_token=NULL, claimed_at=NULL, lease_until=NULL, reintentar_en=NULL
       WHERE id=$1 AND claim_token=$2 AND estado='ENVIANDO'
       RETURNING id`,
      [notification.id, notification.claim_token, result.provider, result.providerId || null],
    );
    if (
      updated.rowCount &&
      notification.tipo === 'CONFIRMACION' &&
      notification.canal === 'EMAIL'
    ) {
      await client.query('UPDATE citas_medicas SET correo_enviado=TRUE WHERE id=$1', [
        notification.cita_id,
      ]);
    }
    return updated.rowCount > 0;
  });
}

async function markFailed(pool, notification, error) {
  await withTransaction(pool, (client) =>
    client.query(
      `UPDATE notificaciones
     SET estado='FALLIDA', intentos=intentos+1, error=$3,
         reintentar_en=NOW() + LEAST(POWER(2, intentos+1), 60) * INTERVAL '1 minute',
         claim_token=NULL, claimed_at=NULL, lease_until=NULL
     WHERE id=$1 AND claim_token=$2 AND estado='ENVIANDO'`,
      [
        notification.id,
        notification.claim_token,
        String(error.message || 'Error de proveedor').slice(0, 500),
      ],
    ),
  );
}

async function markOmitted(pool, notification) {
  await withTransaction(pool, (client) =>
    client.query(
      `UPDATE notificaciones
     SET estado='OMITIDA', claim_token=NULL, claimed_at=NULL, lease_until=NULL
     WHERE id=$1 AND claim_token=$2 AND estado='ENVIANDO'`,
      [notification.id, notification.claim_token],
    ),
  );
}

async function deliverWithTimeout(deliver, notification, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(() =>
        deliver({
          to: notification.destinatario,
          subject: notification.asunto,
          text: notification.contenido,
          signal: controller.signal,
        }),
      ),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`El proveedor superó el límite de ${timeoutMs} ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function createNotificationWorker({
  database = defaultPool,
  providers = { EMAIL: deliverEmail, WHATSAPP: deliverWhatsApp },
  batchSize = BATCH_SIZE,
  leaseMs = LEASE_MS,
  timeoutMs = DELIVERY_TIMEOUT_MS,
  createClaimToken = crypto.randomUUID,
} = {}) {
  return async function processNotificationQueue() {
    const claimToken = createClaimToken();
    const notifications = await claimBatch(database, claimToken, { batchSize, leaseMs });
    const outcomes = await Promise.allSettled(
      notifications.map(async (notification) => {
        const appointment = await database.query('SELECT estado FROM citas_medicas WHERE id=$1', [
          notification.cita_id,
        ]);
        if (!appointment.rowCount || appointment.rows[0].estado !== 'CONFIRMADA') {
          await markOmitted(database, notification);
          return;
        }

        let result;
        try {
          const deliver = providers[notification.canal];
          if (!deliver) throw new Error(`No hay proveedor para el canal ${notification.canal}.`);
          result = await deliverWithTimeout(deliver, notification, timeoutMs);
          if (result?.status !== 'ACEPTADO')
            throw new Error('El proveedor devolvió un estado de aceptación desconocido.');
        } catch (error) {
          await markFailed(database, notification, error);
          return;
        }

        // Si falla esta persistencia, la toma vence y se recupera; no se presenta como fallo del proveedor.
        await markAccepted(database, notification, result);
      }),
    );
    const failedPersistence = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failedPersistence) throw failedPersistence.reason;
    return { claimed: notifications.length };
  };
}

const processNotificationQueue = createNotificationWorker();

module.exports = {
  enqueueConfirmationEmail,
  claimBatch,
  createNotificationWorker,
  processNotificationQueue,
  constants: { BATCH_SIZE, LEASE_MS, DELIVERY_TIMEOUT_MS, MAX_ATTEMPTS },
};
