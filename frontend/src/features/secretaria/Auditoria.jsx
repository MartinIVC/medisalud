import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { requestApi } from '../../api/client.js';
import { Alert, Button, Dialog, EmptyState, Field } from '../../components/ui';

const ACCION_LABELS = {
  MEDICO_CREAR: 'Alta de médico',
  MEDICO_ACTUALIZAR: 'Modificación de médico',
  MEDICO_FOTO_ACTUALIZAR: 'Actualización de foto',
  MEDICO_DESVINCULAR: 'Desvinculación de médico',
  MEDICO_REVINCULAR: 'Revinculación de médico',
  AGENDA_CONFIGURAR: 'Configuración de agenda',
  AGENDA_BLOQUEAR: 'Bloqueo de horarios',
  AGENDA_DESBLOQUEAR: 'Desbloqueo de horarios',
  CITA_RESERVAR_MANUAL: 'Reserva manual de cita',
  CITA_CANCELAR: 'Cancelación de cita',
  CITA_REPROGRAMAR: 'Reprogramación de cita',
};

function formatDetailSummary(accion, detalles) {
  if (!detalles || typeof detalles !== 'object') return 'Sin detalles adicionales.';

  switch (accion) {
    case 'MEDICO_CREAR': {
      const nuevo = detalles.nuevo || {};
      return `Registró a ${nuevo.nombre || 'profesional'} (RUT ${nuevo.rut || 's/d'}, ${nuevo.box_atencion || 's/box'}).`;
    }
    case 'MEDICO_ACTUALIZAR': {
      const cambios = Object.keys(detalles.nuevo || {});
      if (!cambios.length) return 'Sin campos modificados.';
      return `Modificó: ${cambios.join(', ')}.`;
    }
    case 'MEDICO_FOTO_ACTUALIZAR': {
      const info = detalles.nuevo || {};
      return `${info.reemplazo ? 'Reemplazó' : 'Cargó'} foto (${info.foto_mime || 'imagen'}, ${Math.round((info.tamano_bytes || 0) / 1024)} KB).`;
    }
    case 'MEDICO_DESVINCULAR':
      return `Motivo: "${detalles.motivo || 'No indicado'}".`;
    case 'MEDICO_REVINCULAR':
      return 'Reactivó al profesional en el sistema.';
    case 'AGENDA_CONFIGURAR':
      return `Generó ${detalles.bloques_creados || 0} bloques (${detalles.duracion_min || 30} min) para el ${detalles.fecha || ''}.`;
    case 'AGENDA_BLOQUEAR':
      return `${detalles.alcance === 'FERIADO_GLOBAL' ? 'Feriado global' : 'Bloqueo'}: "${detalles.motivo || 's/m'}" (${detalles.bloques_afectados || 0} bloque/s).`;
    case 'AGENDA_DESBLOQUEAR':
      return `Habilitó ${detalles.bloques_habilitados || 0} bloque/s horarios.`;
    case 'CITA_RESERVAR_MANUAL':
      return `Cita ${detalles.codigo_reserva || ''} (${detalles.origen || 'MANUAL'}).`;
    case 'CITA_CANCELAR':
      return `Cita ${detalles.codigo_reserva || ''} cancelada. Motivo: "${detalles.motivo || 's/m'}".`;
    case 'CITA_REPROGRAMAR':
      return `Cita ${detalles.codigo_reserva || ''} movida a nueva fecha. Motivo: "${detalles.motivo || 's/m'}".`;
    default:
      return JSON.stringify(detalles);
  }
}

