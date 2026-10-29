BEGIN;

ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notificaciones_toma_vencida
  ON notificaciones(lease_until) WHERE estado = 'ENVIANDO';

COMMIT;
