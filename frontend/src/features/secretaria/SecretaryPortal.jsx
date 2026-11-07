import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { requestApi } from '../../api/client.js';
import { validateRutClient } from '../../utils/rut.js';
import CrearMedico from '../../components/CrearMedico';
import DoctorPhotoEditor from '../../components/DoctorPhotoEditor.jsx';
import Profesionales from './Profesionales.jsx';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Field,
  PatientFields,
  StatusIndicator,
  formatDate,
} from '../../components/ui';

export default function SecretaryPortal({ state, actions }) {
  const {
    secretaryView,
    secretaryToken,
    logoutPending,
    especialidades,
    catalogosLoading,
    catalogosError,
    pendingMedicoDraft,
    secMedicoId,
    medicos,
    secFecha,
    todayStr,
    secAgendas,
    secAgendasLoading,
    secError,
    scheduleDetailsOpen,
    secHoraInicio,
    secHoraFin,
    secDuracion,
    secMotivoBloqueo,
    secFeedback,
    receptionBlock,
    receptionData,
    receptionFieldErrors,
    receptionError,
    submittingReception,
  } = state;
  const {
    setSecretaryView,
    refreshDoctorCatalogs,
    handleDoctorSessionExpired,
    handleSecretaryUnauthorized,
    setPendingMedicoDraft,
    logoutSecretary,
    setSecMedicoId,
    setSecFeedback,
    setSecError,
    setScheduleDetailsOpen,
    setSecHoraInicio,
    setSecHoraFin,
    setSecDuracion,
    setSecMotivoBloqueo,
    handleConfigurarAgenda,
    handleBloquearDia,
    setSecFecha,
    moveSecretaryDate,
    fetchSecAgendas,
    openReceptionBooking,
    handleToggleBloque,
    closeReceptionBooking,
    submitReceptionBooking,
    updateReceptionField,
  } = actions;
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [selection, setSelection] = useState(null);
  const [blockingTarget, setBlockingTarget] = useState(null);
  const [blockingScope, setBlockingScope] = useState('doctor');
  const [blockingInProgress, setBlockingInProgress] = useState(false);
  const [appointmentAction, setAppointmentAction] = useState(null);
  const [appointmentReason, setAppointmentReason] = useState('');
  const [appointmentSubmitting, setAppointmentSubmitting] = useState(false);
  const [appointmentError, setAppointmentError] = useState('');
  const [appointmentMessage, setAppointmentMessage] = useState(null);
  const [moveDoctorId, setMoveDoctorId] = useState('');
  const [moveDate, setMoveDate] = useState(todayStr);
  const [moveAgendaId, setMoveAgendaId] = useState('');
  const [moveSlots, setMoveSlots] = useState([]);
  const [moveSlotsLoading, setMoveSlotsLoading] = useState(false);
  const [moveSlotsError, setMoveSlotsError] = useState('');
  const [configSubmitting, setConfigSubmitting] = useState(false);
  const [configReview, setConfigReview] = useState(false);
  const [receptionRutError, setReceptionRutError] = useState('');
  const operationRef = useRef(false);
  const configRef = useRef(false);
  const filteredDoctors = useMemo(
    () =>
      specialtyFilter
        ? medicos.filter((doctor) => String(doctor.especialidad_id) === specialtyFilter)
        : medicos,
    [medicos, specialtyFilter],
  );
  const selectedDoctor = medicos.find((doctor) => String(doctor.id) === String(secMedicoId));
  const isPastDate = Boolean(secFecha && todayStr && secFecha < todayStr);
  const selectedBlock =
    selection?.key === `${secMedicoId}:${secFecha}`
      ? secAgendas.find((block) => block.agenda_id === selection.id)
      : null;
  const filteredAgendas = useMemo(
    () =>
      secAgendas.filter(
        (block) =>
          (statusFilter === 'TODOS' || block.estado === statusFilter) &&
          (!searchQuery.trim() ||
            [
              block.hora_inicio,
              block.paciente_nombre,
              block.paciente_rut,
              block.codigo_reserva,
              block.motivo_bloqueo,
            ].some((value) => value?.toLowerCase().includes(searchQuery.trim().toLowerCase()))),
      ),
    [secAgendas, statusFilter, searchQuery],
  );

  useEffect(() => {
    setSecFeedback(null);
    setAppointmentMessage(null);
  }, [secMedicoId, secFecha, setSecFeedback]);

  function changeSpecialty(value) {
    setSpecialtyFilter(value);
    const options = value
      ? medicos.filter((doctor) => String(doctor.especialidad_id) === value)
      : medicos;
    if (!options.some((doctor) => String(doctor.id) === String(secMedicoId))) {
      setSecMedicoId(options[0] ? String(options[0].id) : '');
    }
  }
  function openBlocking(target) {
    setBlockingTarget(target);
    setBlockingScope('doctor');
    setSecFeedback(null);
    if (target.type === 'slot' && target.block.estado !== 'BLOQUEADO')
      setSecMotivoBloqueo('Bloqueo manual por secretaría');
  }
  async function submitBlocking(event) {
    event.preventDefault();
    if (operationRef.current) return;
    operationRef.current = true;
    setBlockingInProgress(true);
    try {
      const ok =
        blockingTarget.type === 'slot'
          ? await handleToggleBloque(blockingTarget.block)
          : await handleBloquearDia(blockingScope === 'global');
      if (ok) setBlockingTarget(null);
    } finally {
      operationRef.current = false;
      setBlockingInProgress(false);
    }
  }
  function openAppointment(action, block) {
    setSecFeedback(null);
    setAppointmentMessage(null);
    setAppointmentAction({ action, appointment: block });
    setAppointmentReason('');
    setAppointmentError('');
    if (action === 'MOVER') {
      setMoveDoctorId(String(block.medico_id || secMedicoId));
      setMoveDate(block.fecha || secFecha);
      setMoveAgendaId('');
      setMoveSlots([]);
    }
  }
  async function submitAppointment(event) {
    event.preventDefault();
    if (operationRef.current) return;
    operationRef.current = true;
    setAppointmentSubmitting(true);
    setAppointmentError('');
    try {
      const response = await requestApi(
        `/api/reservas/${appointmentAction.appointment.cita_id}/gestionar`,
        {
          method: 'POST',
          token: secretaryToken,
          onUnauthorized: handleSecretaryUnauthorized,
          body: {
            accion: appointmentAction.action,
            motivo: appointmentReason.trim(),
            ...(appointmentAction.action === 'MOVER' ? { agenda_id: Number(moveAgendaId) } : {}),
          },
        },
      );
      if (!response.ok) {
        setAppointmentError(response.data.error || 'No pudimos actualizar la cita.');
        return;
      }
      const emailReady = response.data.correo_aviso?.proveedor_configurado !== false;
      const noticePending = response.data.correo_aviso?.estado === 'PENDIENTE';
      const noticeMessage = noticePending
        ? emailReady
          ? ' Se solicitó el envío del aviso por correo.'
          : ' El aviso por correo quedó pendiente: falta configurar SMTP o SendGrid.'
        : '';
      setAppointmentMessage({
        tone: emailReady ? 'success' : 'warning',
        text: `La cita fue ${appointmentAction.action === 'MOVER' ? 'cambiada' : 'cancelada'}.${noticeMessage}`,
      });
      setAppointmentAction(null);
      fetchSecAgendas();
    } catch (error) {
      setAppointmentError(error.message || 'No pudimos conectar con el sistema.');
    } finally {
      operationRef.current = false;
      setAppointmentSubmitting(false);
    }
  }
  useEffect(() => {
    if (appointmentAction?.action !== 'MOVER' || !moveDoctorId || !moveDate) return undefined;
    const controller = new AbortController();
    setMoveSlotsLoading(true);
    setMoveSlotsError('');
    setMoveSlots([]);
    setMoveAgendaId('');
    requestApi(
      `/api/agendas?${new URLSearchParams({ medico_id: moveDoctorId, fecha: moveDate })}`,
      {
        token: secretaryToken,
        signal: controller.signal,
        onUnauthorized: handleSecretaryUnauthorized,
      },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.ok || !response.data.ok) {
          setMoveSlotsError(response.data.error || 'No pudimos cargar los horarios.');
          return;
        }
        const available = (response.data.bloques || []).filter(
          (block) =>
            block.estado === 'DISPONIBLE' &&
            block.futuro &&
            Number(block.agenda_id) !== Number(appointmentAction.appointment.agenda_id),
        );
        setMoveSlots(available);
        setMoveAgendaId(available[0] ? String(available[0].agenda_id) : '');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMoveSlotsError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMoveSlotsLoading(false);
      });
    return () => controller.abort();
  }, [
    appointmentAction?.action,
    appointmentAction?.appointment?.agenda_id,
    moveDate,
    moveDoctorId,
    secretaryToken,
    handleSecretaryUnauthorized,
  ]);

  async function configure(event) {
    event.preventDefault();
    if (!configReview) {
      setConfigReview(true);
      return;
    }
    if (configRef.current) return;
    configRef.current = true;
    setConfigSubmitting(true);
    try {
      await handleConfigurarAgenda(event);
      setConfigReview(false);
    } finally {
      configRef.current = false;
      setConfigSubmitting(false);
    }
  }
  const isUnlock = blockingTarget?.block?.estado === 'BLOQUEADO';
  const receptionValues = {
    rut: receptionData.rut,
    nombre: receptionData.nombre,
    email: receptionData.email,
    telefono: receptionData.telefono,
  };

  if (secretaryView === 'profesionales')
    return (
      <Profesionales
        token={secretaryToken}
        onUnauthorized={handleSecretaryUnauthorized}
        onRefresh={refreshDoctorCatalogs}
        onBack={() => setSecretaryView('agenda')}
        onCreate={() => setSecretaryView('create-medico')}
        onAgenda={(id, fecha) => {
          setSpecialtyFilter('');
          setStatusFilter('TODOS');
          setSearchQuery('');
          setSelection(null);
          setSecMedicoId(String(id));
          if (fecha) setSecFecha(fecha);
          setSecretaryView('agenda');
        }}
      />
    );

  if (secretaryView === 'create-medico')
    return (
      <>
        <div className="section-heading">
          <Button onClick={() => setSecretaryView('profesionales')}>Volver a profesionales</Button>
          <Button onClick={logoutSecretary} disabled={logoutPending}>
            Cerrar sesión
          </Button>
        </div>
        <CrearMedico
          secretaryToken={secretaryToken}
          specialties={especialidades}
          specialtiesLoading={catalogosLoading}
          specialtiesError={catalogosError}
          onRefreshCatalogs={refreshDoctorCatalogs}
          onSessionExpired={handleDoctorSessionExpired}
          initialDraft={pendingMedicoDraft}
          onDraftChange={setPendingMedicoDraft}
          onClearDraft={() => setPendingMedicoDraft(null)}
          onCancel={() => setSecretaryView('profesionales')}
          onContinueScheduling={(id) => {
            setSpecialtyFilter('');
            setSecMedicoId(String(id));
            setSecFeedback(null);
            setSecError('');
            setScheduleDetailsOpen(true);
            setSecretaryView('agenda');
          }}
        />
      </>
    );

  return (
    <div className="secretary-portal">
      <div className="section-heading admin-heading">
        <div>
          <p className="section-context">Secretaría</p>
          <h1 id="secretary-agenda-title" tabIndex={-1}>
            Agenda del día
          </h1>
          <p className="muted">{formatDate(secFecha, { year: 'numeric' })}</p>
        </div>
        <div className="button-group">
          <Button onClick={() => setSecretaryView('profesionales')}>Profesionales</Button>
          <Button
            variant="primary"
            disabled={!selectedDoctor || isPastDate}
            onClick={() => {
              setSecFeedback(null);
              setConfigReview(false);
              setScheduleDetailsOpen(true);
            }}
          >
            Configurar horarios
          </Button>
          <Button variant="text" onClick={logoutSecretary} disabled={logoutPending}>
            Cerrar sesión
          </Button>
        </div>
      </div>
      {catalogosLoading && (
        <p role="status" className="loading-state">
          Cargando profesionales…
        </p>
      )}
      {catalogosError && (
        <Alert>
          {catalogosError}
          <Button onClick={refreshDoctorCatalogs}>Reintentar</Button>
        </Alert>
      )}
      <div className="agenda-toolbar">
        <Field id="agenda-specialty" label="Especialidad">
          <select
            id="agenda-specialty"
            value={specialtyFilter}
            onChange={(event) => changeSpecialty(event.target.value)}
          >
            <option value="">Todas las especialidades</option>
            {especialidades.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field id="agenda-doctor" label="Profesional">
          <select
            id="agenda-doctor"
            value={secMedicoId}
            onChange={(event) => setSecMedicoId(event.target.value)}
            disabled={!filteredDoctors.length}
          >
            {!filteredDoctors.length && <option value="">Sin profesionales</option>}
            {filteredDoctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field id="agenda-date" label="Fecha">
          <input
            type="date"
            id="agenda-date"
            value={secFecha}
            required
            onChange={(event) => {
              if (event.target.value) setSecFecha(event.target.value);
            }}
          />
        </Field>
        <div className="date-navigation">
          <Button
            className="icon-button"
            aria-label="Día anterior"
            onClick={() => moveSecretaryDate(-1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
          <Button onClick={() => setSecFecha(todayStr)}>Hoy</Button>
          <Button
            className="icon-button"
            aria-label="Día siguiente"
            onClick={() => moveSecretaryDate(1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {selectedDoctor && (
        <div className="agenda-caption">
          <DoctorPhotoEditor
            doctor={selectedDoctor}
            token={secretaryToken}
            onSaved={refreshDoctorCatalogs}
            onUnauthorized={handleSecretaryUnauthorized}
          />
          <div className="agenda-doctor-meta">
            <strong>{selectedDoctor.nombre}</strong>
            <span>
              {selectedDoctor.especialidad_nombre} · {selectedDoctor.box_atencion}
            </span>
          </div>
        </div>
      )}
      {secFeedback && !scheduleDetailsOpen && !blockingTarget && (
        <Alert tone={secFeedback.ok ? 'success' : 'error'}>
          {secFeedback.mensaje || secFeedback.error}
        </Alert>
      )}
      {appointmentMessage && (
        <Alert tone={appointmentMessage.tone}>{appointmentMessage.text}</Alert>
      )}
      <div className="agenda-filters">
        <div className="filter-tabs" aria-label="Filtrar agenda por estado">
          {[
            ['TODOS', 'Todos'],
            ['DISPONIBLE', 'Disponibles'],
            ['RESERVADO', 'Reservados'],
            ['BLOQUEADO', 'Bloqueados'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
              <span>
                {secAgendas.filter((block) => value === 'TODOS' || block.estado === value).length}
              </span>
            </button>
          ))}
        </div>
        <Field id="agenda-search" label="Buscar en la agenda">
          <input
            type="search"
            id="agenda-search"
            placeholder="Paciente, RUT, código u hora"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </Field>
      </div>
      {secError ? (
        <Alert>
          {secError}
          <Button onClick={() => fetchSecAgendas()}>Reintentar</Button>
        </Alert>
      ) : secAgendasLoading ? (
        <p role="status" className="loading-state">
          Cargando agenda…
        </p>
      ) : !filteredDoctors.length ? (
        <EmptyState title="No hay profesionales para esta selección">
          Selecciona otra especialidad o registra un médico.
        </EmptyState>
      ) : !secAgendas.length ? (
        <EmptyState
          title="No hay horarios configurados"
          action={
            isPastDate ? null : (
              <Button
                onClick={() => {
                  setConfigReview(false);
                  setSecFeedback(null);
                  setScheduleDetailsOpen(true);
                }}
              >
                Configurar horarios
              </Button>
            )
          }
        >
          {isPastDate
            ? 'No se registraron horarios de atención para esta fecha.'
            : 'Crea los bloques de atención para este profesional y fecha.'}
        </EmptyState>
      ) : !filteredAgendas.length ? (
        <EmptyState
          title="No hay resultados para estos filtros"
          action={
            <Button
              onClick={() => {
                setStatusFilter('TODOS');
                setSearchQuery('');
              }}
            >
              Limpiar filtros
            </Button>
          }
        >
          Prueba otro estado o término de búsqueda.
        </EmptyState>
      ) : (
        <div className="agenda-list" role="group" aria-label="Horarios de la agenda">
          <div className="agenda-columns" aria-hidden="true">
            <span>Horario</span>
            <span>Paciente o detalle</span>
            <span>Estado</span>
          </div>
          {filteredAgendas.map((block) => (
            <div
              key={block.agenda_id}
              className={`agenda-entry${selectedBlock?.agenda_id === block.agenda_id ? ' is-expanded' : ''}`}
            >
              <button
                type="button"
                className="agenda-row"
                aria-expanded={selectedBlock?.agenda_id === block.agenda_id}
                onClick={() =>
                  setSelection(
                    selectedBlock?.agenda_id === block.agenda_id
                      ? null
                      : { key: `${secMedicoId}:${secFecha}`, id: block.agenda_id },
                  )
                }
              >
                <span className="agenda-time numeric">
                  {block.hora_inicio}
                  <small>{block.hora_fin}</small>
                </span>
                <span>
                  {block.estado === 'RESERVADO'
                    ? block.paciente_nombre
                    : block.estado === 'BLOQUEADO'
                      ? block.motivo_bloqueo || 'Horario bloqueado'
                      : 'Disponible para reservar'}
                  <small>
                    {block.estado === 'RESERVADO'
                      ? `${block.paciente_rut} · ${block.codigo_reserva}`
                      : `${block.duracion_min} minutos · ${block.box_atencion}`}
                  </small>
                </span>
                <StatusIndicator status={block.estado} />
              </button>
              {selectedBlock?.agenda_id === block.agenda_id && (
                <section className="agenda-context" aria-label="Acciones del horario seleccionado">
                  <div className="button-group">
                    {selectedBlock.estado === 'DISPONIBLE' && selectedBlock.futuro !== false && (
                      <Button
                        variant="primary"
                        onClick={(event) => {
                          setReceptionRutError('');
                          openReceptionBooking(selectedBlock, event);
                        }}
                      >
                        Registrar cita
                      </Button>
                    )}
                    {selectedBlock.estado !== 'RESERVADO' && selectedBlock.futuro !== false && (
                      <Button onClick={() => openBlocking({ type: 'slot', block: selectedBlock })}>
                        {selectedBlock.estado === 'BLOQUEADO'
                          ? 'Desbloquear horario'
                          : 'Bloquear horario'}
                      </Button>
                    )}
                    {selectedBlock.estado === 'RESERVADO' &&
                      selectedBlock.futuro &&
                      selectedBlock.cita_id && (
                        <>
                          <Button onClick={() => openAppointment('MOVER', selectedBlock)}>
                            Cambiar cita
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => openAppointment('CANCELAR', selectedBlock)}
                          >
                            Cancelar cita
                          </Button>
                        </>
                      )}
                  </div>
                  {selectedBlock.estado !== 'RESERVADO' && selectedBlock.futuro === false && (
                    <p className="muted">
                      No se puede modificar ni reservar un horario cuya hora ya pasó.
                    </p>
                  )}
                  {selectedBlock.estado === 'RESERVADO' &&
                    (!selectedBlock.futuro || !selectedBlock.cita_id) && (
                      <p className="muted">
                        {selectedBlock.futuro === false
                          ? 'No se puede cambiar ni cancelar una cita cuya hora ya pasó.'
                          : 'No se puede gestionar esta cita porque sus datos no están disponibles.'}
                      </p>
                    )}
                </section>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="admin-footnote">
        <span className="muted">
          {isPastDate
            ? 'Fecha pasada en modo de consulta.'
            : 'La agenda se actualiza automáticamente.'}
        </span>
        <Button
          variant="text"
          disabled={!selectedDoctor || isPastDate}
          onClick={() => openBlocking({ type: 'day' })}
        >
          Registrar ausencia o feriado
        </Button>
      </div>

      <Dialog
        open={scheduleDetailsOpen}
        title="Configurar horarios"
        busy={configSubmitting}
        onClose={() => setScheduleDetailsOpen(false)}
      >
        <p className="context-line">
          {selectedDoctor?.nombre}
          <br />
          {formatDate(secFecha)}
        </p>
        <form onSubmit={configure}>
          <div className="form-grid">
            <Field id="schedule-start" label="Desde">
              <input
                id="schedule-start"
                type="time"
                required
                value={secHoraInicio}
                disabled={configReview}
                onChange={(event) => setSecHoraInicio(event.target.value)}
              />
            </Field>
            <Field id="schedule-end" label="Hasta">
              <input
                id="schedule-end"
                type="time"
                required
                value={secHoraFin}
                disabled={configReview}
                onChange={(event) => setSecHoraFin(event.target.value)}
              />
            </Field>
            <Field id="schedule-duration" label="Duración de atención">
              <select
                id="schedule-duration"
                value={secDuracion}
                disabled={configReview}
                onChange={(event) => setSecDuracion(event.target.value)}
              >
                {[15, 20, 30].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutos
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {configReview && (
            <Alert tone="warning">
              Se configurarán horarios de {secHoraInicio} a {secHoraFin} para{' '}
              {selectedDoctor?.nombre}, el {formatDate(secFecha)}. La operación puede reemplazar
              bloques existentes sin historial de citas.
            </Alert>
          )}
          {secFeedback && (
            <Alert tone={secFeedback.ok ? 'success' : 'error'}>
              {secFeedback.mensaje || secFeedback.error}
            </Alert>
          )}
          <div className="form-actions">
            {configReview && (
              <Button disabled={configSubmitting} onClick={() => setConfigReview(false)}>
                Editar configuración
              </Button>
            )}
            <Button variant="primary" type="submit" disabled={configSubmitting}>
              {configSubmitting
                ? 'Guardando…'
                : configReview
                  ? 'Confirmar configuración'
                  : 'Revisar configuración'}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(receptionBlock)}
        title="Registrar cita"
        busy={submittingReception}
        onClose={closeReceptionBooking}
      >
        <p className="context-line">
          {receptionBlock?.medico_nombre}
          <br />
          {formatDate(receptionBlock?.fecha || secFecha)} · {receptionBlock?.hora_inicio}–
          {receptionBlock?.hora_fin}
        </p>
        <form
          onSubmit={(event) => {
            const result = validateRutClient(receptionData.rut);
            if (!result.valid) {
              event.preventDefault();
              setReceptionRutError(result.message);
              return;
            }
            submitReceptionBooking(event);
          }}
        >
          <Field id="reception-origin" label="Origen de la reserva">
            <select
              id="reception-origin"
              value={receptionData.origen}
              onChange={(event) => updateReceptionField('origen', event.target.value)}
            >
              <option value="PRESENCIAL">Presencial</option>
              <option value="TELEFONO">Telefónica</option>
            </select>
          </Field>
          <PatientFields
            prefix="reception"
            values={receptionValues}
            onChange={(key, value) => {
              updateReceptionField(key, value);
              if (key === 'rut') setReceptionRutError('');
            }}
            errors={receptionFieldErrors}
            rutError={receptionRutError}
          />
          {receptionError && <Alert>{receptionError}</Alert>}
          <div className="form-actions">
            <Button disabled={submittingReception} onClick={closeReceptionBooking}>
              Volver
            </Button>
            <Button type="submit" variant="primary" disabled={submittingReception}>
              {submittingReception ? 'Reservando…' : 'Confirmar reserva'}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(blockingTarget)}
        title={
          isUnlock
            ? 'Desbloquear horario'
            : blockingTarget?.type === 'slot'
              ? 'Bloquear horario'
              : 'Registrar ausencia o feriado'
        }
        busy={blockingInProgress}
        onClose={() => setBlockingTarget(null)}
      >
        <p className="context-line">
          {selectedDoctor?.nombre}
          <br />
          {formatDate(secFecha)}
          {blockingTarget?.block &&
            ` · ${blockingTarget.block.hora_inicio}–${blockingTarget.block.hora_fin}`}
        </p>
        <form onSubmit={submitBlocking}>
          {blockingTarget?.type === 'day' && (
            <Field id="blocking-scope" label="Alcance del bloqueo">
              <select
                id="blocking-scope"
                value={blockingScope}
                onChange={(event) => setBlockingScope(event.target.value)}
              >
                <option value="doctor">Jornada del profesional seleccionado</option>
                <option value="global">Feriado global: todos los profesionales</option>
              </select>
            </Field>
          )}
          {!isUnlock && (
            <Field id="blocking-reason" label="Motivo">
              <input
                id="blocking-reason"
                maxLength={255}
                required
                value={secMotivoBloqueo}
                onChange={(event) => setSecMotivoBloqueo(event.target.value)}
              />
            </Field>
          )}
          <Alert tone="warning">
            {isUnlock
              ? 'El sistema reevaluará los bloqueos de la fecha antes de habilitar el horario.'
              : blockingTarget?.type === 'slot'
                ? 'Este horario dejará de estar disponible para reservas.'
                : blockingScope === 'global'
                  ? `Se bloqueará el ${formatDate(secFecha)} para todos los profesionales de la clínica.`
                  : `Se bloqueará la jornada de ${selectedDoctor?.nombre}.`}
          </Alert>
          {secFeedback && !secFeedback.ok && (
            <Alert>{secFeedback.error || secFeedback.mensaje}</Alert>
          )}
          <div className="form-actions">
            <Button disabled={blockingInProgress} onClick={() => setBlockingTarget(null)}>
              Volver
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={blockingInProgress || (!isUnlock && !secMotivoBloqueo.trim())}
            >
              {blockingInProgress
                ? 'Actualizando…'
                : isUnlock
                  ? 'Confirmar desbloqueo'
                  : blockingTarget?.type === 'day' && blockingScope === 'global'
                    ? 'Bloquear a todos'
                    : 'Confirmar bloqueo'}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(appointmentAction)}
        title={appointmentAction?.action === 'MOVER' ? 'Cambiar cita' : 'Cancelar cita'}
        busy={appointmentSubmitting}
        onClose={() => setAppointmentAction(null)}
      >
        <p className="context-line">
          {appointmentAction?.appointment.paciente_nombre} ·{' '}
          {appointmentAction?.appointment.codigo_reserva}
          <br />
          {appointmentAction?.appointment.medico_nombre}
          <br />
          {formatDate(appointmentAction?.appointment.fecha)} ·{' '}
          {appointmentAction?.appointment.hora_inicio}–{appointmentAction?.appointment.hora_fin}
        </p>
        <form onSubmit={submitAppointment}>
          {appointmentAction?.action === 'MOVER' ? (
            <div className="form-grid">
              <Field id="move-doctor" label="Nuevo profesional">
                <select
                  id="move-doctor"
                  value={moveDoctorId}
                  onChange={(event) => setMoveDoctorId(event.target.value)}
                >
                  {medicos.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.nombre}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="move-date" label="Nueva fecha">
                <input
                  id="move-date"
                  type="date"
                  min={todayStr}
                  required
                  value={moveDate}
                  onChange={(event) => setMoveDate(event.target.value)}
                />
              </Field>
              <Field id="move-slot" label="Nuevo horario" className="span-full">
                <select
                  id="move-slot"
                  required
                  value={moveAgendaId}
                  disabled={moveSlotsLoading || !moveSlots.length}
                  onChange={(event) => setMoveAgendaId(event.target.value)}
                >
                  <option value="">
                    {moveSlotsLoading ? 'Buscando horarios…' : 'Selecciona un horario'}
                  </option>
                  {moveSlots.map((slot) => (
                    <option key={slot.agenda_id} value={slot.agenda_id}>
                      {slot.hora_inicio}–{slot.hora_fin} · {slot.box_atencion}
                    </option>
                  ))}
                </select>
                {moveSlotsError ? (
                  <Alert>{moveSlotsError}</Alert>
                ) : (
                  !moveSlotsLoading &&
                  !moveSlots.length && (
                    <p role="status" className="field-hint">
                      No hay horarios disponibles para esta selección.
                    </p>
                  )
                )}
              </Field>
            </div>
          ) : (
            <Alert tone="warning">
              Se cancelará esta cita y se liberará el horario. Se solicitará un aviso por correo al
              paciente.
            </Alert>
          )}
          <Field id="appointment-reason" label="Motivo del cambio">
            <textarea
              id="appointment-reason"
              required
              maxLength={255}
              value={appointmentReason}
              onChange={(event) => setAppointmentReason(event.target.value)}
            />
          </Field>
          {appointmentError && <Alert>{appointmentError}</Alert>}
          <div className="form-actions">
            <Button disabled={appointmentSubmitting} onClick={() => setAppointmentAction(null)}>
              Volver
            </Button>
            <Button
              type="submit"
              variant={appointmentAction?.action === 'CANCELAR' ? 'danger' : 'primary'}
              disabled={
                appointmentSubmitting ||
                (appointmentAction?.action === 'MOVER' && (!moveAgendaId || moveSlotsLoading))
              }
            >
              {appointmentSubmitting
                ? 'Actualizando…'
                : appointmentAction?.action === 'MOVER'
                  ? 'Confirmar cambio'
                  : 'Confirmar cancelación'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
