const assert = require('node:assert/strict');
const test = require('node:test');
const { requireDisposableTestEnvironment } = require('./disposable-env');

const validEnvironment = {
  TEST_DATABASE_URL: 'postgresql://medisalud_test:secret@127.0.0.1:5432/medisalud_test',
  TEST_API_URL: 'http://localhost:4000/api',
};

test('integration tests require an explicitly local disposable database and API', () => {
  const parsed = requireDisposableTestEnvironment(validEnvironment);
  assert.equal(parsed.database.name, 'medisalud_test');
  assert.equal(parsed.apiUrl, validEnvironment.TEST_API_URL);
  assert.throws(() => requireDisposableTestEnvironment({}), /TEST_DATABASE_URL y TEST_API_URL/);
  assert.throws(() => requireDisposableTestEnvironment({
    ...validEnvironment,
    TEST_DATABASE_URL: 'postgresql://user:secret@db.example.com/medisalud_test',
  }), /base local descartable/);
  assert.throws(() => requireDisposableTestEnvironment({
    ...validEnvironment,
    TEST_DATABASE_URL: 'postgresql://user:secret@localhost/medisalud',
  }), /base local descartable/);
  assert.throws(() => requireDisposableTestEnvironment({ ...validEnvironment, DB_NAME: 'medisalud' }), /no coincide/);
});
