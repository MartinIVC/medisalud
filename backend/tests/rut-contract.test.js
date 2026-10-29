const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateRut } = require('../src/utils/rutValidator');

const cases = JSON.parse(readFileSync(path.join(__dirname, '../../shared/rut-cases.json'), 'utf8'));

test('backend RUT rules match the shared cross-runtime cases', () => {
  for (const item of cases) {
    const result = validateRut(item.value);
    assert.equal(result.valid, item.valid, `validity for ${JSON.stringify(item.value)}`);
    if (item.valid) assert.equal(result.formatted, item.formatted, `format for ${item.value}`);
  }
});

test('all seeded doctor RUTs pass the same validator', () => {
  const sql = readFileSync(path.join(__dirname, '../../database/02_seed.sql'), 'utf8');
  const doctorSeed = sql.split('INSERT INTO medicos')[1].split('ON CONFLICT (rut)')[0];
  const ruts = [...doctorSeed.matchAll(/\(\s*\d+\s*,\s*'([^']+)'/g)].map((match) => match[1]);
  assert.equal(ruts.length, 15);
  for (const rut of ruts) assert.equal(validateRut(rut).valid, true, `seed RUT ${rut}`);
});
