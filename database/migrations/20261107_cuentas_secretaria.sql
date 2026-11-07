-- MED-25 y MED-26: cuentas individuales, sesiones revocables y límite de acceso.
BEGIN;

CREATE TABLE IF NOT EXISTS secretarias (
    id BIGSERIAL PRIMARY KEY,
    usuario VARCHAR(64) NOT NULL UNIQUE
      CHECK (usuario ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
    contrasena_hash TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sesiones_secretaria (
    token_hash VARCHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    secretaria_id BIGINT NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
    expira_en TIMESTAMPTZ NOT NULL,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sesiones_secretaria_cuenta ON sesiones_secretaria(secretaria_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_secretaria_expiracion ON sesiones_secretaria(expira_en);

CREATE TABLE IF NOT EXISTS intentos_acceso_secretaria (
    clave_hash VARCHAR(64) PRIMARY KEY CHECK (clave_hash ~ '^[0-9a-f]{64}$'),
    intentos INTEGER NOT NULL CHECK (intentos > 0),
    ventana_inicio TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intentos_secretaria_ventana ON intentos_acceso_secretaria(ventana_inicio);

COMMIT;
