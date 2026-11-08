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

export default function Auditoria({ token, onUnauthorized }) {
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
    <div className="audit-portal">
      <div className="section-heading admin-heading">
        <div>
          <p className="section-context">Secretaría / Gobernanza</p>
          <h1 id="audit-title" tabIndex={-1}>
            Auditoría de acciones
          </h1>
          <p className="muted">Bitácora persistente e inmutable de operaciones administrativas</p>
        </div>
        <div className="button-group">
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

      <div className="audit-toolbar">
        <div className="audit-toolbar-filters">
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
        </div>

        <div className="audit-toolbar-search-row">
          <Field id="audit-search" label="Buscar en bitácora" className="audit-search-field">
            <input
              type="search"
              id="audit-search"
              placeholder="Buscar por responsable, motivo, código de reserva, entidad…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Field>

          <div className="audit-toolbar-actions">
            <span className="audit-count-badge">
              {filteredRegistros.length} {filteredRegistros.length === 1 ? 'registro' : 'registros'}
            </span>
            {(filterSecretary || filterAction || filterDateFrom || filterDateTo || searchQuery) && (
              <Button variant="text" onClick={handleResetFilters}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
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
        <div className="audit-table-wrapper">
          <table className="audit-table portal-table" aria-label="Registros de auditoría">
            <thead>
              <tr>
                <th scope="col" style={{ width: '120px' }}>
                  Fecha / Hora
                </th>
                <th scope="col" style={{ width: '150px' }}>
                  Responsable
                </th>
                <th scope="col" style={{ width: '180px' }}>
                  Acción
                </th>
                <th scope="col" style={{ width: '130px' }}>
                  Elemento
                </th>
                <th scope="col">Resumen</th>
                <th
                  scope="col"
                  style={{ width: '110px', textAlign: 'right' }}
                  aria-label="Acciones"
                >
                  Detalles
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistros.map((item) => {
                const categoryClass = item.accion.startsWith('CITA_')
                  ? 'is-cita'
                  : item.accion.startsWith('MEDICO_')
                    ? 'is-medico'
                    : 'is-agenda';

                return (
                  <tr key={item.id}>
                    <td className="audit-cell-timestamp">
                      <strong className="numeric">{item.fecha_santiago}</strong>
                      <span className="muted numeric">{item.hora_santiago}</span>
                    </td>
                    <td>
                      {item.origen_identidad === 'SESION_INDIVIDUAL' ? (
                        <span className="user-badge audit-user-badge">@{item.responsable}</span>
                      ) : (
                        <span
                          className="muted-badge audit-muted-badge"
                          title="Acción anterior a la creación de cuentas individuales"
                        >
                          {item.responsable}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`action-tag audit-action-tag ${categoryClass}`}>
                        {ACCION_LABELS[item.accion] || item.accion}
                      </span>
                    </td>
                    <td>
                      <span className="entity-tag audit-entity-tag">
                        {item.entidad_tipo} #{item.entidad_id}
                      </span>
                    </td>
                    <td>
                      <span className="summary-text audit-summary-text">
                        {formatDetailSummary(item.accion, item.detalles)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant="secondary"
                        className="button-sm"
                        onClick={() => setSelectedLog(item)}
                      >
                        Inspeccionar
                      </Button>
                    </td>
                  </tr>
                );
              })}
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
          <div className="audit-detail-body">
            <div className="audit-detail-meta">
              <div className="audit-detail-item">
                <span className="audit-detail-label">Acción</span>
                <div className="audit-detail-value">
                  <span
                    className={`action-tag audit-action-tag ${
                      selectedLog.accion.startsWith('CITA_')
                        ? 'is-cita'
                        : selectedLog.accion.startsWith('MEDICO_')
                          ? 'is-medico'
                          : 'is-agenda'
                    }`}
                  >
                    {ACCION_LABELS[selectedLog.accion] || selectedLog.accion}
                  </span>
                </div>
              </div>
              <div className="audit-detail-item">
                <span className="audit-detail-label">Fecha y Hora (Santiago)</span>
                <span className="audit-detail-value numeric">
                  {selectedLog.fecha_santiago} a las {selectedLog.hora_santiago}
                </span>
              </div>
              <div className="audit-detail-item">
                <span className="audit-detail-label">Responsable</span>
                <div className="audit-detail-value">
                  {selectedLog.origen_identidad === 'SESION_INDIVIDUAL' ? (
                    <span className="user-badge audit-user-badge">@{selectedLog.responsable}</span>
                  ) : (
                    <span className="muted-badge audit-muted-badge">{selectedLog.responsable}</span>
                  )}
                </div>
              </div>
              <div className="audit-detail-item">
                <span className="audit-detail-label">Entidad Afectada</span>
                <div className="audit-detail-value">
                  <span className="entity-tag audit-entity-tag">
                    {selectedLog.entidad_tipo} #{selectedLog.entidad_id}
                  </span>
                </div>
              </div>
            </div>

            {selectedLog.detalles?.motivo && (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--surface)',
                  borderLeft: '3px solid var(--primary)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <span
                  className="audit-detail-label"
                  style={{ display: 'block', marginBottom: '2px' }}
                >
                  Motivo registrado
                </span>
                <span style={{ fontStyle: 'italic', color: 'var(--foreground)' }}>
                  &ldquo;{selectedLog.detalles.motivo}&rdquo;
                </span>
              </div>
            )}

            {selectedLog.detalles?.anterior || selectedLog.detalles?.nuevo ? (
              <div className="audit-diff-container">
                <span className="audit-diff-heading">Comparativa de cambios</span>
                <div className="audit-diff-cards">
                  <div className="audit-diff-card is-prev">
                    <span className="audit-diff-card-title">Valor anterior</span>
                    <pre className="audit-diff-code">
                      {JSON.stringify(selectedLog.detalles.anterior || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="audit-diff-card is-next">
                    <span className="audit-diff-card-title">Valor nuevo</span>
                    <pre className="audit-diff-code">
                      {JSON.stringify(selectedLog.detalles.nuevo || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="audit-raw-section">
              <span className="audit-diff-heading">Valores registrados completos</span>
              <pre className="audit-diff-code">{JSON.stringify(selectedLog.detalles, null, 2)}</pre>
            </div>

            <div className="audit-modal-footer">
              <Button onClick={() => setSelectedLog(null)}>Cerrar</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
