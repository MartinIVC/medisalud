-- =============================================================================
-- MED-15 (RNF-02): Esquema Relacional PostgreSQL — Sistema Medisalud (Sprint 1)
-- Tablas: especialidades, medicos, agendas, citas_medicas + Índices
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Tabla de Especialidades Médicas (4 áreas del Centro Médico Medisalud)
CREATE TABLE IF NOT EXISTS especialidades (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Médicos Especialistas (15 profesionales del centro)
CREATE TABLE IF NOT EXISTS medicos (
    id SERIAL PRIMARY KEY,
    rut VARCHAR(15) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    box_atencion VARCHAR(20) NOT NULL,
    especialidad_id INTEGER NOT NULL REFERENCES especialidades(id) ON DELETE RESTRICT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- La unicidad considera equivalentes los RUT con o sin puntos y guion.
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicos_rut_normalizado
    ON medicos (UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g')));

-- 3. Tabla de Agendas / Bloques Horarios (MED-10, MED-9, MED-16)
-- Soporta bloques de 15, 20 o 30 minutos y estados DISPONIBLE, RESERVADO, BLOQUEADO
CREATE TABLE IF NOT EXISTS agendas (
    id SERIAL PRIMARY KEY,
    medico_id INTEGER NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    duracion_min INTEGER NOT NULL CHECK (duracion_min IN (15, 20, 30)),
    estado VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE'
        CHECK (estado IN ('DISPONIBLE', 'RESERVADO', 'BLOQUEADO')),
    motivo_bloqueo VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Restricción de integridad: un médico no puede tener dos bloques que inicien a la misma hora y fecha
    CONSTRAINT uq_medico_fecha_hora UNIQUE (medico_id, fecha, hora_inicio),
    CONSTRAINT ex_agendas_sin_superposicion EXCLUDE USING gist
      (medico_id WITH =, tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') WITH &&)
);

-- 4. Tabla de Citas Médicas Reservadas (MED-11 y MED-16)
-- Garantiza a nivel de esquema que un bloque_id solo pueda tener una cita activa (UNIQUE)
CREATE TABLE IF NOT EXISTS citas_medicas (
    id SERIAL PRIMARY KEY,
    codigo_reserva VARCHAR(30) NOT NULL UNIQUE,
    agenda_id INTEGER NOT NULL REFERENCES agendas(id) ON DELETE RESTRICT,
    medico_id INTEGER NOT NULL REFERENCES medicos(id) ON DELETE RESTRICT,
    paciente_rut VARCHAR(15) NOT NULL,
    paciente_nombre VARCHAR(150) NOT NULL,
    paciente_email VARCHAR(150) NOT NULL,
    paciente_telefono VARCHAR(30) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADA'
        CHECK (estado IN ('CONFIRMADA', 'CANCELADA')),
    asistencia_estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (asistencia_estado IN ('PENDIENTE', 'ASISTIRA', 'CANCELADA')),
    correo_enviado BOOLEAN NOT NULL DEFAULT FALSE,
    origen VARCHAR(20) NOT NULL DEFAULT 'WEB' CHECK (origen IN ('WEB','PRESENCIAL','TELEFONO')),
    solicitud_id VARCHAR(100) UNIQUE,
    token_respuesta_hash VARCHAR(64),
    token_respuesta_expira TIMESTAMP WITH TIME ZONE,
    reminder_programado TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_agenda_activas ON citas_medicas(agenda_id) WHERE estado = 'CONFIRMADA';

CREATE TABLE IF NOT EXISTS notificaciones (
    id BIGSERIAL PRIMARY KEY,
    cita_id INTEGER NOT NULL REFERENCES citas_medicas(id) ON DELETE CASCADE,
    canal VARCHAR(10) NOT NULL CHECK (canal IN ('EMAIL','WHATSAPP')),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('CONFIRMACION','RECORDATORIO')),
    destinatario VARCHAR(255) NOT NULL,
    asunto VARCHAR(255),
    contenido TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
      CHECK (estado IN ('PENDIENTE','ENVIANDO','ACEPTADO','ENTREGADO','FALLIDA','OMITIDA')),
    intentos INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    proveedor VARCHAR(40),
    proveedor_id VARCHAR(255),
    reintentar_en TIMESTAMP WITH TIME ZONE,
    claim_token UUID,
    claimed_at TIMESTAMP WITH TIME ZONE,
    lease_until TIMESTAMP WITH TIME ZONE,
    programado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    enviado_en TIMESTAMP WITH TIME ZONE,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notificacion_cita_canal_tipo UNIQUE (cita_id, canal, tipo)
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_pendientes ON notificaciones(estado, programado_en);
CREATE INDEX IF NOT EXISTS idx_notificaciones_toma_vencida ON notificaciones(lease_until) WHERE estado = 'ENVIANDO';

CREATE TABLE IF NOT EXISTS bloqueos_agenda (
    id BIGSERIAL PRIMARY KEY,
    medico_id INTEGER REFERENCES medicos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bloqueos_agenda_fecha ON bloqueos_agenda(fecha, medico_id);

-- =============================================================================
-- Índices sobre llaves foráneas y filtros de búsqueda (RNF-01 / MED-9 < 2,0 s)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_medicos_especialidad
    ON medicos(especialidad_id) WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_agendas_busqueda_disponibilidad
    ON agendas(medico_id, fecha, estado, hora_inicio);

CREATE INDEX IF NOT EXISTS idx_agendas_fecha_estado
    ON agendas(fecha, estado);

CREATE INDEX IF NOT EXISTS idx_citas_medico_fecha
    ON citas_medicas(medico_id, created_at);

CREATE INDEX IF NOT EXISTS idx_citas_paciente_rut
    ON citas_medicas(paciente_rut);

COMMIT;
