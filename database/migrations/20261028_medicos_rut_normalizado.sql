-- Unicidad de RUT independiente de puntos y guion.
-- La migración se detiene con los IDs afectados si encuentra colisiones;
-- no modifica ni elimina registros para que puedan resolverse explícitamente.
BEGIN;

DO $$
DECLARE
    colisiones TEXT;
BEGIN
    SELECT string_agg(format('médicos %s', ids), '; ')
    INTO colisiones
    FROM (
        SELECT
            UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g')) AS rut_normalizado,
            string_agg(id::TEXT, ', ' ORDER BY id) AS ids
        FROM medicos
        GROUP BY UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g'))
        HAVING COUNT(*) > 1
    ) duplicados;

    IF colisiones IS NOT NULL THEN
        RAISE EXCEPTION 'No se creó el índice de RUT normalizado. Resuelve estas colisiones manualmente: %', colisiones;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_medicos_rut_normalizado
    ON medicos (UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g')));

COMMIT;
