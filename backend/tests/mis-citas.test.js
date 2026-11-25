const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { normalizeEmail, validateEmail } = require('../src/utils/email');
const {
  PURPOSES,
  GENERIC_LOOKUP_MESSAGE,
  GENERIC_INVALID_CODE_MESSAGE,
  computeCodeHmac,
  verifyCodeHmac,
} = require('../src/services/verificacion-correo');
const {
  buildVerificationEmail,
  createVerificationWorker,
} = require('../src/notifications/verification-worker');

test('normalizeEmail y validateEmail conservan puntos y alias + y normalizan mayúsculas', () => {
  assert.equal(normalizeEmail('  Ana.Perez+citas@Medisalud.CL  '), 'ana.perez+citas@medisalud.cl');
  const valid = validateEmail('Ana.Perez+alias@Example.CL');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, 'ana.perez+alias@example.cl');

  assert.equal(validateEmail('').valid, false);
  assert.equal(validateEmail('sin-arroba').valid, false);
  assert.equal(validateEmail('mal<tag>@example.cl').valid, false);
});

test('computeCodeHmac y verifyCodeHmac aíslan solicitud, propósito, RUT y correo', () => {
  const env = { VERIFICATION_HMAC_SECRET: 'test-hmac-secret-med29' };
  const base = {
    solicitudId: 'sol_123456789012345678901234',
    proposito: PURPOSES.RESERVA,
    rut: '12.345.678-5',
    correo: 'ana.perez+1@example.cl',
    codigo: '482913',
  };
  const hmac = computeCodeHmac(base, env);
  assert.equal(verifyCodeHmac(hmac, base, env), true);
  assert.equal(verifyCodeHmac(hmac, { ...base, codigo: '482914' }, env), false);
  assert.equal(verifyCodeHmac(hmac, { ...base, proposito: PURPOSES.CONSULTA }, env), false);
  assert.equal(verifyCodeHmac(hmac, { ...base, correo: 'otro@example.cl' }, env), false);
  assert.equal(verifyCodeHmac(hmac, { ...base, rut: '19.000.015-K' }, env), false);
});

test('el worker de verificación persiste codigo_hmac antes de enviar y omite datos médicos', async () => {
  const events = [];
  let sentMessage = null;
  const fakeRow = {
    id: 'sol_123456789012345678901234',
    proposito: PURPOSES.CONSULTA,
    paciente_rut: '12.345.678-5',
    correo_normalizado: 'ana@example.cl',
    expira_en: new Date(Date.now() + 600_000).toISOString(),
    claim_token: '00000000-0000-4000-8000-000000000001',
  };

  const database = {
    async query() {
      return { rowCount: 0, rows: [] };
    },
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql.includes('RETURNING s.id, s.proposito')) {
            events.push('CLAIM');
            return { rowCount: 1, rows: [fakeRow] };
          }
          if (sql.includes('SET codigo_hmac = $3')) {
            events.push('PERSIST_HMAC');
            assert.match(params[2], /^[0-9a-f]{64}$/);
            return { rowCount: 1, rows: [{ id: fakeRow.id }] };
          }
          if (sql.includes("SET estado_envio = 'ACEPTADO'")) {
            events.push('MARK_ACCEPTED');
            return { rowCount: 1, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
    },
  };

  const worker = createVerificationWorker({
    database,
    generateCode: () => '123456',
    createClaimToken: () => fakeRow.claim_token,
    emailProvider: async (msg) => {
      events.push('DELIVER_EMAIL');
      sentMessage = msg;
      return { status: 'ACEPTADO', provider: 'SMTP', providerId: 'msg-1' };
    },
    env: { VERIFICATION_HMAC_SECRET: 'test-secret' },
  });

  const outcome = await worker();
  assert.equal(outcome.claimed, 1);
  assert.deepEqual(events, ['CLAIM', 'PERSIST_HMAC', 'DELIVER_EMAIL', 'MARK_ACCEPTED']);
  assert.equal(sentMessage.to, 'ana@example.cl');
  assert.match(sentMessage.text, /123456/);
  assert.match(sentMessage.text, /10 minutos/);
  assert.equal(sentMessage.text.includes('12.345.678-5'), false);

  const recoveryMsg = buildVerificationEmail({
    solicitudId: fakeRow.id,
    proposito: PURPOSES.RECUPERACION,
    correo: 'nuevo@example.cl',
    codigo: '654321',
  });
  assert.match(recoveryMsg.text, /654321/);
  assert.match(recoveryMsg.text, new RegExp(fakeRow.id));
});

