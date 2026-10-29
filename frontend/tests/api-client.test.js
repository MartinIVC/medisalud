import test from 'node:test';
import assert from 'node:assert/strict';
import { idempotencyKeyFor, requestApi } from '../src/api/client.js';

test('requestApi serializa JSON, agrega autenticación y normaliza la respuesta', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true, value: 1 }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await requestApi('/api/test', { method: 'POST', token: 'secret', body: { value: 1 } });
    assert.equal(result.status, 201);
    assert.equal(result.data.value, 1);
    assert.equal(request.options.headers.get('Authorization'), 'Bearer secret');
    assert.equal(request.options.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(request.options.body), { value: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestApi comunica 401 al flujo de sesión y mantiene detalles de campos', async () => {
  const originalFetch = globalThis.fetch;
  let expired = false;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Sesión vencida.', fields: { rut: 'Inválido.' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const result = await requestApi('/api/secretary', { onUnauthorized: () => { expired = true; } });
    assert.equal(result.status, 401);
    assert.equal(expired, true);
    assert.equal(result.data.fields.rut, 'Inválido.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('la clave de idempotencia se mantiene al repetir el contenido y cambia al editarlo', () => {
  const reference = { current: null };
  const first = idempotencyKeyFor(reference, { agenda_id: 3, nombre: 'Ana' });
  assert.equal(idempotencyKeyFor(reference, { agenda_id: 3, nombre: 'Ana' }), first);
  assert.notEqual(idempotencyKeyFor(reference, { agenda_id: 4, nombre: 'Ana' }), first);
});
