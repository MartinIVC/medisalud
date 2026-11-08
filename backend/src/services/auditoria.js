const { HttpError } = require('../middleware/errors');
const { isValidDate } = require('../schemas/inputs');

const AUDIT_ACTIONS = Object.freeze({
  MEDICO_CREAR: 'MEDICO_CREAR',
  MEDICO_ACTUALIZAR: 'MEDICO_ACTUALIZAR',
  MEDICO_FOTO_ACTUALIZAR: 'MEDICO_FOTO_ACTUALIZAR',
  MEDICO_DESVINCULAR: 'MEDICO_DESVINCULAR',
  MEDICO_REVINCULAR: 'MEDICO_REVINCULAR',
  AGENDA_CONFIGURAR: 'AGENDA_CONFIGURAR',
  AGENDA_BLOQUEAR: 'AGENDA_BLOQUEAR',
  AGENDA_DESBLOQUEAR: 'AGENDA_DESBLOQUEAR',
  CITA_RESERVAR_MANUAL: 'CITA_RESERVAR_MANUAL',
  CITA_CANCELAR: 'CITA_CANCELAR',
  CITA_REPROGRAMAR: 'CITA_REPROGRAMAR',
});
const AUDIT_ACTION_NAMES = Object.freeze(Object.values(AUDIT_ACTIONS));

const AUDIT_ENTITY_TYPES = Object.freeze({
  MEDICO: 'MEDICO',
  AGENDA: 'AGENDA',
  CITA: 'CITA',
});
const AUDIT_ENTITY_TYPE_NAMES = Object.freeze(Object.values(AUDIT_ENTITY_TYPES));

const AUDIT_IDENTITY_ORIGINS = Object.freeze(['SESION_INDIVIDUAL', 'ANTERIOR_O_DESCONOCIDO']);

const FORBIDDEN_KEYS_REGEX =
  /contrasena|password|pass|secret|token|hash|salt|cookie|authorization|foto_datos|paciente_rut|paciente_nombre|paciente_email|paciente_telefono|response_url/i;
const SENSITIVE_VALUES_REGEX = /cita_token=|Bearer |\$scrypt\$/i;
const MAX_DETAILS_BYTES = 8192;

function computeMinimalDiff(previousObj = {}, nextObj = {}, allowedKeys = []) {
  const anterior = {};
  const nuevo = {};
  let changedCount = 0;

  for (const key of allowedKeys) {
    const prevVal = previousObj[key] !== undefined ? previousObj[key] : null;
    const nextVal = nextObj[key] !== undefined ? nextObj[key] : null;

    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      anterior[key] = prevVal;
      nuevo[key] = nextVal;
      changedCount += 1;
    }
  }

  return { anterior, nuevo, changedCount };
}

function sanitizeAuditDetails(details, depth = 0) {
  if (depth > 4) {
    throw new Error('Estructura de detalles excede la profundidad permitida.');
  }

  if (details === null || details === undefined) {
    return {};
  }

  if (typeof details !== 'object' || Array.isArray(details)) {
    throw new Error('El campo detalles de auditoría debe ser un objeto.');
  }

  const clean = {};
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_KEYS_REGEX.test(key)) {
      throw new Error(`Se detectó una clave no permitida o sensible en auditoría: "${key}".`);
    }

    if (value === null || value === undefined) {
      clean[key] = null;
    } else if (typeof value === 'string') {
      if (SENSITIVE_VALUES_REGEX.test(value)) {
        throw new Error(`Se detectó un valor con patrón sensible en auditoría para "${key}".`);
      }
      clean[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    } else if (Array.isArray(value)) {
      clean[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return sanitizeAuditDetails(item, depth + 1);
        }
        if (typeof item === 'string' && SENSITIVE_VALUES_REGEX.test(item)) {
          throw new Error('Se detectó un valor con patrón sensible en arreglo de auditoría.');
        }
        return item;
      });
    } else if (typeof value === 'object') {
      clean[key] = sanitizeAuditDetails(value, depth + 1);
    } else {
      throw new Error(`Tipo de dato no permitido en detalles de auditoría para "${key}".`);
    }
  }

  const serialized = JSON.stringify(clean);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DETAILS_BYTES) {
    throw new Error('El tamaño de los detalles de auditoría excede el límite permitido (8 KB).');
  }

  return clean;
}

