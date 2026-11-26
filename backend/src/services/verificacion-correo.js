const crypto = require('node:crypto');
const { pool: defaultPool } = require('../db');
const { withTransaction } = require('../db/transaction');
const { HttpError } = require('../middleware/errors');
const { validateRut } = require('../utils/rutValidator');
const { validateEmail } = require('../utils/email');
const { AUDIT_ACTIONS, recordAuditEvent } = require('./auditoria');

const PURPOSES = Object.freeze({
  RESERVA: 'RESERVA',
  CONSULTA: 'CONSULTA',
  RECUPERACION: 'RECUPERACION',
});

const GENERIC_LOOKUP_MESSAGE =
  'Si los datos coinciden, recibirás un código para consultar tus citas.';
const GENERIC_INVALID_CODE_MESSAGE =
  'El código ingresado no es válido o venció. Solicita uno nuevo e intenta nuevamente.';

const FALLBACK_PROCESS_SECRET = crypto.randomBytes(32).toString('hex');
const MIN_PRODUCTION_HMAC_SECRET_LENGTH = 32;
const INSECURE_HMAC_SECRETS = new Set([
  'medisalud-demo-hmac-secret-local-only',
  'disposable-hmac-secret-test-only',
]);
const INSECURE_HMAC_PATTERN = /(demo|test-only|local-only|dev[-_]?only|change[-_]?me|default)/i;

function isStrictHmacEnvironment(env = process.env) {
  const nodeEnv = typeof env.NODE_ENV === 'string' ? env.NODE_ENV.trim().toLowerCase() : '';
  return Boolean(nodeEnv) && nodeEnv !== 'development' && nodeEnv !== 'test';
}

function validateHmacSecretConfig(env = process.env) {
  const raw =
    typeof env.VERIFICATION_HMAC_SECRET === 'string' ? env.VERIFICATION_HMAC_SECRET.trim() : '';
  if (isStrictHmacEnvironment(env)) {
    if (
      !raw ||
      raw.length < MIN_PRODUCTION_HMAC_SECRET_LENGTH ||
      INSECURE_HMAC_SECRETS.has(raw) ||
      INSECURE_HMAC_PATTERN.test(raw)
    ) {
      throw new Error(
        'VERIFICATION_HMAC_SECRET debe configurarse explícitamente con al menos 32 caracteres aleatorios (sin valores de demostración) cuando NODE_ENV no es development ni test.',
      );
    }
    return raw;
  }
  return raw || FALLBACK_PROCESS_SECRET;
}

function getHmacSecret(env = process.env) {
  return validateHmacSecretConfig(env);
}

