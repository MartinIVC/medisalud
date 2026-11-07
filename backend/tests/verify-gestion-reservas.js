const assert = require('node:assert/strict');
const { requireDisposableTestEnvironment } = require('./disposable-env');

const testEnvironment = requireDisposableTestEnvironment();
process.env.DB_HOST = testEnvironment.database.host;
process.env.DB_PORT = testEnvironment.database.port;
process.env.DB_USER = testEnvironment.database.user;
process.env.DB_PASSWORD = testEnvironment.database.password;
process.env.DB_NAME = testEnvironment.database.name;

const { pool } = require('../src/db');
const API_URL = testEnvironment.apiUrl;

async function post(path, body, token) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

async function readSlot(id) {
  const result = await pool.query('SELECT estado FROM agendas WHERE id=$1', [id]);
  return result.rows[0]?.estado;
}

async function readAppointment(id) {
  const result = await pool.query(
    'SELECT estado, asistencia_estado, agenda_id FROM citas_medicas WHERE id=$1',
    [id],
  );
  return result.rows[0];
}

async function run() {
  assert.ok(process.env.SECRETARY_PASSWORD, 'Configura SECRETARY_PASSWORD.');
  const login = await post('/auth/secretaria', { password: process.env.SECRETARY_PASSWORD });
  assert.equal(login.status, 200);
  const token = login.body.token;

  const dateResult = await pool.query(
    `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Santiago')::date + 45, 'YYYY-MM-DD') AS fecha,
            TO_CHAR((NOW() AT TIME ZONE 'America/Santiago')::date - 1, 'YYYY-MM-DD') AS fecha_pasada`,
  );
  const fecha = dateResult.rows[0].fecha;
  const createdSlotIds = [];
  const createdBlockIds = [];
  let appointmentId;
  let inactiveDoctorUpdated = false;

  try {
    for (const [horaInicio, horaFin] of [
      ['13:00', '13:30'],
      ['13:30', '14:00'],
      ['14:00', '14:30'],
      ['14:30', '15:00'],
    ]) {
      const result = await pool.query(
        `INSERT INTO agendas (medico_id, fecha, hora_inicio, hora_fin, duracion_min)
         VALUES (1, $1, $2, $3, 30) RETURNING id`,
        [fecha, horaInicio, horaFin],
      );
      createdSlotIds.push(result.rows[0].id);
    }
    const pastSlot = await pool.query(
      `INSERT INTO agendas (medico_id, fecha, hora_inicio, hora_fin, duracion_min)
       VALUES (1, $1, '13:00', '13:30', 30) RETURNING id`,
      [dateResult.rows[0].fecha_pasada],
    );
    createdSlotIds.push(pastSlot.rows[0].id);
    const inactiveDoctorSlot = await pool.query(
      `INSERT INTO agendas (medico_id, fecha, hora_inicio, hora_fin, duracion_min)
       VALUES (2, $1, '13:00', '13:30', 30) RETURNING id`,
      [fecha],
    );
    createdSlotIds.push(inactiveDoctorSlot.rows[0].id);

    const [originalId, targetId, blockedId, occupiedId, pastSlotId, inactiveDoctorSlotId] =
      createdSlotIds;

    const booking = await post('/reservas', {
      agenda_id: originalId,
      paciente_rut: '12.345.678-5',
      paciente_nombre: 'Paciente Prueba Gestión',
      paciente_email: 'gestion-reservas@example.test',
      paciente_telefono: '+56912345678',
    });
    assert.equal(booking.status, 201, JSON.stringify(booking.body));
    const appointment = await pool.query('SELECT id FROM citas_medicas WHERE codigo_reserva=$1', [
      booking.body.reserva.codigo_reserva,
    ]);
    appointmentId = appointment.rows[0].id;
    const path = `/reservas/${appointmentId}/gestionar`;

    assert.equal((await post(path, { accion: 'CANCELAR', motivo: 'Prueba' })).status, 401);
    assert.equal((await post(path, { accion: 'CANCELAR' }, token)).status, 400);
    assert.equal(
      (await post(path, { accion: 'MOVER', motivo: 'Prueba', agenda_id: originalId }, token))
        .status,
      400,
    );

    await pool.query("UPDATE agendas SET estado='BLOQUEADO' WHERE id=$1", [blockedId]);
    await pool.query("UPDATE agendas SET estado='RESERVADO' WHERE id=$1", [occupiedId]);
    const blockedMove = await post(
      path,
      { accion: 'MOVER', motivo: 'Contingencia de prueba', agenda_id: blockedId },
      token,
    );
    assert.equal(blockedMove.status, 409, JSON.stringify(blockedMove.body));
    assert.equal((await readAppointment(appointmentId)).agenda_id, originalId);
    assert.equal(await readSlot(originalId), 'RESERVADO');

    const occupiedMove = await post(
      path,
      { accion: 'MOVER', motivo: 'Contingencia de prueba', agenda_id: occupiedId },
      token,
    );
    assert.equal(occupiedMove.status, 409, JSON.stringify(occupiedMove.body));
    assert.equal((await readAppointment(appointmentId)).agenda_id, originalId);
    assert.equal(await readSlot(originalId), 'RESERVADO');

    const pastMove = await post(
      path,
      { accion: 'MOVER', motivo: 'Contingencia de prueba', agenda_id: pastSlotId },
      token,
    );
    assert.equal(pastMove.status, 409, JSON.stringify(pastMove.body));
    assert.equal((await readAppointment(appointmentId)).agenda_id, originalId);

    const deactivation = await pool.query(
      'UPDATE medicos SET activo=FALSE WHERE id=2 RETURNING id',
    );
    assert.equal(deactivation.rowCount, 1);
    inactiveDoctorUpdated = true;
    const inactiveDoctorMove = await post(
      path,
      { accion: 'MOVER', motivo: 'Contingencia de prueba', agenda_id: inactiveDoctorSlotId },
      token,
    );
    assert.equal(inactiveDoctorMove.status, 409, JSON.stringify(inactiveDoctorMove.body));
    assert.equal((await readAppointment(appointmentId)).agenda_id, originalId);
    assert.equal(await readSlot(originalId), 'RESERVADO');
    await pool.query('UPDATE medicos SET activo=TRUE WHERE id=2');
    inactiveDoctorUpdated = false;

    const moved = await post(
      path,
      { accion: 'MOVER', motivo: 'Contingencia de prueba', agenda_id: targetId },
      token,
    );
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.correo_aviso.estado, 'PENDIENTE');
    assert.equal(moved.body.correo_aviso.proveedor_configurado, false);
    assert.match(moved.body.mensaje, /aviso quedó pendiente/);
    assert.equal((await readAppointment(appointmentId)).agenda_id, targetId);
    assert.equal(await readSlot(originalId), 'DISPONIBLE');
    assert.equal(await readSlot(targetId), 'RESERVADO');

    const noticesAfterMove = await pool.query(
      'SELECT tipo, contenido, estado FROM notificaciones WHERE cita_id=$1',
      [appointmentId],
    );
    assert.ok(noticesAfterMove.rows.some((row) => row.tipo === 'REPROGRAMACION'));
    assert.equal(
      noticesAfterMove.rows.find((row) => row.tipo === 'REPROGRAMACION').estado,
      'PENDIENTE',
    );
    assert.ok(
      noticesAfterMove.rows
        .filter((row) => row.tipo === 'RECORDATORIO')
        .every((row) => row.contenido.includes('13:30')),
    );

    const block = await pool.query(
      `INSERT INTO bloqueos_agenda (medico_id, fecha, motivo)
       VALUES (1, $1, 'Bloqueo de aceptación') RETURNING id`,
      [fecha],
    );
    createdBlockIds.push(block.rows[0].id);
    const cancelled = await post(
      path,
      { accion: 'CANCELAR', motivo: 'Cancelación de prueba' },
      token,
    );
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.correo_aviso.estado, 'PENDIENTE');
    assert.equal(cancelled.body.correo_aviso.proveedor_configurado, false);
    assert.match(cancelled.body.mensaje, /aviso quedó pendiente/);
    assert.equal((await readAppointment(appointmentId)).estado, 'CANCELADA');
    assert.equal((await readAppointment(appointmentId)).asistencia_estado, 'CANCELADA');
    assert.equal(await readSlot(targetId), 'BLOQUEADO');
    assert.equal((await post(path, { accion: 'CANCELAR', motivo: 'Repetida' }, token)).status, 409);

    const noticesAfterCancel = await pool.query(
      'SELECT tipo, estado FROM notificaciones WHERE cita_id=$1',
      [appointmentId],
    );
    assert.equal(
      noticesAfterCancel.rows.find((row) => row.tipo === 'CANCELACION').estado,
      'PENDIENTE',
    );
    assert.ok(
      noticesAfterCancel.rows
        .filter((row) => ['CONFIRMACION', 'RECORDATORIO', 'REPROGRAMACION'].includes(row.tipo))
        .every((row) => !['PENDIENTE', 'FALLIDA', 'ENVIANDO'].includes(row.estado)),
    );

    console.log(
      'Gestión de citas: acceso, motivos, conflictos, reprogramación, cancelación, bloqueos y avisos pendientes OK.',
    );
  } finally {
    if (inactiveDoctorUpdated) {
      await pool.query('UPDATE medicos SET activo=TRUE WHERE id=2');
    }
    if (appointmentId) await pool.query('DELETE FROM citas_medicas WHERE id=$1', [appointmentId]);
    if (createdBlockIds.length) {
      await pool.query('DELETE FROM bloqueos_agenda WHERE id=ANY($1::bigint[])', [createdBlockIds]);
    }
    if (createdSlotIds.length) {
      await pool.query('DELETE FROM agendas WHERE id=ANY($1::int[])', [createdSlotIds]);
    }
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Falló la verificación de gestión de citas:', error);
  process.exitCode = 1;
});
