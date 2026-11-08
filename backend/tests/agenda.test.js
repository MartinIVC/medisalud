const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError } = require('../src/middleware/errors');
const {
  generateIntervals,
  configureAgenda,
  blockAgenda,
  unblockAgenda,
} = require('../src/services/agenda');

test('la generación de bloques no cruza medianoche ni trunca la hora de fin', () => {
  const intervals = generateIntervals('09:00', '23:59', 30);
  assert.equal(intervals.length, 29);
  assert.deepEqual(intervals.at(-1), { start: '23:00', end: '23:30' });
  assert.equal(
    intervals.some(({ end }) => end === '00:00'),
    false,
  );
});

test('la generación omite un rango menor que el bloque y admite duraciones válidas', () => {
  assert.deepEqual(generateIntervals('09:00', '09:14', 15), []);
  assert.equal(generateIntervals('09:00', '12:00', 20).length, 9);
  assert.equal(generateIntervals('09:00', '10:00', 15).length, 4);
  assert.equal(generateIntervals('09:00', '10:00', 30).length, 2);
});

test('reconfigurar conserva los bloques disponibles que tienen citas históricas', async () => {
  const statements = [];
  let released = false;
  const pool = {
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('SELECT id FROM medicos')) return { rowCount: 1, rows: [{ id: 2 }] };
          if (sql.includes('AS futuro')) return { rowCount: 1, rows: [{ futuro: true }] };
          if (sql.startsWith('SELECT 1 FROM bloqueos_agenda')) return { rowCount: 0, rows: [] };
          if (sql.startsWith('SELECT COUNT(*)')) return { rowCount: 1, rows: [{ total: 1 }] };
          if (sql.startsWith('DELETE FROM agendas')) return { rowCount: 3, rows: [] };
          if (sql.startsWith('WITH requested'))
            return { rowCount: 2, rows: [{ id: 11 }, { id: 12 }] };
          return { rowCount: 0, rows: [] };
        },
        release() {
          released = true;
        },
      };
    },
  };

  const result = await configureAgenda(pool, {
    medicoId: 2,
    fecha: '2026-11-15',
    horaInicio: '09:00',
    horaFin: '10:00',
    duracion: 30,
  });
  assert.equal(result.historyCount, 1);
  assert.equal(result.deletedCount, 3);
  assert.equal(result.blocks.length, 2);
  assert.equal(released, true);
  const deletion = statements.find((sql) => sql.startsWith('DELETE FROM agendas'));
  assert.match(deletion, /NOT EXISTS \(SELECT 1 FROM citas_medicas/);
  assert.match(deletion, /AT TIME ZONE 'America\/Santiago'\) > NOW\(\)/);
});

test('configurar horarios rechaza con 409 AGENDA_PAST si la fecha u hora de inicio ya pasó', async () => {
  const statements = [];
  const pool = {
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (sql.startsWith('SELECT id FROM medicos')) return { rowCount: 1, rows: [{ id: 2 }] };
          if (sql.includes('AS futuro')) return { rowCount: 1, rows: [{ futuro: false }] };
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
    },
  };

  await assert.rejects(
    () =>
      configureAgenda(pool, {
        medicoId: 2,
        fecha: '2026-11-01',
        horaInicio: '09:00',
        horaFin: '10:00',
        duracion: 30,
      }),
    (error) => error instanceof HttpError && error.status === 409 && error.code === 'AGENDA_PAST',
  );
  assert.equal(
    statements.some((sql) => sql.startsWith('DELETE FROM agendas')),
    false,
  );
});

test('bloquear y desbloquear un bloque vencido rechazan con 409 SLOT_PAST tras bloquear al médico', async () => {
  for (const [operation, initialState] of [
    [(pool) => blockAgenda(pool, { agendaId: 77, motivo: 'Ausencia' }), 'DISPONIBLE'],
    [(pool) => unblockAgenda(pool, { agendaId: 77 }), 'BLOQUEADO'],
  ]) {
    const statements = [];
    const pool = {
      async connect() {
        return {
          async query(sql) {
            statements.push(sql);
            if (sql.startsWith('SELECT medico_id')) {
              return { rowCount: 1, rows: [{ medico_id: 4, fecha: '2026-11-05' }] };
            }
            if (sql.startsWith('SELECT id FROM medicos WHERE id=$1 FOR UPDATE')) {
              return { rowCount: 1, rows: [{ id: 4 }] };
            }
            if (sql.includes('FROM agendas WHERE id=$1 FOR UPDATE')) {
              return {
                rowCount: 1,
                rows: [{ fecha: '2026-11-05', estado: initialState, futuro: false }],
              };
            }
            return { rowCount: 0, rows: [] };
          },
          release() {},
        };
      },
    };

    await assert.rejects(
      () => operation(pool),
      (error) => error instanceof HttpError && error.status === 409 && error.code === 'SLOT_PAST',
    );
    const doctorLockIdx = statements.findIndex((sql) =>
      sql.startsWith('SELECT id FROM medicos WHERE id=$1 FOR UPDATE'),
    );
    const slotLockIdx = statements.findIndex((sql) =>
      sql.includes('FROM agendas WHERE id=$1 FOR UPDATE'),
    );
    assert.ok(doctorLockIdx !== -1 && slotLockIdx !== -1 && doctorLockIdx < slotLockIdx);
    assert.equal(
      statements.some((sql) => sql.startsWith('UPDATE agendas')),
      false,
    );
  }
});

