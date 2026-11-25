import React, { useState } from 'react';
import { requestApi } from '../../api/client.js';
import { formatRutInput, validateRutClient } from '../../utils/rut.js';
import { Alert, Button, EmptyState, Field, formatDate } from '../../components/ui';

export default function RecuperacionCitas({ token, onUnauthorized }) {
  const [rutQuery, setRutQuery] = useState('');
  const [rutError, setRutError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [data, setData] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [correoDestino, setCorreoDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState('');

  async function searchByRut(rawRut = rutQuery) {
    const trimmed = rawRut.trim();
    const check = validateRutClient(trimmed);
    if (!trimmed || !check.valid) {
      setRutError(check.message || 'Ingresa un RUT chileno válido.');
      return;
    }
    setRutError('');
    setError('');
    setLoading(true);
    try {
      const response = await requestApi('/api/secretaria/recuperacion-citas/buscar', {
        method: 'POST',
        token,
        onUnauthorized,
        body: { rut: trimmed },
      });
      if (response.ok && response.data?.ok) {
        setData(response.data);
        setSelectedIds([]);
      } else {
        setData(null);
        setError(response.data?.mensaje || response.data?.error || 'No pudimos buscar las citas.');
      }
    } catch {
      setError('No pudimos conectar con el sistema. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setFeedback(null);
    searchByRut();
  }

  function toggleAppointment(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function handleCreateRequest(event) {
    event.preventDefault();
    if (!data?.rut) return;
    if (!selectedIds.length) {
      setError('Selecciona al menos una cita para vincular o trasladar.');
      return;
    }
    setSubmitting(true);
    setError('');
    setFeedback(null);
    try {
      const response = await requestApi('/api/secretaria/recuperacion-citas/solicitudes', {
        method: 'POST',
        token,
        onUnauthorized,
        body: {
          rut: data.rut,
          correo_destino: correoDestino.trim(),
          citas_ids: selectedIds,
          motivo: motivo.trim(),
        },
      });
      if (response.ok && response.data?.ok) {
        setFeedback({
          tone: 'success',
          message: `Solicitud ${response.data.solicitud_id} creada. Se solicitó el envío del código de 6 dígitos a ${response.data.correo_destino}.`,
        });
        setCorreoDestino('');
        setMotivo('');
        setSelectedIds([]);
        await searchByRut(data.rut);
      } else {
        setError(
          response.data?.fields?.correo ||
            response.data?.fields?.motivo ||
            response.data?.fields?.citas_ids ||
            response.data?.mensaje ||
            response.data?.error ||
            'No pudimos crear la solicitud de recuperación.',
        );
      }
    } catch {
      setError('No pudimos conectar con el sistema. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(solicitudId) {
    setRevokingId(solicitudId);
    setError('');
    setFeedback(null);
    try {
      const response = await requestApi(
        `/api/secretaria/recuperacion-citas/solicitudes/${encodeURIComponent(solicitudId)}/revocar`,
        {
          method: 'POST',
          token,
          onUnauthorized,
        },
      );
      if (response.ok && response.data?.ok) {
        setFeedback({
          tone: 'success',
          message: `Solicitud ${solicitudId} revocada correctamente.`,
        });
        if (data?.rut) await searchByRut(data.rut);
      } else {
        setError(
          response.data?.mensaje || response.data?.error || 'No pudimos revocar la solicitud.',
        );
      }
    } catch {
      setError('No pudimos conectar con el sistema.');
    } finally {
      setRevokingId('');
    }
  }

  return (
    <section className="recovery-admin-section" aria-labelledby="recovery-admin-title">
      <div className="admin-heading">
        <div>
          <h1 id="recovery-admin-title">Recuperación asistida de citas</h1>
          <p className="muted">
            Incorpora citas anteriores o reservadas por secretaría al historial de un correo, o
            traslada citas seleccionadas cuando el paciente perdió acceso a su buzón. El cambio se
            aplica solo cuando el paciente confirma el código enviado al nuevo correo.
          </p>
        </div>
      </div>

      <form className="recovery-search-toolbar" onSubmit={handleSearchSubmit} noValidate>
        <Field id="sec-recovery-rut" label="RUT del paciente" error={rutError}>
          <input
            id="sec-recovery-rut"
            type="text"
            autoComplete="off"
            placeholder="12.345.678-5"
            maxLength={15}
            value={rutQuery}
            onChange={(event) => {
              setRutQuery(formatRutInput(event.target.value));
              if (rutError) setRutError('');
            }}
            aria-invalid={Boolean(rutError)}
          />
        </Field>
        <div className="recovery-search-action">
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? 'Buscando…' : 'Buscar citas del paciente'}
          </Button>
        </div>
      </form>

      {error && <Alert>{error}</Alert>}
      {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

      {data && (
        <div className="recovery-results">
          <h2>
            Citas registradas para <span className="numeric">{data.rut}</span>
          </h2>
          {!data.citas?.length ? (
            <EmptyState title="No hay citas registradas para este RUT">
              Verifica el RUT ingresado antes de iniciar una recuperación.
            </EmptyState>
          ) : (
            <form onSubmit={handleCreateRequest} className="recovery-create-form">
              <ul
                className="recovery-appointments-list"
                aria-label="Citas elegibles para recuperación"
              >
                {data.citas.map((cita) => {
                  const checked = selectedIds.includes(cita.id);
                  return (
                    <li key={cita.id} className="recovery-appointment-row">
                      <label className="recovery-checkbox-label">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAppointment(cita.id)}
                        />
                        <div>
                          <div className="recovery-row-top">
                            <strong className="numeric">{cita.codigo_reserva}</strong>
                            <span>
                              {formatDate(cita.fecha)} ·{' '}
                              <span className="numeric">
                                {cita.hora_inicio}–{cita.hora_fin}
                              </span>
                            </span>
                            <span className="muted">
                              {cita.estado} · {cita.origen}
                            </span>
                          </div>
                          <p className="muted">
                            {cita.medico_nombre} ({cita.especialidad_nombre}, {cita.box_atencion}) ·{' '}
                            {cita.vinculada
                              ? `Vinculada a ${cita.correo_vinculo_actual}`
                              : 'Pendiente de vínculo en portal'}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="form-grid">
                <Field
                  id="sec-recovery-email"
                  label="Correo de destino"
                  hint="El paciente recibirá un código de 6 dígitos en este buzón para confirmar el cambio."
                >
                  <input
                    id="sec-recovery-email"
                    type="email"
                    required
                    maxLength={150}
                    placeholder="nuevo.correo@ejemplo.cl"
                    value={correoDestino}
                    onChange={(event) => setCorreoDestino(event.target.value)}
                  />
                </Field>
                <Field
                  id="sec-recovery-motivo"
                  label="Motivo de la recuperación"
                  hint="Queda registrado en la bitácora de auditoría sin incluir datos personales."
                >
                  <input
                    id="sec-recovery-motivo"
                    type="text"
                    required
                    maxLength={255}
                    placeholder="Ej.: Incorporación de reserva presencial tras validación de identidad"
                    value={motivo}
                    onChange={(event) => setMotivo(event.target.value)}
                  />
                </Field>
              </div>

              <div className="form-actions">
                <Button
                  variant="primary"
                  type="submit"
                  disabled={submitting || selectedIds.length === 0}
                >
                  {submitting
                    ? 'Generando solicitud…'
                    : `Enviar código de recuperación (${selectedIds.length} seleccionada${selectedIds.length === 1 ? '' : 's'})`}
                </Button>
              </div>
            </form>
          )}

          {data.solicitudes_pendientes?.length > 0 && (
            <div className="recovery-pending-section">
              <h3>Solicitudes de recuperación vigentes</h3>
              <ul className="recovery-pending-list">
                {data.solicitudes_pendientes.map((item) => (
                  <li key={item.id} className="recovery-pending-item">
                    <div>
                      <strong className="numeric">{item.id}</strong>
                      <p className="muted">
                        Destino: {item.correo_destino} · Citas: {(item.citas_ids || []).join(', ')}{' '}
                        · Envío: {item.estado_envio}
                      </p>
                      <p className="muted">
                        Motivo: {item.motivo} · Iniciada por{' '}
                        {item.secretaria_usuario || 'secretaría'}
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      disabled={revokingId === item.id}
                      onClick={() => handleRevoke(item.id)}
                    >
                      {revokingId === item.id ? 'Revocando…' : 'Revocar'}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
