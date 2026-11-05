-- MED-23: foto persistente del profesional en PostgreSQL.
BEGIN;
ALTER TABLE medicos
  ADD COLUMN foto_mime VARCHAR(10),
  ADD COLUMN foto_datos BYTEA,
  ADD COLUMN foto_actualizada_en TIMESTAMPTZ,
  ADD CONSTRAINT ck_medicos_foto_completa CHECK (
    (foto_mime IS NULL AND foto_datos IS NULL AND foto_actualizada_en IS NULL)
    OR (foto_mime IN ('image/png', 'image/jpeg') AND foto_datos IS NOT NULL AND foto_actualizada_en IS NOT NULL)
  );
COMMIT;
