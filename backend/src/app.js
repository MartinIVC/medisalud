const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const disponibilidadRoutes = require('./routes/disponibilidad');
const agendasRoutes = require('./routes/agendas');
const reservasRoutes = require('./routes/reservas');
const medicosRoutes = require('./routes/medicos');
const { createSecretaryToken } = require('./middleware/auth');

function createApp({ database = pool } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.post('/api/auth/secretaria', (req, res) => {
    const configured = process.env.SECRETARY_PASSWORD;
    if (!configured || typeof req.body?.password !== 'string' ||
        Buffer.byteLength(configured) !== Buffer.byteLength(req.body.password) ||
        !require('crypto').timingSafeEqual(Buffer.from(configured), Buffer.from(req.body.password))) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas o acceso no configurado.' });
    }
    if (!process.env.SECRETARY_TOKEN_SECRET || Buffer.byteLength(process.env.SECRETARY_TOKEN_SECRET) < 32) {
      return res.status(503).json({ ok: false, error: 'SECRETARY_TOKEN_SECRET debe tener al menos 32 bytes.' });
    }
    return res.json({ ok: true, token: createSecretaryToken(), expires_in: 28800 });
  });

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

  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, code: 'INVALID_JSON', error: 'El cuerpo de la solicitud no contiene JSON válido.' });
    }
    console.error('[API] Error no controlado:', error.message);
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', error: 'Ocurrió un error interno. Intenta nuevamente.' });
  });

  return app;
}

module.exports = { createApp, app: createApp() };