function getLimitsConfig(env = process.env) {
  const num = (key, fallback) => {
    const parsed = Number(env[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    windowMs: num('VERIFICATION_WINDOW_MINUTES', 15) * 60 * 1000,
    resendCooldownMs: num('VERIFICATION_RESEND_COOLDOWN_SECONDS', 60) * 1000,
    maxSendsPerPair: num('VERIFICATION_MAX_SENDS_PER_PAIR', 3),
    maxSendsPerEmail: num('VERIFICATION_MAX_SENDS_PER_EMAIL', 6),
    maxSendsPerIp: num('VERIFICATION_MAX_SENDS_PER_IP', 15),
    maxAttemptsPerRequest: num('VERIFICATION_MAX_ATTEMPTS_PER_REQUEST', 5),
    maxAttemptsPerPair: num('VERIFICATION_MAX_ATTEMPTS_PER_PAIR', 10),
    codeTtlMs: num('VERIFICATION_CODE_TTL_MINUTES', 10) * 60 * 1000,
    authTtlMs: num('VERIFICATION_AUTH_TTL_MINUTES', 10) * 60 * 1000,
  };
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateOpaqueId(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function generateSixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function computeCodeHmac({ solicitudId, proposito, rut, correo, codigo }, env = process.env) {
  const context = `${solicitudId}|${proposito}|${rut}|${correo}|${codigo}`;
  return crypto.createHmac('sha256', getHmacSecret(env)).update(context).digest('hex');
}

function verifyCodeHmac(storedHmac, params, env = process.env) {
  if (typeof storedHmac !== 'string' || !/^[0-9a-f]{64}$/.test(storedHmac)) return false;
  const expected = computeCodeHmac(params, env);
  return crypto.timingSafeEqual(Buffer.from(storedHmac, 'hex'), Buffer.from(expected, 'hex'));
}

function hashSecretToken(token) {
  return sha256Hex(token);
}

function isValidOpaqueId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(value.trim());
}

function isValidSixDigitCode(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value.trim());
}

function limitKeyHash(ambito, rawKey) {
  return sha256Hex(`${ambito}:${rawKey}`);
}

function normalizeClientIp(ip) {
  if (typeof ip !== 'string' || !ip.trim()) return 'unknown';
  return ip
    .trim()
    .replace(/^::ffff:/, '')
    .slice(0, 100);
}

function parseRutAndEmail(rawRut, rawEmail) {
  const rutStr = typeof rawRut === 'string' ? rawRut.trim() : '';
  const rutCheck = validateRut(rutStr);
  if (!rutStr || !rutCheck.valid) {
    const message = rutStr
      ? rutCheck.reason || 'El RUT ingresado no es válido.'
      : 'Debes ingresar un RUT válido.';
    throw new HttpError(400, 'INVALID_RUT', message, { rut: message });
  }

  const emailCheck = validateEmail(rawEmail);
  if (!emailCheck.valid) {
    throw new HttpError(400, 'VALIDATION_ERROR', emailCheck.reason, {
      correo: emailCheck.reason,
    });
  }

  return {
    rut: rutCheck.formatted,
    correo: emailCheck.normalized,
  };
}

async function purgeExpiredVerificationData(database = defaultPool) {
  await database.query(
    `DELETE FROM autorizaciones_reserva_correo
     WHERE expira_en <= NOW() - INTERVAL '1 hour'`,
  );
  await database.query(
    `DELETE FROM solicitudes_verificacion_correo
     WHERE expira_en <= NOW() - INTERVAL '1 hour'
       AND id NOT IN (SELECT solicitud_id FROM autorizaciones_reserva_correo)`,
  );
  await database.query(
    `DELETE FROM limites_verificacion_correo
     WHERE ventana_inicio <= NOW() - INTERVAL '1 hour'`,
  );
}

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

async function evaluateAndConsumeLimits(client, checks) {
  // Orden determinista por clave_hash para evitar deadlocks bajo solicitudes concurrentes.
  const ordered = checks
    .map((check) => ({
      ...check,
      keyHash: limitKeyHash(check.ambito, check.key),
    }))
    .sort((left, right) => left.keyHash.localeCompare(right.keyHash));

  const nowMs = Date.now();
  const lockedStates = [];

  for (const check of ordered) {
    // Creación idempotente antes de bloquear: evita errores 23505 (unique_violation) bajo concurrencia.
    await client.query(
      `INSERT INTO limites_verificacion_correo (clave_hash, ambito, conteo, ventana_inicio, ultimo_evento)
       VALUES ($1, $2, 1, 'epoch'::timestamptz, 'epoch'::timestamptz)
       ON CONFLICT (clave_hash) DO NOTHING`,
      [check.keyHash, check.ambito],
    );

    const existing = await client.query(
      `SELECT conteo, ventana_inicio, ultimo_evento
       FROM limites_verificacion_correo
       WHERE clave_hash = $1
       FOR UPDATE`,
      [check.keyHash],
    );

    const row = existing.rows[0] || {
      conteo: 0,
      ventana_inicio: EPOCH_ISO,
      ultimo_evento: EPOCH_ISO,
    };
    const windowStartMs = new Date(row.ventana_inicio).getTime();
    const lastEventMs = new Date(row.ultimo_evento).getTime();
    const windowExpired = nowMs - windowStartMs >= check.windowMs;

    if (!windowExpired) {
      if (check.cooldownMs > 0 && nowMs - lastEventMs < check.cooldownMs) {
        return {
          allowed: false,
          reason: 'COOLDOWN',
          retryAfterMs: check.cooldownMs - (nowMs - lastEventMs),
        };
      }
      if (row.conteo >= check.maxCount) {
        return {
          allowed: false,
          reason: 'QUOTA',
          retryAfterMs: Math.max(1000, check.windowMs - (nowMs - windowStartMs)),
        };
      }
    }

    lockedStates.push({ check, windowExpired });
  }

  for (const { check, windowExpired } of lockedStates) {
    if (windowExpired) {
      await client.query(
        `UPDATE limites_verificacion_correo
         SET conteo = 1, ventana_inicio = NOW(), ultimo_evento = NOW()
         WHERE clave_hash = $1`,
        [check.keyHash],
      );
    } else {
      await client.query(
        `UPDATE limites_verificacion_correo
         SET conteo = conteo + 1, ultimo_evento = NOW()
         WHERE clave_hash = $1`,
        [check.keyHash],
      );
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}

async function inspectAndConsumeLimit(client, { ambito, key, maxCount, windowMs, cooldownMs = 0 }) {
  return evaluateAndConsumeLimits(client, [{ ambito, key, maxCount, windowMs, cooldownMs }]);
}

async function checkSendLimits(client, { proposito, rut, correo, clientIp, config }) {
  // Todas las cuotas de envío se aíslan por propósito para evitar filtrar existencia de vínculos
  // entre CONSULTA (202 indistinguible) y RESERVA (429 observable).
  const checks = [
    {
      ambito: 'SEND_PAIR',
      key: `${proposito}|${rut}|${correo}`,
      maxCount: config.maxSendsPerPair,
      windowMs: config.windowMs,
      cooldownMs: config.resendCooldownMs,
    },
    {
      ambito: 'SEND_EMAIL',
      key: `${proposito}|${correo}`,
      maxCount: config.maxSendsPerEmail,
      windowMs: config.windowMs,
      cooldownMs: 0,
    },
    {
      ambito: 'SEND_IP',
      key: `${proposito}|${normalizeClientIp(clientIp)}`,
      maxCount: config.maxSendsPerIp,
      windowMs: config.windowMs,
      cooldownMs: 0,
    },
  ];

  return evaluateAndConsumeLimits(client, checks);
}

async function requestBookingVerification({
  database = defaultPool,
  rut: rawRut,
  correo: rawEmail,
  clientIp = 'unknown',
  env = process.env,
}) {
  const { rut, correo } = parseRutAndEmail(rawRut, rawEmail);
  const config = getLimitsConfig(env);

  const outcome = await withTransaction(database, async (client) => {
    const limitResult = await checkSendLimits(client, {
      proposito: PURPOSES.RESERVA,
      rut,
      correo,
      clientIp,
      config,
    });
    if (!limitResult.allowed) {
      return { limited: true, retryAfterMs: limitResult.retryAfterMs, reason: limitResult.reason };
    }

    const solicitudId = generateOpaqueId(24);
    const expiraEn = new Date(Date.now() + config.codeTtlMs);
    const reenvioEn = new Date(Date.now() + config.resendCooldownMs);

    await client.query(
      `INSERT INTO solicitudes_verificacion_correo (
         id, proposito, paciente_rut, correo_normalizado, estado_envio, expira_en
       ) VALUES ($1, $2, $3, $4, 'PENDIENTE', $5)`,
      [solicitudId, PURPOSES.RESERVA, rut, correo, expiraEn.toISOString()],
    );

    return {
      limited: false,
      solicitudId,
      expiraEn: expiraEn.toISOString(),
      reenvioEn: reenvioEn.toISOString(),
    };
  });

  if (outcome.limited) {
    const retrySeconds = Math.max(1, Math.ceil(outcome.retryAfterMs / 1000));
    const message =
      outcome.reason === 'COOLDOWN'
        ? `Ya solicitaste un código recientemente. Espera ${retrySeconds} segundos antes de reenviar; tu código anterior sigue vigente.`
        : 'Superaste temporalmente el límite de envíos de códigos. Intenta nuevamente en unos minutos.';
    throw new HttpError(429, 'RATE_LIMITED', message, {
      retry_after_seconds: retrySeconds,
      reenvio_disponible_en: new Date(Date.now() + outcome.retryAfterMs).toISOString(),
    });
  }

  return {
    solicitud_id: outcome.solicitudId,
    rut,
    correo,
    expira_en: outcome.expiraEn,
    reenvio_disponible_en: outcome.reenvioEn,
    mensaje: `Solicitamos el envío de un código de verificación a ${correo}. Tiene una vigencia de 10 minutos.`,
  };
}

async function verifyBookingCode({
  database = defaultPool,
  solicitudId,
  codigo,
  env = process.env,
}) {
  if (!isValidOpaqueId(solicitudId) || !isValidSixDigitCode(codigo)) {
    throw new HttpError(400, 'VERIFICATION_CODE_INVALID', GENERIC_INVALID_CODE_MESSAGE);
  }

  const trimmedId = solicitudId.trim();
  const trimmedCode = codigo.trim();
  const config = getLimitsConfig(env);

  const outcome = await withTransaction(database, async (client) => {
    const found = await client.query(
      `SELECT id, proposito, paciente_rut, correo_normalizado, codigo_hmac,
              intentos_verificacion, expira_en, consumida_en, revocada_en
       FROM solicitudes_verificacion_correo
       WHERE id = $1
       FOR UPDATE`,
      [trimmedId],
    );

    if (!found.rowCount) return { ok: false };
    const reqRow = found.rows[0];

    if (
      reqRow.proposito !== PURPOSES.RESERVA ||
      reqRow.consumida_en ||
      reqRow.revocada_en ||
      !reqRow.codigo_hmac ||
      new Date(reqRow.expira_en).getTime() <= Date.now() ||
      reqRow.intentos_verificacion >= config.maxAttemptsPerRequest
    ) {
      return { ok: false };
    }

    const pairLimit = await inspectAndConsumeLimit(client, {
      ambito: 'VERIFY_PAIR',
      key: `${reqRow.proposito}|${reqRow.paciente_rut}|${reqRow.correo_normalizado}`,
      maxCount: config.maxAttemptsPerPair,
      windowMs: config.windowMs,
    });
    if (!pairLimit.allowed) {
      return { ok: false };
    }

    const valid = verifyCodeHmac(
      reqRow.codigo_hmac,
      {
        solicitudId: reqRow.id,
        proposito: reqRow.proposito,
        rut: reqRow.paciente_rut,
        correo: reqRow.correo_normalizado,
        codigo: trimmedCode,
      },
      env,
    );

    if (!valid) {
      await client.query(
        `UPDATE solicitudes_verificacion_correo
         SET intentos_verificacion = intentos_verificacion + 1
         WHERE id = $1`,
        [reqRow.id],
      );
      return { ok: false };
    }

    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET consumida_en = NOW()
       WHERE id = $1`,
      [reqRow.id],
    );

    const authToken = generateOpaqueId(32);
    const tokenHash = hashSecretToken(authToken);
    const authExpiraEn = new Date(Date.now() + config.authTtlMs);

    await client.query(
      `INSERT INTO autorizaciones_reserva_correo (
         token_hash, solicitud_id, paciente_rut, correo_normalizado, expira_en
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        tokenHash,
        reqRow.id,
        reqRow.paciente_rut,
        reqRow.correo_normalizado,
        authExpiraEn.toISOString(),
      ],
    );

    return {
      ok: true,
      autorizacion_reserva: authToken,
      expira_en: authExpiraEn.toISOString(),
      rut: reqRow.paciente_rut,
      correo: reqRow.correo_normalizado,
    };
  });

  if (!outcome.ok) {
    throw new HttpError(400, 'VERIFICATION_CODE_INVALID', GENERIC_INVALID_CODE_MESSAGE);
  }

  return outcome;
}

async function requestLookupVerification({
  database = defaultPool,
  rut: rawRut,
  correo: rawEmail,
  clientIp = 'unknown',
  env = process.env,
}) {
  const { rut, correo } = parseRutAndEmail(rawRut, rawEmail);
  const config = getLimitsConfig(env);

  const syntheticId = generateOpaqueId(24);
  const expiraEn = new Date(Date.now() + config.codeTtlMs).toISOString();
  const reenvioEn = new Date(Date.now() + config.resendCooldownMs).toISOString();

  const outcome = await withTransaction(database, async (client) => {
    const linkResult = await client.query(
      `SELECT id, version
       FROM vinculos_consulta_paciente
       WHERE paciente_rut = $1 AND correo_normalizado = $2`,
      [rut, correo],
    );

    if (!linkResult.rowCount) {
      return { enqueued: false, solicitudId: syntheticId };
    }

    const limitResult = await checkSendLimits(client, {
      proposito: PURPOSES.CONSULTA,
      rut,
      correo,
      clientIp,
      config,
    });
    if (!limitResult.allowed) {
      return { enqueued: false, solicitudId: syntheticId };
    }

    const link = linkResult.rows[0];
    const solicitudId = generateOpaqueId(24);
    await client.query(
      `INSERT INTO solicitudes_verificacion_correo (
         id, proposito, paciente_rut, correo_normalizado, vinculo_id, vinculo_version, estado_envio, expira_en
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE', $7)`,
      [solicitudId, PURPOSES.CONSULTA, rut, correo, link.id, link.version, expiraEn],
    );

    return { enqueued: true, solicitudId };
  });

  return {
    solicitud_id: outcome.solicitudId,
    expira_en: expiraEn,
    reenvio_disponible_en: reenvioEn,
    mensaje: GENERIC_LOOKUP_MESSAGE,
    _enqueued: outcome.enqueued,
  };
}

async function verifyLookupCode({
  database = defaultPool,
  solicitudId,
  codigo,
  env = process.env,
}) {
  if (!isValidOpaqueId(solicitudId) || !isValidSixDigitCode(codigo)) {
    throw new HttpError(400, 'VERIFICATION_CODE_INVALID', GENERIC_INVALID_CODE_MESSAGE);
  }

  const trimmedId = solicitudId.trim();
  const trimmedCode = codigo.trim();
  const config = getLimitsConfig(env);

  const outcome = await withTransaction(database, async (client) => {
    const found = await client.query(
      `SELECT s.id, s.proposito, s.paciente_rut, s.correo_normalizado,
              s.vinculo_id, s.vinculo_version, s.codigo_hmac,
              s.intentos_verificacion, s.expira_en, s.consumida_en, s.revocada_en,
              v.version AS vinculo_version_actual
       FROM solicitudes_verificacion_correo s
       LEFT JOIN vinculos_consulta_paciente v ON v.id = s.vinculo_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [trimmedId],
    );

    if (!found.rowCount) return { ok: false };
    const reqRow = found.rows[0];

    if (
      reqRow.proposito !== PURPOSES.CONSULTA ||
      !reqRow.vinculo_id ||
      reqRow.vinculo_version_actual !== reqRow.vinculo_version ||
      reqRow.consumida_en ||
      reqRow.revocada_en ||
      !reqRow.codigo_hmac ||
      new Date(reqRow.expira_en).getTime() <= Date.now() ||
      reqRow.intentos_verificacion >= config.maxAttemptsPerRequest
    ) {
      return { ok: false };
    }

    const pairLimit = await inspectAndConsumeLimit(client, {
      ambito: 'VERIFY_PAIR',
      key: `${reqRow.proposito}|${reqRow.paciente_rut}|${reqRow.correo_normalizado}`,
      maxCount: config.maxAttemptsPerPair,
      windowMs: config.windowMs,
    });
    if (!pairLimit.allowed) {
      return { ok: false };
    }

    const valid = verifyCodeHmac(
      reqRow.codigo_hmac,
      {
        solicitudId: reqRow.id,
        proposito: reqRow.proposito,
        rut: reqRow.paciente_rut,
        correo: reqRow.correo_normalizado,
        codigo: trimmedCode,
      },
      env,
    );

    if (!valid) {
      await client.query(
        `UPDATE solicitudes_verificacion_correo
         SET intentos_verificacion = intentos_verificacion + 1
         WHERE id = $1`,
        [reqRow.id],
      );
      return { ok: false };
    }

    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET consumida_en = NOW()
       WHERE id = $1`,
      [reqRow.id],
    );

    const appointments = await client.query(
      `SELECT c.id,
              c.codigo_reserva,
              TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
              TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
              TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
              m.nombre AS medico_nombre,
              e.nombre AS especialidad_nombre,
              m.box_atencion,
              c.estado,
              c.asistencia_estado,
              ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW() AS futuro
       FROM citas_medicas c
       INNER JOIN agendas a ON a.id = c.agenda_id
       INNER JOIN medicos m ON m.id = c.medico_id
       INNER JOIN especialidades e ON e.id = m.especialidad_id
       WHERE c.vinculo_consulta_id = $1
       ORDER BY
         CASE WHEN ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') >= NOW() THEN 0 ELSE 1 END ASC,
         CASE WHEN ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') >= NOW() THEN a.fecha END ASC,
         CASE WHEN ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') >= NOW() THEN a.hora_inicio END ASC,
         a.fecha DESC,
         a.hora_inicio DESC,
         c.created_at DESC`,
      [reqRow.vinculo_id],
    );

    return {
      ok: true,
      rut: reqRow.paciente_rut,
      citas: appointments.rows,
    };
  });

  if (!outcome.ok) {
    throw new HttpError(400, 'VERIFICATION_CODE_INVALID', GENERIC_INVALID_CODE_MESSAGE);
  }

  return {
    rut: outcome.rut,
    citas: outcome.citas,
  };
}

async function searchRecoveryAppointments({ database = defaultPool, rut: rawRut }) {
  const rutStr = typeof rawRut === 'string' ? rawRut.trim() : '';
  const rutCheck = validateRut(rutStr);
  if (!rutStr || !rutCheck.valid) {
    const message = rutStr
      ? rutCheck.reason || 'El RUT ingresado no es válido.'
      : 'Debes ingresar un RUT válido.';
    throw new HttpError(400, 'INVALID_RUT', message, { rut: message });
  }
  const normalizedRut = rutCheck.formatted;

  const [appointments, requests] = await Promise.all([
    database.query(
      `SELECT c.id,
              c.codigo_reserva,
              c.paciente_nombre,
              c.paciente_email AS correo_original_reserva,
              c.origen,
              c.estado,
              c.asistencia_estado,
              c.vinculo_consulta_id,
              v.correo_normalizado AS correo_vinculo_actual,
              TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
              TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
              TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
              m.nombre AS medico_nombre,
              e.nombre AS especialidad_nombre,
              m.box_atencion
       FROM citas_medicas c
       INNER JOIN agendas a ON a.id = c.agenda_id
       INNER JOIN medicos m ON m.id = c.medico_id
       INNER JOIN especialidades e ON e.id = m.especialidad_id
       LEFT JOIN vinculos_consulta_paciente v ON v.id = c.vinculo_consulta_id
       WHERE c.paciente_rut = $1
       ORDER BY a.fecha DESC, a.hora_inicio DESC, c.id DESC`,
      [normalizedRut],
    ),
    database.query(
      `SELECT s.id,
              s.correo_normalizado AS correo_destino,
              s.citas_ids,
              s.motivo,
              s.estado_envio,
              s.expira_en,
              s.creado_en,
              sec.usuario AS secretaria_usuario
       FROM solicitudes_verificacion_correo s
       LEFT JOIN secretarias sec ON sec.id = s.secretaria_id
       WHERE s.proposito = 'RECUPERACION'
         AND s.paciente_rut = $1
         AND s.consumida_en IS NULL
         AND s.revocada_en IS NULL
         AND s.expira_en > NOW()
       ORDER BY s.creado_en DESC`,
      [normalizedRut],
    ),
  ]);

  return {
    rut: normalizedRut,
    citas: appointments.rows.map((row) => ({
      ...row,
      vinculada: Boolean(row.vinculo_consulta_id),
    })),
    solicitudes_pendientes: requests.rows,
  };
}

async function createRecoveryRequest({
  database = defaultPool,
  rut: rawRut,
  correoDestino: rawCorreoDestino,
  citasIds: rawCitasIds,
  motivo: rawMotivo,
  secretary,
  env = process.env,
}) {
  const { rut, correo } = parseRutAndEmail(rawRut, rawCorreoDestino);
  const motivo = typeof rawMotivo === 'string' ? rawMotivo.trim() : '';
  if (!motivo || motivo.length > 255) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Indica un motivo de hasta 255 caracteres.', {
      motivo: 'Indica un motivo de hasta 255 caracteres.',
    });
  }

  if (!Array.isArray(rawCitasIds) || rawCitasIds.length === 0 || rawCitasIds.length > 50) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Selecciona al menos una cita (máximo 50 por solicitud).',
      { citas_ids: 'Selecciona al menos una cita válida.' },
    );
  }

  const citasIds = [...new Set(rawCitasIds.map((id) => Number(id)))].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (citasIds.length !== rawCitasIds.length) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los identificadores de cita no son válidos.', {
      citas_ids: 'Indica identificadores numéricos únicos y válidos.',
    });
  }
  citasIds.sort((a, b) => a - b);

  const config = getLimitsConfig(env);
  const solicitudId = generateOpaqueId(24);
  const expiraEn = new Date(Date.now() + config.codeTtlMs);

  return withTransaction(database, async (client) => {
    const found = await client.query(
      `SELECT c.id, c.vinculo_consulta_id, v.version AS vinculo_version
       FROM citas_medicas c
       LEFT JOIN vinculos_consulta_paciente v ON v.id = c.vinculo_consulta_id
       WHERE c.id = ANY($1::int[]) AND c.paciente_rut = $2
       ORDER BY c.id ASC
       FOR UPDATE OF c`,
      [citasIds, rut],
    );
    if (found.rowCount !== citasIds.length) {
      throw new HttpError(
        409,
        'APPOINTMENTS_SCOPE_MISMATCH',
        'Alguna de las citas seleccionadas no existe o no pertenece al RUT indicado.',
      );
    }

    // Revocar atómicamente solicitudes de recuperación pendientes superpuestas sobre estas citas
    // para evitar que un código vigente anterior sobrescriba esta nueva gestión.
    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET revocada_en = NOW(),
           estado_envio = CASE WHEN estado_envio = 'PENDIENTE' THEN 'OMITIDA' ELSE estado_envio END
       WHERE proposito = 'RECUPERACION'
         AND paciente_rut = $1
         AND consumida_en IS NULL
         AND revocada_en IS NULL
         AND citas_ids && $2::int[]`,
      [rut, citasIds],
    );

    // Capturar el estado de origen de los vínculos cuando todas las citas comparten el mismo origen.
    const uniqueOriginLinks = new Set(
      found.rows.map((row) => (row.vinculo_consulta_id ? Number(row.vinculo_consulta_id) : null)),
    );
    let snapshotLinkId = null;
    let snapshotLinkVersion = null;
    if (uniqueOriginLinks.size === 1) {
      const [onlyOrigin] = uniqueOriginLinks;
      if (onlyOrigin === null) {
        snapshotLinkId = null;
        snapshotLinkVersion = 0; // Todas las citas estaban sin vínculo al emitir la solicitud
      } else {
        snapshotLinkId = onlyOrigin;
        snapshotLinkVersion = Number(found.rows[0].vinculo_version);
      }
    }

    await client.query(
      `INSERT INTO solicitudes_verificacion_correo (
         id, proposito, paciente_rut, correo_normalizado, vinculo_id, vinculo_version,
         citas_ids, secretaria_id, motivo, estado_envio, expira_en
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::int[], $8, $9, 'PENDIENTE', $10)`,
      [
        solicitudId,
        PURPOSES.RECUPERACION,
        rut,
        correo,
        snapshotLinkId,
        snapshotLinkVersion,
        citasIds,
        secretary.id,
        motivo,
        expiraEn.toISOString(),
      ],
    );

    await recordAuditEvent(client, {
      secretary,
      accion: AUDIT_ACTIONS.CITA_RECUPERACION_INICIAR,
      entidadTipo: 'CITA',
      entidadId: solicitudId,
      detalles: {
        citas_ids: citasIds,
        cantidad_citas: citasIds.length,
        motivo,
      },
    });

    return {
      solicitud_id: solicitudId,
      rut,
      correo_destino: correo,
      citas_ids: citasIds,
      expira_en: expiraEn.toISOString(),
      mensaje:
        'Solicitud de recuperación creada. Se solicitó el envío del código de verificación al correo de destino.',
    };
  });
}

async function revokeRecoveryRequest({ database = defaultPool, solicitudId, secretary }) {
  if (!isValidOpaqueId(solicitudId)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Indica una solicitud de recuperación válida.', {
      id: 'Identificador de solicitud inválido.',
    });
  }
  const trimmedId = solicitudId.trim();

  return withTransaction(database, async (client) => {
    const found = await client.query(
      `SELECT id, citas_ids, consumida_en, revocada_en, estado_envio
       FROM solicitudes_verificacion_correo
       WHERE id = $1 AND proposito = 'RECUPERACION'
       FOR UPDATE`,
      [trimmedId],
    );
    if (!found.rowCount) {
      throw new HttpError(
        404,
        'RECOVERY_NOT_FOUND',
        'No se encontró la solicitud de recuperación.',
      );
    }
    const row = found.rows[0];
    if (row.consumida_en) {
      throw new HttpError(
        409,
        'RECOVERY_ALREADY_CONSUMED',
        'La solicitud de recuperación ya fue confirmada y no puede revocarse.',
      );
    }
    if (row.revocada_en) {
      throw new HttpError(
        409,
        'RECOVERY_ALREADY_REVOKED',
        'La solicitud de recuperación ya se encontraba revocada.',
      );
    }

    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET revocada_en = NOW(),
           estado_envio = CASE WHEN estado_envio = 'PENDIENTE' THEN 'OMITIDA' ELSE estado_envio END
       WHERE id = $1`,
      [row.id],
    );

    const citasIds = Array.isArray(row.citas_ids) ? row.citas_ids : [];
    await recordAuditEvent(client, {
      secretary,
      accion: AUDIT_ACTIONS.CITA_RECUPERACION_REVOCAR,
      entidadTipo: 'CITA',
      entidadId: row.id,
      detalles: {
        citas_ids: citasIds,
        cantidad_citas: citasIds.length,
      },
    });

    return {
      solicitud_id: row.id,
      revocada: true,
      mensaje: 'Solicitud de recuperación revocada correctamente.',
    };
  });
}

