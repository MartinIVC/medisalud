/**
 * Suite de aceptación MED-29: Verificación de correo, aislamiento por vínculo,
 * separación de permisos, concurrencia/idempotencia, privacidad y recuperación asistida.
 */
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { requireDisposableTestEnvironment } = require('./disposable-env');
const { ensureTestSecretary } = require('./secretary-fixture');
const {
  authorizeWebBookingEmail,
  clearMailpit,
  listMailpitMessages,
  waitForVerificationCode,
} = require('./mailpit-fixture');

const { apiUrl } = requireDisposableTestEnvironment();
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

async function apiJson(path, { method = 'POST', token = null, headers = {}, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, headers: response.headers, data };
}

async function createFutureSlots(token, medicoId, fecha, horaInicio, horaFin, duracionMin = 20) {
  const config = await apiJson('/agendas/configurar', {
    token,
    body: {
      medico_id: medicoId,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      duracion_min: duracionMin,
    },
  });
  assert.equal(config.status, 201, JSON.stringify(config));
  const disp = await apiJson(`/disponibilidad?medico_id=${medicoId}&fecha=${fecha}`, {
    method: 'GET',
  });
  assert.equal(disp.status, 200);
  return disp.data.bloques;
}

async function queryHistoryWithCode({ rut, correo, seenMessageIds }) {
  const reqRes = await apiJson('/reservas/mis-citas/solicitudes', {
    body: { rut, correo },
  });
  assert.equal(reqRes.status, 202, JSON.stringify(reqRes));
  assert.equal(reqRes.headers.get('cache-control'), 'no-store');
  const received = await waitForVerificationCode({
    email: correo,
    subjectIncludes: 'consultar tus citas',
    seenMessageIds,
  });
  assert.equal(received.text.includes(rut), false, 'El correo no debe exponer el RUT.');
  const verRes = await apiJson('/reservas/mis-citas/verificar', {
    body: { solicitud_id: reqRes.data.solicitud_id, codigo: received.code },
  });
  return { reqRes, received, verRes };
}

