const { withTransaction } = require('../db/transaction');
const { HttpError } = require('../middleware/errors');

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function generateIntervals(start, end, duration) {
  const startMinute = timeToMinutes(start);
  const endMinute = timeToMinutes(end);
  const intervals = [];
  for (let cursor = startMinute; cursor + duration <= endMinute; cursor += duration) {
    intervals.push({ start: minutesToTime(cursor), end: minutesToTime(cursor + duration) });
  }
  return intervals;
}

async function configureAgenda(pool, { medicoId, fecha, horaInicio, horaFin, duracion }) {
  const intervals = generateIntervals(horaInicio, horaFin, duracion);
  const startTimes = intervals.map(({ start }) => start);
  const endTimes = intervals.map(({ end }) => end);

  return withTransaction(pool, async (client) => {
    const doctor = await client.query(
      'SELECT id FROM medicos WHERE id=$1 AND activo=TRUE FOR UPDATE',
      [medicoId],
    );
    if (!doctor.rowCount)
      throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'El médico no existe o está inactivo.');

    const blocked = await client.query(
      'SELECT 1 FROM bloqueos_agenda WHERE fecha=$1::date AND (medico_id IS NULL OR medico_id=$2) LIMIT 1',
      [fecha, medicoId],
    );
    if (blocked.rowCount)
      throw new HttpError(
        409,
        'AGENDA_BLOCKED',
        'La fecha está bloqueada por feriado o ausencia registrada.',
      );

    const history = await client.query(
      `SELECT COUNT(*)::INT AS total
       FROM agendas a
       WHERE a.medico_id=$1 AND a.fecha=$2::date
         AND a.hora_inicio >= $3::time AND a.hora_fin <= $4::time AND a.estado='DISPONIBLE'
         AND EXISTS (SELECT 1 FROM citas_medicas c WHERE c.agenda_id=a.id)`,
      [medicoId, fecha, horaInicio, horaFin],
    );
    const deleted = await client.query(
      `DELETE FROM agendas a
       WHERE a.medico_id=$1 AND a.fecha=$2::date
         AND a.hora_inicio >= $3::time AND a.hora_fin <= $4::time AND a.estado='DISPONIBLE'
         AND NOT EXISTS (SELECT 1 FROM citas_medicas c WHERE c.agenda_id=a.id)
       RETURNING a.id`,
      [medicoId, fecha, horaInicio, horaFin],
    );

    const inserted = await client.query(
      `WITH requested(h_ini, h_fin) AS (
         SELECT * FROM UNNEST($3::time[], $4::time[])
       )
       INSERT INTO agendas (medico_id, fecha, hora_inicio, hora_fin, duracion_min, estado)
       SELECT $1, $2::date, requested.h_ini, requested.h_fin, $5, 'DISPONIBLE'
       FROM requested
       WHERE NOT EXISTS (
         SELECT 1 FROM agendas existing
         WHERE existing.medico_id=$1 AND existing.fecha=$2::date
           AND existing.hora_inicio < requested.h_fin AND existing.hora_fin > requested.h_ini
       )
       ON CONFLICT (medico_id, fecha, hora_inicio) DO NOTHING
       RETURNING id, TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
                 TO_CHAR(hora_fin, 'HH24:MI') AS hora_fin, duracion_min, estado`,
      [medicoId, fecha, startTimes, endTimes, duracion],
    );

    return {
      blocks: inserted.rows,
      deletedCount: deleted.rowCount,
      historyCount: Number(history.rows[0]?.total || 0),
      requestedCount: intervals.length,
    };
  });
}

async function lockDoctor(client, medicoId) {
  const result = await client.query('SELECT id FROM medicos WHERE id=$1 FOR UPDATE', [medicoId]);
  if (!result.rowCount) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'El médico no existe.');
}

async function lockAllDoctors(client) {
  await client.query('SELECT id FROM medicos ORDER BY id FOR UPDATE');
}

