import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  LogOut,
  MapPin,
  PhoneCall,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { requestApi } from '../../api/client.js';
import { formatRutInput } from '../../utils/rut';
import { onlyMobileSubscriberDigits, parseChileanMobileDigits } from '../../utils/phone.js';
import CrearMedico from '../../components/CrearMedico';

function getDoctorInitials(name = '') {
  const clean = name.replace(/^(dr\.?|dra\.?)\s+/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function SecretaryPortal({ state, actions }) {
  const {
    secretaryView,
    secretaryToken,
    especialidades,
    catalogosLoading,
    catalogosError,
    pendingMedicoDraft,
    secMedicoId,
    medicos,
    secFecha,
    todayStr,
    secAgendas,
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
    receptionDialogRef,
    submitReceptionBooking,
    updateReceptionField,
  } = actions;

  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [blockingTarget, setBlockingTarget] = useState(null);
  const [blockingInProgress, setBlockingInProgress] = useState(false);
  const [appointmentAction, setAppointmentAction] = useState(null);
  const [appointmentReason, setAppointmentReason] = useState('');
  const [appointmentSubmitting, setAppointmentSubmitting] = useState(false);
  const [appointmentError, setAppointmentError] = useState('');
  const [appointmentManagementMessage, setAppointmentManagementMessage] = useState('');
  const [appointmentManagementEmailReady, setAppointmentManagementEmailReady] = useState(true);
  const [moveDoctorId, setMoveDoctorId] = useState('');
  const [moveDate, setMoveDate] = useState(todayStr);
  const [moveAgendaId, setMoveAgendaId] = useState('');
  const [moveSlots, setMoveSlots] = useState([]);
  const [moveSlotsLoading, setMoveSlotsLoading] = useState(false);
  const [moveSlotsError, setMoveSlotsError] = useState('');
  const blockingDialogRef = useRef(null);
  const blockingTriggerRef = useRef(null);
  const blockingInProgressRef = useRef(false);
  const appointmentDialogRef = useRef(null);
  const appointmentTriggerRef = useRef(null);
  const appointmentSubmittingRef = useRef(false);

  const filteredDoctors = useMemo(
    () =>
      specialtyFilter
        ? medicos.filter((doctor) => String(doctor.especialidad_id) === specialtyFilter)
        : medicos,
    [medicos, specialtyFilter],
  );

  const selectedDoctor = useMemo(
    () => medicos.find((m) => String(m.id) === String(secMedicoId)) || null,
    [medicos, secMedicoId],
  );

  function handleSpecialtyFilterChange(value) {
    setSpecialtyFilter(value);
    if (!value) return;

    const currentDoctor = medicos.find((doctor) => String(doctor.id) === String(secMedicoId));
    if (String(currentDoctor?.especialidad_id) === value) return;

    const firstMatchingDoctor = medicos.find(
      (doctor) => String(doctor.especialidad_id) === value,
    );
    if (firstMatchingDoctor) setSecMedicoId(String(firstMatchingDoctor.id));
  }

  function openBlockingDialog(target, event) {
    blockingTriggerRef.current = event?.currentTarget || document.activeElement;
    setSecFeedback(null);
    if (target.type === 'slot') {
      setSecMotivoBloqueo('Bloqueo manual por secretaría (MED-10)');
    }
    setBlockingTarget(target);
  }

  function openAppointmentDialog(action, appointment, event) {
    appointmentTriggerRef.current = event?.currentTarget || document.activeElement;
    setAppointmentAction({ action, appointment });
    setAppointmentReason('');
    setAppointmentError('');
    setAppointmentManagementMessage('');
    setAppointmentManagementEmailReady(true);
    if (action === 'MOVER') {
      setMoveDoctorId(String(appointment.medico_id || secMedicoId));
      setMoveDate(appointment.fecha || secFecha);
      setMoveAgendaId('');
      setMoveSlots([]);
      setMoveSlotsError('');
    }
  }

  function closeAppointmentDialog() {
    if (appointmentSubmittingRef.current) return;
    setAppointmentAction(null);
  }

  function closeBlockingDialog() {
    if (blockingInProgressRef.current) return;
    setBlockingTarget(null);
  }

  async function submitBlockingAction(isGlobalHoliday = false) {
    if (!blockingTarget) return;
    blockingInProgressRef.current = true;
    setBlockingInProgress(true);
    try {
      const succeeded =
        blockingTarget.type === 'slot'
          ? await handleToggleBloque(blockingTarget.block)
          : await handleBloquearDia(isGlobalHoliday);
      if (succeeded) setBlockingTarget(null);
    } finally {
      blockingInProgressRef.current = false;
      setBlockingInProgress(false);
    }
  }

  async function submitAppointmentAction() {
    if (!appointmentAction) return;
    appointmentSubmittingRef.current = true;
    setAppointmentSubmitting(true);
    setAppointmentError('');
    const { action, appointment } = appointmentAction;
    try {
      const response = await requestApi(`/api/reservas/${appointment.cita_id}/gestionar`, {
        method: 'POST',
        token: secretaryToken,
        onUnauthorized: handleSecretaryUnauthorized,
        body: {
          accion: action,
          motivo: appointmentReason.trim(),
          ...(action === 'MOVER' ? { agenda_id: Number(moveAgendaId) } : {}),
        },
      });
      if (!response.ok) {
        setAppointmentError(response.data.error || 'No se pudo actualizar la cita.');
        return;
      }

      setAppointmentManagementMessage(response.data.mensaje || 'La cita fue actualizada.');
      setAppointmentManagementEmailReady(
        response.data.correo_aviso?.proveedor_configurado !== false,
      );
      setAppointmentAction(null);
      fetchSecAgendas();
    } catch (error) {
      setAppointmentError(error.message || 'No pudimos conectar con el sistema.');
    } finally {
      appointmentSubmittingRef.current = false;
      setAppointmentSubmitting(false);
    }
  }

  useEffect(() => {
    if (!blockingTarget) return undefined;

    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.inert ?? false;
    const previousBodyOverflow = document.body.style.overflow;
    const dialog = blockingDialogRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    if (appRoot) appRoot.inert = true;
    document.body.style.setProperty('overflow', 'hidden');
    dialog?.querySelector(focusableSelector)?.focus();

    function handleDialogKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeBlockingDialog();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
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

    dialog?.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      dialog?.removeEventListener('keydown', handleDialogKeyDown);
      if (appRoot) appRoot.inert = rootWasInert;
      if (previousBodyOverflow) {
        document.body.style.setProperty('overflow', previousBodyOverflow);
      } else {
        document.body.style.removeProperty('overflow');
      }

      const trigger = blockingTriggerRef.current;
      if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
    };
  }, [blockingTarget]);

  useEffect(() => {
    if (appointmentAction?.action !== 'MOVER' || !moveDoctorId || !moveDate) {
      setMoveSlots([]);
      setMoveAgendaId('');
      setMoveSlotsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ medico_id: moveDoctorId, fecha: moveDate });
    setMoveSlotsLoading(true);
    setMoveSlotsError('');
    setMoveSlots([]);
    setMoveAgendaId('');

    requestApi(`/api/agendas?${params.toString()}`, {
      token: secretaryToken,
      signal: controller.signal,
      onUnauthorized: handleSecretaryUnauthorized,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.ok || !response.data.ok) {
          setMoveSlotsError(response.data.error || 'No pudimos cargar los horarios disponibles.');
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
        if (!controller.signal.aborted) {
          setMoveSlotsError(error.message || 'No pudimos cargar los horarios disponibles.');
        }
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

  useEffect(() => {
    if (!appointmentAction) return undefined;

    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.inert ?? false;
    const previousBodyOverflow = document.body.style.overflow;
    const dialog = appointmentDialogRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    if (appRoot) appRoot.inert = true;
    document.body.style.setProperty('overflow', 'hidden');
    dialog?.querySelector(focusableSelector)?.focus();

    function handleDialogKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAppointmentDialog();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
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

    dialog?.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      dialog?.removeEventListener('keydown', handleDialogKeyDown);
      if (appRoot) appRoot.inert = rootWasInert;
      if (previousBodyOverflow) {
        document.body.style.setProperty('overflow', previousBodyOverflow);
      } else {
        document.body.style.removeProperty('overflow');
      }

      const trigger = appointmentTriggerRef.current;
      if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
    };
  }, [appointmentAction]);

  const metrics = useMemo(() => {
    const total = secAgendas.length;
    const disponibles = secAgendas.filter((b) => b.estado === 'DISPONIBLE').length;
    const reservados = secAgendas.filter((b) => b.estado === 'RESERVADO').length;
    const bloqueados = secAgendas.filter((b) => b.estado === 'BLOQUEADO').length;
    return {
      total,
      disponibles,
      reservados,
      bloqueados,
      pctDisponible: total > 0 ? Math.round((disponibles / total) * 100) : 0,
      pctReservado: total > 0 ? Math.round((reservados / total) * 100) : 0,
      pctBloqueado: total > 0 ? Math.round((bloqueados / total) * 100) : 0,
    };
  }, [secAgendas]);

  const filteredAgendas = useMemo(() => {
    return secAgendas.filter((b) => {
      if (statusFilter !== 'TODOS' && b.estado !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (b.hora_inicio && b.hora_inicio.toLowerCase().includes(q)) ||
        (b.paciente_nombre && b.paciente_nombre.toLowerCase().includes(q)) ||
        (b.paciente_rut && b.paciente_rut.toLowerCase().includes(q)) ||
        (b.codigo_reserva && b.codigo_reserva.toLowerCase().includes(q)) ||
        (b.motivo_bloqueo && b.motivo_bloqueo.toLowerCase().includes(q))
      );
    });
  }, [secAgendas, statusFilter, searchQuery]);

  return secretaryView === 'create-medico' ? (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-900/10 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-900 text-teal-100">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-teal-700">
              Catálogo Clínico
            </p>
            <p className="text-sm font-bold text-slate-900">Incorporación de Especialistas</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSecretaryView('agenda')}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Volver a la agenda
          </button>
          <button
            type="button"
            onClick={logoutSecretary}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
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
        onCancel={() => setSecretaryView('agenda')}
        onContinueScheduling={(medicoId) => {
          setSpecialtyFilter('');
          setSecMedicoId(String(medicoId));
          setSecFeedback(null);
          setSecError('');
          setScheduleDetailsOpen(true);
          setSecretaryView('agenda');
        }}
      />
    </div>
  ) : (
    /* Panel Administrativo de Secretaría (MED-10) */
    <div className="space-y-6">
      {/* Cabecera de Comando Clínico */}
      <section className="bg-hero-mesh relative overflow-hidden rounded-3xl border border-teal-800/40 p-6 text-white shadow-clinical-lg sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Administración clínica · Recepción Central
            </div>
            <h2
              id="secretary-agenda-title"
              tabIndex={-1}
              className="font-display mt-3 text-2xl font-bold tracking-tight text-white focus:outline-none sm:text-3xl"
            >
              Agenda del día
            </h2>
            <p className="mt-1 text-sm text-teal-100/85">
              Supervisa la ocupación en tiempo real, registra pacientes en recepción y configura
              jornadas médicas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSecretaryView('create-medico')}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-teal-950 shadow-md shadow-teal-950/20 transition hover:bg-emerald-300"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear médico
            </button>
            <button
              type="button"
              onClick={logoutSecretary}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Tarjetas KPI de Ocupación */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur-md">
            <span className="flex items-center justify-between text-xs font-medium text-teal-200">
              <span>Total Bloques</span>
              <Activity className="h-4 w-4 text-teal-300" aria-hidden="true" />
            </span>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white sm:text-3xl">
              {metrics.total}
            </p>
            <span className="mt-0.5 block text-[11px] text-teal-200/75">Jornada seleccionada</span>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 backdrop-blur-md">
            <span className="flex items-center justify-between text-xs font-medium text-emerald-200">
              <span>Disponibles</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            </span>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white sm:text-3xl">
              {metrics.disponibles}
            </p>
            <span className="mt-0.5 block font-mono text-[11px] text-emerald-300">
              {metrics.pctDisponible}% libre
            </span>
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 backdrop-blur-md">
            <span className="flex items-center justify-between text-xs font-medium text-cyan-200">
              <span>Reservados</span>
              <User className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            </span>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white sm:text-3xl">
              {metrics.reservados}
            </p>
            <span className="mt-0.5 block font-mono text-[11px] text-cyan-200">
              {metrics.pctReservado}% ocupación
            </span>
          </div>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 backdrop-blur-md">
            <span className="flex items-center justify-between text-xs font-medium text-amber-200">
              <span>Bloqueados</span>
              <Lock className="h-4 w-4 text-amber-300" aria-hidden="true" />
            </span>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white sm:text-3xl">
              {metrics.bloqueados}
            </p>
            <span className="mt-0.5 block font-mono text-[11px] text-amber-200">
              {metrics.pctBloqueado}% inhabilitado
            </span>
          </div>
        </div>
      </section>

      {/* Consola Principal de Agenda del Día */}
      <section className="overflow-hidden rounded-3xl border border-teal-900/10 bg-white shadow-clinical">
        {/* Selector de Profesional, Fecha y Navegación */}
        <div className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(160px,0.8fr)_minmax(230px,1.2fr)_minmax(170px,auto)_auto_auto]">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              <span className="mb-1.5 flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                Especialidad
              </span>
              <select
                aria-label="Filtrar médicos por especialidad"
                value={specialtyFilter}
                onChange={(event) => handleSpecialtyFilterChange(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
              >
                <option value="">Todas las especialidades</option>
                {especialidades
                  .filter((specialty) =>
                    medicos.some(
                      (doctor) => String(doctor.especialidad_id) === String(specialty.id),
                    ),
                  )
                  .map((specialty) => (
                    <option key={specialty.id} value={String(specialty.id)}>
                      {specialty.nombre}
                    </option>
                  ))}
              </select>
            </label>

            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              <span className="mb-1.5 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                Profesional
              </span>
              <select
                aria-label="Profesional de la agenda"
                value={secMedicoId}
                onChange={(e) => setSecMedicoId(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
              >
                {filteredDoctors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} · {m.especialidad_nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              <span className="mb-1.5 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                Fecha
              </span>
              <input
                aria-label="Fecha de la agenda"
                type="date"
                value={secFecha}
                onChange={(e) => setSecFecha(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
              />
            </label>

            <div className="flex items-end gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm lg:self-end">
              <button
                type="button"
                onClick={() => moveSecretaryDate(-1)}
                className="flex min-h-10 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3 sm:text-sm"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setSecFecha(todayStr)}
                className="min-h-10 rounded-lg bg-teal-50 px-3 text-xs font-bold text-teal-900 ring-1 ring-teal-200 transition hover:bg-teal-100 sm:text-sm"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => moveSecretaryDate(1)}
                className="flex min-h-10 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3 sm:text-sm"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={(event) => {
                const first = secAgendas.find((b) => b.estado === 'DISPONIBLE');
                if (first) openReceptionBooking(first, event);
              }}
              disabled={!secAgendas.some((b) => b.estado === 'DISPONIBLE')}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50 lg:self-end"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva reserva
            </button>
          </div>

          {/* Ficha contextual del profesional activo + Mapa de Jornada */}
          {selectedDoctor && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-800 to-emerald-900 font-mono text-xs font-bold text-teal-100">
                  {getDoctorInitials(selectedDoctor.nombre)}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedDoctor.nombre}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-teal-800">
                      {selectedDoctor.especialidad_nombre}
                    </span>
                    {selectedDoctor.box_atencion && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          {selectedDoctor.box_atencion}
                        </span>
                      </>
                    )}
                    {selectedDoctor.rut && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-[11px]">RUT {selectedDoctor.rut}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Barra visual segmentada de ocupación */}
              {metrics.total > 0 && (
                <div className="w-full sm:w-64">
                  <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500">
                    <span>Distribución de jornada</span>
                    <span className="font-mono">{metrics.pctReservado}% reservado</span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 p-0.5 ring-1 ring-slate-200/70">
                    {metrics.disponibles > 0 && (
                      <div
                        style={{ width: `${(metrics.disponibles / metrics.total) * 100}%` }}
                        className="bg-emerald-500 transition-all"
                        title={`Disponibles: ${metrics.disponibles}`}
                      />
                    )}
                    {metrics.reservados > 0 && (
                      <div
                        style={{ width: `${(metrics.reservados / metrics.total) * 100}%` }}
                        className="bg-teal-700 transition-all"
                        title={`Reservados: ${metrics.reservados}`}
                      />
                    )}
                    {metrics.bloqueados > 0 && (
                      <div
                        style={{ width: `${(metrics.bloqueados / metrics.total) * 100}%` }}
                        className="bg-amber-500 transition-all"
                        title={`Bloqueados: ${metrics.bloqueados}`}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6">
          {/* Filtros rápidos de estado y buscador en tabla */}
          {secAgendas.length > 0 && (
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'TODOS', label: 'Todos', count: metrics.total },
                  { id: 'DISPONIBLE', label: 'Disponibles', count: metrics.disponibles },
                  { id: 'RESERVADO', label: 'Reservados', count: metrics.reservados },
                  { id: 'BLOQUEADO', label: 'Bloqueados', count: metrics.bloqueados },
                ].map((tab) => {
                  const active = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-teal-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                          active ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar paciente, RUT o hora…"
                  aria-label="Filtrar bloques de la agenda"
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          )}

          {appointmentManagementMessage && (
            <div
              role="status"
              className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
                appointmentManagementEmailReady
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {appointmentManagementMessage}
            </div>
          )}

          {secError && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              <span>{secError}</span>
              <button
                onClick={fetchSecAgendas}
                className="ml-3 rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-900 shadow-sm ring-1 ring-rose-200 transition hover:bg-rose-100"
              >
                Reintentar
              </button>
            </div>
          )}

          {secAgendas.length === 0 && !secError && (
            <div
              role="status"
              className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center text-sm text-slate-600"
            >
              <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
                <Calendar className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="font-semibold text-slate-800">
                No hay horarios configurados para este profesional y fecha.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Despliega el panel inferior «Configurar horarios y registrar ausencias» para generar
                bloques de atención.
              </p>
            </div>
          )}

          {/* Vista móvil en tarjetas */}
          <div className="space-y-3 md:hidden">
            {filteredAgendas.map((b) => (
              <article
                key={b.agenda_id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-mono text-base font-bold text-slate-900">
                      {b.hora_inicio}–{b.hora_fin}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {b.duracion_min} minutos
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      b.estado === 'DISPONIBLE'
                        ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                        : b.estado === 'RESERVADO'
                          ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200'
                          : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                    }`}
                  >
                    {b.estado === 'DISPONIBLE' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Disponible
                      </>
                    ) : b.estado === 'RESERVADO' ? (
                      <>
                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                        Reservado
                      </>
                    ) : (
                      <>Bloqueado</>
                    )}
                  </span>
                </div>
                <p className="mt-2.5 text-sm text-slate-700">
                  {b.estado === 'RESERVADO'
                    ? `${b.paciente_nombre} (${b.paciente_rut})`
                    : b.estado === 'BLOQUEADO'
                      ? b.motivo_bloqueo
                      : 'Listo para reservar'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.estado === 'DISPONIBLE' && (
                    <button
                      type="button"
                      onClick={(event) => openReceptionBooking(b, event)}
                      className="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white transition hover:bg-teal-900"
                    >
                      Reservar recepción
                    </button>
                  )}
                  {b.estado !== 'RESERVADO' && (
                    <button
                      type="button"
                      onClick={(event) =>
                        b.estado === 'BLOQUEADO'
                          ? handleToggleBloque(b)
                          : openBlockingDialog({ type: 'slot', block: b }, event)
                      }
                      className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {b.estado === 'BLOQUEADO' ? 'Habilitar' : 'Bloquear'}
                    </button>
                  )}
                  {b.estado === 'RESERVADO' && b.futuro && b.cita_id && (
                    <>
                      <button
                        type="button"
                        onClick={(event) => openAppointmentDialog('MOVER', b, event)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-100"
                      >
                        <Calendar className="h-4 w-4" aria-hidden="true" />
                        Mover
                      </button>
                      <button
                        type="button"
                        onClick={(event) => openAppointmentDialog('CANCELAR', b, event)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-800 transition hover:bg-rose-100"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>

          {/* Tabla de escritorio */}
          {secAgendas.length > 0 && (
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/90 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3.5">Horario</th>
                    <th className="px-4 py-3.5">Duración</th>
                    <th className="px-4 py-3.5">Estado</th>
                    <th className="px-4 py-3.5">Detalle / Paciente / Motivo</th>
                    <th className="px-4 py-3.5 text-right">Acción Secretaría</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAgendas.map((b) => (
                    <tr
                      key={b.agenda_id}
                      className={`transition ${
                        b.estado === 'RESERVADO'
                          ? 'bg-teal-50/20 hover:bg-teal-50/40'
                          : b.estado === 'BLOQUEADO'
                            ? 'bg-amber-50/15 hover:bg-amber-50/30'
                            : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="px-4 py-3.5 font-mono font-bold tabular-nums text-slate-900">
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                          {b.hora_inicio} – {b.hora_fin}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                        {b.duracion_min} min
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          aria-label={`Estado: ${
                            b.estado === 'DISPONIBLE'
                              ? 'Disponible'
                              : b.estado === 'RESERVADO'
                                ? 'Reservado'
                                : 'Bloqueado'
                          }`}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                            b.estado === 'DISPONIBLE'
                              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                              : b.estado === 'RESERVADO'
                                ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-200'
                                : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                          }`}
                        >
                          {b.estado === 'DISPONIBLE' ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Disponible
                            </>
                          ) : b.estado === 'RESERVADO' ? (
                            <>
                              <User className="h-3.5 w-3.5" aria-hidden="true" />
                              Reservado
                            </>
                          ) : (
                            'Bloqueado'
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">
                        {b.estado === 'RESERVADO' ? (
                          <div>
                            <span className="font-semibold text-slate-900">
                              {b.paciente_nombre}
                            </span>{' '}
                            <span className="font-mono text-xs text-slate-500">
                              ({b.paciente_rut})
                            </span>
                            {b.codigo_reserva && (
                              <span className="ml-2 rounded-md bg-teal-100/80 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-900">
                                {b.codigo_reserva}
                              </span>
                            )}
                          </div>
                        ) : b.estado === 'BLOQUEADO' ? (
                          <span className="text-amber-900">{b.motivo_bloqueo}</span>
                        ) : (
                          <span className="text-slate-400">Disponible para reservar</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {b.estado === 'DISPONIBLE' && (
                            <button
                              type="button"
                              onClick={(event) => openReceptionBooking(b, event)}
                              className="rounded-xl bg-teal-800 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-900"
                            >
                              Reservar recepción
                            </button>
                          )}
                          {b.estado !== 'RESERVADO' && (
                            <button
                              type="button"
                              onClick={(event) =>
                                b.estado === 'BLOQUEADO'
                                  ? handleToggleBloque(b)
                                  : openBlockingDialog({ type: 'slot', block: b }, event)
                              }
                              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                                b.estado === 'BLOQUEADO'
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {b.estado === 'BLOQUEADO' ? (
                                <>
                                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                                  Habilitar
                                </>
                              ) : (
                                <>
                                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                  Bloquear
                                </>
                              )}
                            </button>
                          )}
                          {b.estado === 'RESERVADO' && b.futuro && b.cita_id && (
                            <>
                              <button
                                type="button"
                                onClick={(event) => openAppointmentDialog('MOVER', b, event)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 transition hover:bg-teal-100"
                              >
                                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                                Mover
                              </button>
                              <button
                                type="button"
                                onClick={(event) => openAppointmentDialog('CANCELAR', b, event)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Drawer lateral de Reserva en Recepción */}
        {receptionBlock && (
          <div
            className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeReceptionBooking();
            }}
          >
            <form
              ref={receptionDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-booking-title"
              onSubmit={submitReceptionBooking}
              className="flex h-full w-full max-w-md min-w-0 flex-col gap-4 overflow-y-auto rounded-l-3xl border-l border-teal-900/15 bg-white p-5 shadow-2xl sm:p-6"
            >
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-teal-800">
                    <PhoneCall className="h-3 w-3" aria-hidden="true" />
                    Ingreso por Recepción
                  </p>
                  <h3
                    id="quick-booking-title"
                    className="font-display text-xl font-bold tracking-tight text-slate-900"
                  >
                    Nueva reserva
                  </h3>
                  <p className="mt-1 flex items-center gap-2 font-mono text-xs text-slate-500">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                    {receptionBlock.fecha} · {receptionBlock.hora_inicio}–{receptionBlock.hora_fin}{' '}
                    · {receptionBlock.medico_nombre}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeReceptionBooking}
                  className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Cerrar
                </button>
              </div>

              <label className="block w-full min-w-0 text-sm font-semibold text-slate-700">
                Origen de la reserva
                <select
                  autoFocus
                  value={receptionData.origen}
                  onChange={(e) => updateReceptionField('origen', e.target.value)}
                  className="mt-1 block min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                >
                  <option value="PRESENCIAL">Presencial (Mesón Clínica)</option>
                  <option value="TELEFONO">Telefónica (Call Center)</option>
                </select>
              </label>

              <label
                htmlFor="reception-rut"
                className="block w-full min-w-0 text-sm font-semibold text-slate-700"
              >
                RUT
                <input
                  id="reception-rut"
                  required
                  placeholder="12.345.678-5"
                  value={receptionData.rut}
                  aria-invalid={Boolean(receptionFieldErrors.paciente_rut)}
                  aria-describedby={
                    receptionFieldErrors.paciente_rut ? 'reception-rut-error' : undefined
                  }
                  onChange={(e) => updateReceptionField('rut', formatRutInput(e.target.value))}
                  className="mt-1 block min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm font-normal shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                />
                {receptionFieldErrors.paciente_rut && (
                  <span id="reception-rut-error" className="mt-1 block text-xs text-rose-800">
                    {receptionFieldErrors.paciente_rut}
                  </span>
                )}
              </label>

              <label
                htmlFor="reception-name"
                className="block w-full min-w-0 text-sm font-semibold text-slate-700"
              >
                Nombre completo
                <input
                  id="reception-name"
                  required
                  placeholder="Nombre y apellidos"
                  value={receptionData.nombre}
                  aria-invalid={Boolean(receptionFieldErrors.paciente_nombre)}
                  aria-describedby={
                    receptionFieldErrors.paciente_nombre ? 'reception-name-error' : undefined
                  }
                  onChange={(e) => updateReceptionField('nombre', e.target.value)}
                  className="mt-1 block min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                />
                {receptionFieldErrors.paciente_nombre && (
                  <span id="reception-name-error" className="mt-1 block text-xs text-rose-800">
                    {receptionFieldErrors.paciente_nombre}
                  </span>
                )}
              </label>

              <label
                htmlFor="reception-email"
                className="block w-full min-w-0 text-sm font-semibold text-slate-700"
              >
                Correo electrónico
                <input
                  id="reception-email"
                  required
                  type="email"
                  placeholder="nombre@ejemplo.cl"
                  value={receptionData.email}
                  aria-invalid={Boolean(receptionFieldErrors.paciente_email)}
                  aria-describedby={
                    receptionFieldErrors.paciente_email ? 'reception-email-error' : undefined
                  }
                  onChange={(e) => updateReceptionField('email', e.target.value)}
                  className="mt-1 block min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                />
                {receptionFieldErrors.paciente_email && (
                  <span id="reception-email-error" className="mt-1 block text-xs text-rose-800">
                    {receptionFieldErrors.paciente_email}
                  </span>
                )}
              </label>

              <label
                htmlFor="reception-phone"
                className="block w-full min-w-0 text-sm font-semibold text-slate-700"
              >
                Teléfono
                <div className="relative mt-1 flex min-h-12 items-center rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-600/10">
                  <span className="border-r border-slate-200 px-3 py-1 font-mono text-sm font-semibold text-slate-600">
                    +569
                  </span>
                  <input
                    id="reception-phone"
                    required
                    type="tel"
                    inputMode="numeric"
                    maxLength={8}
                    pattern="[0-9]{8}"
                    title="Ingresa exactamente 8 dígitos después del prefijo +569."
                    placeholder="12345678"
                    value={
                      receptionData.telefono.startsWith('+569')
                        ? receptionData.telefono.slice(4)
                        : onlyMobileSubscriberDigits(receptionData.telefono)
                    }
                    aria-invalid={Boolean(receptionFieldErrors.paciente_telefono)}
                    aria-describedby={
                      receptionFieldErrors.paciente_telefono ? 'reception-phone-error' : undefined
                    }
                    onChange={(e) =>
                      updateReceptionField(
                        'telefono',
                        `+569${onlyMobileSubscriberDigits(e.target.value)}`,
                      )
                    }
                    onPaste={(e) => {
                      e.preventDefault();
                      updateReceptionField(
                        'telefono',
                        `+569${parseChileanMobileDigits(e.clipboardData.getData('text'))}`,
                      );
                    }}
                    className="min-h-12 min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2 font-mono text-sm font-normal tracking-wide focus:outline-none"
                  />
                </div>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Prefijo +569 fijo · ingresa los 8 dígitos restantes.
                </span>
                {receptionFieldErrors.paciente_telefono && (
                  <span id="reception-phone-error" className="mt-1 block text-xs text-rose-800">
                    {receptionFieldErrors.paciente_telefono}
                  </span>
                )}
              </label>

              {receptionError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                  {receptionError}
                </p>
              )}

              <button
                disabled={submittingReception}
                className="mt-2 min-h-12 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingReception ? 'Procesando…' : 'Reservar'}
              </button>
            </form>
          </div>
        )}
      </section>

      {/* Estudio de Planificación Horaria y Bloqueos (Desplegable) */}
      <section className="overflow-hidden rounded-3xl border border-teal-900/10 bg-white shadow-clinical">
        <details
          open={scheduleDetailsOpen}
          onToggle={(event) => setScheduleDetailsOpen(event.currentTarget.open)}
          className="group"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 bg-gradient-to-r from-teal-50/70 via-white to-emerald-50/40 px-6 py-4 font-semibold text-slate-900 transition hover:bg-teal-50/90">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-900 text-teal-100">
                <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <span className="block text-base font-bold text-slate-900">
                  Configurar horarios y registrar ausencias
                </span>
                <span className="block text-xs font-normal text-slate-500">
                  Generador de bloques por tramo y bloqueo masivo por ausencias o feriados
                </span>
              </div>
            </div>
            <span className="rounded-xl border border-teal-200 bg-white px-3 py-1 text-xs font-bold text-teal-800 shadow-sm">
              {scheduleDetailsOpen ? 'Ocultar panel' : 'Abrir configuración'}
            </span>
          </summary>

          <div className="border-t border-slate-100 p-5 sm:p-6">
            <div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
                <div className="mb-4">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-teal-700">
                    Planificación de Jornada
                  </span>
                  <h2 className="font-display text-lg font-bold tracking-tight text-slate-900">
                    Configurar horarios
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Define el rango horario y la duración de cada bloque para generar cupos
                    automáticamente.
                  </p>
                </div>

                <form onSubmit={handleConfigurarAgenda} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="schedule-doctor"
                        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                      >
                        Profesional
                      </label>
                      <select
                        id="schedule-doctor"
                        value={secMedicoId}
                        onChange={(e) => setSecMedicoId(e.target.value)}
                        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      >
                        {filteredDoctors.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre} ({m.especialidad_nombre})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="schedule-date"
                        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                      >
                        Fecha
                      </label>
                      <input
                        id="schedule-date"
                        type="date"
                        value={secFecha}
                        onChange={(e) => setSecFecha(e.target.value)}
                        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="schedule-start"
                        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                      >
                        Hora Inicio
                      </label>
                      <input
                        id="schedule-start"
                        type="time"
                        value={secHoraInicio}
                        onChange={(e) => setSecHoraInicio(e.target.value)}
                        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="schedule-end"
                        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                      >
                        Hora Fin
                      </label>
                      <input
                        id="schedule-end"
                        type="time"
                        value={secHoraFin}
                        onChange={(e) => setSecHoraFin(e.target.value)}
                        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="schedule-duration"
                      className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                    >
                      Duración de cada horario
                    </label>
                    <select
                      id="schedule-duration"
                      value={secDuracion}
                      onChange={(e) => setSecDuracion(e.target.value)}
                      className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-900 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                    >
                      <option value="15">15 minutos por bloque</option>
                      <option value="20">20 minutos por bloque</option>
                      <option value="30">30 minutos por bloque</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="submit"
                      className="min-h-12 w-full rounded-xl bg-teal-800 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20"
                    >
                      Guardar horarios
                    </button>
                    <button
                      type="button"
                      onClick={(event) => openBlockingDialog({ type: 'day' }, event)}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20"
                    >
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      Bloquear jornada
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {secFeedback && (
              <div
                role={secFeedback.ok ? 'status' : 'alert'}
                className={`mt-5 rounded-2xl border p-4 text-sm font-medium ${
                  secFeedback.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : 'border-rose-200 bg-rose-50 text-rose-950'
                }`}
              >
                {secFeedback.mensaje || secFeedback.error}
              </div>
            )}
          </div>
        </details>
      </section>

      {blockingTarget && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeBlockingDialog();
            }}
          >
            <section
              ref={blockingDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="secretary-blocking-title"
              tabIndex={-1}
              className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-amber-200 bg-white shadow-2xl shadow-slate-950/30 focus:outline-none sm:max-h-[calc(100dvh-3rem)]"
            >
              <header className="flex items-start justify-between gap-4 rounded-t-3xl bg-gradient-to-br from-amber-50 to-white p-5 sm:p-6">
                <div>
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    {blockingTarget.type === 'slot' ? 'Bloqueo de horario' : 'Contingencia y feriados'}
                  </span>
                  <h2
                    id="secretary-blocking-title"
                    className="font-display mt-1 text-xl font-bold text-slate-900"
                  >
                    {blockingTarget.type === 'slot'
                      ? 'Bloquear este horario'
                      : 'Registrar ausencia o feriado'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {blockingTarget.type === 'slot'
                      ? 'Indica el motivo para inhabilitar este bloque.'
                      : 'Elige si el bloqueo aplica al profesional seleccionado o a toda la clínica.'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar diálogo de bloqueo"
                  onClick={closeBlockingDialog}
                  disabled={blockingInProgress}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </header>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-900">
                    {blockingTarget.type === 'slot'
                      ? `${selectedDoctor?.nombre || 'Profesional seleccionado'} · ${blockingTarget.block.hora_inicio} – ${blockingTarget.block.hora_fin}`
                      : selectedDoctor?.nombre || 'Profesional seleccionado'}
                  </p>
                  <p className="mt-0.5 text-slate-600">
                    {new Date(`${secFecha}T12:00:00`).toLocaleDateString('es-CL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                <label
                  htmlFor="secretary-blocking-reason"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Motivo
                  <input
                    id="secretary-blocking-reason"
                    type="text"
                    required
                    value={secMotivoBloqueo}
                    onChange={(event) => setSecMotivoBloqueo(event.target.value)}
                    placeholder="Motivo del bloqueo..."
                    className="mt-1.5 min-h-12 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm transition focus:border-amber-600 focus:outline-none focus:ring-4 focus:ring-amber-500/15"
                  />
                </label>

                {secFeedback && !secFeedback.ok && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                  >
                    {secFeedback.error || secFeedback.mensaje}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeBlockingDialog}
                    disabled={blockingInProgress}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  {blockingTarget.type === 'slot' ? (
                    <button
                      type="button"
                      onClick={() => submitBlockingAction(false)}
                      disabled={blockingInProgress || !secMotivoBloqueo.trim()}
                      className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {blockingInProgress ? 'Bloqueando…' : 'Bloquear horario'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => submitBlockingAction(false)}
                        disabled={blockingInProgress || !secMotivoBloqueo.trim()}
                        className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {blockingInProgress ? 'Bloqueando…' : 'Bloquear jornada'}
                      </button>
                      <button
                        type="button"
                        onClick={() => submitBlockingAction(true)}
                        disabled={blockingInProgress || !secMotivoBloqueo.trim()}
                        className="min-h-11 rounded-xl border border-amber-800 bg-amber-900 px-4 text-sm font-semibold text-amber-50 transition hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Bloquear fecha para todos
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}

      {appointmentAction && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeAppointmentDialog();
            }}
          >
            <section
              ref={appointmentDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="secretary-appointment-action-title"
              tabIndex={-1}
              className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30 focus:outline-none sm:max-h-[calc(100dvh-3rem)]"
            >
              <header
                className={`flex items-start justify-between gap-4 rounded-t-3xl p-5 sm:p-6 ${
                  appointmentAction.action === 'CANCELAR'
                    ? 'bg-gradient-to-br from-rose-50 to-white'
                    : 'bg-gradient-to-br from-teal-50 to-white'
                }`}
              >
                <div>
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-teal-800">
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                    Gestión de cita · Secretaría
                  </span>
                  <h2
                    id="secretary-appointment-action-title"
                    className="font-display mt-1 text-xl font-bold text-slate-900"
                  >
                    {appointmentAction.action === 'CANCELAR'
                      ? 'Cancelar cita por contingencia'
                      : 'Mover cita a otro horario'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {appointmentAction.action === 'CANCELAR'
                      ? 'La hora quedará disponible y avisaremos al paciente por correo.'
                      : 'Selecciona un bloque disponible. Avisaremos al paciente por correo.'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar gestión de cita"
                  onClick={closeAppointmentDialog}
                  disabled={appointmentSubmitting}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </header>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-900">
                    {appointmentAction.appointment.paciente_nombre} ·{' '}
                    {appointmentAction.appointment.codigo_reserva}
                  </p>
                  <p className="mt-0.5 text-slate-600">
                    {appointmentAction.appointment.paciente_email}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Cita actual: {appointmentAction.appointment.fecha},{' '}
                    {appointmentAction.appointment.hora_inicio}–
                    {appointmentAction.appointment.hora_fin} ·{' '}
                    {appointmentAction.appointment.medico_nombre}
                  </p>
                </div>

                {appointmentAction.action === 'MOVER' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label
                      htmlFor="move-appointment-doctor"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      Profesional
                      <select
                        id="move-appointment-doctor"
                        value={moveDoctorId}
                        onChange={(event) => setMoveDoctorId(event.target.value)}
                        className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      >
                        {medicos.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.nombre} · {doctor.especialidad_nombre}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label
                      htmlFor="move-appointment-date"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      Fecha nueva
                      <input
                        id="move-appointment-date"
                        type="date"
                        min={todayStr}
                        value={moveDate}
                        onChange={(event) => setMoveDate(event.target.value)}
                        className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm font-medium normal-case tracking-normal text-slate-800 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      />
                    </label>

                    <label
                      htmlFor="move-appointment-slot"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 sm:col-span-2"
                    >
                      Horario disponible
                      <select
                        id="move-appointment-slot"
                        value={moveAgendaId}
                        onChange={(event) => setMoveAgendaId(event.target.value)}
                        disabled={moveSlotsLoading || moveSlots.length === 0}
                        className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10 disabled:bg-slate-100"
                      >
                        <option value="">
                          {moveSlotsLoading ? 'Buscando horarios…' : 'Selecciona un horario'}
                        </option>
                        {moveSlots.map((slot) => (
                          <option key={slot.agenda_id} value={slot.agenda_id}>
                            {slot.fecha} · {slot.hora_inicio}–{slot.hora_fin} · {slot.medico_nombre}
                            {slot.box_atencion ? ` · ${slot.box_atencion}` : ''}
                          </option>
                        ))}
                      </select>
                      {moveSlotsError ? (
                        <span role="alert" className="mt-1 block text-xs font-medium text-rose-700">
                          {moveSlotsError}
                        </span>
                      ) : !moveSlotsLoading && moveSlots.length === 0 ? (
                        <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-slate-500">
                          No hay horarios futuros disponibles para esta selección.
                        </span>
                      ) : null}
                    </label>
                  </div>
                )}

                <label
                  htmlFor="appointment-action-reason"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Motivo de la gestión
                  <input
                    id="appointment-action-reason"
                    type="text"
                    required
                    maxLength={255}
                    value={appointmentReason}
                    onChange={(event) => setAppointmentReason(event.target.value)}
                    placeholder="Ej.: emergencia médica"
                    className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                  />
                </label>

                {appointmentError && (
                  <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                    {appointmentError}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeAppointmentDialog}
                    disabled={appointmentSubmitting}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={submitAppointmentAction}
                    disabled={
                      appointmentSubmitting ||
                      !appointmentReason.trim() ||
                      (appointmentAction.action === 'MOVER' &&
                        (moveSlotsLoading || !moveAgendaId || moveSlots.length === 0))
                    }
                    className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      appointmentAction.action === 'CANCELAR'
                        ? 'bg-rose-700 hover:bg-rose-800'
                        : 'bg-teal-800 hover:bg-teal-900'
                    }`}
                  >
                    {appointmentSubmitting
                      ? 'Procesando…'
                      : appointmentAction.action === 'CANCELAR'
                        ? 'Cancelar cita y avisar'
                        : 'Mover cita y avisar'}
                  </button>
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
