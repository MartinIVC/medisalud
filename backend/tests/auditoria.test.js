const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const {
  computeMinimalDiff,
  sanitizeAuditDetails,
  recordAuditEvent,
} = require('../src/services/auditoria');

test('computeMinimalDiff extrae únicamente los campos con valores modificados', () => {
  const prev = { nombre: 'Dr. Original', box: 'Box 1', email: 'doc@med.cl' };
  const next = { nombre: 'Dr. Actualizado', box: 'Box 1', email: 'nuevo@med.cl' };
  const diff = computeMinimalDiff(prev, next, ['nombre', 'box', 'email']);

  assert.equal(diff.changedCount, 2);
  assert.deepEqual(diff.anterior, { nombre: 'Dr. Original', email: 'doc@med.cl' });
  assert.deepEqual(diff.nuevo, { nombre: 'Dr. Actualizado', email: 'nuevo@med.cl' });
  assert.equal(diff.anterior.box, undefined);
  assert.equal(diff.nuevo.box, undefined);
});

test('computeMinimalDiff devuelve objetos vacíos y conteo 0 si no hay cambios', () => {
  const obj = { nombre: 'Dra. Prueba', box: 'Box 2' };
  const diff = computeMinimalDiff(obj, { ...obj }, ['nombre', 'box']);
  assert.equal(diff.changedCount, 0);
  assert.deepEqual(diff.anterior, {});
  assert.deepEqual(diff.nuevo, {});
});

test('sanitizeAuditDetails rechaza claves sensibles como password, token, hash, paciente_rut', () => {
  assert.throws(
    () => sanitizeAuditDetails({ password: 'secreto' }),
    /clave no permitida o sensible/i,
  );
  assert.throws(
    () => sanitizeAuditDetails({ token: 'abc12345' }),
    /clave no permitida o sensible/i,
  );
  assert.throws(
    () => sanitizeAuditDetails({ contrasena_hash: 'xyz' }),
    /clave no permitida o sensible/i,
  );
  assert.throws(
    () => sanitizeAuditDetails({ nested: { paciente_rut: '12.345.678-5' } }),
    /clave no permitida o sensible/i,
  );
  assert.throws(
    () => sanitizeAuditDetails({ response_url: 'http://localhost/?cita_token=123' }),
    /clave no permitida o sensible/i,
  );
});

test('sanitizeAuditDetails rechaza valores que coincidan con patrones de secretos o tokens', () => {
  assert.throws(
    () => sanitizeAuditDetails({ link: 'http://localhost/?cita_token=abcdef' }),
    /patrón sensible/i,
  );
  assert.throws(
    () => sanitizeAuditDetails({ auth: 'Bearer eyJhbGciOiJIUzI1Ni...' }),
    /patrón sensible/i,
  );
  assert.throws(
    () => sanitizeAuditDetails({ credencial: '$scrypt$ln=16,r=8,p=1$...' }),
    /patrón sensible/i,
  );
});

test('sanitizeAuditDetails admite estructuras válidas y excluye nulos sin fallar', () => {
  const safe = {
    motivo: 'Cancelación por viaje',
    anterior: { estado: 'CONFIRMADA', bloques: 2 },
    nuevo: { estado: 'CANCELADA', bloques: 0 },
    activo: false,
    nulo: null,
  };
  const result = sanitizeAuditDetails(safe);
  assert.equal(result.motivo, 'Cancelación por viaje');
  assert.equal(result.activo, false);
  assert.equal(result.nulo, null);
  assert.deepEqual(result.nuevo, { estado: 'CANCELADA', bloques: 0 });
});

test('recordAuditEvent valida parámetros requeridos y consistencia de identidad', async () => {
  const fakeClient = {
    async query() {
      return { rows: [{ id: 10, creado_en: new Date().toISOString() }] };
    },
  };

  await assert.rejects(() => recordAuditEvent(null, {}), /cliente transaccional/i);

  await assert.rejects(
    () =>
      recordAuditEvent(fakeClient, {
        secretary: null,
        origenIdentidad: 'SESION_INDIVIDUAL',
        accion: 'MEDICO_CREAR',
        entidadTipo: 'MEDICO',
        entidadId: '1',
      }),
    /requiere un identificador de secretaría válido/i,
  );

  await assert.rejects(
    () =>
      recordAuditEvent(fakeClient, {
        secretary: { id: 1 },
        accion: 'ACCION_INVENTADA',
        entidadTipo: 'MEDICO',
        entidadId: '1',
      }),
    /Acción de auditoría no válida/i,
  );

  const ok = await recordAuditEvent(fakeClient, {
    secretary: { id: 2, usuario: 'ana' },
    origenIdentidad: 'SESION_INDIVIDUAL',
    accion: 'MEDICO_CREAR',
    entidadTipo: 'MEDICO',
    entidadId: '5',
    detalles: { nuevo: { nombre: 'Dr. Test' } },
  });
  assert.equal(ok.id, 10);
});

test('GET /api/secretaria/auditoria exige autenticación y cabeceras seguras', async (t) => {
  const database = {
    async query(sql) {
      if (sql.includes('FROM sesiones_secretaria')) {
        return { rowCount: 1, rows: [{ id: 1, usuario: 'sec.prueba' }] };
      }
      if (sql.includes('COUNT(*)')) {
        return { rowCount: 1, rows: [{ total: 1 }] };
      }
      if (sql.includes('FROM secretarias ORDER BY')) {
        return { rowCount: 1, rows: [{ id: 1, usuario: 'sec.prueba', activo: true }] };
      }
      if (sql.includes('FROM auditoria_acciones_secretaria')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 1,
              secretaria_id: 1,
              origen_identidad: 'SESION_INDIVIDUAL',
              accion: 'MEDICO_CREAR',
              entidad_tipo: 'MEDICO',
              entidad_id: '1',
              detalles: { nuevo: { nombre: 'Dr. Prueba' } },
              creado_en: '2026-11-08T15:00:00Z',
              fecha_santiago: '2026-11-08',
              hora_santiago: '12:00',
              secretaria_usuario: 'sec.prueba',
              secretaria_activo: true,
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const unauth = await fetch(`http://127.0.0.1:${server.address().port}/api/secretaria/auditoria`);
  assert.equal(unauth.status, 401);

  const token = 'A'.repeat(43);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/secretaria/auditoria?accion=MEDICO_CREAR`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.jira, 'MED-27');
  assert.equal(data.registros.length, 1);
  assert.equal(data.registros[0].responsable, 'sec.prueba');
  assert.equal(data.registros[0].accion, 'MEDICO_CREAR');
});

test('GET /api/secretaria/auditoria valida filtros de fecha y acción', async (t) => {
  const database = {
    async query(sql) {
      if (sql.includes('FROM sesiones_secretaria')) {
        return { rowCount: 1, rows: [{ id: 1, usuario: 'sec.prueba' }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const token = 'A'.repeat(43);
  const invalidDate = await fetch(
    `http://127.0.0.1:${server.address().port}/api/secretaria/auditoria?fecha_desde=2026-13-40`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(invalidDate.status, 400);

  const invertedDates = await fetch(
    `http://127.0.0.1:${server.address().port}/api/secretaria/auditoria?fecha_desde=2026-11-10&fecha_hasta=2026-11-05`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(invertedDates.status, 400);

  const invalidAction = await fetch(
    `http://127.0.0.1:${server.address().port}/api/secretaria/auditoria?accion=ACCION_INVENTADA`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(invalidAction.status, 400);
});
