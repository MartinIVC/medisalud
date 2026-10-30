-- Permite encolar avisos distintos por cada cambio de una cita.
BEGIN;

ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS ck_notificaciones_tipo;
ALTER TABLE notificaciones
  ADD CONSTRAINT ck_notificaciones_tipo
  CHECK (tipo IN ('CONFIRMACION','RECORDATORIO','CANCELACION','REPROGRAMACION'));

ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS uq_notificacion_cita_canal_tipo;
DROP INDEX IF EXISTS uq_notificacion_cita_canal_tipo;
CREATE UNIQUE INDEX uq_notificacion_cita_canal_tipo
  ON notificaciones(cita_id, canal, tipo)
  WHERE tipo IN ('CONFIRMACION','RECORDATORIO');

COMMIT;