async function blockAgenda(pool, { agendaId, medicoId, fecha, global, motivo }) {
  return withTransaction(pool, async (client) => {
    if (agendaId !== undefined) {
      const target = await client.query('SELECT medico_id FROM agendas WHERE id=$1', [agendaId]);
      if (!target.rowCount)
        throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario no existe.');
      await lockDoctor(client, target.rows[0].medico_id);
      const result = await client.query(
        `UPDATE agendas SET estado='BLOQUEADO', motivo_bloqueo=$2, updated_at=NOW()
         WHERE id=$1 AND estado='DISPONIBLE' RETURNING id`,
        [agendaId, motivo],
      );
      if (!result.rowCount)
        throw new HttpError(
          409,
          'SLOT_NOT_AVAILABLE',
          'Solo se pueden bloquear horarios disponibles.',
        );
      return { affected: result.rowCount };
    }

    if (global) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
        `agenda-global:${fecha}`,
      ]);
      await lockAllDoctors(client);
      await client.query(
        `INSERT INTO bloqueos_agenda (medico_id, fecha, motivo)
         SELECT NULL, $1::date, $2
         WHERE NOT EXISTS (SELECT 1 FROM bloqueos_agenda WHERE medico_id IS NULL AND fecha=$1::date)`,
        [fecha, motivo],
      );
      const updated = await client.query(
        `UPDATE agendas SET estado='BLOQUEADO', motivo_bloqueo=$2, updated_at=NOW()
         WHERE fecha=$1::date AND estado='DISPONIBLE' RETURNING id`,
        [fecha, motivo],
      );
      return { affected: updated.rowCount };
    }

    await lockDoctor(client, medicoId);
    await client.query(
      `INSERT INTO bloqueos_agenda (medico_id, fecha, motivo)
       SELECT $1, $2::date, $3
       WHERE NOT EXISTS (SELECT 1 FROM bloqueos_agenda WHERE medico_id=$1 AND fecha=$2::date)`,
      [medicoId, fecha, motivo],
    );
    const updated = await client.query(
      `UPDATE agendas SET estado='BLOQUEADO', motivo_bloqueo=$3, updated_at=NOW()
       WHERE medico_id=$1 AND fecha=$2::date AND estado='DISPONIBLE' RETURNING id`,
      [medicoId, fecha, motivo],
    );
    return { affected: updated.rowCount };
  });
}

async function unblockAgenda(pool, { agendaId, medicoId, fecha, global }) {
  return withTransaction(pool, async (client) => {
    if (agendaId !== undefined) {
      const target = await client.query('SELECT medico_id, fecha FROM agendas WHERE id=$1', [
        agendaId,
      ]);
      if (!target.rowCount)
        throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario no existe.');
      await lockDoctor(client, target.rows[0].medico_id);
      const dayLock = await client.query(
        'SELECT 1 FROM bloqueos_agenda WHERE fecha=$1::date AND (medico_id IS NULL OR medico_id=$2) LIMIT 1',
        [target.rows[0].fecha, target.rows[0].medico_id],
      );
      if (dayLock.rowCount)
        throw new HttpError(
          409,
          'AGENDA_BLOCKED',
          'Primero levanta el bloqueo de la fecha para habilitar este horario.',
        );
      const updated = await client.query(
        `UPDATE agendas SET estado='DISPONIBLE', motivo_bloqueo=NULL, updated_at=NOW()
         WHERE id=$1 AND estado='BLOQUEADO' RETURNING id`,
        [agendaId],
      );
      if (!updated.rowCount)
        throw new HttpError(409, 'SLOT_NOT_BLOCKED', 'El bloque no está bloqueado.');
      return { affected: updated.rowCount };
    }

    if (global) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
        `agenda-global:${fecha}`,
      ]);
      await lockAllDoctors(client);
      await client.query('DELETE FROM bloqueos_agenda WHERE medico_id IS NULL AND fecha=$1::date', [
        fecha,
      ]);
      const updated = await client.query(
        `UPDATE agendas a
         SET estado=CASE WHEN EXISTS (
               SELECT 1 FROM bloqueos_agenda ba
               WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
             ) THEN 'BLOQUEADO' ELSE 'DISPONIBLE' END,
             motivo_bloqueo=(SELECT ba.motivo FROM bloqueos_agenda ba
               WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
               ORDER BY ba.medico_id NULLS FIRST LIMIT 1),
             updated_at=NOW()
         WHERE a.fecha=$1::date AND a.estado='BLOQUEADO' RETURNING a.id`,
        [fecha],
      );
      return { affected: updated.rowCount };
    }

    await lockDoctor(client, medicoId);
    await client.query('DELETE FROM bloqueos_agenda WHERE medico_id=$1 AND fecha=$2::date', [
      medicoId,
      fecha,
    ]);
    const updated = await client.query(
      `UPDATE agendas a
       SET estado=CASE WHEN EXISTS (
             SELECT 1 FROM bloqueos_agenda ba
             WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
           ) THEN 'BLOQUEADO' ELSE 'DISPONIBLE' END,
           motivo_bloqueo=(SELECT ba.motivo FROM bloqueos_agenda ba
             WHERE ba.fecha=a.fecha AND (ba.medico_id IS NULL OR ba.medico_id=a.medico_id)
             ORDER BY ba.medico_id NULLS FIRST LIMIT 1),
           updated_at=NOW()
       WHERE a.medico_id=$1 AND a.fecha=$2::date AND a.estado='BLOQUEADO' RETURNING a.id`,
      [medicoId, fecha],
    );
    return { affected: updated.rowCount };
  });
}

module.exports = { generateIntervals, configureAgenda, blockAgenda, unblockAgenda };
