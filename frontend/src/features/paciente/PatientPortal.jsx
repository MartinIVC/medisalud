import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  Sunset,
  Ticket,
  User,
  X,
} from 'lucide-react';
import { formatRutInput } from '../../utils/rut.js';
import { onlyMobileSubscriberDigits, parseChileanMobileDigits } from '../../utils/phone.js';

function getDoctorInitials(name = '') {
  const clean = name.replace(/^(dr\.?|dra\.?)\s+/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function buildQuickDates(baseDateStr) {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(),
  );
  const startStr = baseDateStr && baseDateStr < todayStr ? baseDateStr : todayStr;
  const base = new Date(`${startStr}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return [];

  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + idx);
    const iso = d.toISOString().slice(0, 10);
    const weekday = d
      .toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'UTC' })
      .replace('.', '');
    const dayNum = d.toLocaleDateString('es-CL', { day: '2-digit', timeZone: 'UTC' });
    const monthShort = d
      .toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' })
      .replace('.', '');
    return {
      iso,
      weekday,
      dayNum,
      monthShort,
      isToday: iso === todayStr,
    };
  });
}

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

  const [copiedCode, setCopiedCode] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const bookingDialogRef = useRef(null);
  const bookingCloseButtonRef = useRef(null);
  const bookingOpenerRef = useRef(null);

  const quickDates = useMemo(() => buildQuickDates(selectedFecha), [selectedFecha]);

  useEffect(() => {
    if (!selectedBloque || !isBookingOpen) return undefined;

    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.inert ?? false;
    const previousBodyOverflow = document.body.style.overflow;

    if (appRoot) appRoot.inert = true;
    document.body.style.overflow = 'hidden';
    bookingCloseButtonRef.current?.focus({ preventScroll: true });

    return () => {
      if (appRoot) appRoot.inert = rootWasInert;
      document.body.style.overflow = previousBodyOverflow;

      const opener = bookingOpenerRef.current;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [selectedBloque, isBookingOpen]);

  function closeBookingDialog() {
    if (submittingReserva) return;

    setIsBookingOpen(false);
    if (reservaResult?.type === 'success') return;

    resetRequestKey();
    setSelectedBloque(null);
    setReservaResult(null);
    setBookingStep('datos');
  }

  function handleBookingDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeBookingDialog();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = bookingDialogRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      bookingDialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const activeStepIndex = selectedBloque ? (bookingStep === 'datos' ? 1 : 2) : 0;

  function handleCopyCode(code) {
    if (!code || !navigator?.clipboard?.writeText) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2200);
    });
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero Bio-Editorial con Pulso EKG y Telemetría en Vivo */}
      <section className="bg-hero-mesh relative isolate overflow-hidden rounded-3xl border border-teal-800/40 p-6 text-white shadow-clinical-lg sm:p-8 lg:p-10">
        {/* Onda EKG decorativa de fondo */}
        <svg
          aria-hidden="true"
          viewBox="0 0 900 140"
          className="pointer-events-none absolute -bottom-3 right-0 -z-10 h-36 w-full max-w-3xl opacity-25"
          fill="none"
        >
          <path
            d="M0 90 H240 L270 60 L295 115 L325 20 L355 125 L380 75 L405 90 H620 L650 55 L675 110 L705 30 L735 120 L760 85 H900"
            stroke="url(#ekgGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="240 240"
            className="animate-ekg-pulse"
          />
          <defs>
            <linearGradient
              id="ekgGrad"
              x1="0"
              y1="0"
              x2="900"
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0" />
              <stop offset="45%" stopColor="#5eead4" stopOpacity="0.9" />
              <stop offset="85%" stopColor="#34d399" stopOpacity="1" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-950/50 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-emerald-300 backdrop-blur-md">
              <HeartPulse className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>Agenda Ambulatoria Digital · Confirmación Inmediata</span>
            </div>
            <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.65rem] lg:leading-[1.12]">
              Reserva tu hora médica con precisión y sin esperas
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-teal-100/85 sm:text-base">
              Explora la disponibilidad en tiempo real de nuestros especialistas, selecciona el
              bloque que mejor se adapte a tu rutina y obtén tu pase clínico digital al instante.
            </p>
          </div>

          {/* Tarjetas de telemetría rápida */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-md">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-teal-200/80">
                <Calendar className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                Cupos libres
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {loadingDisp ? '…' : disponibilidad.total_cupos_libres || 0}
              </p>
              <span className="mt-0.5 block text-[11px] text-emerald-300/90">Para la fecha</span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-md">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-teal-200/80">
                <Stethoscope className="h-3.5 w-3.5 text-teal-300" aria-hidden="true" />
                Médicos
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {medicosFiltrados.length}
              </p>
              <span className="mt-0.5 block text-[11px] text-teal-200/80">Habilitados</span>
            </div>
          </div>
        </div>

        {/* Riel de progreso de 3 pasos */}
        <div className="mt-7 border-t border-white/10 pt-5">
          <ol
            aria-label="Pasos de la reserva"
            className="flex flex-wrap items-center gap-2 text-sm sm:gap-3"
          >
            {[
              { label: 'Elegir hora', sub: 'Especialidad y bloque' },
              { label: 'Tus datos', sub: 'Ficha del paciente' },
              { label: 'Revisar y reservar', sub: 'Pase confirmado' },
            ].map((step, index) => {
              const isCurrent = index === activeStepIndex;
              const isCompleted =
                index < activeStepIndex || (index === 2 && reservaResult?.type === 'success');
              return (
                <li
                  key={step.label}
                  className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2 transition-all duration-200 ${isCurrent
                      ? 'border-white bg-white text-teal-950 shadow-md shadow-teal-950/20'
                      : isCompleted
                        ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                        : 'border-white/15 bg-white/5 text-teal-100/80'
                    }`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-xl font-mono text-xs font-bold ${isCurrent
                        ? 'bg-teal-800 text-white'
                        : isCompleted
                          ? 'bg-emerald-400 text-teal-950'
                          : 'bg-white/10 text-white'
                      }`}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  <div className="leading-tight">
                    <span className="block font-semibold">{step.label}</span>
                    <span
                      className={`hidden text-[11px] sm:block ${isCurrent ? 'text-teal-700' : 'text-teal-200/70'
                        }`}
                    >
                      {step.sub}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Cinta rápida de especialidades médicas */}
      {especialidades.length > 0 && (
        <div
          aria-label="Filtro rápido por especialidad"
          className="no-print flex items-center gap-2 overflow-x-auto pb-1 pt-0.5"
        >
          <button
            type="button"
            onClick={() => {
              resetRequestKey();
              setSelectedEsp('');
              setSelectedMedico('');
              setSelectedBloque(null);
              setReservaResult(null);
            }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-semibold transition-all ${selectedEsp === ''
                ? 'border-teal-800 bg-teal-900 text-white shadow-sm'
                : 'border-slate-200/90 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50'
              }`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Todas las especialidades
          </button>
          {especialidades.map((esp) => {
            const active = String(selectedEsp) === String(esp.id);
            return (
              <button
                key={esp.id}
                type="button"
                onClick={() => {
                  resetRequestKey();
                  setSelectedEsp(String(esp.id));
                  setSelectedMedico('');
                  setSelectedBloque(null);
                  setReservaResult(null);
                }}
                className={`inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-semibold transition-all ${active
                    ? 'border-teal-800 bg-teal-900 text-white shadow-sm'
                    : 'border-slate-200/90 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50'
                  }`}
              >
                <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{esp.nombre}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                >
                  {esp.total_medicos}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Columna Izquierda: Consola de Filtros A-01 (MED-9) */}
        <section className="no-print h-fit overflow-hidden rounded-3xl border border-teal-900/10 bg-white shadow-clinical lg:sticky lg:top-24">
          <div className="border-b border-slate-100 bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-900 p-5 text-white sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-emerald-300 ring-1 ring-white/15">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </span>
                Buscador Clínico
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-teal-100">
                Paso 1 de 3
              </span>
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-white">
              Elige tu hora
            </h2>
            <p className="mt-1 text-xs leading-5 text-teal-100/85">
              Filtra por especialidad, profesional y fecha para explorar los bloques disponibles.
            </p>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <label
                htmlFor="patient-specialty"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Especialidad Médica
              </label>
              <div className="relative">
                <Stethoscope
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-700"
                  aria-hidden="true"
                />
                <ChevronDown
                  className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
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
                  className="min-h-12 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-10 pr-9 text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-600/10"
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
              <label
                htmlFor="patient-doctor"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Profesional ({medicosFiltrados.length} disponibles)
              </label>
              <div className="relative">
                <User
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-700"
                  aria-hidden="true"
                />
                <ChevronDown
                  className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <select
                  id="patient-doctor"
                  value={selectedMedico}
                  onChange={(e) => {
                    resetRequestKey();
                    setSelectedMedico(e.target.value);
                    setSelectedBloque(null);
                    setReservaResult(null);
                  }}
                  className="min-h-12 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-10 pr-9 text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                >
                  <option value="">Cualquiera disponible</option>
                  {medicosFiltrados.map((med) => (
                    <option key={med.id} value={med.id}>
                      {med.nombre} — {med.especialidad_nombre} ({med.box_atencion})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="patient-date"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Fecha de Atención
              </label>
              <div className="relative">
                <Calendar
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-700"
                  aria-hidden="true"
                />
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
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-10 pr-3 font-mono text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={fetchDisponibilidad}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 active:scale-[0.99]"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Buscar horarios
            </button>

            <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3.5">
              <p className="flex items-start gap-2.5 text-xs leading-5 text-teal-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                <span>
                  Tu cupo se bloquea de forma segura al confirmar tus datos en el paso final.
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* Columna Central/Derecha: Grilla de Horarios A-02 y Pase de Reserva A-03..A-06 */}
        <section className="space-y-6 lg:col-span-2">
          <div className="no-print overflow-hidden rounded-3xl border border-teal-900/10 bg-white shadow-clinical">
            {/* Cabecera de Agenda + Cinta de 7 días */}
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/40 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-900 text-teal-100 shadow-sm">
                    <Calendar className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="mb-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
                      Cartelera Clínica
                    </p>
                    <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                      Horarios disponibles
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Selecciona un bloque horario para generar tu pase de atención.
                    </p>
                  </div>
                </div>
                <div
                  className={`inline-flex min-h-10 items-center gap-2 rounded-2xl border px-3.5 py-1.5 text-xs font-bold ${loadingDisp
                      ? 'border-slate-200 bg-slate-50 text-slate-500'
                      : (disponibilidad.total_cupos_libres || 0) > 0
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                >
                  {loadingDisp ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal-600 border-r-transparent" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  )}
                  {loadingDisp
                    ? 'Buscando cupos…'
                    : `${disponibilidad.total_cupos_libres || 0} cupos disponibles`}
                </div>
              </div>

              {/* Cinta interactiva de próximos días */}
              {quickDates.length > 0 && (
                <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
                  {quickDates.map((d) => {
                    const isSelectedDate = d.iso === selectedFecha;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => {
                          resetRequestKey();
                          setSelectedFecha(d.iso);
                          setSelectedBloque(null);
                          setReservaResult(null);
                        }}
                        className={`flex flex-col items-center justify-center rounded-2xl border py-2 px-1 text-center transition-all ${isSelectedDate
                            ? 'border-teal-800 bg-teal-900 text-white shadow-md shadow-teal-950/15'
                            : 'border-slate-200/80 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/40'
                          }`}
                      >
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${isSelectedDate ? 'text-emerald-300' : 'text-slate-400'
                            }`}
                        >
                          {d.isToday ? 'Hoy' : d.weekday}
                        </span>
                        <span className="mt-0.5 font-mono text-base font-bold leading-none sm:text-lg">
                          {d.dayNum}
                        </span>
                        <span
                          className={`mt-0.5 text-[10px] capitalize ${isSelectedDate ? 'text-teal-100' : 'text-slate-400'
                            }`}
                        >
                          {d.monthShort}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {loadingDisp ? (
              <div
                role="status"
                aria-live="polite"
                className="space-y-4 bg-slate-50/50 p-6 text-sm text-slate-500"
              >
                <p className="text-center font-medium text-slate-600">
                  Estamos consultando la agenda clínica para esta fecha…
                </p>
                <div
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
                  aria-hidden="true"
                >
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="h-4 w-2/3 rounded bg-slate-200" />
                      <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
            ) : availabilityError ? (
              <div
                role="alert"
                className="mx-5 my-5 rounded-2xl border border-rose-200 bg-rose-50/80 p-6 text-center sm:mx-6 sm:my-6"
              >
                <AlertCircle className="mx-auto mb-2 h-7 w-7 text-rose-600" aria-hidden="true" />
                <p className="font-bold text-rose-950">No pudimos cargar la información</p>
                <p className="mt-1 text-sm text-rose-800">{availabilityError}</p>
                <button
                  type="button"
                  onClick={fetchDisponibilidad}
                  className="mt-4 min-h-11 rounded-xl bg-teal-800 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900"
                >
                  Reintentar
                </button>
              </div>
            ) : disponibilidad.bloques?.length === 0 ? (
              <div className="mx-5 my-6 rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/70 to-white px-5 py-10 text-center sm:mx-6">
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-amber-100/80 text-amber-800">
                  <Calendar className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="font-display text-lg font-bold text-amber-950">
                  {medicosFiltrados.length === 0
                    ? 'No hay profesionales disponibles'
                    : 'No hay horas para esta fecha'}
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-amber-900/80">
                  {medicosFiltrados.length === 0
                    ? 'Prueba seleccionando otra especialidad médica en el panel lateral.'
                    : 'Selecciona otro día en la cinta superior o quita el filtro de profesional.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6 bg-slate-50/40 p-5 sm:p-6">
                {Object.entries(groupedBlocks).map(([group, blocks]) => {
                  const period = group.endsWith('· Mañana') ? 'Mañana' : 'Tarde';
                  const doctorName = group.replace(/ · (Mañana|Tarde)$/, '');
                  const sampleBlock = blocks[0];
                  const initials = getDoctorInitials(doctorName);

                  return (
                    <section
                      key={group}
                      aria-label={`Horarios de ${group}`}
                      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-800 to-emerald-900 font-mono text-xs font-bold tracking-wider text-teal-100 shadow-sm">
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-bold text-slate-900">
                              {doctorName}
                            </h3>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="font-medium text-teal-800">
                                {sampleBlock?.especialidad_nombre}
                              </span>
                              {sampleBlock?.box_atencion && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-slate-400" aria-hidden="true" />
                                    {sampleBlock.box_atencion}
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span>
                                {blocks.length} {blocks.length === 1 ? 'horario' : 'horarios'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${period === 'Mañana'
                              ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80'
                              : 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200/80'
                            }`}
                        >
                          {period === 'Mañana' ? (
                            <Sun className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                          ) : (
                            <Sunset className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                          )}
                          Jornada {period}
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
                              aria-haspopup="dialog"
                              onClick={(event) => {
                                bookingOpenerRef.current = event.currentTarget;
                                if (!isSelected) {
                                  resetRequestKey();
                                  setSelectedBloque(b);
                                  setReservaResult(null);
                                  setBookingStep('datos');
                                }
                                setIsBookingOpen(true);
                              }}
                              className={`group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 ${isSelected
                                  ? 'border-teal-700 bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/60 shadow-md ring-2 ring-teal-700/20'
                                  : 'border-slate-200/90 bg-slate-50/40 hover:-translate-y-0.5 hover:border-teal-500 hover:bg-white hover:shadow-md'
                                }`}
                            >
                              <div
                                className={`absolute inset-x-0 top-0 h-1 transition-colors ${isSelected
                                    ? 'bg-gradient-to-r from-teal-600 to-emerald-500'
                                    : 'bg-transparent group-hover:bg-teal-500/60'
                                  }`}
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 font-mono text-base font-bold tabular-nums text-slate-900">
                                  <Clock
                                    className={`h-4 w-4 shrink-0 ${isSelected
                                        ? 'text-teal-700'
                                        : 'text-slate-400 group-hover:text-teal-600'
                                      }`}
                                    aria-hidden="true"
                                  />
                                  {b.hora_inicio} – {b.hora_fin}
                                </span>
                                <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                                  {b.duracion_min} min
                                </span>
                              </div>
                              <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-700">
                                    {b.medico_nombre}
                                  </p>
                                  <p className="truncate text-[11px] text-slate-500">
                                    {b.box_atencion
                                      ? `${b.especialidad_nombre} · ${b.box_atencion}`
                                      : b.especialidad_nombre}
                                  </p>
                                </div>
                                {isSelected ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-800 px-2 py-0.5 text-[10px] font-bold text-white">
                                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                    Elegido
                                  </span>
                                ) : (
                                  <ChevronRight
                                    className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-700"
                                    aria-hidden="true"
                                  />
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

          {/* Pase Clínico de Atención y Formulario de Reserva (MED-11 / CU-02) */}
          {selectedBloque && !isBookingOpen && reservaResult?.type === 'success' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 shadow-sm">
              <p>
                Reserva confirmada para las{' '}
                <strong className="font-mono">
                  {selectedBloque.hora_inicio} – {selectedBloque.hora_fin}
                </strong>
                .
              </p>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={(event) => {
                  bookingOpenerRef.current = event.currentTarget;
                  setIsBookingOpen(true);
                }}
                className="min-h-10 rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20"
              >
                Ver comprobante
              </button>
            </div>
          )}

          {selectedBloque && isBookingOpen && typeof document !== 'undefined' &&
            createPortal(
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
                onClick={(event) => {
                  if (event.target === event.currentTarget) closeBookingDialog();
                }}
              >
                <div
                  ref={bookingDialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="patient-booking-title"
                  tabIndex={-1}
                  onKeyDown={handleBookingDialogKeyDown}
                  className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-3xl border border-teal-900/15 bg-white shadow-2xl shadow-slate-950/30 focus:outline-none sm:max-h-[calc(100dvh-3rem)]"
                >
              {/* Encabezado estilo Boarding Pass Clínico */}
              <div className="bg-hero-mesh relative overflow-hidden p-5 text-white sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                      <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                      Pase de Atención Ambulatoria
                    </div>
                    <h3
                      id="patient-booking-title"
                      className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl"
                    >
                      {bookingStep === 'revision'
                        ? 'Revisa tu reserva'
                        : bookingStep === 'confirmacion'
                          ? 'Reserva confirmada'
                          : 'Tus datos'}
                    </h3>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2 text-right backdrop-blur-md">
                      <span className="block font-mono text-[10px] uppercase tracking-wider text-teal-200">
                        Bloque Seleccionado
                      </span>
                      <span className="font-mono text-base font-bold text-white">
                        {selectedBloque.hora_inicio} – {selectedBloque.hora_fin}
                      </span>
                    </div>
                    <button
                      ref={bookingCloseButtonRef}
                      type="button"
                      aria-label={
                        reservaResult?.type === 'success'
                          ? 'Cerrar comprobante'
                          : 'Cerrar ficha y volver a los horarios'
                      }
                      title="Cerrar"
                      disabled={submittingReserva}
                      onClick={closeBookingDialog}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Resumen perforado del turno seleccionado */}
                <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-white/15 bg-teal-950/50 p-3.5 text-xs sm:grid-cols-3">
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-teal-300/80">
                      Profesional
                    </span>
                    <strong className="mt-0.5 block truncate text-sm text-white">
                      {selectedBloque.medico_nombre}
                    </strong>
                    <span className="text-teal-200/80">{selectedBloque.especialidad_nombre}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-teal-300/80">
                      Fecha programada
                    </span>
                    <strong className="mt-0.5 block capitalize text-sm text-white">
                      {new Date(`${selectedBloque.fecha}T12:00:00`).toLocaleDateString('es-CL', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </strong>
                    <span className="text-teal-200/80">
                      Duración estimada: {selectedBloque.duracion_min} min
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-teal-300/80">
                      Paciente Titular
                    </span>
                    <strong className="mt-0.5 block truncate text-sm text-emerald-300">
                      {pacienteNombre.trim() || 'Pendiente de completar'}
                    </strong>
                    <span className="block min-w-0 break-all font-mono text-teal-200/80">
                      {pacienteRut ? `RUT ${pacienteRut}` : 'Ingresa tu RUT abajo'}
                    </span>
                  </div>
                </div>
              </div>

              {bookingStep === 'revision' && (
                <div className="mx-5 mt-5 rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/90 to-emerald-50/50 p-5 text-sm text-teal-950 sm:mx-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-bold text-teal-900">
                      <ShieldCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
                      Comprueba tus datos antes de reservar
                    </p>
                    <span className="rounded-full bg-teal-900 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-200">
                      Verificación Final
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-white/80 p-3.5 ring-1 ring-teal-200/70 sm:grid-cols-2">
                    <div>
                      <span className="text-xs text-slate-500">Paciente y RUT</span>
                      <p className="font-semibold text-slate-900">
                        {pacienteNombre} · <span className="font-mono">RUT {pacienteRut}</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Contacto de notificación</span>
                      <p className="font-semibold text-slate-900">
                        {pacienteEmail} · <span className="font-mono">{pacienteTelefono}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBookingStep('datos');
                      setReservaResult(null);
                    }}
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-50"
                  >
                    Editar mis datos
                  </button>
                </div>
              )}

              {bookingStep !== 'confirmacion' && (
                <form
                  onSubmit={handleReservarSubmit}
                  className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 sm:p-6"
                >
                  <div>
                    <label
                      htmlFor="patient-rut"
                      className="mb-1.5 block text-sm font-semibold text-slate-700"
                    >
                      RUT *
                    </label>
                    <div className="relative">
                      <ShieldCheck
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
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
                            fieldTouched.rut && rutCheck && !rutCheck.valid
                              ? 'patient-rut-local-error'
                              : null,
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
                        className={`min-h-12 w-full rounded-xl border bg-white py-2 pl-10 pr-3 font-mono text-sm shadow-sm transition focus:outline-none focus:ring-4 focus:ring-teal-600/10 ${rutCheck
                            ? rutCheck.valid
                              ? 'border-emerald-500 bg-emerald-50/20 focus:border-emerald-500'
                              : 'border-rose-500 bg-rose-50/20 focus:border-rose-500 focus:ring-rose-500/10'
                            : 'border-slate-200 focus:border-teal-600'
                          }`}
                      />
                    </div>
                    {rutCheck && fieldTouched.rut && !rutCheck.valid && (
                      <p
                        id="patient-rut-local-error"
                        className="mt-1 text-[11px] font-medium text-rose-700"
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
                      <User
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
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
                      <Mail
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
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
                      <Phone
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <span className="ml-10 border-r border-slate-200 px-3 py-1 font-mono text-sm font-semibold text-slate-600">
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
                          reservationFieldErrors.paciente_telefono
                            ? 'patient-phone-error'
                            : undefined
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
                        className="min-h-12 min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2 font-mono text-sm tracking-wide focus:outline-none"
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
                      className="min-h-11 rounded-xl bg-teal-800 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
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

              {/* Resultado A-05 (Éxito - Pase Clínico Perforado) o A-06 (Rechazo) */}
              {reservaResult && (
                <div
                  className={`mx-5 mb-6 overflow-hidden rounded-2xl border sm:mx-6 ${reservaResult.type === 'success'
                      ? 'mt-5 border-emerald-300/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 text-slate-900 shadow-md'
                      : 'border-rose-200 bg-rose-50 text-rose-950'
                    }`}
                >
                  {reservaResult.type === 'success' ? (
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                          </span>
                          <div>
                            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-700">
                              Comprobante Oficial · Medisalud
                            </span>
                            <h4 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                              Tu hora está reservada
                            </h4>
                            <p className="mt-0.5 text-sm text-slate-600">
                              Presenta este pase digital al llegar al centro médico.
                            </p>
                          </div>
                        </div>

                        {/* Código de reserva con botón copiar */}
                        <div className="flex items-center gap-2 rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 shadow-sm">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Código de reserva
                            </span>
                            <strong className="font-mono text-base font-bold tracking-wider text-teal-900">
                              {reservaResult.data.reserva.codigo_reserva}
                            </strong>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyCode(reservaResult.data.reserva.codigo_reserva)
                            }
                            title="Copiar código"
                            className="no-print ml-2 inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800"
                          >
                            {copiedCode ? (
                              <>
                                <Check
                                  className="h-3.5 w-3.5 text-emerald-600"
                                  aria-hidden="true"
                                />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                Copiar
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="ticket-divider my-5 pt-5">
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Profesional
                            </dt>
                            <dd className="mt-1 font-bold text-slate-900">
                              {reservaResult.data.reserva.medico_nombre}
                            </dd>
                          </div>
                          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Especialidad
                            </dt>
                            <dd className="mt-1 font-bold text-teal-800">
                              {reservaResult.data.reserva.especialidad_nombre}
                            </dd>
                          </div>
                          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Fecha y hora
                            </dt>
                            <dd className="mt-1 font-mono font-bold text-slate-900">
                              {reservaResult.data.reserva.fecha} ·{' '}
                              {reservaResult.data.reserva.hora_inicio}–
                              {reservaResult.data.reserva.hora_fin}
                            </dd>
                          </div>
                          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Lugar / Box
                            </dt>
                            <dd className="mt-1 font-bold text-slate-900">
                              {reservaResult.data.reserva.box_atencion}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-emerald-100/60 px-4 py-3 text-xs text-emerald-950">
                        <p>
                          El comprobante quedó en cola para enviarse a{' '}
                          <strong>{pacienteEmail}</strong>.
                        </p>
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                          ESTADO: CONFIRMADA
                        </span>
                      </div>

                      <div className="no-print mt-5 flex flex-wrap items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => window.print?.()}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          Imprimir comprobante
                        </button>
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
                          className="min-h-11 rounded-xl bg-teal-800 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900"
                        >
                          Reservar otra hora
                        </button>
                      </div>
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
              </div>,
              document.body,
            )}
        </section>
      </div>
    </div>
  );
}
