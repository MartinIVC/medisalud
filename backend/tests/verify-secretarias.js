const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { requireDisposableTestEnvironment } = require('./disposable-env');

const env = requireDisposableTestEnvironment();
process.env.DB_HOST = env.database.host;
process.env.DB_PORT = env.database.port;
process.env.DB_USER = env.database.user;
process.env.DB_PASSWORD = env.database.password;
process.env.DB_NAME = env.database.name;
const { pool } = require('../src/db');

const suffix = randomBytes(6).toString('hex');
const usernames = [`prueba.a.${suffix}`, `prueba.b.${suffix}`];
const firstPassword = 'Clave ficticia inicial 2026';
const secondPassword = 'Clave ficticia renovada 2026';

function manage(action, username, password) {
  const result = spawnSync(process.execPath, ['src/cli/secretarias.js', action, username], {
    encoding: 'utf8',
    input: password === undefined ? undefined : `${password}\n`,
    env: process.env,
    timeout: 15000,
  });
  assert.equal(result.status, 0, `${action}: ${result.stderr}`);
  if (password) assert.ok(!`${result.stdout}${result.stderr}`.includes(password));
}

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

function login(username, password) {
  return request('/auth/secretaria', { method: 'POST', body: { username, password } });
}

async function run() {
  manage('crear', usernames[0], firstPassword);
  manage('crear', usernames[1], firstPassword);

  const stored = await pool.query(
    'SELECT usuario, contrasena_hash FROM secretarias WHERE usuario = ANY($1::text[])',
    [usernames],
  );
  assert.equal(stored.rowCount, 2);
  assert.ok(stored.rows.every((row) => !row.contrasena_hash.includes(firstPassword)));
  assert.notEqual(stored.rows[0].contrasena_hash, stored.rows[1].contrasena_hash);

  const unknown = await login(`desconocido.${suffix}`, 'Clave incorrecta ficticia');
  const wrong = await login(usernames[0], 'Clave incorrecta ficticia');
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.body.error, wrong.body.error);
  assert.equal(
    (await request('/auth/secretaria', { method: 'POST', body: { password: firstPassword } }))
      .status,
    401,
  );

  const first = await login(usernames[0], firstPassword);
  const second = await login(usernames[1], firstPassword);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.notEqual(first.body.secretaria.id, second.body.secretaria.id);
  assert.equal(first.body.secretaria.usuario, usernames[0]);
  const tokenHash = createHash('sha256').update(first.body.token).digest('hex');
  const session = await pool.query(
    'SELECT token_hash FROM sesiones_secretaria WHERE token_hash = $1',
    [tokenHash],
  );
  assert.equal(session.rowCount, 1);
  assert.notEqual(session.rows[0].token_hash, first.body.token);

  const protectedPath = '/agendas?medico_id=1&fecha=2099-01-01';
  assert.equal((await request(protectedPath)).status, 401);
  assert.equal((await request(protectedPath, { token: first.body.token })).status, 200);
  assert.equal(
    (await request('/auth/secretaria/logout', { method: 'POST', token: first.body.token })).status,
    200,
  );
  assert.equal((await request(protectedPath, { token: first.body.token })).status, 401);
  assert.equal((await request(protectedPath, { token: second.body.token })).status, 200);

  manage('desactivar', usernames[1]);
  assert.equal((await request(protectedPath, { token: second.body.token })).status, 401);
  assert.equal((await login(usernames[1], firstPassword)).status, 401);
  manage('activar', usernames[1]);
  assert.equal((await request(protectedPath, { token: second.body.token })).status, 401);
  const active = await login(usernames[1], firstPassword);
  assert.equal(active.status, 200);
  manage('restablecer', usernames[1], secondPassword);
  assert.equal((await request(protectedPath, { token: active.body.token })).status, 401);
  assert.equal((await login(usernames[1], firstPassword)).status, 401);
  const renewed = await login(usernames[1], secondPassword);
  assert.equal(renewed.status, 200);
  await pool.query(
    "UPDATE sesiones_secretaria SET expira_en = NOW() - INTERVAL '1 second' WHERE token_hash = $1",
    [createHash('sha256').update(renewed.body.token).digest('hex')],
  );
  assert.equal((await request(protectedPath, { token: renewed.body.token })).status, 401);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(usernames[1], 'Clave incorrecta ficticia')).status, 401);
  }
  assert.equal((await login(usernames[1], secondPassword)).status, 401);
  manage('restablecer', usernames[1], secondPassword);
  assert.equal((await login(usernames[1], secondPassword)).status, 200);

  manage('restablecer', usernames[0], firstPassword);
  const attempts = await Promise.all(
    Array.from({ length: 52 }, () => login(usernames[0], 'Clave incorrecta ficticia')),
  );
  assert.ok(attempts.every((attempt) => [401, 503].includes(attempt.status)));
  assert.equal((await login(usernames[1], secondPassword)).status, 200);
  console.log(
    'Secretarías: provisión, cuentas individuales, revocación, vencimiento y límite de intentos OK.',
  );
}

run()
  .catch((error) => {
    console.error('Verificación de secretarías:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.query('DELETE FROM secretarias WHERE usuario = ANY($1::text[])', [usernames]);
    await pool.end();
  });
