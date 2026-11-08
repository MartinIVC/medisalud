const test = require('node:test');
const assert = require('node:assert/strict');

test('importar la aplicación crea Express sin arrancar un servidor', () => {
  const http = require('node:http');
  let listenCalls = 0;
  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (...args) {
    listenCalls += 1;
    return originalListen.apply(this, args);
  };

  try {
    const { app, createApp } = require('../src/app');
    const { start } = require('../src/index');
    assert.equal(typeof createApp, 'function');
    assert.equal(typeof app.listen, 'function');
    assert.equal(typeof start, 'function');
    assert.equal(listenCalls, 0);
  } finally {
    http.Server.prototype.listen = originalListen;
  }
});

test('createApp asigna worker de notificaciones por defecto o inyectado', () => {
  const { createApp } = require('../src/app');
  const dummyWorker = async () => ({ claimed: 0 });
  const customApp = createApp({ notificationWorker: dummyWorker });
  assert.equal(customApp.locals.notificationWorker, dummyWorker);
});
