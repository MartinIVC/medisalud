import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import AppointmentResponse from './features/citas/AppointmentResponse';
import PatientPortal from './features/paciente/PatientPortal';
import usePatientPortal from './features/paciente/usePatientPortal';
import SecretaryPortal from './features/secretaria/SecretaryPortal';
import useSecretaryPortal from './features/secretaria/useSecretaryPortal';
import { Alert, Button, Field } from './components/ui';

export default function App() {
  const appointmentToken = new URLSearchParams(window.location.search).get('cita_token');
  const [activeTab, setActiveTab] = useState(() =>
    sessionStorage.getItem('medisalud-secretaria-token') ? 'secretaria' : 'paciente',
  );
  const [showPassword, setShowPassword] = useState(false);
  const patientAvailabilityRef = useRef(() => {});
  const refreshPatientAvailability = useCallback(
    (...args) => patientAvailabilityRef.current(...args),
    [],
  );
  const secretaryPortal = useSecretaryPortal({
    activeTab,
    refreshAvailability: refreshPatientAvailability,
  });
  const { state: secretaryState, actions: secretaryActions } = secretaryPortal;
  const patientPortal = usePatientPortal({
    medicos: secretaryState.medicos,
    especialidades: secretaryState.especialidades,
    catalogosLoading: secretaryState.catalogosLoading,
    catalogosError: secretaryState.catalogosError,
    retryCatalogos: secretaryActions.refreshDoctorCatalogs,
  });
  useEffect(() => {
    patientAvailabilityRef.current = patientPortal.actions.fetchDisponibilidad;
  }, [patientPortal.actions.fetchDisponibilidad]);

  if (appointmentToken) return <AppointmentResponse token={appointmentToken} />;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <header className="site-header no-print">
        <div className="header-inner">
          <a className="wordmark" href="/" aria-label="Medisalud, inicio">
            medisalud<span>Centro médico</span>
          </a>
          <nav className="main-nav" aria-label="Navegación principal">
            <button
              onClick={() => setActiveTab('paciente')}
              aria-current={activeTab === 'paciente' ? 'page' : undefined}
            >
              Reserva tu hora
            </button>
            <button
              onClick={() => setActiveTab('secretaria')}
              aria-current={activeTab === 'secretaria' ? 'page' : undefined}
            >
              Secretaría
            </button>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="main-content">
        {activeTab === 'paciente' ? (
          <PatientPortal state={patientPortal.state} actions={patientPortal.actions} />
        ) : !secretaryState.secretaryToken ? (
          <section className="login-layout">
            <div className="login-intro">
              <p className="section-context">Secretaría</p>
              <h1>
                Una agenda clara.
                <br />
                Una atención coordinada.
              </h1>
              <p>
                Consulta las horas del día, registra citas y organiza la disponibilidad de los
                profesionales.
              </p>
            </div>
            <div className="login-form">
              <h2>Iniciar sesión</h2>
              <p className="muted">Ingresa tu contraseña para acceder a la agenda.</p>
              {secretaryState.pendingMedicoDraft && (
                <Alert tone="warning">
                  Conservamos el borrador de {secretaryState.pendingMedicoDraft.nombre || 'médico'}.
                  Podrás retomarlo al iniciar sesión.
                </Alert>
              )}
              <form onSubmit={secretaryActions.loginSecretary}>
                <Field id="secretary-password" label="Contraseña">
                  <div className="password-input">
                    <input
                      id="secretary-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={secretaryState.secretaryPassword}
                      onChange={(event) =>
                        secretaryActions.setSecretaryPassword(event.target.value)
                      }
                    />
                    <Button
                      className="icon-button"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? (
                        <EyeOff size={20} aria-hidden="true" />
                      ) : (
                        <Eye size={20} aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </Field>
                {secretaryState.secretaryError && <Alert>{secretaryState.secretaryError}</Alert>}
                <Button variant="primary" type="submit">
                  Iniciar sesión
                </Button>
              </form>
            </div>
          </section>
        ) : (
          <SecretaryPortal state={secretaryState} actions={secretaryActions} />
        )}
      </main>
      <footer className="site-footer no-print">
        <span>Medisalud · Centro médico</span>
        <span>Agendamiento y atención ambulatoria</span>
      </footer>
    </div>
  );
}
