const { withTransaction } = require('../db/transaction');
const { HttpError } = require('../middleware/errors');
const { recordAuditEvent } = require('./auditoria');

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

async function assertFutureOrCurrentDate(client, fecha, message) {
  const result = await client.query(
    "SELECT ($1::date >= (NOW() AT TIME ZONE 'America/Santiago')::date) AS vigente",
    [fecha],
  );
  if (!result.rows[0]?.vigente) {
    throw new HttpError(409, 'AGENDA_DATE_PAST', message);
  }
}

async function configureAgenda(
  pool,
  { medicoId, fecha, horaInicio, horaFin, duracion, secretary },
) {
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

    const timing = await client.query(
      "SELECT (($1::date + $2::time) AT TIME ZONE 'America/Santiago') > NOW() AS futuro",
      [fecha, horaInicio],
    );
    if (!timing.rows[0]?.futuro)
      throw new HttpError(
        409,
        'AGENDA_PAST',
        'Indica una fecha y hora de inicio futuras para configurar horarios.',
      );

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
         AND ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW()
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

    if (secretary) {
      await recordAuditEvent(client, {
        secretary,
        accion: 'AGENDA_CONFIGURAR',
        entidadTipo: 'AGENDA',
        entidadId: `${medicoId}:${fecha}`,
        detalles: {
          medico_id: medicoId,
          fecha,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          duracion_min: duracion,
          bloques_creados: inserted.rows.length,
          bloques_reemplazados: deleted.rowCount,
          bloques_con_historial_conservados: Number(history.rows[0]?.total || 0),
        },
      });
    }

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

async function blockAgenda(pool, { agendaId, medicoId, fecha, global, motivo, secretary }) {
  return withTransaction(pool, async (client) => {
    if (agendaId !== undefined) {
      const target = await client.query('SELECT medico_id FROM agendas WHERE id=$1', [agendaId]);
      if (!target.rowCount)
        throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario no existe.');
      await lockDoctor(client, target.rows[0].medico_id);
      const slot = await client.query(
        `SELECT estado, ((fecha + hora_inicio) AT TIME ZONE 'America/Santiago') > NOW() AS futuro
         FROM agendas WHERE id=$1 FOR UPDATE`,
        [agendaId],
      );
      if (!slot.rowCount)
        throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario no existe.');
      if (!slot.rows[0].futuro)
        throw new HttpError(409, 'SLOT_PAST', 'No se puede bloquear un horario cuya hora ya pasó.');
      if (slot.rows[0].estado !== 'DISPONIBLE')
        throw new HttpError(
          409,
          'SLOT_NOT_AVAILABLE',
          'Solo se pueden bloquear horarios disponibles.',
        );
      const result = await client.query(
        `UPDATE agendas SET estado='BLOQUEADO', motivo_bloqueo=$2, updated_at=NOW()
         WHERE id=$1 AND estado='DISPONIBLE' RETURNING id`,
        [agendaId, motivo],
      );

      if (secretary) {
        await recordAuditEvent(client, {
          secretary,
          accion: 'AGENDA_BLOQUEAR',
          entidadTipo: 'AGENDA',
          entidadId: String(agendaId),
          detalles: {
            alcance: 'BLOQUE',
            agenda_id: agendaId,
            motivo,
            bloques_afectados: result.rowCount,
          },
        });
      }

      return { affected: result.rowCount };
    }

    if (global) {
      await assertFutureOrCurrentDate(
        client,
        fecha,
        'No se pueden bloquear fechas que ya pasaron.',
      );
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
         WHERE fecha=$1::date AND estado='DISPONIBLE'
           AND ((fecha + hora_inicio) AT TIME ZONE 'America/Santiago') > NOW()
         RETURNING id`,
        [fecha, motivo],
      );

      if (secretary) {
        await recordAuditEvent(client, {
          secretary,
          accion: 'AGENDA_BLOQUEAR',
          entidadTipo: 'AGENDA',
          entidadId: `GLOBAL:${fecha}`,
          detalles: {
            alcance: 'FERIADO_GLOBAL',
            fecha,
            motivo,
            bloques_afectados: updated.rowCount,
          },
        });
      }

      return { affected: updated.rowCount };
    }

    await lockDoctor(client, medicoId);
    await assertFutureOrCurrentDate(client, fecha, 'No se pueden bloquear fechas que ya pasaron.');
    await client.query(
      `INSERT INTO bloqueos_agenda (medico_id, fecha, motivo)
       SELECT $1, $2::date, $3
       WHERE NOT EXISTS (SELECT 1 FROM bloqueos_agenda WHERE medico_id=$1 AND fecha=$2::date)`,
      [medicoId, fecha, motivo],
    );
    const updated = await client.query(
      `UPDATE agendas SET estado='BLOQUEADO', motivo_bloqueo=$3, updated_at=NOW()
       WHERE medico_id=$1 AND fecha=$2::date AND estado='DISPONIBLE'
         AND ((fecha + hora_inicio) AT TIME ZONE 'America/Santiago') > NOW()
       RETURNING id`,
      [medicoId, fecha, motivo],
    );

    if (secretary) {
      await recordAuditEvent(client, {
        secretary,
        accion: 'AGENDA_BLOQUEAR',
        entidadTipo: 'AGENDA',
        entidadId: `${medicoId}:${fecha}`,
        detalles: {
          alcance: 'MEDICO_FECHA',
          medico_id: medicoId,
          fecha,
          motivo,
          bloques_afectados: updated.rowCount,
        },
      });
    }

    return { affected: updated.rowCount };
  });
}

async function unblockAgenda(pool, { agendaId, medicoId, fecha, global, secretary }) {
  return withTransaction(pool, async (client) => {
    if (agendaId !== undefined) {
      const target = await client.query('SELECT medico_id, fecha FROM agendas WHERE id=$1', [
        agendaId,
      ]);
      if (!target.rowCount)
        throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario no existe.');
      await lockDoctor(client, target.rows[0].medico_id);
      const slot = await client.query(
        `SELECT fecha, estado, ((fecha + hora_inicio) AT TIME ZONE 'America/Santiago') > NOW() AS futuro
         FROM agendas WHERE id=$1 FOR UPDATE`,
        [agendaId],
      );
      if (!slot.rowCount)
        throw new HttpError(404, 'SLOT_NOT_FOUND', 'El bloque horario no existe.');
      if (!slot.rows[0].futuro)
        throw new HttpError(
          409,
          'SLOT_PAST',
          'No se puede desbloquear un horario cuya hora ya pasó.',
        );
      const dayLock = await client.query(
        'SELECT 1 FROM bloqueos_agenda WHERE fecha=$1::date AND (medico_id IS NULL OR medico_id=$2) LIMIT 1',
        [slot.rows[0].fecha, target.rows[0].medico_id],
      );
      if (dayLock.rowCount)
        throw new HttpError(
          409,
          'AGENDA_BLOCKED',
          'Primero levanta el bloqueo de la fecha para habilitar este horario.',
        );
      if (slot.rows[0].estado !== 'BLOQUEADO')
        throw new HttpError(409, 'SLOT_NOT_BLOCKED', 'El bloque no está bloqueado.');
      const updated = await client.query(
        `UPDATE agendas SET estado='DISPONIBLE', motivo_bloqueo=NULL, updated_at=NOW()
         WHERE id=$1 AND estado='BLOQUEADO' RETURNING id`,
        [agendaId],
      );

      if (secretary) {
        await recordAuditEvent(client, {
          secretary,
          accion: 'AGENDA_DESBLOQUEAR',
          entidadTipo: 'AGENDA',
          entidadId: String(agendaId),
          detalles: {
            alcance: 'BLOQUE',
            agenda_id: agendaId,
            bloques_habilitados: updated.rowCount,
          },
        });
      }

      return { affected: updated.rowCount };
    }

    if (global) {
      await assertFutureOrCurrentDate(
        client,
        fecha,
        'No se pueden desbloquear fechas que ya pasaron.',
      );
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
         WHERE a.fecha=$1::date AND a.estado='BLOQUEADO'
           AND ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW()
         RETURNING a.id`,
        [fecha],
      );

      if (secretary) {
        await recordAuditEvent(client, {
          secretary,
          accion: 'AGENDA_DESBLOQUEAR',
          entidadTipo: 'AGENDA',
          entidadId: `GLOBAL:${fecha}`,
          detalles: {
            alcance: 'FERIADO_GLOBAL',
            fecha,
            bloques_habilitados: updated.rowCount,
          },
        });
      }

      return { affected: updated.rowCount };
    }

    await lockDoctor(client, medicoId);
    await assertFutureOrCurrentDate(
      client,
      fecha,
      'No se pueden desbloquear fechas que ya pasaron.',
    );
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
       WHERE a.medico_id=$1 AND a.fecha=$2::date AND a.estado='BLOQUEADO'
         AND ((a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago') > NOW()
       RETURNING a.id`,
      [medicoId, fecha],
    );

    if (secretary) {
      await recordAuditEvent(client, {
        secretary,
        accion: 'AGENDA_DESBLOQUEAR',
        entidadTipo: 'AGENDA',
        entidadId: `${medicoId}:${fecha}`,
        detalles: {
          alcance: 'MEDICO_FECHA',
          medico_id: medicoId,
          fecha,
          bloques_habilitados: updated.rowCount,
        },
      });
    }

    return { affected: updated.rowCount };
  });
}

module.exports = { generateIntervals, configureAgenda, blockAgenda, unblockAgenda };
