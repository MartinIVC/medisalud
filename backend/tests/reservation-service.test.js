const test = require('node:test');
const assert = require('node:assert/strict');
const { createReservation, reservationFingerprint } = require('../src/services/reservas');
const { HttpError } = require('../src/middleware/errors');

function fakePool({ slot = {}, previous = null } = {}) {
  const queries = [];
  let released = false;
  const slotData = {
    id: 12,
    medico_id: 7,
    estado: 'DISPONIBLE',
    fecha: '2026-11-28',
    hora_inicio: '09:00',
    hora_fin: '09:30',
    medico_nombre: 'Dra. Prueba',
    box_atencion: 'Box T',
    especialidad_nombre: 'Medicina General',
    activo: true,
    futuro: true,
    bloqueado: false,
    ...slot,
  };
  let currentClient;

  return {
    queries,
    get released() {
      return released;
    },
    get client() {
      return currentClient;
    },
    async connect() {
      currentClient = {
        async query(sql, values = []) {
          queries.push({ sql, values });
          if (sql.startsWith('SELECT medico_id FROM agendas'))
            return { rowCount: 1, rows: [{ medico_id: 7 }] };
          if (sql.startsWith('SELECT id, activo FROM medicos'))
            return { rowCount: 1, rows: [{ id: 7, activo: slotData.activo }] };
          if (sql.startsWith('SELECT a.id, a.medico_id')) return { rowCount: 1, rows: [slotData] };
          if (sql.startsWith('SELECT solicitud_payload_hash'))
            return previous ? { rowCount: 1, rows: [previous] } : { rowCount: 0, rows: [] };
          if (sql.startsWith('SELECT id FROM agendas')) return { rowCount: 0, rows: [] };
          if (sql.startsWith('UPDATE agendas')) return { rowCount: 1, rows: [{ id: 12 }] };
          if (sql.startsWith('INSERT INTO citas_medicas'))
            return {
              rowCount: 1,
              rows: [{ id: 21, codigo_reserva: 'MED-2026-ABCDEF', created_at: 'now' }],
            };
          if (sql.startsWith('INSERT INTO notificaciones')) return { rowCount: 1, rows: [] };
          if (sql.startsWith('UPDATE citas_medicas SET solicitud_respuesta'))
            return { rowCount: 1, rows: [] };
          return { rowCount: 0, rows: [] };
        },
        release() {
          released = true;
        },
      };
      return currentClient;
    },
  };
}

const values = {
  agendaId: 12,
  rut: '12.345.678-5',
  nombre: 'Ana Pérez',
  email: 'ana@example.cl',
  telefono: '+56912345678',
  origen: 'WEB',
  requestKey: null,
};

test('la reserva revalida el estado, la actividad, la hora futura y los bloqueos', async (context) => {
  for (const [description, slot] of [
    ['médico inactivo', { activo: false }],
    ['bloque vencido', { futuro: false }],
    ['fecha bloqueada', { bloqueado: true }],
    ['cupo ocupado', { estado: 'RESERVADO' }],
  ]) {
    await context.test(description, async () => {
      const database = fakePool({ slot });
      await assert.rejects(
        () =>
          createReservation({
            database,
            values,
            randomBytes: () => Buffer.from('abcdef'),
            enqueueConfirmation: async () => ({ status: 'PENDIENTE' }),
          }),
        (error) => error instanceof HttpError && error.status === 409,
      );
      assert.equal(
        database.queries.some(({ sql }) => sql.startsWith('UPDATE agendas')),
        false,
      );
      assert.equal(database.queries.at(-1).sql, 'ROLLBACK');
      assert.equal(database.released, true);
    });
  }
});

test('la reserva crea la cita y encola las notificaciones en la misma transacción', async () => {
  const database = fakePool();
  let enqueued = false;
  const result = await createReservation({
    database,
    values: { ...values, requestKey: 'web-booking-first' },
    randomBytes: (size) => Buffer.alloc(size, 1),
    enqueueConfirmation: async ({ client, codigoReserva }) => {
      enqueued = true;
      assert.equal(client, database.client);
      assert.match(codigoReserva, /^MED-\d{4}-[A-F0-9]{12}$/);
      return { status: 'PENDIENTE' };
    },
  });
  assert.equal(enqueued, true);
  assert.equal(result.response.reserva.paciente_nombre, 'Ana Pérez');
  assert.equal(
    database.queries.some(({ sql }) =>
      sql.startsWith('UPDATE citas_medicas SET solicitud_respuesta'),
    ),
    true,
  );
  assert.equal(database.queries.at(-1).sql, 'COMMIT');
  assert.equal(database.released, true);
});

test('una clave repetida recupera el mismo comprobante y no crea otra cita', async () => {
  const request = { ...values, requestKey: 'web-booking-1' };
  const expectedResponse = {
    reserva: { codigo_reserva: 'MED-2026-ABCDEF' },
    comprobante_correo: { id: '3' },
  };
  const database = fakePool({
    previous: {
      solicitud_payload_hash: reservationFingerprint(request),
      solicitud_respuesta: expectedResponse,
    },
  });
  const result = await createReservation({ database, values: request });
  assert.equal(result.repeated, true);
  assert.deepEqual(result.response, expectedResponse);
  assert.equal(
    database.queries.some(({ sql }) => sql.startsWith('INSERT INTO citas_medicas')),
    false,
  );
});

test('reutilizar una clave con contenido diferente produce un conflicto antes de escribir', async () => {
  const request = { ...values, requestKey: 'web-booking-1' };
  const database = fakePool({
    previous: {
      solicitud_payload_hash: '0'.repeat(64),
      solicitud_respuesta: { reserva: { codigo_reserva: 'MED-2026-ABCDEF' } },
    },
  });
  await assert.rejects(
    () => createReservation({ database, values: request }),
    (error) => error instanceof HttpError && error.code === 'IDEMPOTENCY_CONFLICT',
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.startsWith('UPDATE agendas')),
    false,
  );
});
