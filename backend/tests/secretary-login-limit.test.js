const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticateSecretary } = require('../src/services/secretary-accounts');

test('rechaza entradas fuera de límite antes de registrar intentos', async () => {
  const database = {
    async query() {
      throw new Error('No debe consultar la base');
    },
  };
  assert.equal(
    await authenticateSecretary(database, {
      username: 'usuario.valido',
      password: 'a'.repeat(257),
    }),
    null,
  );
  assert.equal(await authenticateSecretary(database, { username: '?', password: 'clave' }), null);
});

test('limita accesos simultáneos y libera el cupo aun cuando falla la base', async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const database = {
    async query() {
      await pending;
      throw new Error('Error ficticio de base de datos');
    },
  };
  const attempts = Array.from({ length: 4 }, (_, index) =>
    authenticateSecretary(database, { username: `usuario.${index}`, password: 'Clave ficticia' }),
  );
  await assert.rejects(
    authenticateSecretary(database, { username: 'otro.usuario', password: 'Clave ficticia' }),
    { status: 503, code: 'SERVICE_UNAVAILABLE' },
  );
  release();
  const results = await Promise.allSettled(attempts);
  assert.ok(results.every((result) => result.status === 'rejected'));
  await assert.rejects(
    authenticateSecretary(database, { username: 'otro.usuario', password: 'Clave ficticia' }),
    /Error ficticio de base de datos/,
  );
});
