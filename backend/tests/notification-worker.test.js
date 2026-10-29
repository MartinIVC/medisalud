const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationWorker } = require('../src/notifications/queue');

function fakePool({ appointmentState = 'CONFIRMADA', failAcceptedUpdate = false } = {}) {
  const queries = [];
  let activeConnections = 0;
  const notification = {
    id: 17,
    cita_id: 9,
    canal: 'EMAIL',
    tipo: 'CONFIRMACION',
    destinatario: 'test@example.cl',
    asunto: 'Confirmación',
    contenido: 'Prueba',
  };

  return {
    queries,
    get activeConnections() {
      return activeConnections;
    },
    async query(sql, values = []) {
      queries.push({ sql, values, source: 'pool' });
      if (sql.startsWith('SELECT estado FROM citas_medicas')) {
        return { rowCount: 1, rows: [{ estado: appointmentState }] };
      }
      throw new Error(`Consulta inesperada vía pool: ${sql}`);
    },
    async connect() {
      activeConnections += 1;
      return {
        async query(sql, values = []) {
          queries.push({ sql, values, source: 'client' });
          if (sql.startsWith('WITH lote AS'))
            return { rowCount: 1, rows: [{ ...notification, claim_token: values[0] }] };
          if (sql.includes("SET estado='ACEPTADO'")) {
            if (failAcceptedUpdate) throw new Error('database update failed');
            return { rowCount: 1, rows: [{ id: notification.id }] };
          }
          if (sql.includes("SET estado='FALLIDA'")) return { rowCount: 1, rows: [] };
          if (sql.includes("SET estado='OMITIDA'")) return { rowCount: 1, rows: [] };
          if (sql.startsWith('UPDATE citas_medicas')) return { rowCount: 1, rows: [] };
          return { rowCount: 0, rows: [] };
        },
        release() {
          activeConnections -= 1;
        },
      };
    },
  };
}

test('el worker persiste ACEPTADO tras liberar la conexión de toma', async () => {
  const database = fakePool();
  let delivered = false;
  const worker = createNotificationWorker({
    database,
    providers: {
      EMAIL: async () => {
        assert.equal(database.activeConnections, 0);
        delivered = true;
        return { status: 'ACEPTADO', provider: 'simulado', providerId: 'msg-17' };
      },
    },
    createClaimToken: () => '8be96a36-fd37-4cb8-a912-1c017fe1b16a',
  });

  const result = await worker();
  assert.equal(delivered, true);
  assert.deepEqual(result, { claimed: 1 });
  const claimSql = database.queries.find(({ sql }) => sql.startsWith('WITH lote AS')).sql;
  assert.match(claimSql, /FOR UPDATE OF n SKIP LOCKED/);
  assert.match(claimSql, /lease_until/);
  const accepted = database.queries.find(({ sql }) => sql.includes("SET estado='ACEPTADO'"));
  assert.ok(accepted);
  assert.deepEqual(accepted.values, [
    17,
    '8be96a36-fd37-4cb8-a912-1c017fe1b16a',
    'simulado',
    'msg-17',
  ]);
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("SET estado='FALLIDA'")),
    false,
  );
});

test('el fallo del proveedor produce FALLIDA y no se traduce en estado de aceptación', async () => {
  const database = fakePool();
  const worker = createNotificationWorker({
    database,
    providers: {
      EMAIL: async () => {
        throw new Error('provider unavailable');
      },
    },
  });

  await worker();
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("SET estado='FALLIDA'")),
    true,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("SET estado='ACEPTADO'")),
    false,
  );
});

test('si falla la persistencia después de aceptar, no se marca como fallo del proveedor', async () => {
  const database = fakePool({ failAcceptedUpdate: true });
  const worker = createNotificationWorker({
    database,
    providers: {
      EMAIL: async () => ({ status: 'ACEPTADO', provider: 'simulado', providerId: 'msg-17' }),
    },
  });

  await assert.rejects(() => worker(), /database update failed/);
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("SET estado='FALLIDA'")),
    false,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("SET estado='ACEPTADO'")),
    true,
  );
});

test('una notificación reclamada no se vuelve a enviar si la cita fue cancelada', async () => {
  const database = fakePool({ appointmentState: 'CANCELADA' });
  let delivered = false;
  const worker = createNotificationWorker({
    database,
    providers: {
      EMAIL: async () => {
        delivered = true;
        return { status: 'ACEPTADO' };
      },
    },
  });

  await worker();
  assert.equal(delivered, false);
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("SET estado='OMITIDA'")),
    true,
  );
});

test('el proveedor queda limitado por un timeout y la toma se libera para reintento', async () => {
  const database = fakePool();
  const worker = createNotificationWorker({
    database,
    timeoutMs: 5,
    providers: { EMAIL: () => new Promise(() => {}) },
  });

  await worker();
  const failed = database.queries.find(({ sql }) => sql.includes("SET estado='FALLIDA'"));
  assert.ok(failed);
  assert.match(failed.values[2], /superó el límite/);
});
