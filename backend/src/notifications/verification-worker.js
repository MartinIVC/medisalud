const crypto = require('node:crypto');
const { pool: defaultPool } = require('../db');
const { withTransaction } = require('../db/transaction');
const { deliverEmail } = require('./email-provider');
const {
  PURPOSES,
  computeCodeHmac,
  generateSixDigitCode,
  purgeExpiredVerificationData,
} = require('../services/verificacion-correo');

const BATCH_SIZE = 10;
const LEASE_MS = 60_000;
const DELIVERY_TIMEOUT_MS = 15_000;

function buildVerificationEmail({ solicitudId, proposito, correo, codigo }) {
  if (proposito === PURPOSES.RESERVA) {
    return {
      to: correo,
      subject: 'Código de verificación para reservar hora — Medisalud',
      text: [
        'Hola,',
        '',
        `Tu código de verificación para confirmar una reserva en Medisalud es: ${codigo}`,
        '',
        'Finalidad: verificar tu correo antes de confirmar la reserva de una hora.',
        'Vigencia: 10 minutos (un solo uso).',
        '',
        'Si no solicitaste este código, puedes ignorar este mensaje.',
      ].join('\n'),
    };
  }

  if (proposito === PURPOSES.RECUPERACION) {
    return {
      to: correo,
      subject: 'Código de recuperación de historial de citas — Medisalud',
      text: [
        'Hola,',
        '',
        `Tu código de recuperación asistida en Medisalud es: ${codigo}`,
        `Identificador de solicitud: ${solicitudId}`,
        '',
        'Finalidad: confirmar la vinculación de tus citas seleccionadas con este correo electrónico.',
        'Vigencia: 10 minutos (un solo uso).',
        '',
        'Ingresa el identificador de solicitud y este código en "Consultar mis citas" del portal de pacientes.',
        'Si no reconoces esta gestión, ignora este mensaje o comunícate con secretaría.',
      ].join('\n'),
    };
  }

  return {
    to: correo,
    subject: 'Código para consultar tus citas — Medisalud',
    text: [
      'Hola,',
      '',
      `Tu código para consultar tus citas en Medisalud es: ${codigo}`,
      '',
      'Finalidad: abrir el historial de citas asociado a este correo.',
      'Vigencia: 10 minutos (un solo uso).',
      '',
      'Si no solicitaste esta consulta, puedes ignorar este mensaje.',
    ].join('\n'),
  };
}

async function claimVerificationBatch(
  database,
  claimToken,
  { batchSize = BATCH_SIZE, leaseMs = LEASE_MS } = {},
) {
  return withTransaction(database, async (client) => {
    // Descartar solicitudes vencidas o revocadas que todavía estaban pendientes
    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET estado_envio = 'OMITIDA', claim_token = NULL, claimed_at = NULL, lease_until = NULL
       WHERE estado_envio = 'PENDIENTE'
         AND (expira_en <= NOW() OR revocada_en IS NOT NULL OR consumida_en IS NOT NULL)`,
    );

    // Reclamar únicamente solicitudes PENDIENTE (o ENVIANDO cuyo lease venció ANTES de emitir código)
    // Nunca se reintenta automáticamente una solicitud que ya emitió código_hmac (envío incierto).
    const result = await client.query(
      `WITH lote AS (
         SELECT id
         FROM solicitudes_verificacion_correo
         WHERE (
             estado_envio = 'PENDIENTE'
             OR (estado_envio = 'ENVIANDO' AND codigo_hmac IS NULL AND (lease_until IS NULL OR lease_until <= NOW()))
           )
           AND expira_en > NOW()
           AND revocada_en IS NULL
           AND consumida_en IS NULL
         ORDER BY creado_en ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE solicitudes_verificacion_correo s
       SET estado_envio = 'ENVIANDO',
           claim_token = $1,
           claimed_at = NOW(),
           lease_until = NOW() + ($2 * INTERVAL '1 millisecond')
       FROM lote
       WHERE s.id = lote.id
       RETURNING s.id, s.proposito, s.paciente_rut, s.correo_normalizado, s.expira_en, s.claim_token`,
      [claimToken, leaseMs, batchSize],
    );

    return result.rows;
  });
}

async function persistIssuedCode(database, requestRow, codeHmac) {
  return withTransaction(database, async (client) => {
    const updated = await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET codigo_hmac = $3
       WHERE id = $1
         AND claim_token = $2
         AND estado_envio = 'ENVIANDO'
         AND expira_en > NOW()
         AND revocada_en IS NULL
         AND consumida_en IS NULL
       RETURNING id`,
      [requestRow.id, requestRow.claim_token, codeHmac],
    );
    return updated.rowCount > 0;
  });
}

