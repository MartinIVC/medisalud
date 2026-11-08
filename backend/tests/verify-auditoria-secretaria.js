const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { requireDisposableTestEnvironment } = require('./disposable-env');
const {
  createSecretary,
  resetSecretaryPassword,
  setSecretaryActive,
} = require('../src/services/secretary-accounts');
const {
  recordAuditEvent,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} = require('../src/services/auditoria');
const { withTransaction } = require('../src/db/transaction');
const { calculateDv, formatRut } = require('../src/utils/rutValidator');

const env = requireDisposableTestEnvironment();
process.env.DB_HOST = env.database.host;
process.env.DB_PORT = env.database.port;
process.env.DB_USER = env.database.user;
process.env.DB_PASSWORD = env.database.password;
process.env.DB_NAME = env.database.name;
const { pool } = require('../src/db');

const API_URL = env.apiUrl;

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const content = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(content));
  return Buffer.concat([header, content, checksum]);
}

function png(color = 1) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, color, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createRut() {
  const body = String(crypto.randomInt(1_000_000, 99_999_999));
  return formatRut(`${body}${calculateDv(body)}`);
}

async function unusedRut() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rut = createRut();
    const normalized = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    const found = await pool.query(
      "SELECT 1 FROM medicos WHERE UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g')) = $1 LIMIT 1",
      [normalized],
    );
    if (!found.rowCount) return rut;
  }
  throw new Error('No se pudo generar un RUT no registrado.');
}

