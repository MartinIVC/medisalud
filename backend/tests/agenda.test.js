const test = require('node:test');
const assert = require('node:assert/strict');
const { generateIntervals, configureAgenda } = require('../src/services/agenda');

test('la generación de bloques no cruza medianoche ni trunca la hora de fin', () => {
  const intervals = generateIntervals('09:00', '23:59', 30);
  assert.equal(intervals.length, 29);
  assert.deepEqual(intervals.at(-1), { start: '23:00', end: '23:30' });
  assert.equal(intervals.some(({ end }) => end === '00:00'), false);
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
          if (sql.startsWith('SELECT 1 FROM bloqueos_agenda')) return { rowCount: 0, rows: [] };
          if (sql.startsWith('SELECT COUNT(*)')) return { rowCount: 1, rows: [{ total: 1 }] };
          if (sql.startsWith('DELETE FROM agendas')) return { rowCount: 3, rows: [] };
          if (sql.startsWith('WITH requested')) return { rowCount: 2, rows: [{ id: 11 }, { id: 12 }] };
          return { rowCount: 0, rows: [] };
        },
        release() { released = true; },
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
});
