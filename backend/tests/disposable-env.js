const { URL } = require('node:url');

function requireDisposableTestEnvironment(env = process.env) {
  if (!env.TEST_DATABASE_URL || !env.TEST_API_URL) {
    throw new Error(
      'Estas pruebas requieren TEST_DATABASE_URL y TEST_API_URL; nunca uses una base local compartida.',
    );
  }

  const databaseUrl = new URL(env.TEST_DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'db-test', 'backend-test']);
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !databaseName.endsWith('_test') ||
    !localHosts.has(databaseUrl.hostname)
  ) {
    throw new Error(
      'TEST_DATABASE_URL debe apuntar a una base local descartable cuyo nombre termine en _test.',
    );
  }
  if (env.DB_NAME && env.DB_NAME !== databaseName) {
    throw new Error('DB_NAME no coincide con la base declarada en TEST_DATABASE_URL.');
  }

  const apiUrl = new URL(env.TEST_API_URL);
  if (
    apiUrl.protocol !== 'http:' ||
    !localHosts.has(apiUrl.hostname) ||
    !apiUrl.pathname.replace(/\/$/, '').endsWith('/api')
  ) {
    throw new Error('TEST_API_URL debe apuntar a la API local del entorno descartable.');
  }

  return {
    apiUrl: apiUrl.toString().replace(/\/$/, ''),
    database: {
      host: databaseUrl.hostname,
      port: databaseUrl.port || '5432',
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      name: databaseName,
    },
  };
}

module.exports = { requireDisposableTestEnvironment };
