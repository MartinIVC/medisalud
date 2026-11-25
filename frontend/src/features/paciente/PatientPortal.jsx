import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarDays, Check, Copy, MapPin, Printer } from 'lucide-react';
import DoctorPhoto from '../../components/DoctorPhoto.jsx';
import MisCitas from './MisCitas.jsx';
import {
  EASE_OUT_EXPO,
  EASE_OUT_QUART,
  SPRING_CRISP,
  stageVariants,
  staggerContainerVariants,
  staggerItemVariants,
} from '../../utils/motionPresets.js';
import {
  Alert,
  AppointmentDetails,
  Button,
  Dialog,
  EmptyState,
  Field,
  PatientFields,
  formatDate,
} from '../../components/ui';

function BookingAppointmentSummary({ appointment }) {
  return (
    <section className="booking-appointment" aria-label="Resumen de la cita seleccionada">
      <div className="booking-professional">
        <div className="booking-professional-details">
          <p className="booking-professional-specialty">{appointment.especialidad_nombre}</p>
          <h3>{appointment.medico_nombre}</h3>
          <p className="booking-professional-caption">Tu profesional de atención</p>
        </div>
        <DoctorPhoto
          url={appointment.foto_url}
          name={appointment.medico_nombre}
          className="booking-doctor-photo"
        />
      </div>
      <dl className="booking-visit-details">
        <div>
          <dt>
            <CalendarDays size={18} aria-hidden="true" /> Fecha y hora
          </dt>
          <dd>
            {formatDate(appointment.fecha)}
            <br />
            <span className="numeric">
              {appointment.hora_inicio}–{appointment.hora_fin}
            </span>
          </dd>
        </div>
        <div>
          <dt>
            <MapPin size={18} aria-hidden="true" /> Lugar de atención
          </dt>
          <dd>{appointment.box_atencion || '—'}</dd>
        </div>
      </dl>
    </section>
  );
}

