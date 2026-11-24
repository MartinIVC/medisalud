const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { getAppointmentsByRut } = require('../src/services/mis-citas');

test('getAppointmentsByRut normaliza el RUT válido y devuelve las citas del paciente', async () => {
  const captured = [];
  const database = {
    async query(sql, params) {
      captured.push({ sql, params });
      return {
        rowCount: 2,
        rows: [
          {
            id: 10,
            codigo_reserva: 'MED-2026-AAA111',
            fecha: '2026-11-28',
            hora_inicio: '09:30',
            hora_fin: '10:00',
            medico_nombre: 'Dr. Alejandro Soto Rojas',
            especialidad_nombre: 'Medicina General',
            box_atencion: 'Box 101',
            estado: 'CONFIRMADA',
            asistencia_estado: 'PENDIENTE',
            futuro: true,
          },
          {
            id: 11,
            codigo_reserva: 'MED-2026-BBB222',
            fecha: '2026-11-10',
            hora_inicio: '11:00',
            hora_fin: '11:20',
            medico_nombre: 'Dra. Patricia Morales Silva',
            especialidad_nombre: 'Pediatría',
            box_atencion: 'Box 201',
            estado: 'CANCELADA',
            asistencia_estado: 'CANCELADA',
            futuro: false,
          },
        ],
      };
    },
  };

  const result = await getAppointmentsByRut({ database, rut: ' 19000015-k ' });

  assert.equal(result.rut, '19.000.015-K');
  assert.equal(result.citas.length, 2);
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].params, ['19.000.015-K']);
  assert.match(captured[0].sql, /FROM citas_medicas c/);
});

test('GET /api/reservas/mis-citas devuelve 200 y las citas para un RUT válido con reservas', async (t) => {
  const queries = [];
  const database = {
    async query(sql, params) {
      queries.push(params);
      return {
        rowCount: 1,
        rows: [
          {
            id: 1,
            codigo_reserva: 'MED-2026-DEMO1',
            fecha: '2026-11-25',
            hora_inicio: '10:00',
            hora_fin: '10:30',
            medico_nombre: 'Dr. Alejandro Soto Rojas',
            especialidad_nombre: 'Medicina General',
            box_atencion: 'Box 101',
            estado: 'CONFIRMADA',
            asistencia_estado: 'PENDIENTE',
            futuro: true,
          },
        ],
      };
    },
  };

  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/reservas/mis-citas?rut=123456785`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.jira, 'MED-29');
  assert.equal(data.rut, '12.345.678-5');
  assert.equal(data.total, 1);
  assert.equal(data.citas.length, 1);
  assert.equal(data.citas[0].fecha, '2026-11-25');
  assert.equal(data.citas[0].hora_inicio, '10:00');
  assert.equal(data.citas[0].hora_fin, '10:30');
  assert.equal(data.citas[0].medico_nombre, 'Dr. Alejandro Soto Rojas');
  assert.equal(data.citas[0].especialidad_nombre, 'Medicina General');
  assert.equal(data.citas[0].box_atencion, 'Box 101');
  assert.equal(data.citas[0].estado, 'CONFIRMADA');
  assert.deepEqual(queries, [['12.345.678-5']]);
});

test('GET /api/reservas/mis-citas devuelve lista vacía para un RUT válido sin citas', async (t) => {
  const database = {
    async query() {
      return { rowCount: 0, rows: [] };
    },
  };

  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/reservas/mis-citas?rut=12.345.678-5`,
  );
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.rut, '12.345.678-5');
  assert.equal(data.total, 0);
  assert.deepEqual(data.citas, []);
});

test('GET /api/reservas/mis-citas devuelve 400 sin consultar la BD cuando el RUT es inválido o falta', async (t) => {
  let queryCalls = 0;
  const database = {
    async query() {
      queryCalls += 1;
      return { rowCount: 0, rows: [] };
    },
  };

  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/reservas/mis-citas`;
  for (const queryString of ['', '?rut=', '?rut=12.345.678-9', '?rut=12%20texto%20345.678-5']) {
    const response = await fetch(`${baseUrl}${queryString}`);
    assert.equal(response.status, 400, `Expected 400 for "${queryString}"`);
    const data = await response.json();
    assert.equal(data.ok, false);
    assert.equal(data.code, 'INVALID_RUT');
    assert.equal(data.codigo_error, 'RUT_INVALIDO');
    assert.ok(data.mensaje);
    assert.ok(data.fields?.rut);
  }

  assert.equal(queryCalls, 0);
});
