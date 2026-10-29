class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function asyncHandler(handler) {
  return function handledAsyncRoute(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, code: 'INVALID_JSON', error: 'El cuerpo de la solicitud no contiene JSON válido.' });
  }

  const status = error.status || (['ECONNREFUSED', 'ETIMEDOUT', '53300'].includes(error.code) ? 503 : 500);
  const code = error.status && error.code && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code)
    ? error.code
    : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
  if (status >= 500) console.error('[API] Error no controlado:', error.message);
  return res.status(status).json({
    ok: false,
    code,
    error: status >= 500 ? 'Ocurrió un error interno. Intenta nuevamente.' : error.message,
    ...(error.fields ? { fields: error.fields } : {}),
  });
}

module.exports = { HttpError, asyncHandler, errorHandler };
