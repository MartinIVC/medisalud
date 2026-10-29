const express = require('express');
const { pool } = require('../db');
const { requireSecretary } = require('../middleware/auth');
const { validateRut } = require('../utils/rutValidator');
const { asyncHandler, sendError } = require('../middleware/errors');

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

module.exports = router;
