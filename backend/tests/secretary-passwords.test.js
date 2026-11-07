const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUsername,
  isValidUsername,
  isValidPassword,
  hashPassword,
  verifyPassword,
} = require('../src/security/secretary-passwords');

test('las contraseñas se derivan con sal única y verifican solo el valor correcto', async () => {
  const password = 'Clave ficticia 2026';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('contraseña incorrecta', first), false);
  assert.equal(await verifyPassword(password, 'scrypt$invalid'), false);
});

test('las cuentas normalizan usuarios y rechazan entradas fuera de los límites', () => {
  assert.equal(normalizeUsername('  Secretaria.Demo  '), 'secretaria.demo');
  assert.equal(isValidUsername('secretaria.demo'), true);
  assert.equal(isValidUsername('usuario con espacios'), false);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(isValidPassword('breve'), false);
  assert.equal(isValidPassword('a'.repeat(257)), false);
});
