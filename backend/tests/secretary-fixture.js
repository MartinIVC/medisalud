const { Pool } = require('pg');
const { requireDisposableTestEnvironment } = require('./disposable-env');
const {
  createSecretary,
  resetSecretaryPassword,
  setSecretaryActive,
} = require('../src/services/secretary-accounts');

async function ensureTestSecretary() {
  requireDisposableTestEnvironment();
  const username = 'secretaria.prueba';
  const password = process.env.SECRETARY_PASSWORD || 'Clave ficticia de pruebas';
  const database = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    try {
      await createSecretary(database, { username, password });
    } catch (error) {
      if (error.code !== '23505') throw error;
      await resetSecretaryPassword(database, username, password);
      await setSecretaryActive(database, username, true);
    }
    return { username, password };
  } finally {
    await database.end();
  }
}

module.exports = { ensureTestSecretary };
