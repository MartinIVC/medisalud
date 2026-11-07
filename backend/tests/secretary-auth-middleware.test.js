const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createApp } = require('../src/app');

test('la sesión y su cierre utilizan la base configurada en la aplicación', async (t) => {
  const queries = [];
  const database = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('JOIN secretarias')) {
        return { rowCount: 1, rows: [{ id: 1, usuario: 'secretaria.prueba' }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const token = 'A'.repeat(43);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/auth/secretaria/logout`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(queries.length, 2);
  const hash = createHash('sha256').update(token).digest('hex');
  assert.deepEqual(
    queries.map((query) => query.params),
    [[hash], [hash]],
  );
  assert.match(queries[1].sql, /DELETE FROM sesiones_secretaria/);
});
