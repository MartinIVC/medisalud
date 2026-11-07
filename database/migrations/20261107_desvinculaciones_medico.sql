BEGIN;

CREATE TABLE IF NOT EXISTS desvinculaciones_medico (
    medico_id INTEGER PRIMARY KEY REFERENCES medicos(id) ON DELETE RESTRICT,
    secretaria_id BIGINT NOT NULL REFERENCES secretarias(id) ON DELETE RESTRICT,
    motivo VARCHAR(255) NOT NULL CHECK (length(trim(motivo)) > 0),
    desvinculado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
