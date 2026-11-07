const express = require('express');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { validateRut } = require('../utils/rutValidator');
const { asyncHandler, sendError } = require('../middleware/errors');
const { MAX_PHOTO_BYTES, imageMime, photoUrl } = require('../services/foto-medico');
const { positiveInteger } = require('../schemas/inputs');
const { withTransaction } = require('../db/transaction');
const { HttpError } = require('../middleware/errors');

const router = express.Router();
const allowedFields = new Set(['rut', 'nombre', 'email', 'especialidad_id', 'box_atencion']);
const MAX_DOCTOR_ID = 2147483647;

function validDoctorId(id) {
  return positiveInteger(id) && id <= MAX_DOCTOR_ID;
}

router.get(
  '/secretaria/medicos',
  requireSecretary,
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database || pool;
    const result = await database.query(`
      SELECT m.id, m.nombre, m.rut, m.activo, m.foto_actualizada_en, e.nombre AS especialidad_nombre,
             d.motivo, d.desvinculado_en, s.usuario AS responsable,
             (SELECT COUNT(*)::int FROM citas_medicas c JOIN agendas a ON a.id = c.agenda_id
              WHERE c.medico_id = m.id AND c.estado = 'CONFIRMADA'
                AND (a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago' > NOW()
             ) AS citas_futuras,
             (SELECT TO_CHAR(MIN(a.fecha), 'YYYY-MM-DD')
              FROM citas_medicas c JOIN agendas a ON a.id = c.agenda_id
              WHERE c.medico_id = m.id AND c.estado = 'CONFIRMADA'
                AND (a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago' > NOW()
             ) AS proxima_cita_fecha
      FROM medicos m JOIN especialidades e ON e.id = m.especialidad_id
      LEFT JOIN desvinculaciones_medico d ON d.medico_id = m.id
      LEFT JOIN secretarias s ON s.id = d.secretaria_id
      ORDER BY m.activo DESC, m.nombre, m.id`);
    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      medicos: result.rows.map(({ foto_actualizada_en, ...medico }) => ({
        ...medico,
        foto_url: medico.activo
          ? photoUrl(medico.id, foto_actualizada_en)
          : foto_actualizada_en
            ? `/api/secretaria/medicos/${medico.id}/foto?v=${new Date(foto_actualizada_en).getTime()}`
            : null,
      })),
    });
  }),
);

router.get(
  '/secretaria/medicos/:id/foto',
  requireSecretary,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!validDoctorId(id))
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica un profesional válido.');
    const database = req.app.locals.database || pool;
    const result = await database.query('SELECT foto_mime, foto_datos FROM medicos WHERE id = $1', [
      id,
    ]);
    if (!result.rowCount || !result.rows[0].foto_datos)
      return sendError(res, 404, 'PHOTO_NOT_FOUND', 'Este profesional no tiene foto disponible.');
    res.set('Content-Type', result.rows[0].foto_mime);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    return res.send(result.rows[0].foto_datos);
  }),
);

router.post(
  '/secretaria/medicos/:id/desvincular',
  requireSecretary,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body;
    if (!validDoctorId(id))
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica un profesional válido.');
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'motivo') ||
      typeof body.motivo !== 'string' ||
      !body.motivo.trim() ||
      body.motivo.trim().length > 255
    )
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica un motivo de hasta 255 caracteres.', {
        motivo: 'Ingresa un motivo de hasta 255 caracteres.',
      });
    const database = req.app.locals.database || pool;
    try {
      const record = await withTransaction(database, async (client) => {
        await client.query("SET LOCAL lock_timeout = '1500ms'");
        const doctor = await client.query('SELECT id, activo FROM medicos WHERE id=$1 FOR UPDATE', [
          id,
        ]);
        if (!doctor.rowCount)
          throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'El profesional no existe.');
        if (!doctor.rows[0].activo)
          throw new HttpError(409, 'DOCTOR_INACTIVE', 'El profesional ya está inactivo.');
        const count = await client.query(
          `SELECT COUNT(*)::int AS total, TO_CHAR(MIN(a.fecha), 'YYYY-MM-DD') AS proxima_cita_fecha
          FROM citas_medicas c JOIN agendas a ON a.id=c.agenda_id
          WHERE c.medico_id=$1 AND c.estado='CONFIRMADA'
            AND (a.fecha + a.hora_inicio) AT TIME ZONE 'America/Santiago' > NOW()`,
          [id],
        );
        const total = count.rows[0].total;
        if (total)
          throw new HttpError(
            409,
            'DOCTOR_HAS_FUTURE_APPOINTMENTS',
            `El profesional tiene ${total} cita${total === 1 ? '' : 's'} futura${total === 1 ? '' : 's'} confirmada${total === 1 ? '' : 's'}. Gestiona las citas antes de desvincularlo.`,
            { citas_futuras: total, proxima_cita_fecha: count.rows[0].proxima_cita_fecha },
          );
        await client.query('UPDATE medicos SET activo=FALSE WHERE id=$1', [id]);
        const audit = await client.query(
          `INSERT INTO desvinculaciones_medico (medico_id, secretaria_id, motivo)
          VALUES ($1, $2, $3) RETURNING medico_id, motivo, desvinculado_en`,
          [id, req.secretary.id, body.motivo.trim()],
        );
        return audit.rows[0];
      });
      return res.json({ ok: true, desvinculacion: record });
    } catch (error) {
      if (error.code === '55P03')
        return sendError(
          res,
          409,
          'DOCTOR_BUSY',
          'El profesional está siendo actualizado. Inténtalo nuevamente.',
        );
      throw error;
    }
  }),
);

