const test = require('node:test');
const assert = require('node:assert/strict');
const { errorHandler } = require('../src/middleware/errors');

function response() {
  return {
    statusCode: null,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('JSON inválido y base desconectada usan el contrato de error común', () => {
  const invalidJson = response();
  errorHandler({ type: 'entity.parse.failed' }, {}, invalidJson, () => {});
  assert.equal(invalidJson.statusCode, 400);
  assert.deepEqual(invalidJson.body, {
    ok: false,
    code: 'INVALID_JSON',
    codigo_error: 'INVALID_JSON',
    error: 'El cuerpo de la solicitud no contiene JSON válido.',
    mensaje: 'El cuerpo de la solicitud no contiene JSON válido.',
  });

  const unavailable = response();
  const connectionError = new Error('connection details must stay internal');
  connectionError.code = 'ECONNREFUSED';
  errorHandler(connectionError, {}, unavailable, () => {});
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.body.code, 'SERVICE_UNAVAILABLE');
  assert.equal(unavailable.body.error.includes('connection details'), false);
});
