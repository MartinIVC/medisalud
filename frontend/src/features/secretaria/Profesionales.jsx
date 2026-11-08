import React, { useCallback, useEffect, useRef, useState } from 'react';
import { requestApi } from '../../api/client.js';
import { Alert, Button, Dialog, EmptyState, Field } from '../../components/ui';
import DoctorPhoto from '../../components/DoctorPhoto.jsx';
import EditarProfesionalModal from './EditarProfesionalModal.jsx';

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function ProfessionalPhoto({ doctor, token, onUnauthorized }) {
  const [privatePhoto, setPrivatePhoto] = useState(null);

  useEffect(() => {
    if (doctor.activo || !doctor.foto_url) return undefined;
    const controller = new AbortController();
    let objectUrl;
    setPrivatePhoto(null);
    fetch(doctor.foto_url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) onUnauthorized();
        if (!response.ok) return;
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPrivatePhoto(objectUrl);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doctor.activo, doctor.foto_url, token, onUnauthorized]);

  return (
    <DoctorPhoto
      name={doctor.nombre}
      url={doctor.activo ? doctor.foto_url : privatePhoto}
      className="professionals-photo"
    />
  );
}

export default function Profesionales({
  token,
  specialties = [],
  onUnauthorized,
  onBack,
  onCreate,
  onAgenda,
  onRefresh,
}) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [linkError, setLinkError] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [historyDoctor, setHistoryDoctor] = useState(null);
  const [historyDate, setHistoryDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()),
  );
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const pending = useRef(false);
  const query = normalizeSearch(search);
  const rutQuery = /^[0-9k.\s-]+$/.test(query) ? query.replace(/[.\s-]/g, '') : '';
  const filteredDoctors = doctors.filter((doctor) => {
    const statusMatches = status === 'todos' || doctor.activo === (status === 'activos');
    const specialtyMatches = !specialtyFilter || String(doctor.especialidad_id) === specialtyFilter;
    const textMatches = [doctor.nombre, doctor.rut, doctor.especialidad_nombre].some((value) =>
      normalizeSearch(value).includes(query),
    );
    const rutMatches =
      rutQuery &&
      normalizeSearch(doctor.rut)
        .replace(/[.\s-]/g, '')
        .includes(rutQuery);
    return statusMatches && specialtyMatches && (textMatches || rutMatches);
  });

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError('');
      try {
        const response = await requestApi('/api/secretaria/medicos', {
          token,
          signal,
          onUnauthorized,
        });
        if (signal?.aborted) return;
        if (!response.ok) throw new Error(response.data.error);
        setDoctors(response.data.medicos);
      } catch (failure) {
        if (!signal?.aborted) setError(failure.message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [token, onUnauthorized],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!historyDoctor || !historyDate) return undefined;
    const controller = new AbortController();
    setHistory([]);
    setHistoryError('');
    setHistoryLoading(true);
    const params = new URLSearchParams({ medico_id: historyDoctor.id, fecha: historyDate });
    requestApi(`/api/agendas?${params}`, {
      token,
      signal: controller.signal,
      onUnauthorized,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(response.data.error);
        setHistory(response.data.bloques);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setHistoryError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [historyDoctor, historyDate, token, onUnauthorized]);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !target || !reason.trim()) return;
    pending.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await requestApi(`/api/secretaria/medicos/${target.id}/desvincular`, {
        method: 'POST',
        token,
        onUnauthorized,
        body: { motivo: reason.trim() },
      });
      if (!response.ok) {
        setError(response.data.error);
        if (response.data.code === 'DOCTOR_HAS_FUTURE_APPOINTMENTS') {
          setTarget((current) => ({
            ...current,
            citas_futuras: response.data.fields.citas_futuras,
            proxima_cita_fecha: response.data.fields.proxima_cita_fecha,
          }));
        }
        return;
      }
      setTarget(null);
      setMessage(`${target.nombre} quedó inactivo. Se conservó su historial.`);
      await Promise.all([load(), onRefresh()]);
    } catch (failure) {
      setError(failure.message);
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  async function reactivate() {
    if (pending.current || !linkTarget) return;
    pending.current = true;
    setSubmitting(true);
    setLinkError('');
    try {
      const response = await requestApi(`/api/secretaria/medicos/${linkTarget.id}/revincular`, {
        method: 'POST',
        token,
        onUnauthorized,
      });
      if (!response.ok) {
        if (response.data.code === 'DOCTOR_ALREADY_ACTIVE') {
          const name = linkTarget.nombre;
          setLinkTarget(null);
          setMessage(`${name} ya estaba activo. Se actualizó la lista.`);
          await Promise.all([load(), onRefresh()]);
          return;
        }
        setLinkError(response.data.error);
        return;
      }
      setLinkTarget(null);
      setMessage(`${linkTarget.nombre} volvió a estar activo. Se conservaron sus agendas y citas.`);
      await Promise.all([load(), onRefresh()]);
    } catch (failure) {
      setLinkError(failure.message);
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="secretary-portal">
      <div className="section-heading admin-heading">
        <div>
          <p className="section-context">Secretaría</p>
          <h1>Profesionales</h1>
        </div>
        <div className="button-group">
          <Button onClick={onBack}>Volver a la agenda</Button>
          <Button variant="primary" onClick={onCreate}>
            Registrar médico
          </Button>
        </div>
      </div>
      <p className="professionals-intro muted">
        Consulta el estado de cada profesional y gestiona su vinculación. Los profesionales
        inactivos conservan sus agendas y citas históricas.
      </p>
      {message && <Alert tone="success">{message}</Alert>}
      {error && !target && (
        <Alert>
          {error} <Button onClick={() => load()}>Reintentar</Button>
        </Alert>
      )}
      <div className="professionals-filters">
        <Field id="professionals-search" label="Buscar profesional">
          <input
            id="professionals-search"
            type="search"
            placeholder="Nombre, RUT o especialidad"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Field id="professionals-specialty" label="Especialidad">
          <select
            id="professionals-specialty"
            value={specialtyFilter}
            onChange={(event) => setSpecialtyFilter(event.target.value)}
          >
            <option value="">Todas las especialidades</option>
            {specialties.map((specialty) => (
              <option key={specialty.id} value={String(specialty.id)}>
                {specialty.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field id="professionals-status" label="Estado">
          <select
            id="professionals-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </Field>
      </div>
      {loading ? (
        <p role="status">Cargando profesionales…</p>
      ) : !error && filteredDoctors.length === 0 ? (
        <EmptyState
          title={
            doctors.length
              ? 'No hay profesionales para estos filtros'
              : 'No hay profesionales registrados'
          }
        >
          {doctors.length
            ? 'Prueba con otro nombre, RUT, especialidad o estado.'
            : 'Registra un médico para comenzar.'}
        </EmptyState>
      ) : (
        <div className="professionals-list" aria-label="Listado de profesionales">
          {filteredDoctors.map((doctor) => (
            <section className="professional-row" key={doctor.id}>
              <ProfessionalPhoto doctor={doctor} token={token} onUnauthorized={onUnauthorized} />
              <div className="professional-details">
                <div className="professional-name-line">
                  <h2>{doctor.nombre}</h2>
                  <span
                    className={`professional-status ${doctor.activo ? 'is-active' : 'is-inactive'}`}
                  >
                    {doctor.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="professional-specialty">{doctor.especialidad_nombre}</p>
                <p className="professional-rut numeric">{doctor.rut}</p>
                {doctor.activo ? (
                  <p className="professional-appointments">
                    {doctor.citas_futuras === 1
                      ? '1 cita futura confirmada'
                      : `${doctor.citas_futuras} citas futuras confirmadas`}
                  </p>
                ) : doctor.desvinculado_en ? (
                  <p className="professional-audit">
                    Desvinculado el{' '}
                    {new Intl.DateTimeFormat('es-CL', {
                      timeZone: 'America/Santiago',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(doctor.desvinculado_en))}{' '}
                    por {doctor.responsable}. Motivo: {doctor.motivo}
                  </p>
                ) : (
                  <p className="professional-audit">Sin registro de desvinculación disponible.</p>
                )}
              </div>
              <div className="professional-actions">
                {doctor.activo ? (
                  <>
                    <Button onClick={() => setEditingDoctor(doctor)}>Editar profesional</Button>
                    {doctor.citas_futuras > 0 && (
                      <Button onClick={() => onAgenda(doctor.id, doctor.proxima_cita_fecha)}>
                        Gestionar citas en agenda
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        setError('');
                        setReason('');
                        setTarget(doctor);
                      }}
                    >
                      Desvincular
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={() => setHistoryDoctor(doctor)}>Consultar agenda</Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setLinkError('');
                        setLinkTarget(doctor);
                      }}
                    >
                      Revincular
                    </Button>
                  </>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      <Dialog
        open={Boolean(historyDoctor)}
        title="Consultar agenda"
        onClose={() => setHistoryDoctor(null)}
      >
        <p className="context-line">
          {historyDoctor?.nombre} · Profesional inactivo. Consulta en modo de solo lectura.
        </p>
        <Field id="history-date" label="Fecha de la agenda">
          <input
            id="history-date"
            type="date"
            value={historyDate}
            onChange={(event) => setHistoryDate(event.target.value)}
          />
        </Field>
        {historyError && <Alert>{historyError}</Alert>}
        {historyLoading ? (
          <p role="status">Cargando agenda…</p>
        ) : (
          historyDate &&
          !historyError &&
          (history.length ? (
            <div className="history-list">
              {history.map((block) => (
                <div className="history-row" key={block.agenda_id}>
                  <strong className="numeric">
                    {block.hora_inicio}–{block.hora_fin}
                  </strong>
                  <span>
                    {block.estado === 'RESERVADO'
                      ? `${block.paciente_nombre} · ${block.codigo_reserva}`
                      : block.estado === 'BLOQUEADO'
                        ? block.motivo_bloqueo || 'Horario bloqueado'
                        : 'Horario disponible'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No hay horarios registrados para esta fecha.</p>
          ))
        )}
      </Dialog>
      <Dialog
        open={Boolean(linkTarget)}
        title="Revincular profesional"
        busy={submitting}
        onClose={() => {
          if (submitting) return;
          setLinkTarget(null);
          setLinkError('');
        }}
      >
        <p>{linkTarget?.nombre}</p>
        <p>
          Volverá a aparecer en el catálogo de pacientes y sus horarios disponibles podrán
          reservarse. Sus agendas y citas existentes se conservarán.
        </p>
        {linkError && <Alert>{linkError}</Alert>}
        <div className="form-actions">
          <Button disabled={submitting} onClick={() => setLinkTarget(null)}>
            Volver
          </Button>
          <Button variant="primary" disabled={submitting} onClick={reactivate}>
            {submitting ? 'Guardando…' : 'Confirmar revinculación'}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(target)}
        title="Desvincular profesional"
        busy={submitting}
        onClose={() => {
          setTarget(null);
          setError('');
        }}
      >
        <p>{target?.nombre}</p>
        {target?.citas_futuras > 0 ? (
          <>
            <Alert tone="warning">
              Tiene {target.citas_futuras} citas futuras confirmadas. Cancélalas o reprograma cada
              una desde la agenda antes de desvincular al profesional.
            </Alert>
            <div className="form-actions">
              <Button onClick={() => onAgenda(target.id, target.proxima_cita_fecha)}>
                Ir a la agenda
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <Field id="unlink-reason" label="Motivo de la desvinculación">
              <textarea
                id="unlink-reason"
                required
                maxLength={255}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <Alert tone="warning">
              Dejará de aparecer en el catálogo público y no admitirá nuevos horarios ni reservas.
              Se conservarán sus agendas y citas.
            </Alert>
            {error && <Alert>{error}</Alert>}
            <div className="form-actions">
              <Button disabled={submitting} onClick={() => setTarget(null)}>
                Volver
              </Button>
              <Button type="submit" variant="danger" disabled={submitting || !reason.trim()}>
                {submitting ? 'Guardando…' : 'Confirmar desvinculación'}
              </Button>
            </div>
          </form>
        )}
        {error && target?.citas_futuras > 0 && <Alert>{error}</Alert>}
      </Dialog>
      {editingDoctor && (
        <EditarProfesionalModal
          doctor={editingDoctor}
          specialties={specialties}
          token={token}
          onClose={() => setEditingDoctor(null)}
          onSaved={async () => {
            await load();
            onRefresh?.();
            setMessage('Datos del profesional actualizados con éxito.');
          }}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
}