function fieldErrorsFor(body) {
  const errors = {};
  const data = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  if (Object.keys(data).some((key) => !allowedFields.has(key))) {
    errors.form = 'Solo se aceptan RUT, nombre, correo, especialidad y box de atención.';
  }

  if (typeof data.rut !== 'string' || !data.rut.trim()) {
    errors.rut = 'Ingresa el RUT del médico.';
  } else {
    const rut = data.rut.trim();
    const validation = validateRut(rut);
    if (!validation.valid) errors.rut = validation.reason;
  }

  if (typeof data.nombre !== 'string' || !data.nombre.trim()) {
    errors.nombre = 'Ingresa el nombre completo.';
  } else if (data.nombre.trim().length > 150) {
    errors.nombre = 'El nombre no puede superar 150 caracteres.';
  }

  if (typeof data.email !== 'string' || !data.email.trim()) {
    errors.email = 'Ingresa el correo electrónico.';
  } else if (data.email.trim().length > 150 || !/^\S+@\S+\.\S+$/.test(data.email.trim())) {
    errors.email = 'Ingresa un correo válido de hasta 150 caracteres.';
  }

  if (!Number.isInteger(data.especialidad_id) || data.especialidad_id <= 0) {
    errors.especialidad_id = 'Selecciona una especialidad válida.';
  }

  if (typeof data.box_atencion !== 'string' || !data.box_atencion.trim()) {
    errors.box_atencion = 'Ingresa el box de atención.';
  } else if (data.box_atencion.trim().length > 20) {
    errors.box_atencion = 'El box no puede superar 20 caracteres.';
  }

  return errors;
}

router.post(
  '/medicos',
  requireSecretary,
  asyncHandler(async (req, res) => {
    const fields = fieldErrorsFor(req.body);
    if (Object.keys(fields).length) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos del médico.', fields);
    }

    const rutValidation = validateRut(req.body.rut.trim());
    const values = {
      rut: rutValidation.formatted,
      nombre: req.body.nombre.trim(),
      email: req.body.email.trim(),
      especialidadId: req.body.especialidad_id,
      boxAtencion: req.body.box_atencion.trim(),
    };

    try {
      const specialty = await pool.query('SELECT id FROM especialidades WHERE id = $1', [
        values.especialidadId,
      ]);
      if (!specialty.rowCount) {
        return sendError(
          res,
          400,
          'SPECIALTY_NOT_FOUND',
          'La especialidad seleccionada no existe.',
          { especialidad_id: 'Selecciona una especialidad disponible.' },
        );
      }

      const result = await pool.query(
        `INSERT INTO medicos (rut, nombre, email, box_atencion, especialidad_id, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, rut, nombre, email, box_atencion, especialidad_id, activo`,
        [values.rut, values.nombre, values.email, values.boxAtencion, values.especialidadId],
      );

      return res.status(201).json({ ok: true, medico: result.rows[0] });
    } catch (error) {
      if (
        error.code === '23505' &&
        ['medicos_rut_key', 'uq_medicos_rut_normalizado'].includes(error.constraint)
      ) {
        return sendError(
          res,
          409,
          'DUPLICATE_RUT',
          'Ya existe un médico registrado con ese RUT. Revisa el registro existente.',
          { rut: 'Este RUT ya está registrado. Revisa el registro existente.' },
        );
      }
      if (error.code === '23503') {
        return sendError(
          res,
          400,
          'SPECIALTY_NOT_FOUND',
          'La especialidad seleccionada ya no existe. Recarga el catálogo e inténtalo nuevamente.',
          { especialidad_id: 'Selecciona una especialidad disponible.' },
        );
      }

      throw error;
    }
  }),
);

router.get(
  '/medicos/:id/foto',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!validDoctorId(id))
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica un profesional válido.');
    const result = await pool.query(
      'SELECT foto_mime, foto_datos FROM medicos WHERE id = $1 AND activo = TRUE',
      [id],
    );
    if (!result.rowCount || !result.rows[0].foto_datos)
      return sendError(res, 404, 'PHOTO_NOT_FOUND', 'Este profesional no tiene foto disponible.');
    res.set('Content-Type', result.rows[0].foto_mime);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    return res.send(result.rows[0].foto_datos);
  }),
);

router.put(
  '/medicos/:id/foto',
  requireSecretary,
  express.raw({ type: ['image/png', 'image/jpeg'], limit: MAX_PHOTO_BYTES }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!validDoctorId(id))
      return sendError(res, 400, 'VALIDATION_ERROR', 'Indica un profesional válido.');
    const bytes = req.body;
    const detected = imageMime(bytes);
    if (!detected || detected !== req.get('Content-Type')?.split(';')[0].trim().toLowerCase())
      return sendError(res, 400, 'INVALID_PHOTO', 'Selecciona una imagen PNG o JPEG válida.');
    const result = await pool.query(
      `UPDATE medicos SET foto_mime = $1, foto_datos = $2, foto_actualizada_en = clock_timestamp()
       WHERE id = $3 AND activo = TRUE RETURNING id, foto_actualizada_en`,
      [detected, bytes, id],
    );
    if (!result.rowCount)
      return sendError(res, 404, 'DOCTOR_NOT_FOUND', 'El profesional no está disponible.');
    return res.json({ ok: true, foto_url: photoUrl(id, result.rows[0].foto_actualizada_en) });
  }),
);

module.exports = router;