async function ensureSecretary(username, password) {
  try {
    await createSecretary(pool, { username, password });
  } catch (error) {
    if (error.code !== '23505') throw error;
    await resetSecretaryPassword(pool, username, password);
    await setSecretaryActive(pool, username, true);
  }
  const res = await fetch(`${API_URL}/auth/secretaria`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  assert.equal(res.status, 200, `Login fallido para ${username}: ${JSON.stringify(data)}`);
  return { id: data.secretaria.id, username, token: data.token };
}

async function verify() {
  console.log('--- Iniciando verificación MED-27: Auditoría de acciones de secretaría ---');

  // 1. Aprovisionar dos cuentas de secretaría
  const sec1 = await ensureSecretary('audit.sec1', 'ClaveSegura123!');
  const sec2 = await ensureSecretary('audit.sec2', 'ClaveSegura456!');

  // 2. Doctor CRUD & Auditoría
  const doctorRut = await unusedRut();
  const espRes = await pool.query('SELECT id FROM especialidades ORDER BY id LIMIT 1');
  assert.ok(espRes.rowCount > 0, 'Se requiere al menos una especialidad');
  const especialidadId = espRes.rows[0].id;

  // 2.1 Crear médico con sec1
  const createDocRes = await fetch(`${API_URL}/medicos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec1.token}`,
    },
    body: JSON.stringify({
      rut: doctorRut,
      nombre: 'Dr. Auditoria Test',
      email: 'dr.auditoria@example.invalid',
      box_atencion: 'Box AUD-1',
      especialidad_id: especialidadId,
    }),
  });
  const createDocData = await createDocRes.json();
  assert.equal(createDocRes.status, 201, `Error al crear médico: ${JSON.stringify(createDocData)}`);
  const doctorId = createDocData.medico.id;

  const auditDocCreate = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.MEDICO_CREAR, String(doctorId)],
  );
  assert.equal(auditDocCreate.rowCount, 1, 'Debe registrar 1 evento de creación de médico');
  assert.equal(auditDocCreate.rows[0].secretaria_id, sec1.id);
  assert.equal(auditDocCreate.rows[0].origen_identidad, 'SESION_INDIVIDUAL');
  assert.equal(auditDocCreate.rows[0].entidad_tipo, AUDIT_ENTITY_TYPES.MEDICO);

  // Una operación fallida no debe generar un evento de creación.
  const createAuditCountBefore = await pool.query(
    'SELECT COUNT(*)::int AS total FROM auditoria_acciones_secretaria WHERE accion = $1',
    [AUDIT_ACTIONS.MEDICO_CREAR],
  );
  const duplicateDocRes = await fetch(`${API_URL}/medicos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec2.token}`,
    },
    body: JSON.stringify({
      rut: doctorRut,
      nombre: 'Dr. Auditoria Duplicado',
      email: 'dr.auditoria.duplicado@example.invalid',
      box_atencion: 'Box AUD-3',
      especialidad_id: especialidadId,
    }),
  });
  const duplicateDocData = await duplicateDocRes.json();
  assert.equal(
    duplicateDocRes.status,
    409,
    `Debe rechazar RUT duplicado: ${JSON.stringify(duplicateDocData)}`,
  );
  assert.equal(duplicateDocData.code, 'DUPLICATE_RUT');
  const createAuditCountAfter = await pool.query(
    'SELECT COUNT(*)::int AS total FROM auditoria_acciones_secretaria WHERE accion = $1',
    [AUDIT_ACTIONS.MEDICO_CREAR],
  );
  assert.equal(
    createAuditCountAfter.rows[0].total,
    createAuditCountBefore.rows[0].total,
    'Una alta rechazada no debe dejar un registro de auditoría.',
  );

  // 2.2 Actualizar médico con sec2
  const updateDocRes = await fetch(`${API_URL}/medicos/${doctorId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec2.token}`,
    },
    body: JSON.stringify({
      rut: doctorRut,
      nombre: 'Dr. Auditoria Test Modificado',
      email: 'dr.auditoria.mod@example.invalid',
      box_atencion: 'Box AUD-2',
      especialidad_id: especialidadId,
    }),
  });
  assert.equal(updateDocRes.status, 200);

  const auditDocUpdate = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.MEDICO_ACTUALIZAR, String(doctorId)],
  );
  assert.equal(auditDocUpdate.rowCount, 1);
  assert.equal(auditDocUpdate.rows[0].secretaria_id, sec2.id);
  assert.equal(auditDocUpdate.rows[0].detalles.nuevo.box_atencion, 'Box AUD-2');
  assert.equal(auditDocUpdate.rows[0].detalles.anterior.box_atencion, 'Box AUD-1');

  // 2.3 Actualizar foto con sec1
  const updateFotoRes = await fetch(`${API_URL}/medicos/${doctorId}/foto`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
      Authorization: `Bearer ${sec1.token}`,
    },
    body: png(2),
  });
  assert.equal(updateFotoRes.status, 200);

  const auditDocFoto = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.MEDICO_FOTO_ACTUALIZAR, String(doctorId)],
  );
  assert.equal(auditDocFoto.rowCount, 1);
  assert.equal(auditDocFoto.rows[0].secretaria_id, sec1.id);

  // 3. Agenda & Auditoría
  // Generar fecha futura para agendar (mañana)
  const tomorrowRes = await pool.query(
    "SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Santiago')::date + 1, 'YYYY-MM-DD') AS manana",
  );
  const targetDate = tomorrowRes.rows[0].manana;

  // 3.1 Configurar agenda con sec1
  const configAgendaRes = await fetch(`${API_URL}/agendas/configurar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec1.token}`,
    },
    body: JSON.stringify({
      medico_id: doctorId,
      fecha: targetDate,
      hora_inicio: '10:00',
      hora_fin: '11:00',
      duracion_min: 30,
    }),
  });
  const configData = await configAgendaRes.json();
  assert.equal(configAgendaRes.status, 201, `Error agenda: ${JSON.stringify(configData)}`);

  const auditAgendaConfig = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.AGENDA_CONFIGURAR, `${doctorId}:${targetDate}`],
  );
  assert.equal(auditAgendaConfig.rowCount, 1);
  assert.equal(auditAgendaConfig.rows[0].secretaria_id, sec1.id);

  // Obtener los bloques creados
  const slotsRes = await pool.query(
    'SELECT id, hora_inicio FROM agendas WHERE medico_id = $1 AND fecha = $2 ORDER BY hora_inicio ASC',
    [doctorId, targetDate],
  );
  assert.equal(slotsRes.rowCount, 2, 'Debe haber 2 bloques (10:00 y 10:30)');
  const slot1 = slotsRes.rows[0];
  const slot2 = slotsRes.rows[1];

  // 3.2 Bloquear slot1 con sec2
  const blockRes = await fetch(`${API_URL}/agendas/bloquear`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec2.token}`,
    },
    body: JSON.stringify({
      agenda_id: slot1.id,
      motivo: 'Capacitación médica',
    }),
  });
  assert.equal(blockRes.status, 200);

  const auditBlock = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.AGENDA_BLOQUEAR, String(slot1.id)],
  );
  assert.equal(auditBlock.rowCount, 1);
  assert.equal(auditBlock.rows[0].secretaria_id, sec2.id);
  assert.equal(auditBlock.rows[0].detalles.motivo, 'Capacitación médica');

  // 3.3 Desbloquear slot1 con sec2
  const unblockRes = await fetch(`${API_URL}/agendas/desbloquear`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec2.token}`,
    },
    body: JSON.stringify({ agenda_id: slot1.id }),
  });
  assert.equal(unblockRes.status, 200);

  const auditUnblock = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.AGENDA_DESBLOQUEAR, String(slot1.id)],
  );
  assert.equal(auditUnblock.rowCount, 1);
  assert.equal(auditUnblock.rows[0].secretaria_id, sec2.id);

  // 4. Reservas & Auditoría
  const patientRut = await unusedRut();
  const idempotencyKey = `audit-key-${crypto.randomBytes(8).toString('hex')}`;

  // 4.1 Reserva manual con sec1
  const resPayload = {
    agenda_id: slot1.id,
    paciente_rut: patientRut,
    paciente_nombre: 'Paciente Auditoria',
    paciente_email: 'paciente.audit@example.invalid',
    paciente_telefono: '+56912345678',
    origen: 'PRESENCIAL',
  };

  const reservaRes1 = await fetch(`${API_URL}/reservas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec1.token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(resPayload),
  });
  const reservaData1 = await reservaRes1.json();
  assert.equal(reservaRes1.status, 201, `Error reserva: ${JSON.stringify(reservaData1)}`);
  const citaId = reservaData1.reserva.id;

  const auditReserva = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.CITA_RESERVAR_MANUAL, String(citaId)],
  );
  assert.equal(auditReserva.rowCount, 1);
  assert.equal(auditReserva.rows[0].secretaria_id, sec1.id);
  assert.equal(auditReserva.rows[0].detalles.origen, 'PRESENCIAL');
  // CA-05: Comprobar que detalles no expone PII sensible
  assert.equal(auditReserva.rows[0].detalles.paciente_rut, undefined);
  assert.equal(auditReserva.rows[0].detalles.paciente_telefono, undefined);

  // 4.2 Repetir llamada con misma Idempotency-Key (idempotencia)
  const reservaRes2 = await fetch(`${API_URL}/reservas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec1.token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(resPayload),
  });
  const reservaData2 = await reservaRes2.json();
  assert.equal(reservaRes2.status, 200);
  assert.equal(reservaData2.repetida, true);

  const auditReservaRepeated = await pool.query(
    'SELECT COUNT(*) FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.CITA_RESERVAR_MANUAL, String(citaId)],
  );
  assert.equal(
    Number(auditReservaRepeated.rows[0].count),
    1,
    'No debe crear registros de auditoría duplicados por idempotencia',
  );

  // 4.3 Reprogramar cita con sec2 a slot2
  const reprogRes = await fetch(`${API_URL}/reservas/${citaId}/gestionar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec2.token}`,
    },
    body: JSON.stringify({
      accion: 'MOVER',
      agenda_id: slot2.id,
      motivo: 'Solicitud médica de cambio',
    }),
  });
  const reprogData = await reprogRes.json();
  assert.equal(reprogRes.status, 200, `Error reprogramar: ${JSON.stringify(reprogData)}`);

  const auditReprog = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.CITA_REPROGRAMAR, String(citaId)],
  );
  assert.equal(auditReprog.rowCount, 1);
  assert.equal(auditReprog.rows[0].secretaria_id, sec2.id);
  assert.equal(auditReprog.rows[0].detalles.motivo, 'Solicitud médica de cambio');
  assert.equal(auditReprog.rows[0].detalles.nuevo.agenda_id, slot2.id);
  assert.equal(auditReprog.rows[0].detalles.anterior.agenda_id, slot1.id);
  // CA-05: No PII
  assert.equal(auditReprog.rows[0].detalles.paciente_rut, undefined);
  assert.equal(auditReprog.rows[0].detalles.paciente_email, undefined);

  // 4.4 Cancelar cita con sec1
  const cancelRes = await fetch(`${API_URL}/reservas/${citaId}/gestionar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec1.token}`,
    },
    body: JSON.stringify({
      accion: 'CANCELAR',
      motivo: 'Paciente desiste',
    }),
  });
  const cancelData = await cancelRes.json();
  assert.equal(cancelRes.status, 200, `Error cancelar: ${JSON.stringify(cancelData)}`);

  const auditCancel = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.CITA_CANCELAR, String(citaId)],
  );
  assert.equal(auditCancel.rowCount, 1);
  assert.equal(auditCancel.rows[0].secretaria_id, sec1.id);
  assert.equal(auditCancel.rows[0].detalles.motivo, 'Paciente desiste');

  // 5. Desvinculación y Revinculación de médico
  // 5.1 Desvincular con sec2
  const desvRes = await fetch(`${API_URL}/secretaria/medicos/${doctorId}/desvincular`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec2.token}`,
    },
    body: JSON.stringify({ motivo: 'Finiquito de funciones' }),
  });
  assert.equal(desvRes.status, 200);

  const auditDesv = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.MEDICO_DESVINCULAR, String(doctorId)],
  );
  assert.equal(auditDesv.rowCount, 1);
  assert.equal(auditDesv.rows[0].secretaria_id, sec2.id);
  assert.equal(auditDesv.rows[0].detalles.motivo, 'Finiquito de funciones');

  // 5.2 Revincular con sec1
  const revRes = await fetch(`${API_URL}/secretaria/medicos/${doctorId}/revincular`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sec1.token}`,
    },
  });
  assert.equal(revRes.status, 200);

  const auditRev = await pool.query(
    'SELECT * FROM auditoria_acciones_secretaria WHERE accion = $1 AND entidad_id = $2',
    [AUDIT_ACTIONS.MEDICO_REVINCULAR, String(doctorId)],
  );
  assert.equal(auditRev.rowCount, 1);
  assert.equal(auditRev.rows[0].secretaria_id, sec1.id);

  // 6. Integridad e Inmutabilidad (Trigger + Rollback)
  // 6.1 Trigger trg_auditoria_inmutable
  let updateRejected = false;
  try {
    await pool.query("UPDATE auditoria_acciones_secretaria SET accion = 'HACK' WHERE id = $1", [
      auditRev.rows[0].id,
    ]);
  } catch (err) {
    updateRejected = true;
    assert.ok(
      err.message.includes('No se permite modificar registros de auditoría') ||
        err.message.includes('inmutable'),
      `Mensaje inesperado: ${err.message}`,
    );
  }
  assert.equal(updateRejected, true, 'El trigger debe impedir cualquier UPDATE en auditoria');

  // 6.2 Atomicidad con rollback
  const uniqueId = `atomic-test-${crypto.randomBytes(4).toString('hex')}`;
  const rollbackMessage = 'Simulación de fallo posterior en transacción';
  let insertedAuditId = null;
  await assert.rejects(
    () =>
      withTransaction(pool, async (client) => {
        const audit = await recordAuditEvent(client, {
          secretary: { id: sec1.id },
          accion: AUDIT_ACTIONS.MEDICO_CREAR,
          entidadTipo: AUDIT_ENTITY_TYPES.MEDICO,
          entidadId: uniqueId,
          detalles: { prueba: 'debe revertirse' },
        });
        insertedAuditId = audit.id;
        throw new Error(rollbackMessage);
      }),
    (error) => error.message === rollbackMessage,
  );
  assert.ok(insertedAuditId, 'La prueba debe insertar auditoría antes de provocar el rollback.');

  const phantomAudit = await pool.query(
    'SELECT 1 FROM auditoria_acciones_secretaria WHERE entidad_id = $1',
    [uniqueId],
  );
  assert.equal(phantomAudit.rowCount, 0, 'No deben quedar registros huérfanos tras rollback');

  // 7. Filtros y Consulta GET /api/secretaria/auditoria
  // 7.1 Sin autenticación debe fallar 401
  const unauthRes = await fetch(`${API_URL}/secretaria/auditoria`);
  assert.equal(unauthRes.status, 401);

  // 7.2 Cabeceras de cache y seguridad
  const auditRes = await fetch(`${API_URL}/secretaria/auditoria`, {
    headers: { Authorization: `Bearer ${sec1.token}` },
  });
  assert.equal(auditRes.status, 200);
  assert.equal(auditRes.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(auditRes.headers.get('X-Content-Type-Options'), 'nosniff');
  const auditBody = await auditRes.json();
  assert.equal(auditBody.ok, true);
  assert.equal(auditBody.jira, 'MED-27');
  assert.ok(Array.isArray(auditBody.registros));
  assert.ok(auditBody.registros.length >= 8);

  // 7.3 Filtro por secretaria_id = sec1.id
  const filterSec1Res = await fetch(`${API_URL}/secretaria/auditoria?secretaria_id=${sec1.id}`, {
    headers: { Authorization: `Bearer ${sec1.token}` },
  });
  const filterSec1Data = await filterSec1Res.json();
  assert.ok(
    filterSec1Data.registros.every((r) => r.secretaria && r.secretaria.id === sec1.id),
    'Todos los registros deben pertenecer a sec1',
  );

  // 7.4 Filtro por accion = CITA_REPROGRAMAR
  const filterAccionRes = await fetch(`${API_URL}/secretaria/auditoria?accion=CITA_REPROGRAMAR`, {
    headers: { Authorization: `Bearer ${sec1.token}` },
  });
  const filterAccionData = await filterAccionRes.json();
  assert.ok(
    filterAccionData.registros.length >= 1 &&
      filterAccionData.registros.every((r) => r.accion === 'CITA_REPROGRAMAR'),
  );

  // 7.5 Filtro por entidad_tipo = MEDICO
  const filterEntidadRes = await fetch(`${API_URL}/secretaria/auditoria?entidad_tipo=MEDICO`, {
    headers: { Authorization: `Bearer ${sec1.token}` },
  });
  const filterEntidadData = await filterEntidadRes.json();
  assert.ok(filterEntidadData.registros.every((r) => r.entidad_tipo === 'MEDICO'));

  // 7.6 Filtro desconocido (CA-06)
  // Insertar un registro histórico sin secretaria
  const anonEntityId = `anon-${crypto.randomBytes(4).toString('hex')}`;
  await pool.query(
    `INSERT INTO auditoria_acciones_secretaria
     (secretaria_id, origen_identidad, accion, entidad_tipo, entidad_id, detalles)
     VALUES (NULL, 'ANTERIOR_O_DESCONOCIDO', 'AGENDA_BLOQUEAR', 'AGENDA', $1, '{"motivo":"Feriado antiguo"}')`,
    [anonEntityId],
  );

  const filterAnonRes = await fetch(`${API_URL}/secretaria/auditoria?secretaria_id=desconocido`, {
    headers: { Authorization: `Bearer ${sec1.token}` },
  });
  const filterAnonData = await filterAnonRes.json();
  assert.ok(
    filterAnonData.registros.some(
      (r) => r.entidad_id === anonEntityId && r.origen_identidad === 'ANTERIOR_O_DESCONOCIDO',
    ),
    'Debe retornar registros de origen desconocido',
  );

  // CA-05 / CA-07: Las credenciales nunca deben persistirse en los detalles auditados.
  const storedDetailsRes = await pool.query(
    "SELECT COALESCE(string_agg(detalles::text, ' '), '') AS detalles FROM auditoria_acciones_secretaria",
  );
  const storedDetails = storedDetailsRes.rows[0].detalles;
  for (const [label, credential] of [
    ['token de sesión de sec1', sec1.token],
    ['token de sesión de sec2', sec2.token],
    ['contraseña de sec1', 'ClaveSegura123!'],
    ['contraseña de sec2', 'ClaveSegura456!'],
  ]) {
    assert.equal(storedDetails.includes(credential), false, `No debe persistir ${label}.`);
  }

  console.log('--- Verificación MED-27 exitosa: Todos los criterios de aceptación validados ---');
}

verify()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Error en verificación:', err);
    await pool.end();
    process.exit(1);
  });