test('el antiguo endpoint GET /api/reservas/mis-citas fue eliminado y devuelve 404', async (t) => {
  const database = {
    async query() {
      throw new Error('No debería consultar la base');
    },
  };
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/reservas/mis-citas?rut=12.345.678-5`,
  );
  assert.equal(response.status, 404);
});

test('POST /api/reservas/mis-citas/solicitudes responde 202 indistinguible para pares desconocidos y valida RUT/correo', async (t) => {
  let enqueuedWorkerCalls = 0;
  const database = {
    async connect() {
      return {
        async query(sql) {
          if (sql.includes('FROM vinculos_consulta_paciente')) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
    },
  };
  const server = createApp({
    database,
    verificationWorker: async () => {
      enqueuedWorkerCalls += 1;
      return { claimed: 0 };
    },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/reservas/mis-citas/solicitudes`;

  // 1. RUT inválido -> 400 INVALID_RUT / RUT_INVALIDO
  const invalidRut = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rut: '12.345.678-9', correo: 'ana@example.cl' }),
  });
  assert.equal(invalidRut.status, 400);
  const invalidRutData = await invalidRut.json();
  assert.equal(invalidRutData.code, 'INVALID_RUT');
  assert.equal(invalidRutData.codigo_error, 'RUT_INVALIDO');
  assert.ok(invalidRutData.fields?.rut);

  // 2. Correo inválido -> 400 VALIDATION_ERROR
  const invalidEmail = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rut: '12.345.678-5', correo: 'correo-malo' }),
  });
  assert.equal(invalidEmail.status, 400);
  const invalidEmailData = await invalidEmail.json();
  assert.equal(invalidEmailData.code, 'VALIDATION_ERROR');
  assert.ok(invalidEmailData.fields?.correo);

  // 3. Par válido pero desconocido -> 202 genérico sin disparar worker
  const unknownPair = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rut: '123456785', correo: 'Desconocido@Example.CL' }),
  });
  assert.equal(unknownPair.status, 202);
  assert.equal(unknownPair.headers.get('cache-control'), 'no-store');
  assert.equal(unknownPair.headers.get('x-content-type-options'), 'nosniff');
  const unknownData = await unknownPair.json();
  assert.equal(unknownData.ok, true);
  assert.equal(unknownData.mensaje, GENERIC_LOOKUP_MESSAGE);
  assert.match(unknownData.solicitud_id, /^[A-Za-z0-9_-]{24,64}$/);
  assert.equal(enqueuedWorkerCalls, 0);
});

test('POST /api/reservas/mis-citas/verificar devuelve las citas del vínculo verificado y rechaza códigos inválidos con error uniforme', async (t) => {
  const solicitudId = 'sol_lookup_12345678901234567890';
  const codeHmac = computeCodeHmac({
    solicitudId,
    proposito: PURPOSES.CONSULTA,
    rut: '12.345.678-5',
    correo: 'ana@example.cl',
    codigo: '654321',
  });

  const database = {
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql.includes('FROM solicitudes_verificacion_correo s')) {
            if (params[0] !== solicitudId) return { rowCount: 0, rows: [] };
            return {
              rowCount: 1,
              rows: [
                {
                  id: solicitudId,
                  proposito: PURPOSES.CONSULTA,
                  paciente_rut: '12.345.678-5',
                  correo_normalizado: 'ana@example.cl',
                  vinculo_id: 99,
                  vinculo_version: 1,
                  vinculo_version_actual: 1,
                  codigo_hmac: codeHmac,
                  intentos_verificacion: 0,
                  expira_en: new Date(Date.now() + 600_000).toISOString(),
                  consumida_en: null,
                  revocada_en: null,
                },
              ],
            };
          }
          if (sql.includes('FROM limites_verificacion_correo')) return { rowCount: 0, rows: [] };
          if (sql.includes('FROM citas_medicas c')) {
            assert.deepEqual(params, [99]);
            return {
              rowCount: 1,
              rows: [
                {
                  id: 1,
                  codigo_reserva: 'MED-2026-DEMO1',
                  fecha: '2027-01-20',
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
          }
          return { rowCount: 1, rows: [] };
        },
        release() {},
      };
    },
  };

  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const verifyUrl = `http://127.0.0.1:${server.address().port}/api/reservas/mis-citas/verificar`;

  // Código erróneo -> 400 VERIFICATION_CODE_INVALID
  const badCode = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ solicitud_id: solicitudId, codigo: '000000' }),
  });
  assert.equal(badCode.status, 400);
  const badData = await badCode.json();
  assert.equal(badData.code, 'VERIFICATION_CODE_INVALID');
  assert.equal(badData.mensaje, GENERIC_INVALID_CODE_MESSAGE);

  // Código correcto -> 200 con citas del vínculo 99
  const okRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ solicitud_id: solicitudId, codigo: '654321' }),
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.headers.get('cache-control'), 'no-store');
  const okData = await okRes.json();
  assert.equal(okData.ok, true);
  assert.equal(okData.rut, '12.345.678-5');
  assert.equal(okData.total, 1);
  assert.equal(okData.citas[0].codigo_reserva, 'MED-2026-DEMO1');
});

test('POST /api/reservas rechaza reservas WEB sin autorización de verificación de correo', async (t) => {
  const database = {
    async connect() {
      throw new Error('No debería abrir transacción sin autorización WEB');
    },
  };
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reservas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agenda_id: 1,
      paciente_rut: '12.345.678-5',
      paciente_nombre: 'Ana Pérez',
      paciente_email: 'ana@example.cl',
      paciente_telefono: '+56912345678',
    }),
  });
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.equal(data.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('POST /api/secretaria/recuperacion-citas/* exige sesión de secretaría', async (t) => {
  const database = {
    async query() {
      return { rowCount: 0, rows: [] };
    },
  };
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}/api/secretaria/recuperacion-citas`;
  for (const path of [
    '/buscar',
    '/solicitudes',
    '/solicitudes/sol_123456789012345678901234/revocar',
  ]) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rut: '12.345.678-5' }),
    });
    assert.equal(res.status, 401);
  }
});
