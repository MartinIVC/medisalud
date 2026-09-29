-- =============================================================================
-- MED-15 & MED-10: Datos Semilla Iniciales — 4 Especialidades y 15 Médicos
-- =============================================================================

BEGIN;

-- 1. Insertar las 4 especialidades de Medisalud
INSERT INTO especialidades (id, nombre, descripcion) VALUES
    (1, 'Medicina General', 'Atención primaria integral, diagnóstico general y controles preventivos'),
    (2, 'Pediatría', 'Control de niño sano, patologías infantiles y adolescentes'),
    (3, 'Traumatología', 'Lesiones músculo-esqueléticas, articulaciones y rehabilitación'),
    (4, 'Dermatología', 'Enfermedades de la piel, cabello, uñas y lesiones cutáneas')
ON CONFLICT (nombre) DO NOTHING;

SELECT setval('especialidades_id_seq', (SELECT MAX(id) FROM especialidades));

-- 2. Insertar los 15 profesionales médicos especialistas (con RUTs chilenos válidos)
INSERT INTO medicos (id, rut, nombre, email, box_atencion, especialidad_id, activo) VALUES
    -- Medicina General (4 médicos)
    (1,  '12.345.678-5', 'Dr. Alejandro Soto Rojas',      'asoto@medisalud.cl',      'Box 101', 1, TRUE),
    (2,  '14.829.310-2', 'Dra. Camila Valdés Muñoz',      'cvaldes@medisalud.cl',    'Box 102', 1, TRUE),
    (3,  '16.402.819-K', 'Dr. Cristóbal Herrera Díaz',    'cherrera@medisalud.cl',   'Box 103', 1, TRUE),
    (4,  '18.920.145-7', 'Dra. Valentina Contreras Paz',  'vcontreras@medisalud.cl', 'Box 104', 1, TRUE),

    -- Pediatría (4 médicos)
    (5,  '11.223.344-9', 'Dra. Patricia Morales Silva',   'pmorales@medisalud.cl',   'Box 201', 2, TRUE),
    (6,  '13.579.246-8', 'Dr. Sebastián Riquelme Bravo',  'sriquelme@medisalud.cl',  'Box 202', 2, TRUE),
    (7,  '15.678.901-3', 'Dra. Francisca Lagos Pizarro',  'flagos@medisalud.cl',     'Box 203', 2, TRUE),
    (8,  '17.890.123-4', 'Dr. Matías Fuentes Garrido',    'mfuentes@medisalud.cl',   'Box 204', 2, TRUE),

    -- Traumatología (4 médicos)
    (9,  '10.987.654-1', 'Dr. Rodrigo Araya Sepúlveda',   'raraya@medisalud.cl',     'Box 301', 3, TRUE),
    (10, '13.246.810-5', 'Dra. Carolina Tapia Bustos',    'ctapia@medisalud.cl',     'Box 302', 3, TRUE),
    (11, '15.432.109-8', 'Dr. Nicolás Vergara Molina',    'nvergara@medisalud.cl',   'Box 303', 3, TRUE),
    (12, '19.123.456-0', 'Dr. Gonzalo Carrasco Vega',     'gcarrasco@medisalud.cl',  'Box 304', 3, TRUE),

    -- Dermatología (3 médicos)
    (13, '12.876.543-2', 'Dra. Javiera Espinoza Castro',  'jespinoza@medisalud.cl',  'Box 401', 4, TRUE),
    (14, '14.567.890-1', 'Dr. Tomás Peñaloza Núñez',      'tpenaloza@medisalud.cl',  'Box 402', 4, TRUE),
    (15, '16.789.012-6', 'Dra. Macarena Sanhueza Ríos',   'msanhueza@medisalud.cl',  'Box 403', 4, TRUE)
ON CONFLICT (rut) DO NOTHING;

SELECT setval('medicos_id_seq', (SELECT MAX(id) FROM medicos));

-- 3. Generar agenda inicial parametrizada para los próximos 7 días (MED-10)
--    Médicos 1-5: bloques de 30 min (09:00 a 13:00)
--    Médicos 6-10: bloques de 20 min (09:00 a 12:00)
--    Médicos 11-15: bloques de 15 min (09:00 a 11:30)
DO $$
DECLARE
    m RECORD;
    dia INT;
    fecha_actual DATE;
    duracion INT;
    h_actual TIME;
    h_fin_jornada TIME;
BEGIN
    FOR m IN SELECT id FROM medicos LOOP
        IF m.id <= 5 THEN
            duracion := 30;
            h_fin_jornada := '13:00'::TIME;
        ELSIF m.id <= 10 THEN
            duracion := 20;
            h_fin_jornada := '12:00'::TIME;
        ELSE
            duracion := 15;
            h_fin_jornada := '11:30'::TIME;
        END IF;

        FOR dia IN 0..6 LOOP
            fecha_actual := CURRENT_DATE + dia;
            h_actual := '09:00'::TIME;

            WHILE h_actual < h_fin_jornada LOOP
                INSERT INTO agendas (medico_id, fecha, hora_inicio, hora_fin, duracion_min, estado, motivo_bloqueo)
                VALUES (
                    m.id,
                    fecha_actual,
                    h_actual,
                    h_actual + (duracion || ' minutes')::INTERVAL,
                    duracion,
                    CASE
                        WHEN h_actual = '11:00'::TIME AND dia = 0 THEN 'BLOQUEADO'
                        ELSE 'DISPONIBLE'
                    END,
                    CASE
                        WHEN h_actual = '11:00'::TIME AND dia = 0 THEN 'Bloqueo administrativo / Reunión clínica (MED-10)'
                        ELSE NULL
                    END
                )
                ON CONFLICT (medico_id, fecha, hora_inicio) DO NOTHING;

                h_actual := h_actual + (duracion || ' minutes')::INTERVAL;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- 4. Insertar una reserva de ejemplo en el bloque 10:00 - 10:30 del Médico 1 hoy
--    para evidenciar el criterio CA-01 de MED-11 (bloque 10:00 a 10:30 ya reservado)
DO $$
DECLARE
    v_agenda_id INT;
BEGIN
    SELECT id INTO v_agenda_id
    FROM agendas
    WHERE medico_id = 1 AND fecha = CURRENT_DATE AND hora_inicio = '10:00'::TIME
    LIMIT 1;

    IF v_agenda_id IS NOT NULL THEN
        UPDATE agendas SET estado = 'RESERVADO', updated_at = CURRENT_TIMESTAMP WHERE id = v_agenda_id;

        INSERT INTO citas_medicas (
            codigo_reserva, agenda_id, medico_id,
            paciente_rut, paciente_nombre, paciente_email, paciente_telefono, estado
        ) VALUES (
            'MED-2026-DEMO1', v_agenda_id, 1,
            '11.111.111-1', 'Paciente Ejemplo Pre-Reservado', 'paciente.demo@correo.cl', '+56987654321', 'CONFIRMADA'
        )
        ON CONFLICT (agenda_id) DO NOTHING;
    END IF;
END $$;

COMMIT;
