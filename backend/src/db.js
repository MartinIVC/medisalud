const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'medisalud',
  password: process.env.DB_PASSWORD || 'medisalud_secret_2026',
  database: process.env.DB_NAME || 'medisalud_db',
  max: 60, // Soporta holgadamente las 30–50 conexiones concurrentes exigidas en MED-16 (RNF-01)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

module.exports = { pool };