async function confirmRecoveryCode({
  database = defaultPool,
  solicitudId,
  codigo,
  env = process.env,
}) {
  if (!isValidOpaqueId(solicitudId) || !isValidSixDigitCode(codigo)) {
    throw new HttpError(400, 'VERIFICATION_CODE_INVALID', GENERIC_INVALID_CODE_MESSAGE);
  }

  const trimmedId = solicitudId.trim();
  const trimmedCode = codigo.trim();
  const config = getLimitsConfig(env);

  const outcome = await withTransaction(database, async (client) => {
    const found = await client.query(
      `SELECT id, proposito, paciente_rut, correo_normalizado, vinculo_id, vinculo_version,
              citas_ids, secretaria_id, motivo, codigo_hmac, intentos_verificacion,
              expira_en, consumida_en, revocada_en, creado_en
       FROM solicitudes_verificacion_correo
       WHERE id = $1
       FOR UPDATE`,
      [trimmedId],
    );

    if (!found.rowCount) return { ok: false };
    const reqRow = found.rows[0];

    if (
      reqRow.proposito !== PURPOSES.RECUPERACION ||
      reqRow.consumida_en ||
      reqRow.revocada_en ||
      !reqRow.codigo_hmac ||
      !Array.isArray(reqRow.citas_ids) ||
      reqRow.citas_ids.length === 0 ||
      new Date(reqRow.expira_en).getTime() <= Date.now() ||
      reqRow.intentos_verificacion >= config.maxAttemptsPerRequest
    ) {
      return { ok: false };
    }

    const pairLimit = await inspectAndConsumeLimit(client, {
      ambito: 'VERIFY_PAIR',
      key: `${reqRow.proposito}|${reqRow.paciente_rut}|${reqRow.correo_normalizado}`,
      maxCount: config.maxAttemptsPerPair,
      windowMs: config.windowMs,
    });
    if (!pairLimit.allowed) {
      return { ok: false };
    }

    const valid = verifyCodeHmac(
      reqRow.codigo_hmac,
      {
        solicitudId: reqRow.id,
        proposito: reqRow.proposito,
        rut: reqRow.paciente_rut,
        correo: reqRow.correo_normalizado,
        codigo: trimmedCode,
      },
      env,
    );

    if (!valid) {
      await client.query(
        `UPDATE solicitudes_verificacion_correo
         SET intentos_verificacion = intentos_verificacion + 1
         WHERE id = $1`,
        [reqRow.id],
      );
      return { ok: false };
    }

    // Revalidar citas, su RUT y que su vínculo actual no haya cambiado desde la emisión
    const lockedAppointments = await client.query(
      `SELECT c.id, c.vinculo_consulta_id,
              v.version AS vinculo_version_actual,
              v.actualizado_en AS vinculo_actualizado_en
       FROM citas_medicas c
       LEFT JOIN vinculos_consulta_paciente v ON v.id = c.vinculo_consulta_id
       WHERE c.id = ANY($1::int[]) AND c.paciente_rut = $2
       ORDER BY c.id ASC
       FOR UPDATE OF c`,
      [reqRow.citas_ids, reqRow.paciente_rut],
    );

    if (lockedAppointments.rowCount !== reqRow.citas_ids.length) {
      return { ok: false, scopeMismatch: true };
    }

    const requestCreatedMs = new Date(reqRow.creado_en).getTime();
    const originChanged = lockedAppointments.rows.some((row) => {
      if (reqRow.vinculo_version === 0 && reqRow.vinculo_id === null) {
        return row.vinculo_consulta_id !== null;
      }
      if (reqRow.vinculo_id !== null) {
        return (
          Number(row.vinculo_consulta_id) !== Number(reqRow.vinculo_id) ||
          Number(row.vinculo_version_actual) !== Number(reqRow.vinculo_version)
        );
      }
      if (row.vinculo_actualizado_en) {
        return new Date(row.vinculo_actualizado_en).getTime() > requestCreatedMs;
      }
      return false;
    });

    if (originChanged) {
      await client.query(
        `UPDATE solicitudes_verificacion_correo
         SET revocada_en = NOW()
         WHERE id = $1 AND revocada_en IS NULL`,
        [reqRow.id],
      );
      return { ok: false, scopeMismatch: true };
    }

    const linkResult = await client.query(
      `INSERT INTO vinculos_consulta_paciente (paciente_rut, correo_normalizado, verificado_en)
       VALUES ($1, $2, NOW())
       ON CONFLICT (paciente_rut, correo_normalizado)
       DO UPDATE SET
         verificado_en = NOW(),
         version = vinculos_consulta_paciente.version + 1,
         actualizado_en = NOW()
       RETURNING id`,
      [reqRow.paciente_rut, reqRow.correo_normalizado],
    );
    const targetLinkId = Number(linkResult.rows[0].id);

    const affectedLinkIds = new Set([targetLinkId]);
    for (const row of lockedAppointments.rows) {
      if (row.vinculo_consulta_id) {
        affectedLinkIds.add(Number(row.vinculo_consulta_id));
      }
    }

    const previousLinkIds = [...affectedLinkIds].filter((id) => id !== targetLinkId);
    if (previousLinkIds.length > 0) {
      await client.query(
        `UPDATE vinculos_consulta_paciente
         SET version = version + 1, actualizado_en = NOW()
         WHERE id = ANY($1::bigint[])`,
        [previousLinkIds],
      );
    }

    // Invalidar solicitudes de consulta pendientes de todos los vínculos afectados
    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET revocada_en = NOW(),
           estado_envio = CASE WHEN estado_envio = 'PENDIENTE' THEN 'OMITIDA' ELSE estado_envio END
       WHERE proposito = 'CONSULTA'
         AND vinculo_id = ANY($1::bigint[])
         AND consumida_en IS NULL
         AND revocada_en IS NULL`,
      [[...affectedLinkIds]],
    );

    // Revocar cualquier otra solicitud de recuperación pendiente que se superponga con estas citas
    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET revocada_en = NOW(),
           estado_envio = CASE WHEN estado_envio = 'PENDIENTE' THEN 'OMITIDA' ELSE estado_envio END
       WHERE proposito = 'RECUPERACION'
         AND id <> $1
         AND paciente_rut = $2
         AND consumida_en IS NULL
         AND revocada_en IS NULL
         AND citas_ids && $3::int[]`,
      [reqRow.id, reqRow.paciente_rut, reqRow.citas_ids],
    );

    // Actualizar únicamente el vínculo de las citas seleccionadas (conserva paciente_email original)
    await client.query(
      `UPDATE citas_medicas
       SET vinculo_consulta_id = $1
       WHERE id = ANY($2::int[]) AND paciente_rut = $3`,
      [targetLinkId, reqRow.citas_ids, reqRow.paciente_rut],
    );

    await client.query(
      `UPDATE solicitudes_verificacion_correo
       SET consumida_en = NOW()
       WHERE id = $1`,
      [reqRow.id],
    );

    if (reqRow.secretaria_id) {
      await recordAuditEvent(client, {
        secretary: { id: Number(reqRow.secretaria_id) },
        accion: AUDIT_ACTIONS.CITA_RECUPERACION_COMPLETAR,
        entidadTipo: 'CITA',
        entidadId: reqRow.id,
        detalles: {
          citas_ids: reqRow.citas_ids,
          cantidad_citas: reqRow.citas_ids.length,
          vinculos_afectados: affectedLinkIds.size,
        },
      });
    }

    return {
      ok: true,
      citas_vinculadas: reqRow.citas_ids.length,
      rut: reqRow.paciente_rut,
      correo: reqRow.correo_normalizado,
    };
  });

  if (!outcome.ok) {
    if (outcome.scopeMismatch) {
      throw new HttpError(
        409,
        'APPOINTMENTS_SCOPE_MISMATCH',
        'Las citas de esta solicitud ya no coinciden con el alcance autorizado.',
      );
    }
    throw new HttpError(400, 'VERIFICATION_CODE_INVALID', GENERIC_INVALID_CODE_MESSAGE);
  }

  return {
    citas_vinculadas: outcome.citas_vinculadas,
    rut: outcome.rut,
    correo: outcome.correo,
    mensaje:
      'Verificación completada. Las citas seleccionadas ya están disponibles para consultar con este correo.',
  };
}

module.exports = {
  PURPOSES,
  GENERIC_LOOKUP_MESSAGE,
  GENERIC_INVALID_CODE_MESSAGE,
  INSECURE_HMAC_SECRETS,
  MIN_PRODUCTION_HMAC_SECRET_LENGTH,
  isStrictHmacEnvironment,
  validateHmacSecretConfig,
  getLimitsConfig,
  generateOpaqueId,
  generateSixDigitCode,
  computeCodeHmac,
  verifyCodeHmac,
  hashSecretToken,
  isValidOpaqueId,
  isValidSixDigitCode,
  purgeExpiredVerificationData,
  requestBookingVerification,
  verifyBookingCode,
  requestLookupVerification,
  verifyLookupCode,
  searchRecoveryAppointments,
  createRecoveryRequest,
  revokeRecoveryRequest,
  confirmRecoveryCode,
};
