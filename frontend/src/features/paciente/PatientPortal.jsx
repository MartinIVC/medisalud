import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Printer } from 'lucide-react';
import DoctorPhoto from '../../components/DoctorPhoto.jsx';
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
    resetRequestKey,
    retryCatalogos,
  } = actions;
  const [view, setView] = useState(() =>
    submittingReserva || reservaResult || bookingStep === 'revision' ? 'reserva' : 'horarios',
  );
  const [bookingOpen, setBookingOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const headingRef = useRef(null);
  const bookingOpenerRef = useRef(null);
  const dates = useMemo(() => nextDates(selectedFecha, today), [selectedFecha, today]);
  const currentDoctor = medicosFiltrados.find((doctor) => String(doctor.id) === selectedMedico);
  // Reservation progress belongs to the persistent hook, including across portal navigation.
  const activeView =
    submittingReserva || reservaResult || bookingStep === 'revision'
      ? 'reserva'
      : selectedBloque
        ? view
        : 'horarios';
  const stage =
    activeView === 'reserva' ? 2 : selectedEsp || selectedMedico || selectedBloque ? 1 : 0;
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
  }, [activeView, bookingStep]);

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

  const bookingForm = (
    <form onSubmit={submitBooking}>
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
      {reservaResult?.type === 'error' && (
        <Alert>
          {retryableConflict
            ? 'No pudimos confirmar este horario. Puedes reintentar sin volver a ingresar tus datos.'
            : reservaResult.data.mensaje ||
              reservaResult.data.error ||
              'No pudimos completar la reserva.'}
          {needsAnotherSlot && (
            <>
              <p>Elige otro horario. Conservamos tus datos.</p>
              <Button onClick={changeHour}>Elegir otra hora</Button>
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
        <Button variant="primary" type="submit" disabled={submittingReserva || needsAnotherSlot}>
          {submittingReserva
            ? 'Reservando…'
            : retryableConflict
              ? 'Reintentar reserva'
              : bookingStep === 'revision'
                ? 'Confirmar reserva'
                : 'Revisar reserva'}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="patient-portal">
      <div className="patient-heading no-print">
        <div>
          <h1>
            {activeView === 'horarios' ? (
              <>
                Tu próxima hora,
                <br />
                aquí.
              </>
            ) : successful ? (
              'Tu hora está reservada.'
            ) : bookingStep === 'revision' ? (
              'Revisa tu reserva.'
            ) : (
              'Tus datos, para continuar.'
            )}
          </h1>
          <p>
            {activeView === 'horarios'
              ? 'Elige profesional, fecha y horario de atención.'
              : successful
                ? 'Conserva este comprobante para tu atención.'
                : 'La hora quedará reservada cuando confirmes.'}
          </p>
        </div>
      </div>
      <ol className="booking-steps no-print" aria-label="Etapas de reserva">
        {['Profesional', 'Fecha y hora', 'Datos y reserva'].map((label, index) => (
          <li key={label} aria-current={stage === index ? 'step' : undefined}>
            <span>{index < stage ? <Check size={14} aria-hidden="true" /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {activeView === 'horarios' ? (
        <>
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
                  {currentDoctor ? (
                    <div className="professional-caption">
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
                    </div>
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
                        <span>{date.weekday}</span>
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
                    <EmptyState title="No hay horas para esta fecha">
                      Prueba otro día o consulta con cualquier profesional.
                    </EmptyState>
                  ) : (
                    <div className="availability-groups">
                      {Object.entries(groupedBlocks).map(([group, blocks]) => (
                        <section className="slot-group" key={group} aria-label={group}>
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
                            {blocks.map((block) => (
                              <button
                                key={block.agenda_id}
                                type="button"
                                className="time-slot"
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
                                  <Check size={16} aria-hidden="true" />
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
                        </section>
                      ))}
                    </div>
                  )}
                  <p className="field-hint">
                    Horarios de Santiago de Chile. La duración se muestra al elegir una hora.
                  </p>
                </section>
              </div>
            </>
          )}
        </>
      ) : successful ? (
        <section className="booking-receipt printable-receipt" aria-labelledby="receipt-title">
          <h2 id="receipt-title" ref={headingRef} tabIndex={-1}>
            Comprobante de reserva
          </h2>
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
            El comprobante quedó en cola para enviarse a <strong>{pacienteEmail}</strong>.
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
      ) : (
        <section className="booking-form" aria-labelledby="patient-data-title">
          <div className="section-heading">
            <h2 id="patient-data-title" ref={headingRef} tabIndex={-1}>
              {bookingStep === 'revision' ? 'Revisión de la reserva' : 'Datos del paciente'}
            </h2>
            <Button disabled={submittingReserva} onClick={() => changeHour(true)}>
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
      )}
      <Dialog
        open={bookingOpen && activeView === 'horarios' && Boolean(selectedBloque)}
        className="booking-dialog"
        title="Completa tus datos"
        onClose={() => setBookingOpen(false)}
        returnFocusRef={bookingOpenerRef}
        busy={submittingReserva}
      >
        {selectedBloque && (
          <AppointmentDetails
            appointment={{ ...selectedBloque, fecha: selectedBloque.fecha || selectedFecha }}
            showPhoto
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
