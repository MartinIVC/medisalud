import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Search, XCircle } from 'lucide-react';
import { requestApi } from '../../api/client.js';
import { formatRutInput, validateRutClient } from '../../utils/rut.js';
import { Alert, AppointmentDetails, Button, EmptyState, Field } from '../../components/ui';

function AppointmentStatusBadge({ estado, asistenciaEstado }) {
  const isCancelled = estado === 'CANCELADA';
  const Icon = isCancelled ? XCircle : CheckCircle2;
  const label = isCancelled ? 'Cancelada' : 'Confirmada';

  return (
    <div className="my-appointment-statuses">
      <span className={`appointment-status-badge ${isCancelled ? 'is-cancelled' : 'is-confirmed'}`}>
        <Icon size={15} aria-hidden="true" />
        {label}
      </span>
      {!isCancelled && asistenciaEstado === 'ASISTIRA' && (
        <span className="asistencia-badge is-confirmed">Asistencia confirmada</span>
      )}
    </div>
  );
}

export default function MisCitas({ onGoToBooking }) {
  const [rutInput, setRutInput] = useState('');
  const [rutError, setRutError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function runLookup(rawRut) {
    const trimmed = rawRut.trim();
    if (!trimmed) {
      setRutError('Ingresa tu RUT para consultar tus citas.');
      setApiError('');
      setResult(null);
      return;
    }

    const check = validateRutClient(trimmed);
    if (!check.valid) {
      setRutError(check.message || 'El RUT ingresado no es válido.');
      setApiError('');
      setResult(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setRutError('');
    setApiError('');
    setLoading(true);

    try {
      const params = new URLSearchParams({ rut: trimmed });
      const response = await requestApi(`/api/reservas/mis-citas?${params.toString()}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;

      if (response.ok && response.data?.ok) {
        setResult({
          rut: response.data.rut || formatRutInput(trimmed),
          citas: Array.isArray(response.data.citas) ? response.data.citas : [],
        });
      } else if (response.status === 400) {
        setResult(null);
        setRutError(
          response.data?.fields?.rut ||
            response.data?.mensaje ||
            response.data?.error ||
            'El RUT ingresado no es válido.',
        );
      } else {
        setResult(null);
        setApiError(
          response.data?.mensaje ||
            response.data?.error ||
            'No pudimos consultar tus citas. Intenta nuevamente.',
        );
      }
    } catch {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setResult(null);
        setApiError('No pudimos conectar con el sistema. Revisa tu conexión e intenta nuevamente.');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    runLookup(rutInput);
  }

  function handleClear() {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setRutInput('');
    setRutError('');
    setApiError('');
    setResult(null);
    setLoading(false);
  }

  return (
    <section className="my-appointments-section" aria-labelledby="my-appointments-title">
      <div className="my-appointments-toolbar">
        <div>
          <h2 id="my-appointments-title">Consultar mis citas</h2>
          <p className="muted">
            Ingresa tu RUT con o sin puntos ni guion para ver tus horas confirmadas o canceladas.
          </p>
        </div>

        <form className="my-appointments-form" onSubmit={handleSubmit} noValidate>
          <Field
            id="patient-lookup-rut"
            label="RUT del paciente"
            error={rutError}
            hint="Ejemplo: 12.345.678-5"
          >
            <input
              id="patient-lookup-rut"
              name="rut"
              type="text"
              autoComplete="off"
              placeholder="12.345.678-5"
              maxLength={15}
              value={rutInput}
              onChange={(event) => {
                setRutInput(formatRutInput(event.target.value));
                if (rutError) setRutError('');
                if (apiError) setApiError('');
              }}
              aria-invalid={Boolean(rutError)}
              aria-describedby={
                rutError
                  ? 'patient-lookup-rut-hint patient-lookup-rut-error'
                  : 'patient-lookup-rut-hint'
              }
            />
          </Field>
          <div className="my-appointments-actions">
            <Button variant="primary" type="submit" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Consultando…' : 'Consultar citas'}
            </Button>
            {(rutInput || result || rutError || apiError) && (
              <Button onClick={handleClear} disabled={loading}>
                Limpiar
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="my-appointments-results" aria-busy={loading}>
        {loading ? (
          <p className="loading-state" role="status">
            Consultando tus citas…
          </p>
        ) : apiError ? (
          <Alert>
            {apiError}
            <Button onClick={() => runLookup(rutInput)}>Reintentar</Button>
          </Alert>
        ) : result && result.citas.length === 0 ? (
          <EmptyState
            title="No encontramos citas asociadas a este RUT"
            action={
              onGoToBooking ? (
                <Button variant="primary" onClick={onGoToBooking}>
                  Reservar una hora
                </Button>
              ) : null
            }
          >
            No hay reservas registradas para el RUT{' '}
            <strong className="numeric">{result.rut}</strong>. Si necesitas atención médica, puedes
            agendar una hora disponible.
          </EmptyState>
        ) : result && result.citas.length > 0 ? (
          <>
            <p className="my-appointments-summary" role="status">
              {result.citas.length === 1
                ? 'Encontramos 1 cita asociada al RUT '
                : `Encontramos ${result.citas.length} citas asociadas al RUT `}
              <strong className="numeric">{result.rut}</strong>.
            </p>
            <ul className="my-appointments-list" aria-label="Listado de citas del paciente">
              {result.citas.map((cita) => (
                <li key={cita.id || cita.codigo_reserva} className="my-appointment-item">
                  <div className="my-appointment-header">
                    <div>
                      <span className="my-appointment-code-label">Código de reserva</span>
                      <strong className="my-appointment-code numeric">
                        {cita.codigo_reserva || '—'}
                      </strong>
                    </div>
                    <AppointmentStatusBadge
                      estado={cita.estado}
                      asistenciaEstado={cita.asistencia_estado}
                    />
                  </div>
                  <AppointmentDetails appointment={cita} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