async function markVerificationAccepted(database, requestRow, result) {
  await withTransaction(database, (client) =>
    client.query(
      `UPDATE solicitudes_verificacion_correo
       SET estado_envio = 'ACEPTADO',
           enviado_en = NOW(),
           proveedor = $3,
           proveedor_id = $4,
           error_envio = NULL,
           claim_token = NULL,
           claimed_at = NULL,
           lease_until = NULL
       WHERE id = $1 AND claim_token = $2 AND estado_envio = 'ENVIANDO'`,
      [requestRow.id, requestRow.claim_token, result.provider, result.providerId || null],
    ),
  );
}

async function markVerificationFailed(database, requestRow, error) {
  await withTransaction(database, (client) =>
    client.query(
      `UPDATE solicitudes_verificacion_correo
       SET estado_envio = 'FALLIDA',
           error_envio = $3,
           claim_token = NULL,
           claimed_at = NULL,
           lease_until = NULL
       WHERE id = $1 AND claim_token = $2 AND estado_envio = 'ENVIANDO'`,
      [
        requestRow.id,
        requestRow.claim_token,
        String(error?.message || 'Error de proveedor').slice(0, 500),
      ],
    ),
  );
}

async function markVerificationOmitted(database, requestRow) {
  await withTransaction(database, (client) =>
    client.query(
      `UPDATE solicitudes_verificacion_correo
       SET estado_envio = 'OMITIDA',
           claim_token = NULL,
           claimed_at = NULL,
           lease_until = NULL
       WHERE id = $1 AND claim_token = $2 AND estado_envio = 'ENVIANDO'`,
      [requestRow.id, requestRow.claim_token],
    ),
  );
}

async function deliverWithTimeout(deliver, message, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(() => deliver({ ...message, signal: controller.signal })),
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

function createVerificationWorker({
  database = defaultPool,
  emailProvider = deliverEmail,
  batchSize = BATCH_SIZE,
  leaseMs = LEASE_MS,
  timeoutMs = DELIVERY_TIMEOUT_MS,
  createClaimToken = crypto.randomUUID,
  generateCode = generateSixDigitCode,
  env = process.env,
} = {}) {
  let lastPurgeAt = 0;

  return async function processVerificationQueue() {
    const claimToken = createClaimToken();
    const claimed = await claimVerificationBatch(database, claimToken, { batchSize, leaseMs });

    await Promise.allSettled(
      claimed.map(async (row) => {
        const codigo = generateCode();
        const codeHmac = computeCodeHmac(
          {
            solicitudId: row.id,
            proposito: row.proposito,
            rut: row.paciente_rut,
            correo: row.correo_normalizado,
            codigo,
          },
          env,
        );

        // Persistir el HMAC antes de enviar para que el código sea verificable incluso si hay fallo posterior
        const persisted = await persistIssuedCode(database, row, codeHmac);
        if (!persisted) {
          await markVerificationOmitted(database, row);
          return;
        }

        const message = buildVerificationEmail({
          solicitudId: row.id,
          proposito: row.proposito,
          correo: row.correo_normalizado,
          codigo,
        });

        let result;
        try {
          result = await deliverWithTimeout(emailProvider, message, timeoutMs);
          if (result?.status !== 'ACEPTADO') {
            throw new Error('El proveedor devolvió un estado de aceptación desconocido.');
          }
        } catch (error) {
          await markVerificationFailed(database, row, error);
          return;
        }

        await markVerificationAccepted(database, row, result);
      }),
    );

    if (Date.now() - lastPurgeAt > 5 * 60 * 1000) {
      lastPurgeAt = Date.now();
      purgeExpiredVerificationData(database).catch(() => {});
    }

    return { claimed: claimed.length };
  };
}

const processVerificationQueue = createVerificationWorker();

module.exports = {
  buildVerificationEmail,
  claimVerificationBatch,
  createVerificationWorker,
  processVerificationQueue,
};