export default function Auditoria({ token, onUnauthorized, onBack }) {
  const [registros, setRegistros] = useState([]);
  const [secretarias, setSecretarias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const [filterSecretary, setFilterSecretary] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (filterSecretary) params.set('secretaria_id', filterSecretary);
    if (filterAction) params.set('accion', filterAction);
    if (filterDateFrom) params.set('fecha_desde', filterDateFrom);
    if (filterDateTo) params.set('fecha_hasta', filterDateTo);
    params.set('limit', '100');

    try {
      const response = await requestApi(`/api/secretaria/auditoria?${params.toString()}`, {
        token,
        onUnauthorized,
      });

      if (!response.ok || !response.data?.ok) {
        throw new Error(
          response.data?.mensaje || response.data?.error || 'Error al cargar auditoría.',
        );
      }

      setRegistros(response.data.registros || []);
      if (response.data.secretarias) {
        setSecretarias(response.data.secretarias);
      }
    } catch (err) {
      setError(err.message || 'No pudimos cargar la bitácora de auditoría.');
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized, filterSecretary, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredRegistros = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return registros;
    return registros.filter((reg) => {
      const matchResp = reg.responsable?.toLowerCase().includes(q);
      const matchAccion = (ACCION_LABELS[reg.accion] || reg.accion).toLowerCase().includes(q);
      const matchEntidad = `${reg.entidad_tipo} ${reg.entidad_id}`.toLowerCase().includes(q);
      const matchDetalle = JSON.stringify(reg.detalles || {})
        .toLowerCase()
        .includes(q);
      return matchResp || matchAccion || matchEntidad || matchDetalle;
    });
  }, [registros, searchQuery]);

  function handleResetFilters() {
    setFilterSecretary('');
    setFilterAction('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  }

  return (
    <div className="secretary-portal audit-portal">
      <div className="section-heading admin-heading">
        <div>
          <p className="section-context">Secretaría / Gobernanza</p>
          <h1 id="audit-title" tabIndex={-1}>
            Auditoría de acciones
          </h1>
          <p className="muted">Bitácora persistente e inmutable de operaciones administrativas</p>
        </div>
        <div className="button-group">
          <Button onClick={onBack}>Volver a la agenda</Button>
          <Button variant="secondary" onClick={fetchLogs} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert tone="error">
          {error}
          <Button onClick={fetchLogs}>Reintentar</Button>
        </Alert>
      )}

      <div
        className="agenda-toolbar"
        style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}
      >
        <Field id="audit-secretary" label="Secretaría">
          <select
            id="audit-secretary"
            value={filterSecretary}
            onChange={(e) => setFilterSecretary(e.target.value)}
          >
            <option value="">Todas las secretarías</option>
            {secretarias.map((s) => (
              <option key={s.id} value={s.id}>
                @{s.usuario} {s.activo ? '' : '(Inactiva)'}
              </option>
            ))}
            <option value="desconocido">Origen anterior o desconocido</option>
          </select>
        </Field>

        <Field id="audit-action" label="Tipo de acción">
          <select
            id="audit-action"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <option value="">Todas las acciones</option>
            {Object.entries(ACCION_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="audit-date-from" label="Desde">
          <input
            type="date"
            id="audit-date-from"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </Field>

        <Field id="audit-date-to" label="Hasta">
          <input
            type="date"
            id="audit-date-to"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </Field>

        <Field id="audit-search" label="Buscar en bitácora">
          <input
            type="search"
            id="audit-search"
            placeholder="Responsable, motivo, código…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Field>

        {(filterSecretary || filterAction || filterDateFrom || filterDateTo || searchQuery) && (
          <Button variant="text" onClick={handleResetFilters} style={{ alignSelf: 'flex-end' }}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {loading && registros.length === 0 ? (
        <p role="status" className="loading-state">
          Cargando registros de auditoría…
        </p>
      ) : filteredRegistros.length === 0 ? (
        <EmptyState
          title="Sin registros de auditoría"
          description="No se encontraron eventos para los filtros seleccionados."
          action={<Button onClick={handleResetFilters}>Restablecer filtros</Button>}
        />
      ) : (
        <div className="table-responsive">
          <table className="portal-table" aria-label="Registros de auditoría">
            <thead>
              <tr>
                <th scope="col">Fecha / Hora</th>
                <th scope="col">Responsable</th>
                <th scope="col">Acción</th>
                <th scope="col">Elemento</th>
                <th scope="col">Resumen</th>
                <th scope="col" aria-label="Acciones">
                  Detalles
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistros.map((item) => (
                <tr key={item.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong>{item.fecha_santiago}</strong>
                    <br />
                    <span className="muted">{item.hora_santiago}</span>
                  </td>
                  <td>
                    {item.origen_identidad === 'SESION_INDIVIDUAL' ? (
                      <span className="user-badge">@{item.responsable}</span>
                    ) : (
                      <span
                        className="muted-badge"
                        title="Acción anterior a la creación de cuentas individuales"
                      >
                        {item.responsable}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="action-tag">{ACCION_LABELS[item.accion] || item.accion}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="entity-tag">
                      {item.entidad_tipo} #{item.entidad_id}
                    </span>
                  </td>
                  <td>
                    <span className="summary-text">
                      {formatDetailSummary(item.accion, item.detalles)}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      className="button-sm"
                      onClick={() => setSelectedLog(item)}
                    >
                      Inspeccionar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedLog && (
        <Dialog
          open={Boolean(selectedLog)}
          title={`Detalle de Auditoría #${selectedLog.id}`}
          onClose={() => setSelectedLog(null)}
        >
          <div
            className="audit-detail-content"
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            <p>
              <strong>Acción:</strong> {ACCION_LABELS[selectedLog.accion] || selectedLog.accion}
            </p>
            <p>
              <strong>Fecha y Hora:</strong> {selectedLog.fecha_santiago} a las{' '}
              {selectedLog.hora_santiago} (Santiago)
            </p>
            <p>
              <strong>Responsable:</strong> {selectedLog.responsable} (
              {selectedLog.origen_identidad})
            </p>
            <p>
              <strong>Entidad afectada:</strong> {selectedLog.entidad_tipo} (ID:{' '}
              {selectedLog.entidad_id})
            </p>

            <div style={{ marginTop: '0.5rem' }}>
              <strong>Valores registrados:</strong>
              <pre
                style={{
                  background: '#f8fafc',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  overflowX: 'auto',
                  border: '1px solid #e2e8f0',
                  marginTop: '0.25rem',
                }}
              >
                {JSON.stringify(selectedLog.detalles, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button onClick={() => setSelectedLog(null)}>Cerrar</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