async function run() {
  console.log('--- Iniciando verificación de aceptación MED-29 ---');
  await clearMailpit();
  const seenMessages = new Set();

  // Limpiar límites previos para una corrida determinista
  await db.query('DELETE FROM limites_verificacion_correo');

  const credentials = await ensureTestSecretary();
  const login = await apiJson('/auth/secretaria', { body: credentials });
  assert.equal(login.status, 200);
  const secretaryToken = login.data.token;

  const futureDate1 = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const futureDate2 = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const slots1 = await createFutureSlots(secretaryToken, 3, futureDate1, '09:00', '12:00', 20);
  const slots2 = await createFutureSlots(secretaryToken, 4, futureDate2, '09:00', '12:00', 20);
  assert.ok(slots1.length >= 8);
  assert.ok(slots2.length >= 6);

  const rutA = '12.345.678-5';
  const rutB = '19.000.015-K';
  const emailX = 'paciente.a+uno@medisalud.test';
  const emailY = 'paciente.a+dos@medisalud.test';
  const emailRec = 'paciente.recuperado+nuevo@medisalud.test';

  // ---------------------------------------------------------------------------
  // Caso 1: Primera atención completamente remota (autoservicio, 0 acciones secretaría)
  // ---------------------------------------------------------------------------
  const authA1 = await authorizeWebBookingEmail({
    apiUrl,
    rut: '123456785',
    correo: 'Paciente.A+Uno@MEDISALUD.TEST',
    seenMessageIds: seenMessages,
  });
  const bookA1 = await apiJson('/reservas', {
    headers: { 'Idempotency-Key': 'med29-idem-a1' },
    body: {
      agenda_id: slots1[0].agenda_id,
      paciente_rut: '123456785',
      paciente_nombre: 'Paciente A Demo',
      paciente_email: 'Paciente.A+Uno@MEDISALUD.TEST',
      paciente_telefono: '+56912345678',
      autorizacion_reserva: authA1.autorizacionReserva,
    },
  });
  assert.equal(bookA1.status, 201, JSON.stringify(bookA1));
  const citaA1Id = bookA1.data.reserva.id;
  const citaA1Code = bookA1.data.reserva.codigo_reserva;

  const firstHistory = await queryHistoryWithCode({
    rut: rutA,
    correo: emailX,
    seenMessageIds: seenMessages,
  });
  assert.equal(firstHistory.verRes.status, 200);
  assert.equal(firstHistory.verRes.data.total, 1);
  assert.equal(firstHistory.verRes.data.citas[0].codigo_reserva, citaA1Code);
  console.log('✅ Caso 1: Primera reserva remota y consulta con código nuevo OK.');

  // ---------------------------------------------------------------------------
  // Caso 2: Historial y aislamiento (A+X: 2 citas, A+Y: 1 cita, B+X: 1 cita) + cancelar/reprogramar
  // ---------------------------------------------------------------------------
  // Esperar/limpiar cooldown de envío del par (A, X) solo para el test de segunda reserva inmediata
  await db.query('DELETE FROM limites_verificacion_correo');
  const authA2 = await authorizeWebBookingEmail({
    apiUrl,
    rut: rutA,
    correo: emailX,
    seenMessageIds: seenMessages,
  });
  const bookA2 = await apiJson('/reservas', {
    body: {
      agenda_id: slots1[1].agenda_id,
      paciente_rut: rutA,
      paciente_nombre: 'Paciente A Demo',
      paciente_email: emailX,
      paciente_telefono: '+56912345678',
      autorizacion_reserva: authA2.autorizacionReserva,
    },
  });
  assert.equal(bookA2.status, 201, JSON.stringify(bookA2));
  const citaA2Id = bookA2.data.reserva.id;
  const citaA2Code = bookA2.data.reserva.codigo_reserva;

  const authAY = await authorizeWebBookingEmail({
    apiUrl,
    rut: rutA,
    correo: emailY,
    seenMessageIds: seenMessages,
  });
  const bookAY = await apiJson('/reservas', {
    body: {
      agenda_id: slots1[2].agenda_id,
      paciente_rut: rutA,
      paciente_nombre: 'Paciente A Otro Buzón',
      paciente_email: emailY,
      paciente_telefono: '+56912345678',
      autorizacion_reserva: authAY.autorizacionReserva,
    },
  });
  assert.equal(bookAY.status, 201);
  const citaAYCode = bookAY.data.reserva.codigo_reserva;

  const authBX = await authorizeWebBookingEmail({
    apiUrl,
    rut: rutB,
    correo: emailX,
    seenMessageIds: seenMessages,
  });
  const bookBX = await apiJson('/reservas', {
    body: {
      agenda_id: slots1[3].agenda_id,
      paciente_rut: rutB,
      paciente_nombre: 'Paciente B Buzón Compartido',
      paciente_email: emailX,
      paciente_telefono: '+56987654321',
      autorizacion_reserva: authBX.autorizacionReserva,
    },
  });
  assert.equal(bookBX.status, 201);
  const citaBXCode = bookBX.data.reserva.codigo_reserva;

  // Cancelar citaA1 y reprogramar citaA2 -> ambas deben permanecer en el historial de (A, X)
  const cancelRes = await apiJson(`/reservas/${citaA1Id}/gestionar`, {
    token: secretaryToken,
    body: { accion: 'CANCELAR', motivo: 'Prueba aislamiento MED-29' },
  });
  assert.equal(cancelRes.status, 200, JSON.stringify(cancelRes));

  const moveRes = await apiJson(`/reservas/${citaA2Id}/gestionar`, {
    token: secretaryToken,
    body: {
      accion: 'MOVER',
      motivo: 'Prueba reprogramación MED-29',
      agenda_id: slots1[4].agenda_id,
    },
  });
  assert.equal(moveRes.status, 200, JSON.stringify(moveRes));

  await db.query('DELETE FROM limites_verificacion_correo');
  const histAX = await queryHistoryWithCode({
    rut: rutA,
    correo: emailX,
    seenMessageIds: seenMessages,
  });
  assert.equal(histAX.verRes.status, 200);
  assert.deepEqual(
    histAX.verRes.data.citas.map((c) => c.codigo_reserva).sort(),
    [citaA1Code, citaA2Code].sort(),
  );
  assert.equal(
    histAX.verRes.data.citas.find((c) => c.codigo_reserva === citaA1Code).estado,
    'CANCELADA',
  );
  assert.equal(
    histAX.verRes.data.citas.find((c) => c.codigo_reserva === citaA2Code).estado,
    'CONFIRMADA',
  );

  const histAY = await queryHistoryWithCode({
    rut: rutA,
    correo: emailY,
    seenMessageIds: seenMessages,
  });
  assert.equal(histAY.verRes.status, 200);
  assert.deepEqual(
    histAY.verRes.data.citas.map((c) => c.codigo_reserva),
    [citaAYCode],
  );

  const histBX = await queryHistoryWithCode({
    rut: rutB,
    correo: emailX,
    seenMessageIds: seenMessages,
  });
  assert.equal(histBX.verRes.status, 200);
  assert.deepEqual(
    histBX.verRes.data.citas.map((c) => c.codigo_reserva),
    [citaBXCode],
  );
  console.log(
    '✅ Caso 2: Historial, aislamiento por par (RUT, correo) y preservación tras cancelar/mover OK.',
  );

  // ---------------------------------------------------------------------------
  // Caso 3: Separación de permisos y propósitos
  // ---------------------------------------------------------------------------
  await db.query('DELETE FROM limites_verificacion_correo');
  const reqReserva = await apiJson('/reservas/verificacion-correo/solicitudes', {
    body: { rut: rutA, correo: emailX },
  });
  assert.equal(reqReserva.status, 202);
  const codeReserva = await waitForVerificationCode({
    email: emailX,
    subjectIncludes: 'reservar hora',
    seenMessageIds: seenMessages,
  });
  // Un código de RESERVA jamás abre el historial de CONSULTA
  const wrongPurposeLookup = await apiJson('/reservas/mis-citas/verificar', {
    body: { solicitud_id: reqReserva.data.solicitud_id, codigo: codeReserva.code },
  });
  assert.equal(wrongPurposeLookup.status, 400);
  assert.equal(wrongPurposeLookup.data.code, 'VERIFICATION_CODE_INVALID');

  // Un código de CONSULTA jamás crea una autorización de RESERVA
  await db.query('DELETE FROM limites_verificacion_correo');
  const reqConsulta = await apiJson('/reservas/mis-citas/solicitudes', {
    body: { rut: rutA, correo: emailX },
  });
  const codeConsulta = await waitForVerificationCode({
    email: emailX,
    subjectIncludes: 'consultar tus citas',
    seenMessageIds: seenMessages,
  });
  const wrongPurposeBooking = await apiJson('/reservas/verificacion-correo/verificar', {
    body: { solicitud_id: reqConsulta.data.solicitud_id, codigo: codeConsulta.code },
  });
  assert.equal(wrongPurposeBooking.status, 400);
  assert.equal(wrongPurposeBooking.data.code, 'VERIFICATION_CODE_INVALID');

  // Verificar código de reserva y comprobar que cambiar RUT o correo en /reservas lo rechaza
  const verReserva = await apiJson('/reservas/verificacion-correo/verificar', {
    body: { solicitud_id: reqReserva.data.solicitud_id, codigo: codeReserva.code },
  });
  assert.equal(verReserva.status, 200);
  const authMismatchEmail = await apiJson('/reservas', {
    body: {
      agenda_id: slots1[5].agenda_id,
      paciente_rut: rutA,
      paciente_nombre: 'Cambio correo',
      paciente_email: emailY,
      paciente_telefono: '+56912345678',
      autorizacion_reserva: verReserva.data.autorizacion_reserva,
    },
  });
  assert.equal(authMismatchEmail.status, 403);
  assert.equal(authMismatchEmail.data.code, 'EMAIL_VERIFICATION_REQUIRED');

  const authMismatchRut = await apiJson('/reservas', {
    body: {
      agenda_id: slots1[5].agenda_id,
      paciente_rut: rutB,
      paciente_nombre: 'Cambio RUT',
      paciente_email: emailX,
      paciente_telefono: '+56912345678',
      autorizacion_reserva: verReserva.data.autorizacion_reserva,
    },
  });
  assert.equal(authMismatchRut.status, 403);
  assert.equal(authMismatchRut.data.code, 'EMAIL_VERIFICATION_REQUIRED');
  console.log(
    '✅ Caso 3: Separación de propósitos y validación estricta de RUT/correo en autorización OK.',
  );

  // ---------------------------------------------------------------------------
  // Caso 4: Datos anteriores, reservas manuales y recuperación asistida + auditoría
  // ---------------------------------------------------------------------------
  // Crear reserva manual por secretaría (queda sin vínculo en portal)
  const manualBooking = await apiJson('/reservas', {
    token: secretaryToken,
    body: {
      agenda_id: slots1[6].agenda_id,
      origen: 'PRESENCIAL',
      paciente_rut: rutA,
      paciente_nombre: 'Paciente A Presencial',
      paciente_email: emailX,
      paciente_telefono: '+56912345678',
    },
  });
  assert.equal(manualBooking.status, 201, JSON.stringify(manualBooking));
  const manualId = manualBooking.data.reserva.id;
  const manualCode = manualBooking.data.reserva.codigo_reserva;

  // Verificar que la reserva manual NO aparece en el historial de (A, X)
  await db.query('DELETE FROM limites_verificacion_correo');
  const histBeforeRec = await queryHistoryWithCode({
    rut: rutA,
    correo: emailX,
    seenMessageIds: seenMessages,
  });
  assert.equal(
    histBeforeRec.verRes.data.citas.some((c) => c.codigo_reserva === manualCode),
    false,
  );

  // Dejar una solicitud de consulta pendiente del vínculo (A, X) para comprobar invalidación al recuperar
  await db.query('DELETE FROM limites_verificacion_correo');
  const pendingConsultaAX = await apiJson('/reservas/mis-citas/solicitudes', {
    body: { rut: rutA, correo: emailX },
  });
  const pendingConsultaAXCode = await waitForVerificationCode({
    email: emailX,
    subjectIncludes: 'consultar tus citas',
    seenMessageIds: seenMessages,
  });

  // Secretaría busca citas de rutA
  const secSearch = await apiJson('/secretaria/recuperacion-citas/buscar', {
    token: secretaryToken,
    body: { rut: rutA },
  });
  assert.equal(secSearch.status, 200);
  assert.equal(secSearch.data.citas.find((c) => c.id === manualId).vinculada, false);

  // Secretaría inicia una recuperación y la revoca antes de confirmar
  const recToRevoke = await apiJson('/secretaria/recuperacion-citas/solicitudes', {
    token: secretaryToken,
    body: {
      rut: rutA,
      correo_destino: emailRec,
      citas_ids: [manualId],
      motivo: 'Solicitud de prueba para revocar',
    },
  });
  assert.equal(recToRevoke.status, 202);
  const revokedCode = await waitForVerificationCode({
    email: emailRec,
    subjectIncludes: 'recuperación',
    seenMessageIds: seenMessages,
  });
  const revokeRes = await apiJson(
    `/secretaria/recuperacion-citas/solicitudes/${recToRevoke.data.solicitud_id}/revocar`,
    { token: secretaryToken },
  );
  assert.equal(revokeRes.status, 200);
  const confirmRevoked = await apiJson('/reservas/mis-citas/recuperacion/confirmar', {
    body: { solicitud_id: recToRevoke.data.solicitud_id, codigo: revokedCode.code },
  });
  assert.equal(confirmRevoked.status, 400);
  assert.equal(confirmRevoked.data.code, 'VERIFICATION_CODE_INVALID');

  // Secretaría inicia recuperación real: mueve citaA2 + incorpora cita manual al nuevo correo emailRec
  const recValid = await apiJson('/secretaria/recuperacion-citas/solicitudes', {
    token: secretaryToken,
    body: {
      rut: rutA,
      correo_destino: emailRec,
      citas_ids: [manualId, citaA2Id],
      motivo: 'Cambio de buzón verificado presencialmente',
    },
  });
  assert.equal(recValid.status, 202);
  const validRecCode = await waitForVerificationCode({
    email: emailRec,
    subjectIncludes: 'recuperación',
    seenMessageIds: seenMessages,
  });
  const confirmValid = await apiJson('/reservas/mis-citas/recuperacion/confirmar', {
    body: { solicitud_id: recValid.data.solicitud_id, codigo: validRecCode.code },
  });
  assert.equal(confirmValid.status, 200, JSON.stringify(confirmValid));
  assert.equal(confirmValid.data.citas_vinculadas, 2);

  // La solicitud de consulta pendiente de (A, X) debe haber quedado invalidada
  const invalidatedLookup = await apiJson('/reservas/mis-citas/verificar', {
    body: {
      solicitud_id: pendingConsultaAX.data.solicitud_id,
      codigo: pendingConsultaAXCode.code,
    },
  });
  assert.equal(invalidatedLookup.status, 400);
  assert.equal(invalidatedLookup.data.code, 'VERIFICATION_CODE_INVALID');

  // El contacto original de la cita trasladada se conserva intacto
  const originalContact = await db.query('SELECT paciente_email FROM citas_medicas WHERE id = $1', [
    citaA2Id,
  ]);
  assert.equal(originalContact.rows[0].paciente_email, emailX);

  // Nuevo correo ve exactamente [manualCode, citaA2Code]; el correo anterior solo conserva [citaA1Code]
  await db.query('DELETE FROM limites_verificacion_correo');
  const histRec = await queryHistoryWithCode({
    rut: rutA,
    correo: emailRec,
    seenMessageIds: seenMessages,
  });
  assert.deepEqual(
    histRec.verRes.data.citas.map((c) => c.codigo_reserva).sort(),
    [manualCode, citaA2Code].sort(),
  );

  const histAXAfter = await queryHistoryWithCode({
    rut: rutA,
    correo: emailX,
    seenMessageIds: seenMessages,
  });
  assert.deepEqual(
    histAXAfter.verRes.data.citas.map((c) => c.codigo_reserva),
    [citaA1Code],
  );

  // Verificar auditoría MED-27 sin PII (sin RUT, sin correo, sin código)
  const auditRes = await apiJson('/secretaria/auditoria?entidad_tipo=CITA&limit=50', {
    method: 'GET',
    token: secretaryToken,
  });
  assert.equal(auditRes.status, 200);
  const recAudits = auditRes.data.registros.filter((r) =>
    r.accion.startsWith('CITA_RECUPERACION_'),
  );
  const auditActions = new Set(recAudits.map((r) => r.accion));
  assert.ok(auditActions.has('CITA_RECUPERACION_INICIAR'));
  assert.ok(auditActions.has('CITA_RECUPERACION_REVOCAR'));
  assert.ok(auditActions.has('CITA_RECUPERACION_COMPLETAR'));
  const serializedAudits = JSON.stringify(recAudits);
  assert.equal(serializedAudits.includes(rutA), false);
  assert.equal(serializedAudits.includes(emailRec), false);
  assert.equal(serializedAudits.includes(validRecCode.code), false);
  console.log(
    '✅ Caso 4: Datos previos/manuales, recuperación asistida, revocación y auditoría sin PII OK.',
  );

  // ---------------------------------------------------------------------------
  // Caso 5: Errores, privacidad, cuotas y eliminación del antiguo GET
  // ---------------------------------------------------------------------------
  const oldGet = await apiJson(`/reservas/mis-citas?rut=${encodeURIComponent(rutA)}`, {
    method: 'GET',
  });
  assert.equal(oldGet.status, 404);

  const unknownEmail = 'no-existe-med29@medisalud.test';
  const unknownReq = await apiJson('/reservas/mis-citas/solicitudes', {
    body: { rut: rutA, correo: unknownEmail },
  });
  assert.equal(unknownReq.status, 202);
  assert.equal(
    unknownReq.data.mensaje,
    'Si los datos coinciden, recibirás un código para consultar tus citas.',
  );
  assert.match(unknownReq.data.solicitud_id, /^[A-Za-z0-9_-]{24,64}$/);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const unknownMsgs = await listMailpitMessages(undefined, `to:${unknownEmail}`);
  assert.equal(unknownMsgs.length, 0, 'Un par desconocido no debe encolar correos.');

  // Reutilizar código ya consumido -> mismo error 400 VERIFICATION_CODE_INVALID
  const reusedCode = await apiJson('/reservas/mis-citas/verificar', {
    body: {
      solicitud_id: histAXAfter.reqRes.data.solicitud_id,
      codigo: histAXAfter.received.code,
    },
  });
  assert.equal(reusedCode.status, 400);
  assert.equal(reusedCode.data.code, 'VERIFICATION_CODE_INVALID');

  // Cooldown de reenvío en reserva web (429) conserva vigente el código anterior
  const cooldownEmail = 'cooldown-med29@medisalud.test';
  const firstSend = await apiJson('/reservas/verificacion-correo/solicitudes', {
    body: { rut: rutA, correo: cooldownEmail },
  });
  assert.equal(firstSend.status, 202);
  const firstCode = await waitForVerificationCode({
    email: cooldownEmail,
    subjectIncludes: 'reservar hora',
    seenMessageIds: seenMessages,
  });
  const secondSendDuringCooldown = await apiJson('/reservas/verificacion-correo/solicitudes', {
    body: { rut: rutA, correo: cooldownEmail },
  });
  assert.equal(secondSendDuringCooldown.status, 429);
  assert.equal(secondSendDuringCooldown.data.code, 'RATE_LIMITED');
  // El primer código sigue siendo válido
  const verifyStillValid = await apiJson('/reservas/verificacion-correo/verificar', {
    body: { solicitud_id: firstSend.data.solicitud_id, codigo: firstCode.code },
  });
  assert.equal(verifyStillValid.status, 200);
  console.log(
    '✅ Caso 5: Privacidad 202 indistinguible, 404 en antiguo GET, cuotas y códigos reutilizados OK.',
  );

  // ---------------------------------------------------------------------------
  // Caso 6: Concurrencia, idempotencia y preservación de autorización tras 409
  // ---------------------------------------------------------------------------
  // 6a. Idempotencia: repetir la misma reserva con misma clave y autorización devuelve comprobante previo
  const idemRetry = await apiJson('/reservas', {
    headers: { 'Idempotency-Key': 'med29-idem-a1' },
    body: {
      agenda_id: slots1[0].agenda_id,
      paciente_rut: '123456785',
      paciente_nombre: 'Paciente A Demo',
      paciente_email: 'Paciente.A+Uno@MEDISALUD.TEST',
      paciente_telefono: '+56912345678',
      autorizacion_reserva: authA1.autorizacionReserva,
    },
  });
  assert.equal(idemRetry.status, 200, JSON.stringify(idemRetry));
  assert.equal(idemRetry.data.repetida, true);
  assert.equal(idemRetry.data.reserva.codigo_reserva, citaA1Code);

  // 6b. Misma clave SIN autorización -> 403 (clave sola jamás entrega comprobante)
  const keyOnly = await apiJson('/reservas', {
    headers: { 'Idempotency-Key': 'med29-idem-a1' },
    body: {
      agenda_id: slots1[0].agenda_id,
      paciente_rut: '123456785',
      paciente_nombre: 'Paciente A Demo',
      paciente_email: 'Paciente.A+Uno@MEDISALUD.TEST',
      paciente_telefono: '+56912345678',
    },
  });
  assert.equal(keyOnly.status, 403);

  // 6c. Misma clave con otro payload -> 409 IDEMPOTENCY_CONFLICT
  const idemConflict = await apiJson('/reservas', {
    headers: { 'Idempotency-Key': 'med29-idem-a1' },
    body: {
      agenda_id: slots1[0].agenda_id,
      paciente_rut: '123456785',
      paciente_nombre: 'Nombre Distinto',
      paciente_email: 'Paciente.A+Uno@MEDISALUD.TEST',
      paciente_telefono: '+56912345678',
      autorizacion_reserva: authA1.autorizacionReserva,
    },
  });
  assert.equal(idemConflict.status, 409);
  assert.equal(idemConflict.data.code, 'IDEMPOTENCY_CONFLICT');

  // 6d. Cupo ocupado (409) hace rollback y deja autorización intacta para reservar otro cupo
  const takenSlotAttempt = await apiJson('/reservas', {
    body: {
      agenda_id: slots1[4].agenda_id, // Ya reservado por citaA2 tras moverse
      paciente_rut: rutA,
      paciente_nombre: 'Paciente Reutiliza Auth',
      paciente_email: cooldownEmail,
      paciente_telefono: '+56912345678',
      autorizacion_reserva: verifyStillValid.data.autorizacion_reserva,
    },
  });
  assert.equal(takenSlotAttempt.status, 409);

  const reuseAfter409 = await apiJson('/reservas', {
    body: {
      agenda_id: slots2[0].agenda_id,
      paciente_rut: rutA,
      paciente_nombre: 'Paciente Reutiliza Auth',
      paciente_email: cooldownEmail,
      paciente_telefono: '+56912345678',
      autorizacion_reserva: verifyStillValid.data.autorizacion_reserva,
    },
  });
  assert.equal(reuseAfter409.status, 201, JSON.stringify(reuseAfter409));

  // 6e. Dos solicitudes concurrentes con claves distintas compitiendo por UNA misma autorización -> máx 1 cita
  const raceEmail = 'race-auth-med29@medisalud.test';
  const raceAuth = await authorizeWebBookingEmail({
    apiUrl,
    rut: rutA,
    correo: raceEmail,
    seenMessageIds: seenMessages,
  });
  const [race1, race2] = await Promise.all([
    apiJson('/reservas', {
      headers: { 'Idempotency-Key': 'med29-race-auth-1' },
      body: {
        agenda_id: slots2[1].agenda_id,
        paciente_rut: rutA,
        paciente_nombre: 'Carrera Auth 1',
        paciente_email: raceEmail,
        paciente_telefono: '+56912345678',
        autorizacion_reserva: raceAuth.autorizacionReserva,
      },
    }),
    apiJson('/reservas', {
      headers: { 'Idempotency-Key': 'med29-race-auth-2' },
      body: {
        agenda_id: slots2[2].agenda_id,
        paciente_rut: rutA,
        paciente_nombre: 'Carrera Auth 2',
        paciente_email: raceEmail,
        paciente_telefono: '+56912345678',
        autorizacion_reserva: raceAuth.autorizacionReserva,
      },
    }),
  ]);
  const raceStatuses = [race1.status, race2.status].sort();
  assert.equal(
    raceStatuses.filter((s) => s === 201).length,
    1,
    `Solo una reserva puede consumir la misma autorización: ${JSON.stringify({ race1, race2 })}`,
  );
  console.log(
    '✅ Caso 6: Idempotencia ligada a autorización, reutilización tras 409 y exclusividad concurrente OK.',
  );

  // ---------------------------------------------------------------------------
  // Caso 7 (MED-30): Privacidad en cuotas — CONSULTA jamás altera las cuotas observables de RESERVA
  // ---------------------------------------------------------------------------
  await db.query('DELETE FROM limites_verificacion_correo');
  const unknownOracleEmail = 'oraculo-desconocido-med30@medisalud.test';

  // Lanzar 8 consultas para el par conocido (rutA, emailX) y 8 para el desconocido
  for (let i = 0; i < 8; i += 1) {
    const knownLookup = await apiJson('/reservas/mis-citas/solicitudes', {
      body: { rut: rutA, correo: emailX },
    });
    const unknownLookup = await apiJson('/reservas/mis-citas/solicitudes', {
      body: { rut: rutA, correo: unknownOracleEmail },
    });
    assert.equal(knownLookup.status, 202);
    assert.equal(unknownLookup.status, 202);
    assert.equal(knownLookup.data.mensaje, unknownLookup.data.mensaje);
  }

  // En RESERVA, tanto el buzón conocido (que sí agotó cuota de CONSULTA) como el desconocido deben responder 202 igual
  const bookingAfterKnownLookup = await apiJson('/reservas/verificacion-correo/solicitudes', {
    body: { rut: rutA, correo: emailX },
  });
  const bookingAfterUnknownLookup = await apiJson('/reservas/verificacion-correo/solicitudes', {
    body: { rut: rutA, correo: unknownOracleEmail },
  });
  assert.equal(
    bookingAfterKnownLookup.status,
    202,
    `CONSULTA no debe agotar la cuota observable de RESERVA: ${JSON.stringify(bookingAfterKnownLookup)}`,
  );
  assert.equal(bookingAfterUnknownLookup.status, 202);
  console.log(
    '✅ Caso 7 (MED-30): Cuotas aisladas por propósito; CONSULTA no delata vínculos en RESERVA OK.',
  );

  // ---------------------------------------------------------------------------
  // Caso 8 (MED-30): Concurrencia en límites (sin errores 23505 / HTTP 500)
  // ---------------------------------------------------------------------------
  await db.query('DELETE FROM limites_verificacion_correo');
  const concurrentSamePairEmail = 'concurrencia-limites-med30@medisalud.test';
  const concurrentLimitResponses = await Promise.all(
    Array.from({ length: 12 }, () =>
      apiJson('/reservas/verificacion-correo/solicitudes', {
        body: { rut: rutA, correo: concurrentSamePairEmail },
      }),
    ),
  );
  const statusCounts = concurrentLimitResponses.reduce((acc, res) => {
    acc[res.status] = (acc[res.status] || 0) + 1;
    return acc;
  }, {});
  assert.equal(
    concurrentLimitResponses.some((res) => res.status >= 500),
    false,
    `No debe haber errores 500 (23505) bajo concurrencia en límites: ${JSON.stringify(statusCounts)}`,
  );
  assert.equal(
    statusCounts[202],
    1,
    `Solo 1 solicitud debe pasar el cooldown: ${JSON.stringify(statusCounts)}`,
  );
  assert.equal(
    statusCounts[429],
    11,
    `Las 11 restantes deben recibir 429 sin fallar: ${JSON.stringify(statusCounts)}`,
  );
  console.log(
    '✅ Caso 8 (MED-30): Concurrencia en creación/actualización de límites (1×202, 11×429, 0×500) OK.',
  );

  // ---------------------------------------------------------------------------
  // Caso 9 (MED-30): Recuperación asistida obsoleta con dos destinos distintos
  // ---------------------------------------------------------------------------
  const destOne = 'recuperacion-destino-uno-med30@medisalud.test';
  const destTwo = 'recuperacion-destino-dos-med30@medisalud.test';

  // 9a. Secretaría emite S1 hacia destino 1 para citaA1Id y llega su código C1
  const recOne = await apiJson('/secretaria/recuperacion-citas/solicitudes', {
    token: secretaryToken,
    body: {
      rut: rutA,
      correo_destino: destOne,
      citas_ids: [citaA1Id],
      motivo: 'Primera solicitud hacia destino 1',
    },
  });
  assert.equal(recOne.status, 202, JSON.stringify(recOne));
  const codeOne = await waitForVerificationCode({
    email: destOne,
    subjectIncludes: 'recuperación',
    seenMessageIds: seenMessages,
  });

  // 9b. Antes de confirmar S1, secretaría emite S2 hacia destino 2 para la misma citaA1Id
  const recTwo = await apiJson('/secretaria/recuperacion-citas/solicitudes', {
    token: secretaryToken,
    body: {
      rut: rutA,
      correo_destino: destTwo,
      citas_ids: [citaA1Id],
      motivo: 'Segunda solicitud hacia destino 2 reemplaza la anterior',
    },
  });
  assert.equal(recTwo.status, 202, JSON.stringify(recTwo));
  const codeTwo = await waitForVerificationCode({
    email: destTwo,
    subjectIncludes: 'recuperación',
    seenMessageIds: seenMessages,
  });

  // 9c. Confirmar S1 (obsoleta/revocada al emitir S2) debe fallar sin alterar el vínculo
  const confirmStaleBeforeTwo = await apiJson('/reservas/mis-citas/recuperacion/confirmar', {
    body: { solicitud_id: recOne.data.solicitud_id, codigo: codeOne.code },
  });
  assert.equal(confirmStaleBeforeTwo.status, 400);
  assert.equal(confirmStaleBeforeTwo.data.code, 'VERIFICATION_CODE_INVALID');

  // 9d. Confirmar S2 aplica el traslado a destino 2
  const confirmTwo = await apiJson('/reservas/mis-citas/recuperacion/confirmar', {
    body: { solicitud_id: recTwo.data.solicitud_id, codigo: codeTwo.code },
  });
  assert.equal(confirmTwo.status, 200, JSON.stringify(confirmTwo));

  // 9e. Incluso si una solicitud antigua no hubiese sido revocada (snapshot de vínculo origen ya no coincide),
  //     al intentar confirmarla debe fallar con 409 sin sobrescribir destino 2.
  await db.query(`UPDATE solicitudes_verificacion_correo SET revocada_en = NULL WHERE id = $1`, [
    recOne.data.solicitud_id,
  ]);
  const confirmStaleAfterMove = await apiJson('/reservas/mis-citas/recuperacion/confirmar', {
    body: { solicitud_id: recOne.data.solicitud_id, codigo: codeOne.code },
  });
  assert.equal(
    confirmStaleAfterMove.status,
    409,
    `Una solicitud con vínculo de origen desactualizado debe rechazarse con 409: ${JSON.stringify(confirmStaleAfterMove)}`,
  );
  assert.equal(confirmStaleAfterMove.data.code, 'APPOINTMENTS_SCOPE_MISMATCH');

  // Confirmar que destino 2 conserva citaA1Code intacta
  await db.query('DELETE FROM limites_verificacion_correo');
  const histDestTwo = await queryHistoryWithCode({
    rut: rutA,
    correo: destTwo,
    seenMessageIds: seenMessages,
  });
  assert.equal(histDestTwo.verRes.status, 200);
  assert.deepEqual(
    histDestTwo.verRes.data.citas.map((c) => c.codigo_reserva),
    [citaA1Code],
  );
  console.log(
    '✅ Caso 9 (MED-30): Recuperación asistida obsoleta (dos destinos) revocada y bloqueada por snapshot de vínculo OK.',
  );

  console.log(
    '--- Verificación MED-29 / MED-30 exitosa: todos los criterios de aceptación validados ---',
  );
}

run()
  .catch((error) => {
    console.error('❌ Falló verificación MED-29:', error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
