import React, { useCallback, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  User,
} from 'lucide-react';
import { formatRutInput } from '../../utils/rut.js';
import { onlyMobileSubscriberDigits, parseChileanMobileDigits } from '../../utils/phone.js';

export default function PatientPortal({ state, actions }) {
  const {
    availabilityError,
    bookingStep,
    disponibilidad,
    fieldTouched,
    groupedBlocks,
    loadingDisp,
    medicosFiltrados,
    pacienteEmail,
    pacienteNombre,
    pacienteRut,
    pacienteTelefono,
    reservaResult,
    rutCheck,
    selectedBloque,
    selectedEsp,
    selectedFecha,
    selectedMedico,
    especialidades,
    submittingReserva,
    reservationFieldErrors,
  } = state;
  const {
    fetchDisponibilidad,
    handleReservarSubmit,
    resetRequestKey,
    setBookingStep,
    setFieldTouched,
    setPacienteEmail,
    setPacienteNombre,
    setPacienteRut,
    setPacienteTelefono,
    setReservaResult,
    setSelectedBloque,
    setSelectedEsp,
    setSelectedFecha,
    setSelectedMedico,
  } = actions;

  const bookingFormRef = useRef(null);
  const bookingHeadingRef = useRef(null);
  const shouldScrollToBookingRef = useRef(false);

  const scrollToBookingForm = useCallback(() => {
    const formSection = bookingFormRef.current;
    if (!formSection) return;

    const prefersReducedMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    formSection.scrollIntoView?.({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    bookingHeadingRef.current?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!selectedBloque || !shouldScrollToBookingRef.current) return;

    shouldScrollToBookingRef.current = false;
    scrollToBookingForm();
  }, [selectedBloque, scrollToBookingForm]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-r from-teal-950 via-teal-900 to-emerald-900 p-6 text-white shadow-lg shadow-teal-950/10 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-1/3 -z-10 h-64 w-64 rounded-full bg-teal-300/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-teal-100">
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
            Atención médica, más simple
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Reserva tu hora</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-teal-100 sm:text-base">
          Elige un horario, completa tus datos y confirma tu reserva.
          </p>
        </div>
        <ol aria-label="Pasos de la reserva" className="relative mt-7 flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          {['Elegir hora', 'Tus datos', 'Revisar y reservar'].map((step, index) => (
            <li
              key={step}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 transition ${index === (selectedBloque ? (bookingStep === 'datos' ? 1 : 2) : 0) ? 'border-white bg-white text-teal-950 shadow-sm' : 'border-white/15 bg-white/5 text-teal-100'}`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${index === (selectedBloque ? (bookingStep === 'datos' ? 1 : 2) : 0) ? 'bg-teal-700 text-white' : 'bg-white/10 text-white'}`}>
                {index + 1}
              </span>
              <span className="font-semibold">{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Columna Izquierda: Filtros A-01 (MED-9) */}
        <section className="h-fit rounded-2xl border border-teal-200 bg-teal-100/70 p-5 shadow-md shadow-teal-950/5 sm:p-6 lg:sticky lg:top-28">
          <div className="-mx-5 -mt-5 mb-5 rounded-t-2xl border-b border-teal-100 bg-gradient-to-br from-teal-100/90 to-teal-50/60 p-5 sm:-mx-6 sm:-mt-6 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-teal-700 shadow-sm ring-1 ring-teal-100">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </span>
                Encuentra tu consulta
              </span>
              <span className="rounded-full border border-teal-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 shadow-sm">
                Paso 1 de 3
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Elige tu hora</h2>
            <p className="mt-1.5 text-sm leading-5 text-slate-500">
              Filtra por especialidad, profesional y fecha para ver los cupos disponibles.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="patient-specialty" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Especialidad Médica
              </label>
              <div className="relative">
                <Stethoscope className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <select
                  id="patient-specialty"
                  value={selectedEsp}
                  onChange={(e) => {
                    resetRequestKey();
                    setSelectedEsp(e.target.value);
                    setSelectedMedico('');
                    setSelectedBloque(null);
                    setReservaResult(null);
                  }}
                  className="min-h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                >
                  <option value="">Todas las especialidades</option>
                  {especialidades.map((esp) => (
                    <option key={esp.id} value={esp.id}>
                      {esp.nombre} ({esp.total_medicos} especialistas)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="patient-doctor" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Profesional ({medicosFiltrados.length} disponibles)
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <select
                  id="patient-doctor"
                  value={selectedMedico}
                  onChange={(e) => {
                    resetRequestKey();
                    setSelectedMedico(e.target.value);
                    setSelectedBloque(null);
                    setReservaResult(null);
                  }}
                  className="min-h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                >
                  <option value="">Cualquiera</option>
                  {medicosFiltrados.map((med) => (
                    <option key={med.id} value={med.id}>
                      {med.nombre} — {med.especialidad_nombre} ({med.box_atencion})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="patient-date" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Fecha
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="patient-date"
                  type="date"
                  value={selectedFecha}
                  onChange={(e) => {
                    resetRequestKey();
                    setSelectedFecha(e.target.value);
                    setSelectedBloque(null);
                    setReservaResult(null);
                  }}
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={fetchDisponibilidad}
              className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 active:scale-[0.99]"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Buscar horarios
            </button>
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
              La reserva se confirma en el siguiente paso.
            </p>
          </div>
        </section>

        {/* Columna Central/Derecha: Grilla de Horarios A-02 y Formulario A-03..A-06 */}
        <section className="space-y-6 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-teal-200 bg-teal-100/70 shadow-md shadow-teal-950/5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-teal-100 bg-teal-100/70 p-5 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <Calendar className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Agenda de atención</p>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">Horarios disponibles</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Elige un bloque que se ajuste a tu día.
                  </p>
                </div>
              </div>
              <div className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold ${loadingDisp ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                {loadingDisp ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-r-transparent" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                {loadingDisp ? 'Buscando cupos…' : `${disponibilidad.total_cupos_libres || 0} cupos disponibles`}
              </div>
            </div>

            {loadingDisp ? (
              <div
                role="status"
                aria-live="polite"
                className="space-y-4 bg-teal-50/70 p-5 text-sm text-slate-500 sm:p-6"
              >
                <p className="text-center font-medium text-slate-600">
                  Estamos consultando la agenda para esta fecha.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
                      <div className="h-4 w-2/3 rounded bg-slate-200" />
                      <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
            ) : availabilityError ? (
              <div
                role="alert"
                className="mx-5 my-5 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center sm:mx-6 sm:my-6"
              >
                <AlertCircle className="mx-auto mb-2 h-6 w-6 text-rose-600" aria-hidden="true" />
                <p className="font-semibold text-rose-900">No pudimos cargar la información</p>
                <p className="mt-1 text-sm text-rose-800">{availabilityError}</p>
                <button
                  type="button"
                  onClick={fetchDisponibilidad}
                  className="mt-4 min-h-11 rounded-xl bg-teal-700 px-4 font-semibold text-white shadow-sm transition hover:bg-teal-800"
                >
                  Reintentar
                </button>
              </div>
            ) : disponibilidad.bloques?.length === 0 ? (
              <div className="mx-5 my-5 rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-8 text-center sm:mx-6 sm:my-6">
                <Calendar className="mx-auto mb-2 h-6 w-6 text-amber-700" aria-hidden="true" />
                <p className="font-semibold text-amber-950">
                  {medicosFiltrados.length === 0
                    ? 'No hay profesionales disponibles'
                    : 'No hay horas para esta fecha'}
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {medicosFiltrados.length === 0
                    ? 'Prueba otra especialidad.'
                    : 'Prueba otra fecha o quita el filtro de profesional.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6 bg-teal-50/60 p-5 sm:p-6">
                {Object.entries(groupedBlocks).map(([group, blocks]) => {
                  const period = group.endsWith('· Mañana') ? 'Mañana' : 'Tarde';
                  const doctorName = group.replace(/ · (Mañana|Tarde)$/, '');

                  return (
                    <section key={group} aria-label={`Horarios de ${group}`}>
                      <div className="mb-3 flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                          <User className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-slate-800">{doctorName}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {blocks.length} {blocks.length === 1 ? 'horario' : 'horarios'}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${period === 'Mañana' ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100'}`}>
                          {period}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {blocks.map((b) => {
                          const isSelected = selectedBloque?.agenda_id === b.agenda_id;
                          return (
                            <button
                              key={b.agenda_id}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => {
                                resetRequestKey();
                                if (selectedBloque?.agenda_id === b.agenda_id) {
                                  shouldScrollToBookingRef.current = false;
                                  scrollToBookingForm();
                                } else {
                                  shouldScrollToBookingRef.current = true;
                                }
                                setSelectedBloque(b);
                                setReservaResult(null);
                                setBookingStep('datos');
                              }}
                              className={`group w-full rounded-2xl border p-4 text-left shadow-sm transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/15 ${
                                isSelected
                                  ? 'border-teal-600 bg-teal-50/70 ring-2 ring-teal-600/15'
                                  : 'border-slate-200 bg-white hover:border-teal-400 hover:bg-teal-50/30 hover:shadow-md'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-base font-bold tabular-nums text-slate-900">
                                  <Clock className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                                  {b.hora_inicio} – {b.hora_fin}
                                </span>
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                                  {b.duracion_min} min
                                </span>
                              </div>
                              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                                    <Stethoscope className="h-4 w-4" aria-hidden="true" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-800">{b.medico_nombre}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{b.especialidad_nombre}</p>
                                  </div>
                                </div>
                                {isSelected ? (
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-700" aria-hidden="true" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {/* Formulario de Reserva Web con Validación de RUT (MED-11 / CU-02) */}
          {selectedBloque && (
            <div
              ref={bookingFormRef}
              className="scroll-mt-24 overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-white p-5 sm:p-6">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                    Detalles de tu cita
                  </div>
                  <h3
                    ref={bookingHeadingRef}
                    tabIndex={-1}
                    className="text-lg font-bold tracking-tight text-slate-900 focus:outline-none"
                  >
                    {bookingStep === 'revision'
                      ? 'Revisa tu reserva'
                      : bookingStep === 'confirmacion'
                        ? 'Reserva confirmada'
                        : 'Tus datos'}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {new Date(`${selectedBloque.fecha}T12:00:00`).toLocaleDateString('es-CL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}{' '}
                    ·{' '}
                    <strong>
                      {selectedBloque.hora_inicio} a {selectedBloque.hora_fin}
                    </strong>{' '}
                    con <strong>{selectedBloque.medico_nombre}</strong> (
                    {selectedBloque.especialidad_nombre})
                  </p>
                </div>
              </div>

              {bookingStep === 'revision' && (
                <div className="mx-5 mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950 sm:mx-6">
                  <p className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Comprueba tus datos antes de reservar
                  </p>
                  <p className="mt-2">
                    {pacienteNombre} · RUT {pacienteRut}
                  </p>
                  <p>
                    {pacienteEmail} · {pacienteTelefono}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setBookingStep('datos');
                      setReservaResult(null);
                    }}
                    className="mt-2 min-h-11 font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4"
                  >
                    Editar mis datos
                  </button>
                </div>
              )}

              {bookingStep !== 'confirmacion' && (
                <form
                  onSubmit={handleReservarSubmit}
                  className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6"
                >
                  <div>
                    <label
                      htmlFor="patient-rut"
                      className="mb-1.5 block text-sm font-semibold text-slate-700"
                    >
                      RUT *
                    </label>
                    <div className="relative">
                      <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        id="patient-rut"
                        type="text"
                        required
                        autoComplete="off"
                        aria-invalid={Boolean(
                          (fieldTouched.rut && rutCheck && !rutCheck.valid) ||
                          reservationFieldErrors.paciente_rut,
                        )}
                        aria-describedby={
                          [
                            fieldTouched.rut && rutCheck ? 'patient-rut-local-error' : null,
                            reservationFieldErrors.paciente_rut ? 'patient-rut-server-error' : null,
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                        placeholder="Ej: 12.345.678-5"
                        value={pacienteRut}
                        readOnly={bookingStep === 'revision'}
                        onBlur={() => setFieldTouched({ ...fieldTouched, rut: true })}
                        onChange={(e) => {
                          setPacienteRut(formatRutInput(e.target.value));
                          setFieldTouched({ ...fieldTouched, rut: true });
                          setReservaResult(null);
                        }}
                        className={`min-h-12 w-full rounded-xl border bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:outline-none focus:ring-4 focus:ring-teal-600/10 ${
                          rutCheck
                            ? rutCheck.valid
                              ? 'border-emerald-500 bg-emerald-50/30 focus:border-emerald-500'
                              : 'border-rose-500 bg-rose-50/30 focus:border-rose-500 focus:ring-rose-500/10'
                            : 'border-slate-200 focus:border-teal-600'
                        }`}
                      />
                    </div>
                    {rutCheck && fieldTouched.rut && (
                      <p
                        id="patient-rut-local-error"
                        className={`text-[11px] mt-1 font-medium ${
                          rutCheck.valid ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {rutCheck.message}
                      </p>
                    )}
                    {reservationFieldErrors.paciente_rut && (
                      <p
                        id="patient-rut-server-error"
                        role="alert"
                        className="mt-1 text-xs font-medium text-rose-800"
                      >
                        {reservationFieldErrors.paciente_rut}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="patient-name"
                      className="mb-1.5 block text-sm font-semibold text-slate-700"
                    >
                      Nombre completo *
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        id="patient-name"
                        type="text"
                        required
                        aria-invalid={Boolean(reservationFieldErrors.paciente_nombre)}
                        aria-describedby={
                          reservationFieldErrors.paciente_nombre ? 'patient-name-error' : undefined
                        }
                        placeholder="Nombre y Apellidos"
                        value={pacienteNombre}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => {
                          setPacienteNombre(e.target.value);
                          setReservaResult(null);
                        }}
                        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      />
                    </div>
                    {reservationFieldErrors.paciente_nombre && (
                      <p
                        id="patient-name-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-800"
                      >
                        {reservationFieldErrors.paciente_nombre}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="patient-email"
                      className="mb-1.5 block text-sm font-semibold text-slate-700"
                    >
                      Correo electrónico *
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        id="patient-email"
                        type="email"
                        required
                        autoComplete="email"
                        aria-invalid={Boolean(reservationFieldErrors.paciente_email)}
                        aria-describedby={
                          reservationFieldErrors.paciente_email ? 'patient-email-error' : undefined
                        }
                        placeholder="nombre@ejemplo.cl"
                        value={pacienteEmail}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => {
                          setPacienteEmail(e.target.value);
                          setReservaResult(null);
                        }}
                        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      />
                    </div>
                    {reservationFieldErrors.paciente_email && (
                      <p
                        id="patient-email-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-800"
                      >
                        {reservationFieldErrors.paciente_email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="patient-phone"
                      className="mb-1.5 block text-sm font-semibold text-slate-700"
                    >
                      Teléfono móvil *
                    </label>
                    <div className="relative mt-1 flex min-h-12 items-center rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-600/10">
                      <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <span className="ml-10 border-r border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600">
                        +569
                      </span>
                      <input
                        id="patient-phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        inputMode="numeric"
                        maxLength={8}
                        pattern="[0-9]{8}"
                        title="Ingresa exactamente 8 dígitos después del prefijo +569."
                        aria-invalid={Boolean(reservationFieldErrors.paciente_telefono)}
                        aria-describedby={
                          reservationFieldErrors.paciente_telefono ? 'patient-phone-error' : undefined
                        }
                        placeholder="12345678"
                        value={
                          pacienteTelefono.startsWith('+569')
                            ? pacienteTelefono.slice(4)
                            : onlyMobileSubscriberDigits(pacienteTelefono)
                        }
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => {
                          setPacienteTelefono(`+569${onlyMobileSubscriberDigits(e.target.value)}`);
                          setReservaResult(null);
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          setPacienteTelefono(
                            `+569${parseChileanMobileDigits(e.clipboardData.getData('text'))}`,
                          );
                          setReservaResult(null);
                        }}
                        className="min-h-12 min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2 text-sm tracking-wide focus:outline-none"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Prefijo +569 fijo · ingresa los 8 dígitos restantes.
                    </p>
                    {reservationFieldErrors.paciente_telefono && (
                      <p
                        id="patient-phone-error"
                        role="alert"
                        className="mt-1 text-xs text-rose-800"
                      >
                        {reservationFieldErrors.paciente_telefono}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-100 pt-4 sm:col-span-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => {
                        resetRequestKey();
                        setSelectedBloque(null);
                        setReservaResult(null);
                        setBookingStep('datos');
                      }}
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cambiar hora
                    </button>
                    <button
                      type="submit"
                      disabled={submittingReserva}
                      className="min-h-11 rounded-xl bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submittingReserva
                        ? 'Procesando reserva…'
                        : bookingStep === 'revision'
                          ? 'Reservar'
                          : 'Continuar'}
                    </button>
                  </div>
                </form>
              )}

              {/* Resultado A-05 (Éxito) o A-06 (Rechazo) */}
              {reservaResult && (
                <div
                  className={`mx-5 mb-5 overflow-hidden rounded-2xl border sm:mx-6 ${
                    reservaResult.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-rose-200 bg-rose-50 text-rose-950'
                  }`}
                >
                  {reservaResult.type === 'success' ? (
                    <div className="p-5 sm:p-6">
                      <div className="mb-4 flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                        </span>
                        <div>
                          <h4 className="text-xl font-bold tracking-tight">Tu hora está reservada</h4>
                          <p className="mt-1 text-sm text-emerald-800">Te enviaremos el comprobante con los detalles.</p>
                        </div>
                      </div>
                      <p className="rounded-xl border border-dashed border-emerald-300 bg-white/70 px-4 py-3 text-sm">
                        Código de reserva:{' '}
                        <strong className="font-mono font-bold tracking-wide">
                          {reservaResult.data.reserva.codigo_reserva}
                        </strong>
                      </p>
                      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div className="rounded-lg bg-white/60 p-3">
                          <dt className="font-semibold">Profesional</dt>
                          <dd>{reservaResult.data.reserva.medico_nombre}</dd>
                        </div>
                        <div className="rounded-lg bg-white/60 p-3">
                          <dt className="font-semibold">Especialidad</dt>
                          <dd>{reservaResult.data.reserva.especialidad_nombre}</dd>
                        </div>
                        <div className="rounded-lg bg-white/60 p-3">
                          <dt className="font-semibold">Fecha y hora</dt>
                          <dd>
                            {reservaResult.data.reserva.fecha} ·{' '}
                            {reservaResult.data.reserva.hora_inicio}–
                            {reservaResult.data.reserva.hora_fin}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-white/60 p-3">
                          <dt className="font-semibold">Lugar</dt>
                          <dd>{reservaResult.data.reserva.box_atencion}</dd>
                        </div>
                      </dl>
                      <p className="mt-4 text-sm leading-6">
                        El comprobante quedó en cola para enviarse a{' '}
                        <strong>{pacienteEmail}</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          resetRequestKey();
                          setSelectedBloque(null);
                          setReservaResult(null);
                          setBookingStep('datos');
                          setPacienteRut('');
                          setPacienteNombre('');
                          setPacienteEmail('');
                          setPacienteTelefono('+569');
                        }}
                        className="mt-4 min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
                      >
                        Reservar otra hora
                      </button>
                    </div>
                  ) : (
                    <div className="p-5 sm:p-6">
                      <h4 className="flex items-center gap-2 font-bold">
                        <AlertCircle className="h-5 w-5" aria-hidden="true" />
                        No se pudo completar la reserva
                      </h4>
                      <p role="alert" className="mt-1 text-sm">
                        {reservaResult.data.mensaje ||
                          reservaResult.data.error ||
                          'Revisa la información e intenta nuevamente.'}
                      </p>
                      {reservaResult.status === 409 && (
                        <button
                          type="button"
                          onClick={() => {
                            resetRequestKey();
                            setReservaResult(null);
                            setSelectedBloque(null);
                            setBookingStep('datos');
                            fetchDisponibilidad();
                          }}
                          className="mt-3 min-h-11 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100"
                        >
                          Elegir otra hora
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
