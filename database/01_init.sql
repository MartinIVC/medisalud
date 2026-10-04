-- =============================================================================
-- MED-15 (RNF-02): Esquema Relacional PostgreSQL — Sistema Medisalud (Sprint 1)
-- Tablas: especialidades, medicos, agendas, citas_medicas + Índices
-- =============================================================================

BEGIN;

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
    CONSTRAINT uq_medico_fecha_hora UNIQUE (medico_id, fecha, hora_inicio)
);

-- 4. Tabla de Citas Médicas Reservadas (MED-11 y MED-16)
-- Garantiza a nivel de esquema que un bloque_id solo pueda tener una cita activa (UNIQUE)
CREATE TABLE IF NOT EXISTS citas_medicas (
    id SERIAL PRIMARY KEY,
    codigo_reserva VARCHAR(30) NOT NULL UNIQUE,
    agenda_id INTEGER NOT NULL UNIQUE REFERENCES agendas(id) ON DELETE RESTRICT,
    medico_id INTEGER NOT NULL REFERENCES medicos(id) ON DELETE RESTRICT,
    paciente_rut VARCHAR(15) NOT NULL,
    paciente_nombre VARCHAR(150) NOT NULL,
    paciente_email VARCHAR(150) NOT NULL,
    paciente_telefono VARCHAR(30) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADA'
        CHECK (estado IN ('CONFIRMADA', 'CANCELADA')),
    correo_enviado BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