test('bloquear y desbloquear por fecha rechazan fechas pasadas y solo actualizan bloques futuros en fechas vigentes', async () => {
  const pastPool = {
    async connect() {
      return {
        async query(sql) {
          if (sql.startsWith('SELECT id FROM medicos')) return { rowCount: 1, rows: [{ id: 2 }] };
          if (sql.includes('AS vigente')) return { rowCount: 1, rows: [{ vigente: false }] };
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
    },
  };

  await assert.rejects(
    () => blockAgenda(pastPool, { medicoId: 2, fecha: '2026-11-01', motivo: 'Feriado' }),
    (error) =>
      error instanceof HttpError && error.status === 409 && error.code === 'AGENDA_DATE_PAST',
  );
  await assert.rejects(
    () => unblockAgenda(pastPool, { global: true, fecha: '2026-11-01' }),
    (error) =>
      error instanceof HttpError && error.status === 409 && error.code === 'AGENDA_DATE_PAST',
  );

  const currentStatements = [];
  const currentPool = {
    async connect() {
      return {
        async query(sql) {
          currentStatements.push(sql);
          if (sql.startsWith('SELECT id FROM medicos')) return { rowCount: 1, rows: [{ id: 2 }] };
          if (sql.includes('AS vigente')) return { rowCount: 1, rows: [{ vigente: true }] };
          if (sql.startsWith('UPDATE agendas'))
            return { rowCount: 2, rows: [{ id: 1 }, { id: 2 }] };
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
    },
  };

  const blocked = await blockAgenda(currentPool, {
    medicoId: 2,
    fecha: '2026-11-05',
    motivo: 'Urgencia vespertina',
  });
  assert.equal(blocked.affected, 2);

  const unblocked = await unblockAgenda(currentPool, {
    medicoId: 2,
    fecha: '2026-11-05',
  });
  assert.equal(unblocked.affected, 2);

  const updates = currentStatements.filter((sql) => sql.startsWith('UPDATE agendas'));
  assert.equal(updates.length, 2);
  for (const updateSql of updates) {
    assert.match(updateSql, /AT TIME ZONE 'America\/Santiago'\) > NOW\(\)/);
  }
});

test('las operaciones de agenda registran auditoría cuando se pasa secretaria', async () => {
  const auditStatements = [];
  const pool = {
    async connect() {
      return {
        async query(sql, params) {
          auditStatements.push({ sql, params });
          if (sql.startsWith('SELECT id FROM medicos')) return { rowCount: 1, rows: [{ id: 2 }] };
          if (sql.includes('AS vigente')) return { rowCount: 1, rows: [{ vigente: true }] };
          if (sql.startsWith('UPDATE agendas')) return { rowCount: 1, rows: [{ id: 10 }] };
          if (sql.startsWith('INSERT INTO auditoria_acciones_secretaria')) {
            return { rowCount: 1, rows: [{ id: 1 }] };
          }
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
    },
  };

  const secretary = { id: 5, usuario: 'sec.agenda' };
  await blockAgenda(pool, {
    medicoId: 2,
    fecha: '2026-11-20',
    motivo: 'Reunión clínica',
    secretary,
  });

  const auditEntry = auditStatements.find((s) =>
    s.sql.startsWith('INSERT INTO auditoria_acciones_secretaria'),
  );
  assert.ok(auditEntry, 'Debe registrar auditoría al bloquear con sesión de secretaría');
  assert.equal(auditEntry.params[0], 5);
  assert.equal(auditEntry.params[2], 'AGENDA_BLOQUEAR');
});
