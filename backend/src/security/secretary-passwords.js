const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidUsername(value) {
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value);
}

function isValidPassword(value) {
  return (
    typeof value === 'string' && Buffer.byteLength(value) >= 12 && Buffer.byteLength(value) <= 256
  );
}

async function hashPassword(password) {
  if (!isValidPassword(password)) {
    throw new Error('La contraseña debe tener entre 12 y 256 bytes.');
  }
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32, SCRYPT_OPTIONS);
  return `scrypt$32768$8$3$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (
    typeof password !== 'string' ||
    Buffer.byteLength(password) > 256 ||
    typeof storedHash !== 'string'
  ) {
    return false;
  }
  const parts = storedHash.split('$');
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    parts[1] !== '32768' ||
    parts[2] !== '8' ||
    parts[3] !== '3' ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{64}$/.test(parts[5])
  )
    return false;
  const expected = Buffer.from(parts[5], 'hex');
  const actual = await scryptAsync(
    password,
    Buffer.from(parts[4], 'hex'),
    expected.length,
    SCRYPT_OPTIONS,
  );
  return timingSafeEqual(actual, expected);
}

module.exports = {
  normalizeUsername,
  isValidUsername,
  isValidPassword,
  hashPassword,
  verifyPassword,
};
