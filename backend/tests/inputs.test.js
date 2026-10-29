const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRut } = require('../src/utils/rutValidator');
const {
  isValidDate,
  parseReservation,
  parseAgendaConfiguration,
} = require('../src/schemas/inputs');

test('el RUT acepta formatos explícitos y rechaza texto mezclado', () => {
  assert.equal(validateRut('12.345.678-5').valid, true);
  assert.equal(validateRut('123456785').valid, true);
  assert.equal(validateRut('12 texto 345.678-5').valid, false);
  assert.equal(validateRut({ value: '12.345.678-5' }).valid, false);
});

test('las fechas deben existir en el calendario', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-2-03'), false);
});

test('reservas normaliza entradas válidas y rechaza tipos, espacios y límites', () => {
  const valid = parseReservation(
    {
      agenda_id: 12,
      paciente_rut: '123456785',
      paciente_nombre: '  Ana Pérez  ',
      paciente_email: 'ana@example.cl',
      paciente_telefono: '+56912345678',
    },
    'request-1',
  );
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.value.rut, '12.345.678-5');
  assert.equal(valid.value.nombre, 'Ana Pérez');

  const invalid = parseReservation(
    {
      agenda_id: '12',
      paciente_rut: '12 texto 345.678-5',
      paciente_nombre: '   ',
      paciente_email: 'a'.repeat(151),
      paciente_telefono: { number: '+56912345678' },
    },
    'x'.repeat(101),
  );
  assert.deepEqual(Object.keys(invalid.errors).sort(), [
    'agenda_id',
    'idempotency_key',
    'paciente_email',
    'paciente_nombre',
    'paciente_rut',
    'paciente_telefono',
  ]);
});

test('la configuración de agenda valida fecha, tipos, horas y duraciones', () => {
  const invalid = parseAgendaConfiguration({
    medico_id: 0,
    fecha: '2026-02-30',
    hora_inicio: '09:00',
    hora_fin: '08:00',
    duracion_min: '30',
  });
  assert.deepEqual(Object.keys(invalid.errors).sort(), [
    'duracion_min',
    'fecha',
    'hora_fin',
    'medico_id',
  ]);
});
