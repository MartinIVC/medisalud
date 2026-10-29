const test = require('node:test');
const assert = require('node:assert/strict');
const { withTransaction } = require('../src/db/transaction');

function fakePool({ failRollback = false } = {}) {
  const events = [];
  const client = {
    async query(sql) {
      events.push(sql);
      if (failRollback && sql === 'ROLLBACK') throw new Error('rollback failed');
      return { rows: [] };
    },
    release() { events.push('RELEASE'); },
  };
  return { events, async connect() { return client; } };
}

test('withTransaction confirma y libera en éxito', async () => {
  const pool = fakePool();
  const result = await withTransaction(pool, async () => 'done', { isolation: 'SERIALIZABLE' });
  assert.equal(result, 'done');
  assert.deepEqual(pool.events, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'COMMIT', 'RELEASE']);
});

test('withTransaction conserva el error original si falla el rollback', async () => {
  const pool = fakePool({ failRollback: true });
  const original = new Error('operation failed');
  await assert.rejects(() => withTransaction(pool, async () => { throw original; }), (error) => error === original);
  assert.deepEqual(pool.events, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK', 'RELEASE']);
});

test('withTransaction rechaza niveles de aislamiento no permitidos', async () => {
  const pool = fakePool();
  await assert.rejects(() => withTransaction(pool, async () => null, { isolation: 'READ UNCOMMITTED' }), TypeError);
  assert.deepEqual(pool.events, []);
});
