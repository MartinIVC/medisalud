const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const disponibilidadRoutes = require('./routes/disponibilidad');
const agendasRoutes = require('./routes/agendas');
const reservasRoutes = require('./routes/reservas');
const medicosRoutes = require('./routes/medicos');
const { requireSecretary } = require('./middleware/auth');
const { authenticateSecretary, revokeSecretarySession } = require('./services/secretary-accounts');
const { errorHandler, sendError, asyncHandler } = require('./middleware/errors');

function createApp({ database = pool } = {}) {
  const app = express();
  app.locals.database = database;

  app.use(cors());
  app.use(express.json());

  app.post(
    '/api/auth/secretaria',
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const session = await authenticateSecretary(database, {
        username: req.body?.username,
        password: req.body?.password,
      });
      if (!session)
        return sendError(
          res,
          401,
          'UNAUTHORIZED',
          'Credenciales inválidas o acceso temporalmente limitado.',
        );
      return res.json({ ok: true, ...session });
    }),
  );

  app.post(
    '/api/auth/secretaria/logout',
    requireSecretary,
    asyncHandler(async (req, res) => {
      await revokeSecretarySession(database, req.secretarySessionHash);
      res.set('Cache-Control', 'no-store');
      return res.json({ ok: true });
    }),
  );

  app.get('/api/health', async (_req, res, next) => {
    const startHr = process.hrtime.bigint();
    try {
      const stats = await database.query(`
        SELECT
          (SELECT COUNT(*)::INT FROM especialidades) AS especialidades,
          (SELECT COUNT(*)::INT FROM medicos WHERE activo = TRUE) AS medicos_activos,
          (SELECT COUNT(*)::INT FROM agendas WHERE estado = 'DISPONIBLE') AS bloques_disponibles,
          (SELECT COUNT(*)::INT FROM agendas WHERE estado = 'RESERVADO') AS bloques_reservados,
          (SELECT COUNT(*)::INT FROM agendas WHERE estado = 'BLOQUEADO') AS bloques_bloqueados,
          (SELECT COUNT(*)::INT FROM citas_medicas WHERE estado = 'CONFIRMADA') AS citas_confirmadas
      `);
      const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      return res.json({
        ok: true,
        jira: 'MED-15',
        requisito: 'RNF-02 Configuración de ambiente Staging y base de datos PostgreSQL',
        database_status: 'CONNECTED',
        ping_ms: Number(elapsedMs.toFixed(2)),
        resumen: stats.rows[0],
      });
    } catch (error) {
      return next(error);
    }
  });

  app.use('/api', disponibilidadRoutes);
  app.use('/api', agendasRoutes);
  app.use('/api', reservasRoutes);
  app.use('/api', medicosRoutes);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp, app: createApp() };