async function recordAuditEvent(client, payload) {
  if (!client || typeof client.query !== 'function') {
    throw new Error(
      'Se requiere un cliente transaccional de base de datos para registrar auditoría.',
    );
  }

  const {
    secretary = null,
    origenIdentidad = 'SESION_INDIVIDUAL',
    accion,
    entidadTipo,
    entidadId,
    detalles = {},
  } = payload || {};

  if (!AUDIT_ACTION_NAMES.includes(accion)) {
    throw new Error(`Acción de auditoría no válida: "${accion}".`);
  }

  if (!AUDIT_ENTITY_TYPE_NAMES.includes(entidadTipo)) {
    throw new Error(`Tipo de entidad de auditoría no válido: "${entidadTipo}".`);
  }

  if (typeof entidadId !== 'string' || !entidadId.trim() || entidadId.trim().length > 64) {
    throw new Error('El identificador de entidad debe ser un texto de 1 a 64 caracteres.');
  }

  if (!AUDIT_IDENTITY_ORIGINS.includes(origenIdentidad)) {
    throw new Error(`Origen de identidad de auditoría no válido: "${origenIdentidad}".`);
  }

  let secretariaId = null;
  if (origenIdentidad === 'SESION_INDIVIDUAL') {
    secretariaId = Number(secretary?.id);
    if (!Number.isSafeInteger(secretariaId) || secretariaId <= 0) {
      throw new Error(
        'La auditoría de sesión individual requiere un identificador de secretaría válido.',
      );
    }
  }

  const safeDetails = sanitizeAuditDetails(detalles);

  const result = await client.query(
    `INSERT INTO auditoria_acciones_secretaria (
       secretaria_id, origen_identidad, accion, entidad_tipo, entidad_id, detalles
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, creado_en`,
    [
      secretariaId,
      origenIdentidad,
      accion,
      entidadTipo,
      entidadId.trim(),
      JSON.stringify(safeDetails),
    ],
  );

  return result.rows[0];
}

