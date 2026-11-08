-- MED-27: Bitácora de auditoría persistente de acciones de secretaría.
BEGIN;

CREATE TABLE IF NOT EXISTS auditoria_acciones_secretaria (
    id BIGSERIAL PRIMARY KEY,
    secretaria_id BIGINT NULL REFERENCES secretarias(id) ON DELETE RESTRICT,
    origen_identidad VARCHAR(24) NOT NULL DEFAULT 'SESION_INDIVIDUAL'
      CHECK (origen_identidad IN ('SESION_INDIVIDUAL', 'ANTERIOR_O_DESCONOCIDO')),
    accion VARCHAR(40) NOT NULL CHECK (
      accion IN (
        'MEDICO_CREAR',
        'MEDICO_ACTUALIZAR',
        'MEDICO_FOTO_ACTUALIZAR',
        'MEDICO_DESVINCULAR',
        'MEDICO_REVINCULAR',
        'AGENDA_CONFIGURAR',
        'AGENDA_BLOQUEAR',
        'AGENDA_DESBLOQUEAR',
        'CITA_RESERVAR_MANUAL',
        'CITA_CANCELAR',
        'CITA_REPROGRAMAR'
      )
    ),
    entidad_tipo VARCHAR(20) NOT NULL CHECK (entidad_tipo IN ('MEDICO', 'AGENDA', 'CITA')),
    entidad_id VARCHAR(64) NOT NULL CHECK (length(trim(entidad_id)) BETWEEN 1 AND 64),
    detalles JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_auditoria_identidad CHECK (
      (origen_identidad = 'SESION_INDIVIDUAL' AND secretaria_id IS NOT NULL)
      OR (origen_identidad = 'ANTERIOR_O_DESCONOCIDO' AND secretaria_id IS NULL)
    ),
    CONSTRAINT ck_auditoria_detalles_objeto CHECK (
      jsonb_typeof(detalles) = 'object'
      AND octet_length(detalles::text) <= 8192
    )
);

CREATE INDEX IF NOT EXISTS idx_auditoria_secretaria_creado
    ON auditoria_acciones_secretaria(secretaria_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_creado_en
    ON auditoria_acciones_secretaria(creado_en DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion_creado
    ON auditoria_acciones_secretaria(accion, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad
    ON auditoria_acciones_secretaria(entidad_tipo, entidad_id);

CREATE OR REPLACE FUNCTION forbid_auditoria_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de auditoría son inmutables y no pueden modificarse.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria_acciones_secretaria;
CREATE TRIGGER trg_auditoria_inmutable
  BEFORE UPDATE ON auditoria_acciones_secretaria
  FOR EACH ROW EXECUTE FUNCTION forbid_auditoria_update();

-- Backfill histórico para CA-06:
-- 1. Desvinculaciones registradas previamente con cuenta responsable
INSERT INTO auditoria_acciones_secretaria (
    secretaria_id,
    origen_identidad,
    accion,
    entidad_tipo,
    entidad_id,
    detalles,
    creado_en
)
SELECT
    d.secretaria_id,
    'SESION_INDIVIDUAL',
    'MEDICO_DESVINCULAR',
    'MEDICO',
    d.medico_id::text,
    jsonb_build_object(
        'motivo', d.motivo,
        'anterior', jsonb_build_object('activo', true),
        'nuevo', jsonb_build_object('activo', false)
    ),
    d.desvinculado_en
FROM desvinculaciones_medico d
WHERE NOT EXISTS (
    SELECT 1 FROM auditoria_acciones_secretaria a
    WHERE a.accion = 'MEDICO_DESVINCULAR'
      AND a.entidad_tipo = 'MEDICO'
      AND a.entidad_id = d.medico_id::text
      AND a.creado_en = d.desvinculado_en
);

-- 2. Bloqueos de agenda anteriores sin cuenta individual
INSERT INTO auditoria_acciones_secretaria (
    secretaria_id,
    origen_identidad,
    accion,
    entidad_tipo,
    entidad_id,
    detalles,
    creado_en
)
SELECT
    NULL,
    'ANTERIOR_O_DESCONOCIDO',
    'AGENDA_BLOQUEAR',
    'AGENDA',
    CASE WHEN b.medico_id IS NULL THEN 'GLOBAL:' || b.fecha::text ELSE b.medico_id::text || ':' || b.fecha::text END,
    jsonb_build_object(
        'motivo', b.motivo,
        'alcance', CASE WHEN b.medico_id IS NULL THEN 'FERIADO_GLOBAL' ELSE 'MEDICO_FECHA' END,
        'fecha', b.fecha::text,
        'medico_id', b.medico_id
    ),
    b.creado_en
FROM bloqueos_agenda b
WHERE NOT EXISTS (
    SELECT 1 FROM auditoria_acciones_secretaria a
    WHERE a.accion = 'AGENDA_BLOQUEAR'
      AND a.entidad_tipo = 'AGENDA'
      AND a.entidad_id = CASE WHEN b.medico_id IS NULL THEN 'GLOBAL:' || b.fecha::text ELSE b.medico_id::text || ':' || b.fecha::text END
      AND a.creado_en = b.creado_en
);

COMMIT;
