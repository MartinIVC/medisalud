-- =============================================================================
-- MED-29: Vínculos de consulta verificados, verificación de correo por código
--         y recuperación asistida por secretaría (migración aditiva).
-- =============================================================================

BEGIN;

-- 1. Vínculos verificados por par (RUT canónico, correo normalizado)
CREATE TABLE IF NOT EXISTS vinculos_consulta_paciente (
    id BIGSERIAL PRIMARY KEY,
    paciente_rut VARCHAR(15) NOT NULL,
    correo_normalizado VARCHAR(150) NOT NULL,
    verificado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vinculos_consulta_rut_correo UNIQUE (paciente_rut, correo_normalizado),
    CONSTRAINT uq_vinculos_consulta_id_rut UNIQUE (id, paciente_rut)
);

-- 2. Columna opcional e indexada en citas_medicas (las citas previas quedan con NULL)
ALTER TABLE citas_medicas
    ADD COLUMN IF NOT EXISTS vinculo_consulta_id BIGINT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_citas_vinculo_consulta_rut'
          AND conrelid = 'citas_medicas'::regclass
    ) THEN
        ALTER TABLE citas_medicas
            ADD CONSTRAINT fk_citas_vinculo_consulta_rut
            FOREIGN KEY (vinculo_consulta_id, paciente_rut)
            REFERENCES vinculos_consulta_paciente(id, paciente_rut)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_citas_vinculo_consulta
    ON citas_medicas(vinculo_consulta_id)
    WHERE vinculo_consulta_id IS NOT NULL;

-- 3. Solicitudes de verificación de correo (RESERVA, CONSULTA, RECUPERACION)
CREATE TABLE IF NOT EXISTS solicitudes_verificacion_correo (
    id VARCHAR(64) PRIMARY KEY,
    proposito VARCHAR(20) NOT NULL
      CHECK (proposito IN ('RESERVA', 'CONSULTA', 'RECUPERACION')),
    paciente_rut VARCHAR(15) NOT NULL,
    correo_normalizado VARCHAR(150) NOT NULL,
    vinculo_id BIGINT NULL REFERENCES vinculos_consulta_paciente(id) ON DELETE CASCADE,
    vinculo_version INTEGER NULL,
    citas_ids INTEGER[] NULL,
    secretaria_id BIGINT NULL REFERENCES secretarias(id) ON DELETE RESTRICT,
    motivo VARCHAR(255) NULL,
    codigo_hmac VARCHAR(64) NULL,
    estado_envio VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
      CHECK (estado_envio IN ('PENDIENTE', 'ENVIANDO', 'ACEPTADO', 'FALLIDA', 'OMITIDA')),
    proveedor VARCHAR(40) NULL,
    proveedor_id VARCHAR(255) NULL,
    error_envio TEXT NULL,
    claim_token UUID NULL,
    claimed_at TIMESTAMPTZ NULL,
    lease_until TIMESTAMPTZ NULL,
    enviado_en TIMESTAMPTZ NULL,
    intentos_verificacion INTEGER NOT NULL DEFAULT 0 CHECK (intentos_verificacion >= 0),
    expira_en TIMESTAMPTZ NOT NULL,
    consumida_en TIMESTAMPTZ NULL,
    revocada_en TIMESTAMPTZ NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_verif_pendientes
    ON solicitudes_verificacion_correo(estado_envio, creado_en)
    WHERE estado_envio IN ('PENDIENTE', 'ENVIANDO');

CREATE INDEX IF NOT EXISTS idx_solicitudes_verif_expira
    ON solicitudes_verificacion_correo(expira_en);

CREATE INDEX IF NOT EXISTS idx_solicitudes_verif_par
    ON solicitudes_verificacion_correo(proposito, paciente_rut, correo_normalizado, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_solicitudes_verif_vinculo
    ON solicitudes_verificacion_correo(vinculo_id)
    WHERE vinculo_id IS NOT NULL;

-- 4. Autorizaciones opacas de un solo uso para confirmar reservas web
CREATE TABLE IF NOT EXISTS autorizaciones_reserva_correo (
    token_hash VARCHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    solicitud_id VARCHAR(64) NOT NULL UNIQUE
      REFERENCES solicitudes_verificacion_correo(id) ON DELETE CASCADE,
    paciente_rut VARCHAR(15) NOT NULL,
    correo_normalizado VARCHAR(150) NOT NULL,
    expira_en TIMESTAMPTZ NOT NULL,
    consumida_en TIMESTAMPTZ NULL,
    cita_id INTEGER NULL REFERENCES citas_medicas(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_reserva_expira
    ON autorizaciones_reserva_correo(expira_en);

-- 5. Límites de envío y verificación por par, buzón e IP
CREATE TABLE IF NOT EXISTS limites_verificacion_correo (
    clave_hash VARCHAR(64) PRIMARY KEY CHECK (clave_hash ~ '^[0-9a-f]{64}$'),
    ambito VARCHAR(24) NOT NULL
      CHECK (ambito IN ('SEND_PAIR', 'SEND_EMAIL', 'SEND_IP', 'VERIFY_PAIR')),
    conteo INTEGER NOT NULL CHECK (conteo > 0),
    ventana_inicio TIMESTAMPTZ NOT NULL,
    ultimo_evento TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_limites_verif_ventana
    ON limites_verificacion_correo(ventana_inicio);

-- 6. Extender acciones permitidas en auditoría de secretaría (MED-27 + MED-29)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'auditoria_acciones_secretaria'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%accion%'
    LOOP
        EXECUTE format('ALTER TABLE auditoria_acciones_secretaria DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

ALTER TABLE auditoria_acciones_secretaria
    ADD CONSTRAINT ck_auditoria_accion_valida CHECK (
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
        'CITA_REPROGRAMAR',
        'CITA_RECUPERACION_INICIAR',
        'CITA_RECUPERACION_REVOCAR',
        'CITA_RECUPERACION_COMPLETAR'
      )
    );

COMMIT;
