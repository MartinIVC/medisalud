const crypto = require('crypto');
const { sendError } = require('./errors');

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SECRETARY_TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verify(token) {
  if (!token || !process.env.SECRETARY_TOKEN_SECRET) return false;
  const [body, signature] = token.split('.');
  if (!body || !signature) return false;
  const expected = crypto.createHmac('sha256', process.env.SECRETARY_TOKEN_SECRET).update(body).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

function requireSecretary(req, res, next) {
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!verify(token)) return sendError(res, 401, 'UNAUTHORIZED', 'Se requiere una sesión de secretaría vigente.');
  next();
}

function createSecretaryToken() {
  return sign({ role: 'secretaria', exp: Date.now() + 8 * 60 * 60 * 1000 });
}

module.exports = { requireSecretary, createSecretaryToken };
