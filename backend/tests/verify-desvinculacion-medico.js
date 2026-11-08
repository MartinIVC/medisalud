const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { requireDisposableTestEnvironment } = require('./disposable-env');
const { ensureTestSecretary } = require('./secretary-fixture');
const { calculateDv, formatRut } = require('../src/utils/rutValidator');

const environment = requireDisposableTestEnvironment();
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const api = environment.apiUrl;
const rutBody = String(crypto.randomInt(1000000, 99999999));
const patientRut = formatRut(`${rutBody}${calculateDv(rutBody)}`);

async function request(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

async function doctorWithSlots() {
  const doctor = await db.query(
    `INSERT INTO medicos (rut,nombre,email,box_atencion,especialidad_id)
    VALUES ($1,'Profesional de prueba','demo@example.invalid','T1',(SELECT id FROM especialidades LIMIT 1)) RETURNING id`,
    [`T${crypto.randomBytes(6).toString('hex')}`],
  );
  const id = doctor.rows[0].id;
  const slots = await db.query(
    `INSERT INTO agendas (medico_id,fecha,hora_inicio,hora_fin,duracion_min,estado)
    VALUES ($1, (NOW() AT TIME ZONE 'America/Santiago')::date - 1, '09:00','09:30',30,'RESERVADO'),
           ($1, (NOW() AT TIME ZONE 'America/Santiago')::date + 2, '09:00','09:30',30,'DISPONIBLE') RETURNING id, estado`,
    [id],
  );
  await db.query(
    `INSERT INTO citas_medicas (codigo_reserva,agenda_id,medico_id,paciente_rut,paciente_nombre,paciente_email,paciente_telefono)
    VALUES ($1,$2,$3,$4,'Paciente de prueba','demo@example.invalid','+56912345678')`,
    [`H-${crypto.randomBytes(8).toString('hex')}`, slots.rows[0].id, id, patientRut],
  );
  return { id, slot: slots.rows[1].id };
}

async function verify() {
  const credentials = await ensureTestSecretary();
  const login = await request('/auth/secretaria', null, credentials);
  assert.equal(login.status, 200);
  const token = login.data.token;
  const doctor = await doctorWithSlots();
  const photo = Buffer.from('imagen ficticia de prueba');
  await db.query(
    "UPDATE medicos SET foto_mime='image/png', foto_datos=$2, foto_actualizada_en=NOW() WHERE id=$1",
    [doctor.id, photo],
  );
  const path = `/secretaria/medicos/${doctor.id}/desvincular`;
  assert.equal((await request('/secretaria/medicos')).status, 401);
  assert.equal((await request('/secretaria/medicos/2147483648/foto', token)).status, 400);
  assert.equal(
    (await request('/secretaria/medicos/2147483648/desvincular', token, { motivo: 'Prueba' }))
      .status,
    400,
  );
  assert.equal(
    (await request('/secretaria/medicos/2147483648/revincular', token, undefined, 'POST')).status,
    400,
  );
  assert.equal(
    (await request(`/secretaria/medicos/${doctor.id}/revincular`, null, undefined, 'POST')).status,
    401,
  );
  assert.equal((await request(path, null, { motivo: 'Prueba' })).status, 401);
  assert.equal((await request(path, token, { motivo: '   ' })).status, 400);
  const reservation = await request('/reservas', null, {
    agenda_id: doctor.slot,
    paciente_rut: patientRut,
    paciente_nombre: 'Paciente de prueba',
    paciente_email: 'demo@example.invalid',
    paciente_telefono: '+56912345678',
    origen: 'WEB',
  });
  assert.equal(reservation.status, 201, JSON.stringify(reservation.data));
  const blocked = await request(path, token, { motivo: 'Fin de atención' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'DOCTOR_HAS_FUTURE_APPOINTMENTS');
  assert.equal(blocked.data.fields.citas_futuras, 1);
  assert.equal(
    (await db.query('SELECT activo FROM medicos WHERE id=$1', [doctor.id])).rows[0].activo,
    true,
  );
  await db.query("UPDATE citas_medicas SET estado='CANCELADA' WHERE agenda_id=$1", [doctor.slot]);
  await db.query("UPDATE agendas SET estado='DISPONIBLE' WHERE id=$1", [doctor.slot]);
  const unlinked = await request(path, token, { motivo: ' Fin de atención ' });
  assert.equal(unlinked.status, 200, JSON.stringify(unlinked.data));
  assert.equal(unlinked.data.desvinculacion.motivo, 'Fin de atención');
  const audit = await db.query(
    `SELECT d.motivo, d.desvinculado_en, s.usuario FROM desvinculaciones_medico d JOIN secretarias s ON s.id=d.secretaria_id WHERE d.medico_id=$1`,
    [doctor.id],
  );
  assert.equal(audit.rows[0].usuario, credentials.username);
  assert.ok(audit.rows[0].desvinculado_en);
  assert.equal(
    (
      await db.query('SELECT COUNT(*)::int AS total FROM citas_medicas WHERE medico_id=$1', [
        doctor.id,
      ])
    ).rows[0].total,
    2,
  );
  assert.equal(
    (await db.query('SELECT COUNT(*)::int AS total FROM agendas WHERE medico_id=$1', [doctor.id]))
      .rows[0].total,
    2,
  );
  assert.equal((await request(path, token, { motivo: 'Repetir' })).data.code, 'DOCTOR_INACTIVE');
  assert.ok(!(await request('/medicos')).data.medicos.some((item) => item.id === doctor.id));
  const list = await request('/secretaria/medicos', token);
  const inactive = list.data.medicos.find((item) => item.id === doctor.id);
  assert.equal(inactive.activo, false);
  assert.match(inactive.foto_url, new RegExp(`^/api/secretaria/medicos/${doctor.id}/foto\\?v=`));
  assert.equal((await fetch(`${api}/secretaria/medicos/${doctor.id}/foto`)).status, 401);
  assert.equal((await fetch(`${api}/medicos/${doctor.id}/foto`)).status, 404);
  const privatePhoto = await fetch(`${api}/secretaria/medicos/${doctor.id}/foto`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(privatePhoto.status, 200);
  assert.equal(privatePhoto.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await privatePhoto.arrayBuffer()), photo);
  const configure = await request('/agendas/configurar', token, {
    medico_id: doctor.id,
    fecha: '2099-01-01',
    hora_inicio: '10:00',
    hora_fin: '11:00',
    duracion_min: 30,
  });
  assert.equal(configure.status, 404);
  const retry = await request('/reservas', null, {
    agenda_id: doctor.slot,
    paciente_rut: patientRut,
    paciente_nombre: 'Paciente de prueba',
    paciente_email: 'demo@example.invalid',
    paciente_telefono: '+56912345678',
    origen: 'WEB',
  });
  assert.equal(retry.status, 409);
  assert.equal(retry.data.code, 'SLOT_NOT_BOOKABLE');

  const relinked = await request(
    `/secretaria/medicos/${doctor.id}/revincular`,
    token,
    undefined,
    'POST',
  );
  assert.equal(relinked.status, 200, JSON.stringify(relinked.data));
  assert.deepEqual(relinked.data.revinculacion, { medico_id: doctor.id, activo: true });
  assert.equal(
    (await db.query('SELECT activo FROM medicos WHERE id=$1', [doctor.id])).rows[0].activo,
    true,
  );
  assert.ok((await request('/medicos')).data.medicos.some((item) => item.id === doctor.id));
  assert.equal(
    (
      await db.query('SELECT COUNT(*)::int AS total FROM citas_medicas WHERE medico_id=$1', [
        doctor.id,
      ])
    ).rows[0].total,
    2,
  );
  assert.equal(
    (await request(`/secretaria/medicos/${doctor.id}/revincular`, token, undefined, 'POST')).data
      .code,
    'DOCTOR_ALREADY_ACTIVE',
  );
  const relinkedAgain = await request(path, token, { motivo: 'Nueva vinculación finalizada' });
  assert.equal(relinkedAgain.status, 200, JSON.stringify(relinkedAgain.data));
  const latestAudit = await db.query(
    'SELECT motivo FROM desvinculaciones_medico WHERE medico_id=$1',
    [doctor.id],
  );
  assert.equal(latestAudit.rows[0].motivo, 'Nueva vinculación finalizada');

  for (let i = 0; i < 6; i += 1) {
    const candidate = await doctorWithSlots();
    const [unlink, booking] = await Promise.all([
      request(`/secretaria/medicos/${candidate.id}/desvincular`, token, {
        motivo: 'Fin de atención',
      }),
      request('/reservas', null, {
        agenda_id: candidate.slot,
        paciente_rut: patientRut,
        paciente_nombre: 'Paciente de prueba',
        paciente_email: 'demo@example.invalid',
        paciente_telefono: '+56912345678',
        origen: 'WEB',
      }),
    ]);
    assert.ok(
      (unlink.status === 200 && booking.status === 409) ||
        (unlink.status === 409 && booking.status === 201),
      JSON.stringify({ unlink, booking }),
    );
    const invariant = await db.query(
      `SELECT m.activo, COUNT(c.id)::int AS total FROM medicos m LEFT JOIN citas_medicas c ON c.medico_id=m.id AND c.estado='CONFIRMADA' AND c.agenda_id=$2 WHERE m.id=$1 GROUP BY m.activo`,
      [candidate.id, candidate.slot],
    );
    assert.ok(invariant.rows[0].activo || invariant.rows[0].total === 0);
  }
  const inactiveCandidate = await doctorWithSlots();
  assert.equal(
    (
      await request(`/secretaria/medicos/${inactiveCandidate.id}/desvincular`, token, {
        motivo: 'Prueba de concurrencia',
      })
    ).status,
    200,
  );
  const [reactivation, concurrentBooking] = await Promise.all([
    request(`/secretaria/medicos/${inactiveCandidate.id}/revincular`, token, undefined, 'POST'),
    request('/reservas', null, {
      agenda_id: inactiveCandidate.slot,
      paciente_rut: patientRut,
      paciente_nombre: 'Paciente de prueba',
      paciente_email: 'demo@example.invalid',
      paciente_telefono: '+56912345678',
      origen: 'WEB',
    }),
  ]);
  assert.equal(reactivation.status, 200, JSON.stringify(reactivation.data));
  assert.ok(
    concurrentBooking.status === 201 ||
      (concurrentBooking.status === 409 && concurrentBooking.data.code === 'SLOT_NOT_BOOKABLE'),
    JSON.stringify(concurrentBooking),
  );
  const concurrentInvariant = await db.query(
    `SELECT m.activo, COUNT(c.id)::int AS total FROM medicos m
     LEFT JOIN citas_medicas c ON c.medico_id=m.id AND c.estado='CONFIRMADA' AND c.agenda_id=$2
     WHERE m.id=$1 GROUP BY m.activo`,
    [inactiveCandidate.id, inactiveCandidate.slot],
  );
  assert.ok(concurrentInvariant.rows[0].activo || concurrentInvariant.rows[0].total === 0);
  console.log('MED-24: autorización, historial, bloqueo, auditoría y concurrencia verificadas.');
}
verify()
  .finally(() => db.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
