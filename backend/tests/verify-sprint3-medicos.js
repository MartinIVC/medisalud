const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { randomInt } = require('node:crypto');
const { requireDisposableTestEnvironment } = require('./disposable-env');
const testEnvironment = requireDisposableTestEnvironment();
if (process.env.DB_NAME && process.env.DB_NAME !== testEnvironment.database.name) {
  throw new Error('DB_NAME no coincide con la base declarada en TEST_DATABASE_URL.');
}
process.env.DB_HOST = testEnvironment.database.host;
process.env.DB_PORT = testEnvironment.database.port;
process.env.DB_USER = testEnvironment.database.user;
process.env.DB_PASSWORD = testEnvironment.database.password;
process.env.DB_NAME = testEnvironment.database.name;
const { pool } = require('../src/db');
const { calculateDv, formatRut } = require('../src/utils/rutValidator');

const API_URL = testEnvironment.apiUrl;
const createdDoctorIds = [];

function createRut() {
  const body = String(randomInt(1_000_000, 99_999_999));
  return formatRut(`${body}${calculateDv(body)}`);
}

function expiredSecretaryToken() {
  const body = Buffer.from(JSON.stringify({ role: 'secretaria', exp: Date.now() - 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SECRETARY_TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

async function postDoctor(payload, token) {
  return fetch(`${API_URL}/medicos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

async function unusedRut() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rut = createRut();
    const normalized = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    const found = await pool.query(
      "SELECT 1 FROM medicos WHERE UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g')) = $1 LIMIT 1",
      [normalized]
    );
    if (!found.rowCount) return rut;
  }
  throw new Error('No se pudo generar un RUT de prueba que no estuviera registrado.');
}

async function verify() {
  assert.ok(process.env.SECRETARY_PASSWORD, 'Configura SECRETARY_PASSWORD para ejecutar la suite.');
  assert.ok(process.env.SECRETARY_TOKEN_SECRET, 'Configura SECRETARY_TOKEN_SECRET para ejecutar la suite.');

  const loginResponse = await fetch(`${API_URL}/auth/secretaria`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.SECRETARY_PASSWORD }),
  });
  const login = await loginResponse.json();
  assert.equal(loginResponse.status, 200, 'Debe iniciar sesión de secretaría.');

  const unauthenticated = await postDoctor({});
  assert.equal(unauthenticated.status, 401, 'La API debe exigir una sesión vigente.');
  const expired = await postDoctor({}, expiredSecretaryToken());
  assert.equal(expired.status, 401, 'La API debe rechazar una sesión vencida.');

  const specialtiesResponse = await fetch(`${API_URL}/especialidades`);
  const specialtiesData = await specialtiesResponse.json();
  assert.equal(specialtiesResponse.status, 200);
  assert.ok(specialtiesData.especialidades?.length, 'Debe existir al menos una especialidad de prueba.');
  const specialtyId = specialtiesData.especialidades[0].id;
  const invalidRut = await postDoctor({
    rut: '12 texto 345.678-5', nombre: 'Médico Prueba', email: 'medico@example.cl',
    especialidad_id: specialtyId, box_atencion: 'Box T1',
  }, login.token);
  assert.equal(invalidRut.status, 400, 'Debe rechazar texto ajeno al formato del RUT.');

  const invalidCheckDigit = await postDoctor({
    rut: '12.345.678-9', nombre: 'Médico Prueba', email: 'medico@example.cl',
    especialidad_id: specialtyId, box_atencion: 'Box T1',
  }, login.token);
  assert.equal(invalidCheckDigit.status, 400, 'Debe validar el dígito verificador del RUT.');

  const invalidFields = await postDoctor({
    rut: await unusedRut(), nombre: 'M'.repeat(151), email: 'correo-inválido',
    especialidad_id: specialtyId, box_atencion: 'B'.repeat(21),
  }, login.token);
  const invalidFieldsData = await invalidFields.json();
  assert.equal(invalidFields.status, 400);
  assert.ok(invalidFieldsData.fields.nombre && invalidFieldsData.fields.email && invalidFieldsData.fields.box_atencion,
    'Debe informar los errores junto a nombre, correo y box.');

  const invalidSpecialtyRut = await unusedRut();
  const invalidSpecialty = await postDoctor({
    rut: invalidSpecialtyRut, nombre: 'Médico Prueba', email: 'medico@example.cl',
    especialidad_id: 2147483647, box_atencion: 'Box T1',
  }, login.token);
  assert.equal(invalidSpecialty.status, 400, 'Debe rechazar una especialidad inexistente sin insertar el médico.');

  const rut = await unusedRut();
  const basePayload = {
    rut,
    nombre: 'Médico de prueba Sprint 3',
    email: 'sprint3-medico@example.cl',
    especialidad_id: specialtyId,
    box_atencion: 'Box QA-3',
  };

  const createdResponse = await postDoctor(basePayload, login.token);
  assert.equal(createdResponse.status, 201, 'Debe crear el médico válido.');
  const created = await createdResponse.json();
  assert.equal(created.medico.activo, true, 'El servidor debe crear al médico activo.');
  createdDoctorIds.push(created.medico.id);

  const savedDoctor = await pool.query(
    `SELECT m.activo,
            (SELECT COUNT(*)::INT FROM agendas a WHERE a.medico_id = m.id) AS agendas
       FROM medicos m WHERE m.id = $1`,
    [created.medico.id]
  );
  assert.equal(savedDoctor.rows[0].activo, true);
  assert.equal(savedDoctor.rows[0].agendas, 0, 'Crear un médico no debe crear horarios.');

  await pool.query('UPDATE medicos SET activo = FALSE WHERE id = $1', [created.medico.id]);
  const alternateRut = rut.replace(/[.-]/g, '');
  const duplicateResponse = await postDoctor({ ...basePayload, rut: alternateRut }, login.token);
  if (duplicateResponse.status === 201) {
    const unexpectedDuplicate = await duplicateResponse.json();
    createdDoctorIds.push(unexpectedDuplicate.medico.id);
  }
  assert.equal(duplicateResponse.status, 409, 'Debe detectar el RUT duplicado con otra representación aunque el registro esté inactivo.');

  const concurrentRut = await unusedRut();
  const concurrentPayload = { ...basePayload, rut: concurrentRut };
  const concurrentResponses = await Promise.all([
    postDoctor(concurrentPayload, login.token),
    postDoctor(concurrentPayload, login.token),
  ]);
  for (const response of concurrentResponses) {
    if (response.status === 201) {
      const data = await response.json();
      createdDoctorIds.push(data.medico.id);
    }
  }
  assert.deepEqual(
    concurrentResponses.map((response) => response.status).sort((a, b) => a - b),
    [201, 409],
    'Dos altas simultáneas para el mismo RUT deben crear un solo registro.',
  );

  console.log('Sprint 3: autenticación, validaciones, alta activa, catálogos sin agenda y unicidad concurrente verificados.');
}

verify()
  .catch((error) => {
    console.error('❌ Verificación Sprint 3:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const id of createdDoctorIds) {
      const result = await pool.query(
        `DELETE FROM medicos m
          WHERE m.id = $1
            AND NOT EXISTS (SELECT 1 FROM agendas a WHERE a.medico_id = m.id)
            AND NOT EXISTS (SELECT 1 FROM citas_medicas c WHERE c.medico_id = m.id)`,
        [id]
      );
      if (!result.rowCount) console.warn(`El médico de prueba ${id} tiene referencias y se conservó para no perder datos.`);
    }
    await pool.end();
  });
