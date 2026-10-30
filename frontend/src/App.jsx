import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import AppointmentResponse from './features/citas/AppointmentResponse';
import PatientPortal from './features/paciente/PatientPortal';
import usePatientPortal from './features/paciente/usePatientPortal';
import SecretaryPortal from './features/secretaria/SecretaryPortal';
import useSecretaryPortal from './features/secretaria/useSecretaryPortal';

export default function App() {
  const appointmentToken = new URLSearchParams(window.location.search).get('cita_token');
  const [activeTab, setActiveTab] = useState('paciente');
  const [showPassword, setShowPassword] = useState(false);
  const [chileTime, setChileTime] = useState(() =>
    new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date()),
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setChileTime(
        new Intl.DateTimeFormat('es-CL', {
          timeZone: 'America/Santiago',
          hour: '2-digit',
          minute: '2-digit',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }).format(new Date()),
      );
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const patientAvailabilityRef = useRef(() => {});
  const refreshPatientAvailability = useCallback(
    (...args) => patientAvailabilityRef.current(...args),
    [],
  );
  const secretaryPortal = useSecretaryPortal({
    activeTab,
    refreshAvailability: refreshPatientAvailability,
  });
  const patientPortal = usePatientPortal({
    medicos: secretaryPortal.state.medicos,
    especialidades: secretaryPortal.state.especialidades,
  });
  useEffect(() => {
    patientAvailabilityRef.current = patientPortal.actions.fetchDisponibilidad;
  }, [patientPortal.actions.fetchDisponibilidad]);

  if (appointmentToken) return <AppointmentResponse token={appointmentToken} />;

  const { state: secretaryState, actions: secretaryActions } = secretaryPortal;
  const totalCupos = patientPortal.state.disponibilidad?.total_cupos_libres ?? 0;
  const totalMedicos = secretaryState.medicos?.length ?? 0;
  const totalEspecialidades = secretaryState.especialidades?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-clinical-canvas text-slate-800">
      {/* Barra superior de telemetría clínica */}
      <div className="no-print border-b border-teal-900/20 bg-teal-950 text-teal-100/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Red Clínica Activa
            </span>
            <span className="hidden text-teal-700 sm:inline">•</span>
            <span className="hidden text-teal-200/80 sm:inline">
              {totalMedicos > 0
                ? `${totalMedicos} especialistas en ${totalEspecialidades} especialidades`
                : 'Sincronización clínica en tiempo real'}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-teal-200/90">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-teal-400" aria-hidden="true" />
              Santiago · <span className="capitalize">{chileTime}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Cabecera principal */}
      <header className="sticky top-0 z-30 border-b border-teal-900/10 bg-white/85 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <a
            href="/"
            className="group flex w-fit items-center gap-3.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 text-white shadow-md shadow-teal-900/20 ring-1 ring-teal-600/30 transition duration-200 group-hover:scale-[1.03] group-hover:shadow-lg">
              <Stethoscope className="h-5 w-5 text-teal-100" aria-hidden="true" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-white">
                <Activity className="h-2.5 w-2.5 text-teal-950" aria-hidden="true" />
              </span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold tracking-tight text-slate-900">
                  Medisalud
                </span>
                <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-teal-800">
                  CLÍNICA
                </span>
              </div>
              <span className="block text-xs font-medium text-slate-500">
                Centro de Especialidades &amp; Diagnóstico
              </span>
            </div>
          </a>

          <nav
            aria-label="Navegación principal"
            className="flex w-full items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-100/90 p-1.5 shadow-inner sm:w-auto"
          >
            <button
              onClick={() => setActiveTab('paciente')}
              aria-current={activeTab === 'paciente' ? 'page' : undefined}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${
                activeTab === 'paciente'
                  ? 'bg-teal-900 text-white shadow-md shadow-teal-950/15 ring-1 ring-teal-800'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <span>Reserva tu hora</span>
              {totalCupos > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                    activeTab === 'paciente'
                      ? 'bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/30'
                      : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {totalCupos}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('secretaria')}
              aria-current={activeTab === 'secretaria' ? 'page' : undefined}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${
                activeTab === 'secretaria'
                  ? 'bg-teal-900 text-white shadow-md shadow-teal-950/15 ring-1 ring-teal-800'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Secretaría</span>
              {secretaryState.secretaryToken && (
                <span
                  title="Sesión administrativa activa"
                  className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30"
                />
              )}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {activeTab === 'paciente' ? (
          <PatientPortal state={patientPortal.state} actions={patientPortal.actions} />
        ) : !secretaryState.secretaryToken ? (
          <section className="mx-auto mt-4 max-w-4xl overflow-hidden rounded-3xl border border-teal-900/15 bg-white shadow-clinical-lg sm:mt-10">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Columna lateral de identidad y seguridad clínica */}
              <div className="bg-hero-mesh relative flex flex-col justify-between overflow-hidden p-6 text-white sm:p-8 lg:col-span-5">
                <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-teal-400/15 blur-2xl" />
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-teal-100">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                    Credencial Clínica
                  </span>
                  <h2 className="font-display mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Portal de Gestión &amp; Recepción
                  </h2>
                  <p className="mt-2.5 text-sm leading-6 text-teal-100/85">
                    Administra agendas médicas, registra sobrecupos o reservas presenciales y
                    gestiona bloqueos horarios en tiempo real.
                  </p>
                </div>

                <ul className="mt-8 space-y-3 border-t border-white/10 pt-5 text-xs text-teal-100/90">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>Sincronización inmediata con el portal de pacientes</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>Resguardo automático de borradores ante expiración</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>Control de concurrencia y validación de RUT chileno</span>
                  </li>
                </ul>
              </div>

              {/* Formulario de autenticación */}
              <div className="flex flex-col justify-center p-6 sm:p-10 lg:col-span-7">
                <div className="mb-6 flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-200/80">
                    <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-teal-700">
                      Autenticación Requerida
                    </span>
                    <h3 className="text-xl font-bold tracking-tight text-slate-900">
                      Acceso de secretaría
                    </h3>
                  </div>
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  Ingrese la contraseña configurada para este entorno para desbloquear la consola de
                  administración clínica.
                </p>

                {secretaryState.pendingMedicoDraft && (
                  <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 text-xs font-medium text-amber-900">
                    <Sparkles className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>
                      Borrador de médico resguardado (
                      <strong>{secretaryState.pendingMedicoDraft.nombre || 'En progreso'}</strong>).
                      Se restaurará al iniciar sesión.
                    </span>
                  </div>
                )}

                <form className="mt-6 space-y-5" onSubmit={secretaryActions.loginSecretary}>
                  <div className="space-y-2">
                    <label
                      htmlFor="secretary-password"
                      className="block text-sm font-semibold text-slate-800"
                    >
                      Contraseña
                    </label>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="secretary-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        placeholder="Ingresa tu clave de acceso clínico"
                        value={secretaryState.secretaryPassword}
                        onChange={(event) =>
                          secretaryActions.setSecretaryPassword(event.target.value)
                        }
                        className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50/60 py-2.5 pl-10 pr-11 text-sm shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  {secretaryState.secretaryError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
                    >
                      {secretaryState.secretaryError}
                    </p>
                  )}

                  <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20">
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    Iniciar sesión
                  </button>
                </form>
              </div>
            </div>
          </section>
        ) : (
          <SecretaryPortal state={secretaryState} actions={secretaryActions} />
        )}
      </main>

      {/* Pie de página clínico */}
      <footer className="no-print mt-12 border-t border-slate-200/80 bg-white/75 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-5 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-center">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-teal-900 text-teal-200">
              <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="font-semibold text-slate-700">Medisalud</span>
            <span>·</span>
            <span>Plataforma de Agendamiento y Gestión Ambulatoria</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