async function queryAuditLogs(database, filters = {}) {
  const conditions = [];
  const params = [];

  const addParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  if (filters.secretaria_id !== undefined && filters.secretaria_id !== '') {
    if (filters.secretaria_id === 'desconocido') {
      conditions.push("a.origen_identidad = 'ANTERIOR_O_DESCONOCIDO'");
    } else {
      const secId = Number(filters.secretaria_id);
      if (!Number.isSafeInteger(secId) || secId <= 0) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Indica una secretaría válida.', {
          secretaria_id: 'Indica una secretaría válida.',
        });
      }
      conditions.push(`a.secretaria_id = ${addParam(secId)}`);
    }
  }

  if (filters.fecha_desde) {
    if (!isValidDate(filters.fecha_desde)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Indica una fecha inicial válida (AAAA-MM-DD).',
        {
          fecha_desde: 'Indica una fecha real con formato AAAA-MM-DD.',
        },
      );
    }
    conditions.push(
      `(a.creado_en AT TIME ZONE 'America/Santiago')::date >= ${addParam(filters.fecha_desde)}::date`,
    );
  }

  if (filters.fecha_hasta) {
    if (!isValidDate(filters.fecha_hasta)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Indica una fecha final válida (AAAA-MM-DD).', {
        fecha_hasta: 'Indica una fecha real con formato AAAA-MM-DD.',
      });
    }
    conditions.push(
      `(a.creado_en AT TIME ZONE 'America/Santiago')::date <= ${addParam(filters.fecha_hasta)}::date`,
    );
  }

  if (filters.fecha_desde && filters.fecha_hasta && filters.fecha_desde > filters.fecha_hasta) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'La fecha inicial no puede ser posterior a la fecha final.',
      {
        fecha_desde: 'La fecha inicial debe ser anterior o igual a la fecha final.',
      },
    );
  }

  if (filters.accion) {
    if (!AUDIT_ACTION_NAMES.includes(filters.accion)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Indica una acción de auditoría válida.', {
        accion: 'Acción no reconocida.',
      });
    }
    conditions.push(`a.accion = ${addParam(filters.accion)}`);
  }

  if (filters.entidad_tipo) {
    if (!AUDIT_ENTITY_TYPE_NAMES.includes(filters.entidad_tipo)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Indica un tipo de entidad válido.', {
        entidad_tipo: 'Tipo de entidad no reconocido.',
      });
    }
    conditions.push(`a.entidad_tipo = ${addParam(filters.entidad_tipo)}`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const limitNum = Math.max(1, Math.min(100, Number(filters.limit) || 50));
  const offsetNum = Math.max(0, Number(filters.offset) || 0);

  const countSql = `SELECT COUNT(*)::int AS total FROM auditoria_acciones_secretaria a ${whereSql}`;
  const countResult = await database.query(countSql, params);
  const total = countResult.rows[0]?.total || 0;

  const dataParams = [...params];
  const limitPlaceholder = `$${dataParams.length + 1}`;
  dataParams.push(limitNum);
  const offsetPlaceholder = `$${dataParams.length + 1}`;
  dataParams.push(offsetNum);

  const dataSql = `
    SELECT
      a.id,
      a.secretaria_id,
      a.origen_identidad,
      a.accion,
      a.entidad_tipo,
      a.entidad_id,
      a.detalles,
      a.creado_en,
      TO_CHAR(a.creado_en AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS fecha_santiago,
      TO_CHAR(a.creado_en AT TIME ZONE 'America/Santiago', 'HH24:MI') AS hora_santiago,
      s.usuario AS secretaria_usuario,
      s.activo AS secretaria_activo
    FROM auditoria_acciones_secretaria a
    LEFT JOIN secretarias s ON s.id = a.secretaria_id
    ${whereSql}
    ORDER BY a.creado_en DESC, a.id DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  const [dataResult, secretariesResult] = await Promise.all([
    database.query(dataSql, dataParams),
    database.query('SELECT id, usuario, activo FROM secretarias ORDER BY activo DESC, usuario ASC'),
  ]);

  const registros = dataResult.rows.map((row) => ({
    id: row.id,
    creado_en: row.creado_en,
    fecha_santiago: row.fecha_santiago,
    hora_santiago: row.hora_santiago,
    origen_identidad: row.origen_identidad,
    secretaria: row.secretaria_id
      ? { id: row.secretaria_id, usuario: row.secretaria_usuario }
      : null,
    responsable:
      row.secretaria_usuario ||
      (row.origen_identidad === 'ANTERIOR_O_DESCONOCIDO'
        ? 'Origen anterior o desconocido'
        : 'Desconocido'),
    accion: row.accion,
    entidad_tipo: row.entidad_tipo,
    entidad_id: row.entidad_id,
    detalles: row.detalles || {},
  }));

  return {
    total,
    limit: limitNum,
    offset: offsetNum,
    secretarias: secretariesResult.rows,
    registros,
  };
}

module.exports = {
  AUDIT_ACTIONS,
  AUDIT_ACTION_NAMES,
  AUDIT_ENTITY_TYPES,
  AUDIT_ENTITY_TYPE_NAMES,
  AUDIT_IDENTITY_ORIGINS,
  computeMinimalDiff,
  sanitizeAuditDetails,
  recordAuditEvent,
  queryAuditLogs,
};
