const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { validateRut } = require('../utils/rutValidator');
const { sendConfirmationEmail, getSentEmails } = require('../utils/mailer');

const router = express.Router();

/**
 * GET /api/reservas
 * Lista las reservas confirmadas y los correos de confirmación emitidos (A-05)
 */
router.get('/reservas', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.codigo_reserva,
        c.agenda_id,
        c.paciente_rut,
        c.paciente_nombre,
        c.paciente_email,
        c.paciente_telefono,
        c.estado,
        c.correo_enviado,
        c.created_at,
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
        TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
        m.nombre AS medico_nombre,
        m.box_atencion,
        e.nombre AS especialidad_nombre
      FROM citas_medicas c
      INNER JOIN agendas a ON a.id = c.agenda_id
      INNER JOIN medicos m ON m.id = c.medico_id
      INNER JOIN especialidades e ON e.id = m.especialidad_id
      ORDER BY c.created_at DESC
      LIMIT 50
    `);

    res.json({
      ok: true,
      total: result.rows.length,
      reservas: result.rows,
      correos_recientes: getSentEmails().slice(0, 15),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/reservas
 * MED-11 (RF-02 / HU03 / CU-02: Actividades A-03, A-04, A-05, A-06)
 * MED-16 (RNF-01 / Riesgo R01): Bloqueo pesimista a nivel de fila (SELECT ... FOR UPDATE)
 * y aislamiento transaccional en PostgreSQL para garantizar 0% de overbooking.
 */
router.post('/reservas', async (req, res) => {
  const startHr = process.hrtime.bigint();
  const {
    agenda_id,
    paciente_rut,
    paciente_nombre,
    paciente_email,
    paciente_telefono,
  } = req.body;

  // 1. Validación de campos obligatorios (A-03)
  if (!agenda_id || !paciente_rut || !paciente_nombre || !paciente_email || !paciente_telefono) {
    return res.status(400).json({
      ok: false,
      jira: 'MED-11',
      actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
      codigo_error: 'CAMPOS_INCOMPLETOS',
      mensaje: 'Todos los datos del paciente (RUT, nombre, correo y teléfono) y el bloque horario son obligatorios.',
    });
  }

  // 2. Actividad A-04: Validación algorítmica de RUT chileno (Módulo 11)
  const rutValidation = validateRut(paciente_rut);
  if (!rutValidation.valid) {
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
    return res.status(400).json({
      ok: false,
      jira: 'MED-11',
      criterio: 'CA-01 Conflicto / Superposición o RUT inválido',
      actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
      codigo_error: 'RUT_INVALIDO',
      latencia_ms: Number(elapsedMs.toFixed(2)),
      mensaje: `Reserva rechazada (A-06): ${rutValidation.reason}`,
    });
  }

  // 3. Actividad A-04 y MED-16: Transacción con Bloqueo Pesimista (SELECT ... FOR UPDATE)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Bloquea la fila específica en la tabla agendas hasta que termine esta transacción (COMMIT/ROLLBACK)
    const lockQuery = await client.query(
      `
      SELECT
        a.id,
        a.medico_id,
        a.estado,
        TO_CHAR(a.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(a.hora_inicio, 'HH24:MI') AS hora_inicio,
        TO_CHAR(a.hora_fin, 'HH24:MI') AS hora_fin,
        m.nombre AS medico_nombre,
        m.box_atencion,
        e.nombre AS especialidad_nombre
      FROM agendas a
      INNER JOIN medicos m ON m.id = a.medico_id
      INNER JOIN especialidades e ON e.id = m.especialidad_id
      WHERE a.id = $1
      FOR UPDATE OF a
      `,
      [Number(agenda_id)]
    );

    if (lockQuery.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        jira: 'MED-11',
        actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
        codigo_error: 'BLOQUE_NO_EXISTE',
        mensaje: 'El bloque horario seleccionado no existe en la agenda médica.',
      });
    }

    const bloque = lockQuery.rows[0];

    // Compuerta Exclusiva BPMN (X): ¿RUT válido y cupo disponible? -> Rama "No" (A-06)
    if (bloque.estado !== 'DISPONIBLE') {
      await client.query('ROLLBACK');
      const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      return res.status(409).json({
        ok: false,
        jira: 'MED-11 / MED-16',
        criterio: 'CA-01 Conflicto / Superposición o RUT inválido',
        actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
        codigo_error: 'CUPO_OCUPADO_CONCURRENCIA',
        estado_actual_cupo: bloque.estado,
        latencia_ms: Number(elapsedMs.toFixed(2)),
        mensaje: `Reserva rechazada (A-06): El bloque de ${bloque.hora_inicio} a ${bloque.hora_fin} con ${bloque.medico_nombre} ya fue ${bloque.estado.toLowerCase()}. Por favor, seleccione un nuevo horario disponible.`,
      });
    }

    // Compuerta Exclusiva BPMN (X): Rama "Sí" (A-05 Registrar reserva y enviar confirmación)
    await client.query(
      `
      UPDATE agendas
      SET estado = 'RESERVADO', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [bloque.id]
    );

    const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const codigoReserva = `MED-2026-${uniqueSuffix}`;

    const insertCita = await client.query(
      `
      INSERT INTO citas_medicas (
        codigo_reserva,
        agenda_id,
        medico_id,
        paciente_rut,
        paciente_nombre,
        paciente_email,
        paciente_telefono,
        estado,
        correo_enviado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMADA', TRUE)
      RETURNING id, codigo_reserva, created_at
      `,
      [
        codigoReserva,
        bloque.id,
        bloque.medico_id,
        rutValidation.formatted,
        paciente_nombre.trim(),
        paciente_email.trim(),
        paciente_telefono.trim(),
      ]
    );

    await client.query('COMMIT');

    // Despacho de correo automático de confirmación (A-05)
    const emailComprobante = await sendConfirmationEmail({
      codigoReserva,
      pacienteNombre: paciente_nombre.trim(),
      pacienteRut: rutValidation.formatted,
      pacienteEmail: paciente_email.trim(),
      medicoNombre: bloque.medico_nombre,
      especialidadNombre: bloque.especialidad_nombre,
      boxAtencion: bloque.box_atencion,
      fecha: bloque.fecha,
      horaInicio: bloque.hora_inicio,
      horaFin: bloque.hora_fin,
    });

    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;

    return res.status(201).json({
      ok: true,
      jira: 'MED-11 / MED-16',
      criterio: 'CA-02 Sin conflicto (Recorrido exitoso)',
      actividad_bpmn: 'A-05 Registrar reserva y enviar confirmación',
      latencia_ms: Number(elapsedMs.toFixed(2)),
      mensaje: `Reserva confirmada exitosamente con código ${codigoReserva}. Se ha enviado el comprobante a ${paciente_email.trim()}.`,
      reserva: {
        id: insertCita.rows[0].id,
        codigo_reserva: codigoReserva,
        agenda_id: bloque.id,
        paciente_rut: rutValidation.formatted,
        paciente_nombre: paciente_nombre.trim(),
        paciente_email: paciente_email.trim(),
        paciente_telefono: paciente_telefono.trim(),
        especialidad_nombre: bloque.especialidad_nombre,
        medico_nombre: bloque.medico_nombre,
        box_atencion: bloque.box_atencion,
        fecha: bloque.fecha,
        hora_inicio: bloque.hora_inicio,
        hora_fin: bloque.hora_fin,
        created_at: insertCita.rows[0].created_at,
      },
      comprobante_correo: emailComprobante,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;

    // Manejo de colisión por índice UNIQUE o serialización en PostgreSQL
    if (err.code === '23505' || err.code === '40001') {
      return res.status(409).json({
        ok: false,
        jira: 'MED-16',
        actividad_bpmn: 'A-06 Informar rechazo y solicitar nueva selección',
        codigo_error: 'COLISION_TRANSACCIONAL',
        latencia_ms: Number(elapsedMs.toFixed(2)),
        mensaje: 'El bloque horario fue reservado simultáneamente por otro usuario. Por favor seleccione otro horario.',
      });
    }

    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
