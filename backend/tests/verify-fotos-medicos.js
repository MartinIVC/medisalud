const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { requireDisposableTestEnvironment } = require('./disposable-env');

const env = requireDisposableTestEnvironment();
process.env.DB_HOST = env.database.host;
process.env.DB_PORT = env.database.port;
process.env.DB_USER = env.database.user;
process.env.DB_PASSWORD = env.database.password;
process.env.DB_NAME = env.database.name;
const { pool } = require('../src/db');

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const content = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(content));
  return Buffer.concat([header, content, checksum]);
}

function png(color) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, color, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function verify() {
  const doctor = await pool.query('SELECT id FROM medicos WHERE activo = TRUE ORDER BY id LIMIT 1');
  assert.ok(doctor.rowCount, 'La base descartable requiere un profesional ficticio.');
  const id = doctor.rows[0].id;
  const url = `${env.apiUrl}/medicos/${id}/foto`;
  const original = await pool.query(
    'SELECT foto_mime, foto_datos, foto_actualizada_en FROM medicos WHERE id = $1',
    [id],
  );
  try {
    await pool.query(
      'UPDATE medicos SET foto_mime = NULL, foto_datos = NULL, foto_actualizada_en = NULL WHERE id = $1',
      [id],
    );
    assert.equal((await fetch(url)).status, 404, 'Sin foto la API ofrece fallback.');
    const catalog = await (await fetch(`${env.apiUrl}/medicos`)).json();
    assert.equal(catalog.medicos.find((m) => m.id === id).foto_url, null);

    const first = png(20);
    const second = png(220);
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADoDFU3/2Q==',
      'base64',
    );
    async function upload(bytes, type, token) {
      return fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: bytes,
      });
    }
    assert.equal((await upload(first, 'image/png')).status, 401);
    assert.equal((await upload(first, 'image/png', 'paciente')).status, 401);
    const login = await fetch(`${env.apiUrl}/auth/secretaria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.SECRETARY_PASSWORD }),
    });
    assert.equal(login.status, 200);
    const token = (await login.json()).token;
    assert.equal((await upload(Buffer.from('imagen falsa'), 'image/png', token)).status, 400);
    assert.equal((await upload(first, 'image/jpeg', token)).status, 400);
    assert.equal((await upload(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png', token)).status, 413);
    assert.equal((await upload(first, 'image/png', token)).status, 200);
    assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), first);
    assert.equal((await upload(second, 'image/png', token)).status, 200);
    assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), second);

    const stored = await pool.query('SELECT foto_datos FROM medicos WHERE id = $1', [id]);
    assert.deepEqual(stored.rows[0].foto_datos, second, 'El reemplazo deja una sola imagen.');
    assert.equal((await upload(jpeg, 'image/jpeg', token)).status, 200);
    const jpegResponse = await fetch(url);
    assert.equal(jpegResponse.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await jpegResponse.arrayBuffer()), jpeg);
    const after = await (await fetch(`${env.apiUrl}/medicos`)).json();
    assert.match(after.medicos.find((m) => m.id === id).foto_url, /\/foto\?v=/);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const availability = await (
      await fetch(`${env.apiUrl}/disponibilidad?medico_id=${id}&fecha=${date}`)
    ).json();
    assert.ok(availability.bloques.length, 'La demo debe mostrar cupos futuros.');
    assert.equal(availability.bloques[0].foto_url, after.medicos.find((m) => m.id === id).foto_url);
    console.log('MED-23: autorización, validación, tamaño, reemplazo, persistencia y fallback OK');
  } finally {
    await pool.query(
      'UPDATE medicos SET foto_mime = $1, foto_datos = $2, foto_actualizada_en = $3 WHERE id = $4',
      [
        original.rows[0].foto_mime,
        original.rows[0].foto_datos,
        original.rows[0].foto_actualizada_en,
        id,
      ],
    );
    await pool.end();
  }
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
