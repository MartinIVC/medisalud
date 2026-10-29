import React, { useCallback, useRef, useState } from 'react';
import AppointmentResponse from './features/citas/AppointmentResponse';
import PatientPortal from './features/paciente/PatientPortal';
import usePatientPortal from './features/paciente/usePatientPortal';
import SecretaryPortal from './features/secretaria/SecretaryPortal';
import useSecretaryPortal from './features/secretaria/useSecretaryPortal';

export default function App() {
  const appointmentToken = new URLSearchParams(window.location.search).get('cita_token');
  const [activeTab, setActiveTab] = useState('paciente');
  const patientAvailabilityRef = useRef(() => {});
  const refreshPatientAvailability = useCallback((...args) => patientAvailabilityRef.current(...args), []);
  const secretaryPortal = useSecretaryPortal({ activeTab, refreshAvailability: refreshPatientAvailability });
  const patientPortal = usePatientPortal({
    medicos: secretaryPortal.state.medicos,
    especialidades: secretaryPortal.state.especialidades,
  });
  patientAvailabilityRef.current = patientPortal.actions.fetchDisponibilidad;

  if (appointmentToken) return <AppointmentResponse token={appointmentToken} />;

  const { state: secretaryState, actions: secretaryActions } = secretaryPortal;
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <a href="/" className="text-xl font-bold tracking-tight text-teal-900">Medisalud</a>
          <nav aria-label="Navegación principal" className="flex w-full sm:w-auto items-center gap-2">
            <button onClick={() => setActiveTab('paciente')} aria-current={activeTab === 'paciente' ? 'page' : undefined}
              className={`min-h-11 flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === 'paciente' ? 'bg-teal-50 text-teal-900' : 'text-slate-600 hover:bg-slate-100'}`}>
              Reserva tu hora
            </button>
            <button onClick={() => setActiveTab('secretaria')} aria-current={activeTab === 'secretaria' ? 'page' : undefined}
              className={`min-h-11 flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === 'secretaria' ? 'bg-teal-50 text-teal-900' : 'text-slate-600 hover:bg-slate-100'}`}>
              Secretaría
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
        {activeTab === 'paciente' ? (
          <PatientPortal state={patientPortal.state} actions={patientPortal.actions} />
        ) : !secretaryState.secretaryToken ? (
          <section className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800">Acceso de secretaría</h2>
            <p className="text-sm text-slate-600 mt-1">Ingrese la contraseña configurada para este entorno.</p>
            <form className="mt-4 space-y-3" onSubmit={secretaryActions.loginSecretary}>
              <label htmlFor="secretary-password" className="block text-sm font-semibold text-slate-700">Contraseña</label>
              <input id="secretary-password" type="password" autoComplete="current-password" required value={secretaryState.secretaryPassword}
                onChange={(event) => secretaryActions.setSecretaryPassword(event.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {secretaryState.secretaryError && <p role="alert" className="text-sm text-rose-700">{secretaryState.secretaryError}</p>}
              <button className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm">Iniciar sesión</button>
            </form>
          </section>
        ) : (
          <SecretaryPortal state={secretaryState} actions={secretaryActions} />
        )}
      </main>
    </div>
  );
}
