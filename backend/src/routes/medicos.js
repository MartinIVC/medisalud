const express = require('express');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { validateRut } = require('../utils/rutValidator');
const { asyncHandler, sendError } = require('../middleware/errors');
const { MAX_PHOTO_BYTES, imageMime, photoUrl } = require('../services/foto-medico');
const { positiveInteger } = require('../schemas/inputs');

const router = express.Router();
const allowedFields = new Set(['rut', 'nombre', 'email', 'especialidad_id', 'box_atencion']);

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
    if (!positiveInteger(id))
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
    if (!positiveInteger(id))
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
