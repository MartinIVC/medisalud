const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

async function setupTestServer(t, queryHandler) {
  const database = {
    async query(sql, params) {
      if (sql.includes('JOIN secretarias')) {
        return { rowCount: 1, rows: [{ id: 1, usuario: 'secretaria.prueba' }] };
      }
      return queryHandler(sql, params);
    },
  };
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server;
}

test('PUT /api/medicos/:id exige autenticación de secretaría', async (t) => {
  const server = await setupTestServer(t, async () => ({ rowCount: 0, rows: [] }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/medicos/1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 401);
});

test('PUT /api/medicos/:id valida id y datos del profesional', async (t) => {
  const server = await setupTestServer(t, async () => ({ rowCount: 0, rows: [] }));
  const token = 'A'.repeat(43);

  const invalidId = await fetch(`http://127.0.0.1:${server.address().port}/api/medicos/abc`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  assert.equal(invalidId.status, 400);

  const invalidRut = await fetch(`http://127.0.0.1:${server.address().port}/api/medicos/1`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      rut: '12.345.678-9',
      nombre: 'Dr. Prueba',
      email: 'doc@example.cl',
      especialidad_id: 1,
      box_atencion: 'Box 1',
    }),
  });
  assert.equal(invalidRut.status, 400);
  const rutData = await invalidRut.json();
  assert.ok(rutData.fields?.rut);
});

test('PUT /api/medicos/:id actualiza los datos del profesional exitosamente', async (t) => {
  const queries = [];
  const server = await setupTestServer(t, async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('SELECT id FROM especialidades')) {
      return { rowCount: 1, rows: [{ id: 1 }] };
    }
    if (sql.includes('UPDATE medicos')) {
      return {
        rowCount: 1,
        rows: [
          {
            id: 1,
            rut: params[0],
            nombre: params[1],
            email: params[2],
            box_atencion: params[3],
            especialidad_id: params[4],
            activo: true,
            foto_actualizada_en: null,
          },
        ],
      };
    }
    return { rowCount: 0, rows: [] };
  });

  const token = 'A'.repeat(43);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/medicos/1`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      rut: '12.345.678-5',
      nombre: 'Dr. Alejandro Soto Rojas Actualizado',
      email: 'alejandro.nuevo@medisalud.cl',
      especialidad_id: 1,
      box_atencion: 'Box 202',
    }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.medico.nombre, 'Dr. Alejandro Soto Rojas Actualizado');
  assert.equal(data.medico.box_atencion, 'Box 202');
});
