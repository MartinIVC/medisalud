BEGIN;

ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS solicitud_payload_hash VARCHAR(64);
ALTER TABLE citas_medicas ADD COLUMN IF NOT EXISTS solicitud_respuesta JSONB;

COMMIT;
