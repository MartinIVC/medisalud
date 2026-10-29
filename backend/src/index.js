const { app } = require('./app');
const { pool } = require('./db');
const { processEmailQueue } = require('./utils/mailer');

function start({ port = Number(process.env.PORT || 4000), database = pool, notificationWorker = processEmailQueue } = {}) {
  let processingQueue = false;
  const processNotifications = async () => {
    if (processingQueue) return;
    processingQueue = true;
    try {
      await notificationWorker();
    } catch (error) {
      console.error('[Notificaciones] No se pudo procesar la cola:', error.message);
    } finally {
      processingQueue = false;
    }
  };

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`[Medisalud Backend] Servidor activo en http://0.0.0.0:${port}`);
  });
  processNotifications();
  const timer = setInterval(processNotifications, 30_000);
  timer.unref();

  return {
    server,
    async close() {
      clearInterval(timer);
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await database.end();
    },
  };
}

if (require.main === module) {
  const running = start();
  const shutdown = () => running.close().then(() => process.exit(0)).catch((error) => {
    console.error('[Medisalud Backend] Error al cerrar:', error.message);
    process.exit(1);
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = { start };
