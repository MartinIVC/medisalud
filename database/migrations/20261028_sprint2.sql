-- Ejecutar una sola vez sobre una instalación existente; hacer respaldo antes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE agendas ADD CONSTRAINT ex_agendas_sin_superposicion EXCLUDE USING gist
  (medico_id WITH =, tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') WITH &&);

ALTER TABLE citas_medicas DROP CONSTRAINT IF EXISTS citas_medicas_agenda_id_key;
ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS asistencia_estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'WEB';
ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS solicitud_id VARCHAR(100);
ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS token_respuesta_hash VARCHAR(64);
ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS token_respuesta_expira TIMESTAMPTZ;
ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS reminder_programado TIMESTAMPTZ;
ALTER TABLE citas_medicas ALTER COLUMN correo_enviado SET DEFAULT FALSE;
UPDATE citas_medicas SET correo_enviado = FALSE WHERE correo_enviado IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_agenda_activas ON citas_medicas(agenda_id) WHERE estado = 'CONFIRMADA';
CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_solicitud_id ON citas_medicas(solicitud_id) WHERE solicitud_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_citas_asistencia_estado') THEN
    ALTER TABLE citas_medicas ADD CONSTRAINT ck_citas_asistencia_estado
      CHECK (asistencia_estado IN ('PENDIENTE','ASISTIRA','CANCELADA'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_citas_origen') THEN
    ALTER TABLE citas_medicas ADD CONSTRAINT ck_citas_origen
      CHECK (origen IN ('WEB','PRESENCIAL','TELEFONO'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notificaciones (
    id BIGSERIAL PRIMARY KEY,
    cita_id INTEGER NOT NULL REFERENCES citas_medicas(id) ON DELETE CASCADE,
    canal VARCHAR(10) NOT NULL CHECK (canal IN ('EMAIL','WHATSAPP')),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('CONFIRMACION','RECORDATORIO')),
    destinatario VARCHAR(255) NOT NULL,
    asunto VARCHAR(255),
    contenido TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ENVIANDO','ACEPTADO','ENTREGADO','FALLIDA','OMITIDA')),
    intentos INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    proveedor VARCHAR(40),
    proveedor_id VARCHAR(255),
    reintentar_en TIMESTAMPTZ,
    programado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    enviado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notificacion_cita_canal_tipo UNIQUE (cita_id, canal, tipo)
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_pendientes ON notificaciones(estado, programado_en);

CREATE TABLE IF NOT EXISTS bloqueos_agenda (
    id BIGSERIAL PRIMARY KEY,
    medico_id INTEGER REFERENCES medicos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bloqueos_agenda_fecha ON bloqueos_agenda(fecha, medico_id);
COMMIT;
