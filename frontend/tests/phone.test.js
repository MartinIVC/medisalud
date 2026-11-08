import assert from 'node:assert/strict';
import test from 'node:test';
import { onlyMobileSubscriberDigits, parseChileanMobileDigits } from '../src/utils/phone.js';

test('normaliza teléfonos chilenos al pegar o escribir en el campo móvil', () => {
  assert.equal(parseChileanMobileDigits('+56 9 1234 5678'), '12345678');
  assert.equal(parseChileanMobileDigits('9 1234 5678'), '12345678');
  assert.equal(parseChileanMobileDigits('1234 5678'), '12345678');
  assert.equal(parseChileanMobileDigits('56912345'), '56912345');
  assert.equal(onlyMobileSubscriberDigits('1234-5678'), '12345678');
});
