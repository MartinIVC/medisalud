const { pool } = require('../db');
const { asyncHandler, sendError } = require('./errors');
const { findSecretarySession } = require('../services/secretary-accounts');

const requireSecretary = asyncHandler(async (req, res, next) => {
  const match = /^Bearer\s+([A-Za-z0-9_-]{43})$/i.exec(req.get('Authorization') || '');
  const session = match
    ? await findSecretarySession(req.app.locals.database || pool, match[1])
    : null;
  if (!session) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Se requiere una sesión de secretaría vigente.');
  }
  req.secretary = session.secretary;
  req.secretarySessionHash = session.tokenHash;
  return next();
});

module.exports = { requireSecretary };
