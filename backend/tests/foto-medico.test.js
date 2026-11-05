const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_PHOTO_BYTES, imageMime, photoUrl } = require('../src/services/foto-medico');

test('rechaza contenido que solo declara ser imagen y genera URL únicamente con foto', () => {
  assert.equal(MAX_PHOTO_BYTES, 2 * 1024 * 1024);
  assert.equal(imageMime(Buffer.from('archivo.png')), null);
  assert.equal(imageMime(Buffer.from('89504e470d0a1a0a', 'hex')), null);
  assert.equal(imageMime(Buffer.from('ffd8ff0000ffd9', 'hex')), null);
  assert.equal(photoUrl(7, null), null);
  assert.equal(photoUrl(7, '2026-11-03T12:00:00.000Z'), '/api/medicos/7/foto?v=1793707200000');
});
