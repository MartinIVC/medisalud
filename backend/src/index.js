const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const disponibilidadRoutes = require('./routes/disponibilidad');
const agendasRoutes = require('./routes/agendas');
const reservasRoutes = require('./routes/reservas');
const medicosRoutes = require('./routes/medicos');
const { createSecretaryToken } = require('./middleware/auth');
const { processEmailQueue } = require('./utils/mailer');

const app = express();
const PORT = Number(process.env.PORT || 4000);

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
  res.json({ ok: true, token: createSecretaryToken(), expires_in: 28800 });
});

/**
 * GET /api/health
 * MED-15 (RNF-02): Verificación de ambiente Staging, tablas relacionales e índices en PostgreSQL
 */
app.get('/api/health', async (_req, res) => {
  const startHr = process.hrtime.bigint();
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*)::INT FROM especialidades) AS especialidades,
        (SELECT COUNT(*)::INT FROM medicos WHERE activo = TRUE) AS medicos_activos,
        (SELECT COUNT(*)::INT FROM agendas WHERE estado = 'DISPONIBLE') AS bloques_disponibles,
        (SELECT COUNT(*)::INT FROM agendas WHERE estado = 'RESERVADO') AS bloques_reservados,
        (SELECT COUNT(*)::INT FROM agendas WHERE estado = 'BLOQUEADO') AS bloques_bloqueados,
        (SELECT COUNT(*)::INT FROM citas_medicas WHERE estado = 'CONFIRMADA') AS citas_confirmadas
    `);
    const elapsedMs = Number(process.hrtime.bigint() - startHr) / 1e6;

    res.json({
      ok: true,
      jira: 'MED-15',
      requisito: 'RNF-02 Configuración de ambiente Staging y base de datos PostgreSQL',
      database_status: 'CONNECTED',
      ping_ms: Number(elapsedMs.toFixed(2)),
      resumen: stats.rows[0],
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      jira: 'MED-15',
      database_status: 'ERROR',
      error: err.message,
    });
  }
});

app.use('/api', disponibilidadRoutes);
app.use('/api', agendasRoutes);
app.use('/api', reservasRoutes);
app.use('/api', medicosRoutes);

let processingQueue = false;
async function processNotifications() {
  if (processingQueue) return;
  processingQueue = true;
  try { await processEmailQueue(); }
  catch (error) { console.error('[Notificaciones] No se pudo procesar la cola:', error.message); }
  finally { processingQueue = false; }
}
processNotifications();
setInterval(processNotifications, 30_000).unref();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Medisalud Backend] Servidor activo en http://0.0.0.0:${PORT}`);
});
