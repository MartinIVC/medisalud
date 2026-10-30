import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, Lock, LogIn, ShieldCheck, Stethoscope } from 'lucide-react';
import AppointmentResponse from './features/citas/AppointmentResponse';
import PatientPortal from './features/paciente/PatientPortal';
import usePatientPortal from './features/paciente/usePatientPortal';
import SecretaryPortal from './features/secretaria/SecretaryPortal';
import useSecretaryPortal from './features/secretaria/useSecretaryPortal';

export default function App() {
  const appointmentToken = new URLSearchParams(window.location.search).get('cita_token');
  const [activeTab, setActiveTab] = useState('paciente');
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
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 border-b border-teal-200/80 bg-teal-50/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <a
            href="/"
            className="group flex w-fit items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-700 text-white shadow-sm transition group-hover:bg-teal-800">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg font-bold tracking-tight text-slate-900">Medisalud</span>
              <span className="block text-xs font-medium text-slate-500">Centro médico</span>
            </span>
          </a>
          <nav
            aria-label="Navegación principal"
            className="flex w-full items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 sm:w-auto"
          >
            <button
              onClick={() => setActiveTab('paciente')}
              aria-current={activeTab === 'paciente' ? 'page' : undefined}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${activeTab === 'paciente' ? 'bg-white text-teal-800 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Reserva tu hora
            </button>
            <button
              onClick={() => setActiveTab('secretaria')}
              aria-current={activeTab === 'secretaria' ? 'page' : undefined}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${activeTab === 'secretaria' ? 'bg-white text-teal-800 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Secretaría
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {activeTab === 'paciente' ? (
          <PatientPortal state={patientPortal.state} actions={patientPortal.actions} />
        ) : !secretaryState.secretaryToken ? (
          <section className="mx-auto mt-8 max-w-md rounded-2xl border border-teal-200 bg-teal-100/70 p-6 shadow-md shadow-teal-950/5 sm:mt-14 sm:p-8">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Acceso de secretaría</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Ingrese la contraseña configurada para este entorno.
            </p>
            <form className="mt-6 space-y-4" onSubmit={secretaryActions.loginSecretary}>
              <div className="space-y-1.5">
                <label
                  htmlFor="secretary-password"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    id="secretary-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={secretaryState.secretaryPassword}
                    onChange={(event) => secretaryActions.setSecretaryPassword(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                  />
                </div>
              </div>
              {secretaryState.secretaryError && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {secretaryState.secretaryError}
                </p>
              )}
              <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Iniciar sesión
              </button>
            </form>
          </section>
        ) : (
          <SecretaryPortal state={secretaryState} actions={secretaryActions} />
        )}
      </main>
    </div>
  );
}