function nextDates(selectedDate, today) {
  const last = new Date(`${today}T12:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 6);
  const start =
    selectedDate >= today && selectedDate <= last.toISOString().slice(0, 10) ? today : selectedDate;
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      iso: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      weekday: new Intl.DateTimeFormat('es-CL', { weekday: 'short', timeZone: 'UTC' }).format(date),
    };
  });
}

export default function PatientPortal({ state, actions }) {
  const {
    disponibilidad,
    loadingDisp,
    availabilityError,
    selectedEsp,
    selectedMedico,
    selectedFecha,
    selectedBloque,
    especialidades,
    medicosFiltrados,
    groupedBlocks,
    pacienteRut,
    pacienteNombre,
    pacienteEmail,
    pacienteTelefono,
    reservaResult,
    submittingReserva,
    bookingStep,
    fieldTouched,
    rutCheck,
    reservationFieldErrors,
    catalogosLoading,
    catalogosError,
    today,
    verificationRequest,
    verificationCode = '',
    verificationLoading = false,
    verificationError = '',
    verificationNotice = '',
    hasValidEmailAuth = false,
  } = state;
  const {
    setSelectedEsp,
    setSelectedMedico,
    setSelectedFecha,
    setSelectedBloque,
    setReservaResult,
    setBookingStep,
    setPacienteRut,
    setPacienteNombre,
    setPacienteEmail,
    setPacienteTelefono,
    setFieldTouched,
    fetchDisponibilidad,
    handleReservarSubmit,
    requestBookingCode,
    setVerificationCode,
    resetRequestKey,
    retryCatalogos,
  } = actions;
  const reduceMotion = useReducedMotion();
  const [portalTab, setPortalTab] = useState('reservar');
  const [view, setView] = useState(() =>
    submittingReserva || reservaResult || ['verificacion', 'revision'].includes(bookingStep)
      ? 'reserva'
      : 'horarios',
  );
  const [bookingOpen, setBookingOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [selectedJornada, setSelectedJornada] = useState('TODAS');
  const [resendRemainingSec, setResendRemainingSec] = useState(0);
  const headingRef = useRef(null);
  const bookingOpenerRef = useRef(null);
  const dates = useMemo(() => nextDates(selectedFecha, today), [selectedFecha, today]);
  const currentDoctor = medicosFiltrados.find((doctor) => String(doctor.id) === selectedMedico);
  const isLookupTab = portalTab === 'mis-citas' && !submittingReserva && !verificationLoading;
  const visibleGroupedBlocks = useMemo(() => {
    const entries = Object.entries(groupedBlocks || {});
    if (selectedJornada === 'TODAS') return entries;
    const suffix = selectedJornada === 'MANANA' ? '· Mañana' : '· Tarde';
    return entries.filter(([group]) => group.endsWith(suffix));
  }, [groupedBlocks, selectedJornada]);

  const hasActiveFilters = Boolean(selectedEsp || selectedMedico || selectedJornada !== 'TODAS');

  function resetPatientFilters() {
    setSelectedJornada('TODAS');
    setSelectedEsp?.('');
    setSelectedMedico?.('');
  }
  // Reservation progress belongs to the persistent hook, including across portal navigation.
  const activeView =
    submittingReserva || reservaResult || ['verificacion', 'revision'].includes(bookingStep)
      ? 'reserva'
      : selectedBloque
        ? view
        : 'horarios';
  const stage =
    activeView === 'reserva' || bookingOpen
      ? 2
      : selectedEsp || selectedMedico || selectedBloque || selectedFecha !== today
        ? 1
        : 0;
  const successful = reservaResult?.type === 'success';
  const needsAnotherSlot =
    reservaResult?.status === 409 &&
    ['SLOT_TAKEN', 'SLOT_NOT_BOOKABLE', 'SLOT_OVERLAP'].includes(
      reservaResult.data.code || reservaResult.data.codigo_error,
    );
  const retryableConflict = reservaResult?.status === 409 && !needsAnotherSlot;
  const rutError = fieldTouched.rut && rutCheck && !rutCheck.valid ? rutCheck.message : '';

  useEffect(() => {
    if (activeView === 'reserva') headingRef.current?.focus({ preventScroll: true });
  }, [activeView, bookingStep, successful]);

  useEffect(() => {
    if (!verificationRequest?.reenvioDisponibleEn || bookingStep !== 'verificacion') {
      setResendRemainingSec(0);
      return undefined;
    }
    const updateRemaining = () => {
      const diffMs = new Date(verificationRequest.reenvioDisponibleEn).getTime() - Date.now();
      setResendRemainingSec(Math.max(0, Math.ceil(diffMs / 1000)));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [verificationRequest?.reenvioDisponibleEn, bookingStep]);

  function changeHour(preserveSelectedSlot = false) {
    resetRequestKey();
    if (!preserveSelectedSlot) setSelectedBloque(null);
    setReservaResult(null);
    setBookingStep('datos');
    setBookingOpen(false);
    setView('horarios');
    window.requestAnimationFrame(() =>
      document.getElementById('patient-date')?.focus({ preventScroll: true }),
    );
  }

  function updatePatient(key, value) {
    const setters = {
      rut: setPacienteRut,
      nombre: setPacienteNombre,
      email: setPacienteEmail,
      telefono: setPacienteTelefono,
    };
    setters[key](value);
    setReservaResult(null);
    if (key === 'rut') setFieldTouched((current) => ({ ...current, rut: true }));
  }

  function submitBooking(event) {
    if (bookingStep === 'datos') {
      setView('reserva');
      setBookingOpen(false);
    }
    handleReservarSubmit(event);
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('No pudimos copiar el código. Puedes seleccionarlo en el comprobante.');
    }
  }

  const bookingForm =
    bookingStep === 'verificacion' ? (
      <form onSubmit={submitBooking} noValidate>
        <div className="verification-panel">
          <p>
            Enviamos la solicitud de un código de 6 dígitos a{' '}
            <strong>{verificationRequest?.correo || pacienteEmail}</strong>. Mientras esperas, el
            horario sigue disponible para otros pacientes.
          </p>
          {verificationNotice && <Alert tone="success">{verificationNotice}</Alert>}
          <Field
            id="patient-verification-code"
            label="Código de verificación (6 dígitos)"
            error={verificationError}
            hint="Tiene una vigencia de 10 minutos y es de un solo uso."
          >
            <input
              id="patient-verification-code"
              name="codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode?.(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              aria-invalid={Boolean(verificationError)}
              aria-describedby={
                verificationError
                  ? 'patient-verification-code-hint patient-verification-code-error'
                  : 'patient-verification-code-hint'
              }
            />
          </Field>
          <div className="verification-inline-actions">
            <Button
              disabled={verificationLoading || resendRemainingSec > 0}
              onClick={() => requestBookingCode?.({ isResend: true })}
            >
              {resendRemainingSec > 0
                ? `Reenviar código (${resendRemainingSec} s)`
                : 'Reenviar código'}
            </Button>
            <Button
              variant="text"
              disabled={verificationLoading}
              onClick={() => {
                setBookingStep('datos');
                setReservaResult(null);
              }}
            >
              Corregir correo o datos
            </Button>
          </div>
        </div>
        <div className="form-actions">
          <Button
            disabled={verificationLoading}
            onClick={() => {
              setBookingStep('datos');
              setReservaResult(null);
            }}
          >
            Volver a mis datos
          </Button>
          <Button variant="primary" type="submit" disabled={verificationLoading}>
            {verificationLoading ? 'Verificando…' : 'Verificar código'}
          </Button>
        </div>
      </form>
    ) : (
      <form onSubmit={submitBooking}>
        {bookingStep === 'revision' && (
          <Alert tone="warning">
            {verificationNotice ||
              'Correo verificado. Tu hora aún no está reservada: revisa tus datos y pulsa «Confirmar reserva» para finalizar.'}
          </Alert>
        )}
        <PatientFields
          prefix="patient"
          values={{
            rut: pacienteRut,
            nombre: pacienteNombre,
            email: pacienteEmail,
            telefono: pacienteTelefono,
          }}
          onChange={updatePatient}
          errors={reservationFieldErrors}
          rutError={rutError}
          readOnly={bookingStep === 'revision'}
        />
        {bookingStep === 'datos' && hasValidEmailAuth && (
          <Alert tone="success">
            Tu correo sigue verificado para este RUT. Puedes elegir otro horario y confirmar sin
            pedir un código nuevo.
          </Alert>
        )}
        {bookingStep === 'datos' && verificationError && <Alert>{verificationError}</Alert>}
        {reservaResult?.type === 'error' && (
          <Alert>
            {retryableConflict
              ? 'No pudimos confirmar este horario. Puedes reintentar sin volver a ingresar tus datos.'
              : reservaResult.data.mensaje ||
                reservaResult.data.error ||
                'No pudimos completar la reserva.'}
            {needsAnotherSlot && (
              <>
                <p>
                  Elige otro horario. Conservamos tus datos
                  {hasValidEmailAuth ? ' y tu verificación vigente' : ''}.
                </p>
                <Button onClick={() => changeHour(false)}>Elegir otra hora</Button>
              </>
            )}
          </Alert>
        )}
        <div className="form-actions">
          {bookingStep === 'revision' && (
            <Button
              disabled={submittingReserva}
              onClick={() => {
                setBookingStep('datos');
                setReservaResult(null);
              }}
            >
              Editar datos
            </Button>
          )}
          <Button
            variant="primary"
            type="submit"
            disabled={submittingReserva || verificationLoading || needsAnotherSlot}
          >
            {submittingReserva
              ? 'Reservando…'
              : verificationLoading
                ? 'Enviando código…'
                : retryableConflict
                  ? 'Reintentar reserva'
                  : bookingStep === 'revision'
                    ? 'Confirmar reserva'
                    : hasValidEmailAuth
                      ? 'Revisar reserva'
                      : 'Verificar correo y continuar'}
          </Button>
        </div>
      </form>
    );

  return (
    <div className="patient-portal">
      <div className="patient-heading no-print">
        <div>
          <h1>
            {isLookupTab ? (
              'Consulta tus citas.'
            ) : activeView === 'horarios' ? (
              <>
                Tu próxima hora,
                <br />
                aquí.
              </>
            ) : successful ? (
              'Tu hora está reservada.'
            ) : bookingStep === 'verificacion' ? (
              'Verifica tu correo.'
            ) : bookingStep === 'revision' ? (
              'Revisa tu reserva.'
            ) : (
              'Tus datos, para continuar.'
            )}
          </h1>
          <p>
            {isLookupTab
              ? 'Ingresa tu RUT y correo verificado para revisar tus horas médicas y su estado.'
              : activeView === 'horarios'
                ? 'Elige profesional, fecha y horario de atención.'
                : successful
                  ? 'Conserva este comprobante para tu atención.'
                  : bookingStep === 'verificacion'
                    ? 'Ingresa el código de 6 dígitos enviado a tu correo antes de confirmar.'
                    : 'La hora quedará reservada cuando confirmes.'}
          </p>
        </div>
      </div>

      <nav className="patient-tabs no-print" aria-label="Secciones del portal del paciente">
        <div className="filter-tabs">
          {[
            { id: 'reservar', label: 'Reservar hora' },
            { id: 'mis-citas', label: 'Consultar mis citas' },
          ].map((tab) => {
            const selected = (isLookupTab ? 'mis-citas' : 'reservar') === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selected}
                disabled={submittingReserva}
                onClick={() => setPortalTab(tab.id)}
              >
                {tab.label}
                {selected && (
                  <motion.span
                    className="nav-active-indicator"
                    layoutId="patient-portal-tab-indicator"
                    initial={false}
                    transition={reduceMotion ? { duration: 0 } : SPRING_CRISP}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {!isLookupTab && (
        <div className="booking-steps-wrap no-print">
          <motion.span
            className="booking-progress"
            aria-hidden="true"
            initial={false}
            animate={{ scaleX: stage / 2 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: EASE_OUT_QUART }}
          />
          <ol className="booking-steps" aria-label="Etapas de reserva">
            {['Profesional', 'Fecha y hora', 'Datos y reserva'].map((label, index) => (
              <li
                key={label}
                aria-current={stage === index ? 'step' : undefined}
                data-completed={index < stage ? 'true' : undefined}
              >
                <span>{index < stage ? <Check size={14} aria-hidden="true" /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      )}

      {isLookupTab ? (
        <motion.div
          key="mis-citas"
          variants={stageVariants}
          initial={reduceMotion ? false : 'initial'}
          animate="animate"
        >
          <MisCitas onGoToBooking={() => setPortalTab('reservar')} />
        </motion.div>
      ) : activeView === 'horarios' ? (
        <motion.div
          key="horarios"
          variants={stageVariants}
          initial={reduceMotion ? false : 'initial'}
          animate="animate"
        >
          {catalogosLoading ? (
            <p className="loading-state" role="status">
              Cargando especialidades y profesionales…
            </p>
          ) : catalogosError ? (
            <Alert>
              {catalogosError}
              <Button onClick={retryCatalogos}>Reintentar</Button>
            </Alert>
          ) : especialidades.length === 0 ? (
            <EmptyState
              title="No hay especialidades para consultar"
              action={<Button onClick={retryCatalogos}>Recargar catálogo</Button>}
            >
              Vuelve a consultar el catálogo para buscar una hora.
            </EmptyState>
          ) : (
            <>
              <div className="patient-search-layout">
                <aside className="professional-context">
                  <h2>Tu atención</h2>
                  <Field id="patient-specialty" label="Especialidad">
                    <select
                      id="patient-specialty"
                      value={selectedEsp}
                      onChange={(event) => setSelectedEsp(event.target.value)}
                    >
                      <option value="">Todas las especialidades</option>
                      {especialidades.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="patient-doctor" label="Profesional">
                    <select
                      id="patient-doctor"
                      value={selectedMedico}
                      onChange={(event) => setSelectedMedico(event.target.value)}
                      disabled={!medicosFiltrados.length}
                    >
                      <option value="">Cualquier profesional</option>
                      {medicosFiltrados.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.nombre}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="patient-period" label="Jornada">
                    <select
                      id="patient-period"
                      value={selectedJornada}
                      onChange={(event) => setSelectedJornada(event.target.value)}
                    >
                      <option value="TODAS">Todas las jornadas</option>
                      <option value="MANANA">Mañana (antes de las 12:00)</option>
                      <option value="TARDE">Tarde (desde las 12:00)</option>
                    </select>
                  </Field>
                  {currentDoctor ? (
                    <motion.div
                      key={currentDoctor.id}
                      className="professional-caption"
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT_QUART }}
                    >
                      <DoctorPhoto
                        url={currentDoctor.foto_url}
                        name={currentDoctor.nombre}
                        className="doctor-photo-md"
                      />
                      <div>
                        <h3>{currentDoctor.nombre}</h3>
                        <p>{currentDoctor.especialidad_nombre}</p>
                        <p>{currentDoctor.box_atencion}</p>
                      </div>
                    </motion.div>
                  ) : (
                    <p className="muted">Compara los horarios de los profesionales disponibles.</p>
                  )}
                </aside>
                <section
                  className="availability"
                  aria-labelledby="availability-title"
                  aria-busy={loadingDisp}
                >
                  <div className="date-heading">
                    <h2 id="availability-title">
                      {new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(
                        new Date(`${selectedFecha}T12:00:00`),
                      )}
                    </h2>
                    <Field id="patient-date" label="Fecha de atención">
                      <input
                        id="patient-date"
                        type="date"
                        value={selectedFecha}
                        min={today}
                        required
                        onChange={(event) => {
                          if (event.target.value) setSelectedFecha(event.target.value);
                        }}
                      />
                    </Field>
                  </div>
                  <div className="date-strip" aria-label="Elegir día">
                    {dates.map((date) => (
                      <button
                        type="button"
                        key={date.iso}
                        className="date-option"
                        aria-pressed={date.iso === selectedFecha}
                        aria-label={formatDate(date.iso)}
                        onClick={() => setSelectedFecha(date.iso)}
                      >
                        {date.iso === selectedFecha && (
                          <motion.span
                            className="date-selection-indicator"
                            layoutId="patient-date-selection"
                            initial={false}
                            transition={reduceMotion ? { duration: 0 } : SPRING_CRISP}
                            aria-hidden="true"
                          />
                        )}
                        <span className="date-weekday">{date.weekday}</span>
                        <strong>{date.day}</strong>
                      </button>
                    ))}
                  </div>
                  {loadingDisp ? (
                    <p className="loading-state" role="status">
                      Consultando horarios…
                    </p>
                  ) : availabilityError ? (
                    <Alert>
                      {availabilityError}
                      <Button onClick={() => fetchDisponibilidad()}>Reintentar</Button>
                    </Alert>
                  ) : !medicosFiltrados.length ? (
                    <EmptyState title="No hay profesionales en esta especialidad">
                      Selecciona otra especialidad para consultar horarios.
                    </EmptyState>
                  ) : !disponibilidad.bloques?.length ? (
                    <EmptyState
                      title="No hay horas para esta fecha"
                      action={
                        hasActiveFilters ? (
                          <Button onClick={resetPatientFilters}>Limpiar filtros</Button>
                        ) : null
                      }
                    >
                      Prueba otro día o consulta con cualquier profesional.
                    </EmptyState>
                  ) : !visibleGroupedBlocks.length ? (
                    <EmptyState
                      title="No hay horas en la jornada seleccionada"
                      action={
                        <Button onClick={() => setSelectedJornada('TODAS')}>
                          Ver todas las jornadas
                        </Button>
                      }
                    >
                      Prueba con otra jornada o selecciona otro día.
                    </EmptyState>
                  ) : (
                    <motion.div
                      className="availability-groups"
                      key={`${selectedFecha}-${selectedEsp}-${selectedMedico}-${selectedJornada}`}
                      variants={staggerContainerVariants}
                      initial={reduceMotion ? false : 'hidden'}
                      animate="visible"
                    >
                      {visibleGroupedBlocks.map(([group, blocks]) => (
                        <motion.section
                          className="slot-group"
                          key={group}
                          aria-label={group}
                          variants={staggerItemVariants}
                        >
                          <div className="slot-group-heading">
                            <div className="slot-doctor-info">
                              <DoctorPhoto
                                url={blocks[0].foto_url}
                                name={blocks[0].medico_nombre}
                                className="doctor-photo-md"
                              />
                              <div>
                                <h3>{blocks[0].medico_nombre}</h3>
                                <p>
                                  {blocks[0].especialidad_nombre}
                                  {blocks[0].box_atencion ? ` · ${blocks[0].box_atencion}` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="muted">
                              {group.endsWith('· Mañana') ? 'Mañana' : 'Tarde'}
                            </span>
                          </div>
                          <div className="time-slots">
                            {blocks.map((block, index) => (
                              <button
                                key={block.agenda_id}
                                type="button"
                                className="time-slot"
                                style={{ '--slot-delay': `${Math.min(index, 5) * 25}ms` }}
                                aria-pressed={selectedBloque?.agenda_id === block.agenda_id}
                                aria-label={`${block.hora_inicio}, ${block.medico_nombre}, ${block.duracion_min} minutos`}
                                aria-haspopup="dialog"
                                onClick={(event) => {
                                  bookingOpenerRef.current = event.currentTarget;
                                  if (selectedBloque?.agenda_id !== block.agenda_id) {
                                    resetRequestKey();
                                    setSelectedBloque(block);
                                    setReservaResult(null);
                                    setBookingStep('datos');
                                  }
                                  setBookingOpen(true);
                                }}
                              >
                                <span>{block.hora_inicio}</span>
                                {selectedBloque?.agenda_id === block.agenda_id && (
                                  <motion.span
                                    className="time-slot-check"
                                    initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                                  >
                                    <Check size={16} aria-hidden="true" />
                                  </motion.span>
                                )}
                              </button>
                            ))}
                          </div>
                          {selectedBloque &&
                            blocks.some(
                              (block) => block.agenda_id === selectedBloque.agenda_id,
                            ) && (
                              <div
                                className="slot-selection"
                                role="region"
                                aria-label="Hora seleccionada"
                                hidden={bookingOpen}
                              >
                                <div>
                                  <strong>{selectedBloque.medico_nombre}</strong>
                                  <p>
                                    {formatDate(selectedBloque.fecha || selectedFecha)} ·{' '}
                                    <span className="numeric">{selectedBloque.hora_inicio}</span>
                                  </p>
                                </div>
                                <Button
                                  variant="primary"
                                  aria-haspopup="dialog"
                                  onClick={(event) => {
                                    bookingOpenerRef.current = event.currentTarget;
                                    setBookingOpen(true);
                                  }}
                                >
                                  Completar reserva
                                </Button>
                              </div>
                            )}
                        </motion.section>
                      ))}
                    </motion.div>
                  )}
                  <p className="field-hint">
                    Horarios de Santiago de Chile. La duración se muestra al elegir una hora.
                  </p>
                </section>
              </div>
            </>
          )}
        </motion.div>
      ) : successful ? (
        <motion.div
          key="comprobante"
          variants={stageVariants}
          initial={reduceMotion ? false : 'initial'}
          animate="animate"
        >
          <section className="booking-receipt printable-receipt" aria-labelledby="receipt-title">
            <div className="receipt-header-row">
              <div className="receipt-check-icon" aria-hidden="true">
                <motion.svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <motion.path
                    d="M20 6L9 17L4 12"
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                  />
                </motion.svg>
              </div>
              <h2 id="receipt-title" ref={headingRef} tabIndex={-1}>
                Comprobante de reserva
              </h2>
            </div>
            <Alert tone="success">Reserva confirmada</Alert>
            <div className="reservation-code">
              <div>
                <span>Código de reserva</span>
                <strong>{reservaResult.data.reserva.codigo_reserva}</strong>
              </div>
              <Button
                className="no-print"
                onClick={() => copyCode(reservaResult.data.reserva.codigo_reserva)}
              >
                <Copy size={16} aria-hidden="true" />
                {copied ? 'Copiado' : 'Copiar código'}
              </Button>
            </div>
            <AppointmentDetails appointment={reservaResult.data.reserva} />
            <p>
              Se solicitó el envío del comprobante a <strong>{pacienteEmail}</strong>.
            </p>
            {copyError && <Alert>{copyError}</Alert>}
            <div className="form-actions no-print">
              <Button onClick={() => window.print()}>
                <Printer size={17} aria-hidden="true" />
                Imprimir comprobante
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  changeHour();
                  setPacienteRut('');
                  setPacienteNombre('');
                  setPacienteEmail('');
                  setPacienteTelefono('+569');
                  setCopied(false);
                }}
              >
                Reservar otra hora
              </Button>
            </div>
          </section>
        </motion.div>
      ) : (
        <motion.div
          key="formulario"
          variants={stageVariants}
          initial={reduceMotion ? false : 'initial'}
          animate="animate"
        >
          <section className="booking-form" aria-labelledby="patient-data-title">
            <div className="section-heading">
              <h2 id="patient-data-title" ref={headingRef} tabIndex={-1}>
                {bookingStep === 'verificacion'
                  ? 'Verificación de correo electrónico'
                  : bookingStep === 'revision'
                    ? 'Revisión de la reserva'
                    : 'Datos del paciente'}
              </h2>
              <Button
                disabled={submittingReserva || verificationLoading}
                onClick={() => changeHour(true)}
              >
                Cambiar hora
              </Button>
            </div>
            {selectedBloque && (
              <AppointmentDetails
                appointment={{ ...selectedBloque, fecha: selectedBloque.fecha || selectedFecha }}
                showPhoto
              />
            )}
            {bookingForm}
          </section>
        </motion.div>
      )}
      <Dialog
        open={!isLookupTab && bookingOpen && activeView === 'horarios' && Boolean(selectedBloque)}
        className="booking-dialog"
        title="Completa tus datos"
        onClose={() => setBookingOpen(false)}
        returnFocusRef={bookingOpenerRef}
        busy={submittingReserva}
      >
        {selectedBloque && (
          <BookingAppointmentSummary
            appointment={{ ...selectedBloque, fecha: selectedBloque.fecha || selectedFecha }}
          />
        )}
        <p className="muted booking-dialog-note">
          Revisa el horario seleccionado y completa tus datos para continuar con la reserva.
        </p>
        {bookingForm}
      </Dialog>
    </div>
  );
}
