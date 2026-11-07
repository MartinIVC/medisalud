const { createHash, randomBytes } = require('node:crypto');
const { withTransaction } = require('../db/transaction');
const { HttpError } = require('../middleware/errors');
const {
  normalizeUsername,
  isValidUsername,
  isValidPassword,
  hashPassword,
  verifyPassword,
} = require('../security/secretary-passwords');

const SESSION_SECONDS = 8 * 60 * 60;
const ACCOUNT_ATTEMPT_LIMIT = 5;
const MAX_CONCURRENT_LOGINS = 4;
let activeLogins = 0;
let dummyHashPromise;

function hashValue(value) {
  return createHash('sha256').update(value).digest('hex');
}

function usernameOrThrow(value) {
  const username = normalizeUsername(value);
  if (!isValidUsername(username)) {
    throw new Error(
      'El usuario debe tener entre 3 y 64 caracteres: letras, números, punto, guion o guion bajo.',
    );
  }
  return username;
}

async function createSecretary(database, { username: value, password }) {
  const username = usernameOrThrow(value);
  if (!isValidPassword(password)) throw new Error('La contraseña debe tener entre 12 y 256 bytes.');
  const passwordHash = await hashPassword(password);
  const result = await database.query(
    `INSERT INTO secretarias (usuario, contrasena_hash)
     VALUES ($1, $2) RETURNING id, usuario, activo`,
    [username, passwordHash],
  );
  return result.rows[0];
}

async function setSecretaryActive(database, value, active) {
  const username = usernameOrThrow(value);
  return withTransaction(database, async (client) => {
    const result = await client.query(
      'UPDATE secretarias SET activo = $2 WHERE usuario = $1 RETURNING id, usuario, activo',
      [username, active],
    );
    if (!result.rowCount) return null;
    await client.query('DELETE FROM sesiones_secretaria WHERE secretaria_id = $1', [
      result.rows[0].id,
    ]);
    await client.query('DELETE FROM intentos_acceso_secretaria WHERE clave_hash = $1', [
      hashValue(`cuenta:${username}`),
    ]);
    return result.rows[0];
  });
}

async function resetSecretaryPassword(database, value, password) {
  const username = usernameOrThrow(value);
  if (!isValidPassword(password)) throw new Error('La contraseña debe tener entre 12 y 256 bytes.');
  const passwordHash = await hashPassword(password);
  return withTransaction(database, async (client) => {
    const result = await client.query(
      'UPDATE secretarias SET contrasena_hash = $2 WHERE usuario = $1 RETURNING id, usuario, activo',
      [username, passwordHash],
    );
    if (!result.rowCount) return null;
    await client.query('DELETE FROM sesiones_secretaria WHERE secretaria_id = $1', [
      result.rows[0].id,
    ]);
    await client.query('DELETE FROM intentos_acceso_secretaria WHERE clave_hash = $1', [
      hashValue(`cuenta:${username}`),
    ]);
    return result.rows[0];
  });
}

async function consumeLoginAttempt(database, username) {
  const accountKey = hashValue(`cuenta:${username}`);
  await database.query(
    "DELETE FROM intentos_acceso_secretaria WHERE ventana_inicio < NOW() - INTERVAL '1 day'",
  );
  const result = await database.query(
    `INSERT INTO intentos_acceso_secretaria (clave_hash, intentos, ventana_inicio)
     VALUES ($1, 1, NOW())
     ON CONFLICT (clave_hash) DO UPDATE SET
       intentos = CASE WHEN intentos_acceso_secretaria.ventana_inicio <= NOW() - INTERVAL '15 minutes'
                       THEN 1 ELSE intentos_acceso_secretaria.intentos + 1 END,
       ventana_inicio = CASE WHEN intentos_acceso_secretaria.ventana_inicio <= NOW() - INTERVAL '15 minutes'
                             THEN NOW() ELSE intentos_acceso_secretaria.ventana_inicio END
     RETURNING clave_hash, intentos`,
    [accountKey],
  );
  return { accountKey, allowed: Number(result.rows[0].intentos) <= ACCOUNT_ATTEMPT_LIMIT };
}

async function authenticateSecretary(database, { username: rawUsername, password }) {
  if (activeLogins >= MAX_CONCURRENT_LOGINS) {
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Demasiados intentos simultáneos.');
  }
  activeLogins += 1;
  try {
    return await authenticateSecretaryWithinLimit(database, { username: rawUsername, password });
  } finally {
    activeLogins -= 1;
  }
}

async function authenticateSecretaryWithinLimit(database, { username: rawUsername, password }) {
  const username = normalizeUsername(rawUsername);
  if (
    !isValidUsername(username) ||
    typeof password !== 'string' ||
    Buffer.byteLength(password) > 256
  )
    return null;
  const { accountKey, allowed } = await consumeLoginAttempt(database, username);
  if (!allowed) return null;
  const found = await database.query(
    'SELECT id, usuario, contrasena_hash, activo FROM secretarias WHERE usuario = $1',
    [username],
  );
  if (!dummyHashPromise) dummyHashPromise = hashPassword(randomBytes(24).toString('hex'));
  const candidate = found.rows[0];
  const valid = await verifyPassword(
    typeof password === 'string' ? password : '',
    candidate?.contrasena_hash || (await dummyHashPromise),
  );
  if (!valid || !candidate?.activo) return null;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashValue(token);
  return withTransaction(database, async (client) => {
    const current = await client.query(
      'SELECT id, usuario FROM secretarias WHERE id = $1 AND activo = TRUE AND contrasena_hash = $2 FOR UPDATE',
      [candidate.id, candidate.contrasena_hash],
    );
    if (!current.rowCount) return null;
    await client.query(
      `INSERT INTO sesiones_secretaria (token_hash, secretaria_id, expira_en)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
      [tokenHash, candidate.id, SESSION_SECONDS],
    );
    await client.query('DELETE FROM intentos_acceso_secretaria WHERE clave_hash = $1', [
      accountKey,
    ]);
    return { token, expires_in: SESSION_SECONDS, secretaria: current.rows[0] };
  });
}

async function findSecretarySession(database, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = hashValue(token);
  const result = await database.query(
    `SELECT s.id, s.usuario FROM sesiones_secretaria ss
       JOIN secretarias s ON s.id = ss.secretaria_id
      WHERE ss.token_hash = $1 AND ss.expira_en > NOW() AND s.activo = TRUE`,
    [tokenHash],
  );
  return result.rowCount ? { secretary: result.rows[0], tokenHash } : null;
}

async function revokeSecretarySession(database, tokenHash) {
  await database.query('DELETE FROM sesiones_secretaria WHERE token_hash = $1', [tokenHash]);
}

module.exports = {
  SESSION_SECONDS,
  createSecretary,
  setSecretaryActive,
  resetSecretaryPassword,
  authenticateSecretary,
  findSecretarySession,
  revokeSecretarySession,
};
