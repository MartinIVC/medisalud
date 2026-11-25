import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, MailCheck, Search, XCircle } from 'lucide-react';
import { requestApi } from '../../api/client.js';
import { formatRutInput, validateRutClient } from '../../utils/rut.js';
import { Alert, AppointmentDetails, Button, EmptyState, Field } from '../../components/ui';

const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

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

export default function MisCitas({ onGoToBooking, inactivityTimeoutMs = DEFAULT_INACTIVITY_MS }) {
  const [rutInput, setRutInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [rutError, setRutError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [pendingRequest, setPendingRequest] = useState(null);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendRemainingSec, setResendRemainingSec] = useState(0);
  const [result, setResult] = useState(null);
  const [expiredNotice, setExpiredNotice] = useState('');

  // Confirmación de código de recuperación asistida por secretaría
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');

  const requestSeqRef = useRef(0);
  const abortRef = useRef(null);

  const resetActiveQuery = useCallback(() => {
    abortRef.current?.abort();
    requestSeqRef.current += 1;
    setPendingRequest(null);
    setCodeInput('');
    setCodeError('');
    setApiError('');
    setResult(null);
    setLoading(false);
    setVerifying(false);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      requestSeqRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!pendingRequest?.reenvioDisponibleEn) {
      setResendRemainingSec(0);
      return undefined;
    }
    const update = () => {
      const diff = new Date(pendingRequest.reenvioDisponibleEn).getTime() - Date.now();
      setResendRemainingSec(Math.max(0, Math.ceil(diff / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pendingRequest?.reenvioDisponibleEn]);

  // Expiración automática del historial tras 5 minutos sin actividad
  useEffect(() => {
    if (!result) return undefined;
    let timerId;
    const schedule = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        setResult(null);
        setPendingRequest(null);
        setCodeInput('');
        setExpiredNotice(
          'El historial se cerró automáticamente por inactividad. Solicita un nuevo código para volver a consultarlo.',
        );
      }, inactivityTimeoutMs);
    };
    schedule();
    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, schedule, { passive: true }));
    return () => {
      window.clearTimeout(timerId);
      events.forEach((eventName) => window.removeEventListener(eventName, schedule));
    };
  }, [result, inactivityTimeoutMs]);

  async function requestCode({ isResend = false } = {}) {
    const trimmedRut = rutInput.trim();
    const trimmedEmail = emailInput.trim();
    let hasError = false;

    if (!trimmedRut) {
      setRutError('Ingresa tu RUT para consultar tus citas.');
      hasError = true;
    } else {
      const check = validateRutClient(trimmedRut);
      if (!check.valid) {
        setRutError(check.message || 'El RUT ingresado no es válido.');
        hasError = true;
      } else {
        setRutError('');
      }
    }

    if (!trimmedEmail || trimmedEmail.length > 150 || !EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError('Ingresa un correo electrónico válido.');
      hasError = true;
    } else {
      setEmailError('');
    }

    if (hasError) {
      setApiError('');
      setResult(null);
      setPendingRequest(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setApiError('');
    setCodeError('');
    setExpiredNotice('');
    if (!isResend) {
      setResult(null);
      setCodeInput('');
    }
    setLoading(true);

    try {
      const response = await requestApi('/api/reservas/mis-citas/solicitudes', {
        method: 'POST',
        body: { rut: trimmedRut, correo: trimmedEmail },
        signal: controller.signal,
      });
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;

      const data = response.data || {};
      if (response.ok && data.ok) {
        setPendingRequest({
          solicitudId: data.solicitud_id,
          mensaje:
            data.mensaje || 'Si los datos coinciden, recibirás un código para consultar tus citas.',
          expiraEn: data.expira_en,
          reenvioDisponibleEn: data.reenvio_disponible_en,
        });
      } else if (response.status === 400) {
        if (data.fields?.rut) setRutError(data.fields.rut);
        if (data.fields?.correo) setEmailError(data.fields.correo);
        if (!data.fields?.rut && !data.fields?.correo) {
          setApiError(data.mensaje || data.error || 'Revisa los datos ingresados.');
        }
      } else {
        setApiError(
          data.mensaje || data.error || 'No pudimos iniciar la consulta. Intenta nuevamente.',
        );
      }
    } catch {
      if (!controller.signal.aborted && seq === requestSeqRef.current) {
        setApiError('No pudimos conectar con el sistema. Revisa tu conexión e intenta nuevamente.');
      }
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    if (!pendingRequest?.solicitudId) return;
    const cleanCode = codeInput.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setCodeError('Ingresa el código de 6 dígitos enviado a tu correo.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setCodeError('');
    setApiError('');
    setExpiredNotice('');
    setVerifying(true);

    try {
      const response = await requestApi('/api/reservas/mis-citas/verificar', {
        method: 'POST',
        body: { solicitud_id: pendingRequest.solicitudId, codigo: cleanCode },
        signal: controller.signal,
      });
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;

      const data = response.data || {};
      if (response.ok && data.ok) {
        setResult({
          rut: data.rut || formatRutInput(rutInput),
          citas: Array.isArray(data.citas) ? data.citas : [],
        });
        setPendingRequest(null);
        setCodeInput('');
      } else if (response.status === 400) {
        setCodeError(
          data.mensaje ||
            data.error ||
            'El código ingresado no es válido o venció. Solicita uno nuevo e intenta nuevamente.',
        );
      } else {
        setApiError(
          data.mensaje || data.error || 'No pudimos verificar el código. Intenta nuevamente.',
        );
      }
    } catch {
      if (!controller.signal.aborted && seq === requestSeqRef.current) {
        setApiError('No pudimos conectar con el sistema. Revisa tu conexión e intenta nuevamente.');
      }
    } finally {
      if (seq === requestSeqRef.current) setVerifying(false);
    }
  }

  async function handleConfirmRecovery(event) {
    event.preventDefault();
    const trimmedId = recoveryId.trim();
    const trimmedCode = recoveryCode.trim();
    if (!trimmedId || !/^\d{6}$/.test(trimmedCode)) {
      setRecoveryError('Ingresa el identificador de solicitud y el código de 6 dígitos.');
      setRecoverySuccess('');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryError('');
    setRecoverySuccess('');

    try {
      const response = await requestApi('/api/reservas/mis-citas/recuperacion/confirmar', {
        method: 'POST',
        body: { solicitud_id: trimmedId, codigo: trimmedCode },
      });
      const data = response.data || {};
      if (response.ok && data.ok) {
        setRecoverySuccess(
          data.mensaje ||
            'Verificación completada. Ya puedes consultar tus citas con el nuevo correo.',
        );
        setRecoveryId('');
        setRecoveryCode('');
        if (data.rut) setRutInput(data.rut);
        if (data.correo) setEmailInput(data.correo);
      } else {
        setRecoveryError(
          data.mensaje ||
            data.error ||
            'El código ingresado no es válido o venció. Solicita asistencia a secretaría.',
        );
      }
    } catch {
      setRecoveryError(
        'No pudimos conectar con el sistema. Revisa tu conexión e intenta nuevamente.',
      );
    } finally {
      setRecoveryLoading(false);
    }
  }

  function handleSubmitLookup(event) {
    event.preventDefault();
    requestCode({ isResend: false });
  }

  function handleClear() {
    resetActiveQuery();
    setRutInput('');
    setEmailInput('');
    setRutError('');
    setEmailError('');
    setExpiredNotice('');
  }

  return (
    <section className="my-appointments-section" aria-labelledby="my-appointments-title">
      <div className="my-appointments-toolbar">
        <div>
          <h2 id="my-appointments-title">Consultar mis citas</h2>
          <p className="muted">
            Ingresa tu RUT y el correo electrónico con el que verificaste tus reservas. Te
            enviaremos un código temporal de 6 dígitos para abrir tu historial.
          </p>
        </div>

        <form className="my-appointments-form-grid" onSubmit={handleSubmitLookup} noValidate>
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
                if (expiredNotice) setExpiredNotice('');
                if (pendingRequest || result || apiError) resetActiveQuery();
              }}
              aria-invalid={Boolean(rutError)}
              aria-describedby={
                rutError
                  ? 'patient-lookup-rut-hint patient-lookup-rut-error'
                  : 'patient-lookup-rut-hint'
              }
            />
          </Field>

          <Field
            id="patient-lookup-email"
            label="Correo electrónico"
            error={emailError}
            hint="El mismo correo usado al verificar tus reservas."
          >
            <input
              id="patient-lookup-email"
              name="correo"
              type="email"
              autoComplete="email"
              placeholder="nombre@correo.cl"
              maxLength={150}
              value={emailInput}
              onChange={(event) => {
                setEmailInput(event.target.value);
                if (emailError) setEmailError('');
                if (expiredNotice) setExpiredNotice('');
                if (pendingRequest || result || apiError) resetActiveQuery();
              }}
              aria-invalid={Boolean(emailError)}
              aria-describedby={
                emailError
                  ? 'patient-lookup-email-hint patient-lookup-email-error'
                  : 'patient-lookup-email-hint'
              }
            />
          </Field>

          <div className="my-appointments-actions span-full">
            <Button variant="primary" type="submit" disabled={loading || verifying}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Solicitando código…' : 'Solicitar código'}
            </Button>
            {(rutInput ||
              emailInput ||
              pendingRequest ||
              result ||
              rutError ||
              emailError ||
              apiError) && <Button onClick={handleClear}>Limpiar</Button>}
          </div>
        </form>
      </div>

      {expiredNotice && (
        <div className="my-appointments-results">
          <Alert>{expiredNotice}</Alert>
        </div>
      )}

      {pendingRequest && (
        <div className="my-appointments-verify-box" aria-busy={verifying}>
          <Alert tone="success">{pendingRequest.mensaje}</Alert>
          <form className="my-appointments-code-form" onSubmit={handleVerifyCode} noValidate>
            <Field
              id="patient-lookup-code"
              label="Código de consulta (6 dígitos)"
              error={codeError}
              hint="Vigencia de 10 minutos. El resultado permanecerá visible solo mientras permanezcas activo en esta pestaña."
            >
              <input
                id="patient-lookup-code"
                name="codigo"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={codeInput}
                onChange={(event) => {
                  setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6));
                  if (codeError) setCodeError('');
                }}
                aria-invalid={Boolean(codeError)}
                aria-describedby={
                  codeError
                    ? 'patient-lookup-code-hint patient-lookup-code-error'
                    : 'patient-lookup-code-hint'
                }
              />
            </Field>
            <div className="button-group">
              <Button variant="primary" type="submit" disabled={verifying || loading}>
                <MailCheck size={16} aria-hidden="true" />
                {verifying ? 'Verificando…' : 'Ver mis citas'}
              </Button>
              <Button
                disabled={loading || verifying || resendRemainingSec > 0}
                onClick={() => requestCode({ isResend: true })}
              >
                {resendRemainingSec > 0
                  ? `Reenviar código (${resendRemainingSec} s)`
                  : 'Reenviar código'}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="my-appointments-results" aria-busy={loading || verifying}>
        {loading && !pendingRequest ? (
          <p className="loading-state" role="status">
            Procesando solicitud de consulta…
          </p>
        ) : apiError ? (
          <Alert>
            {apiError}
            <Button onClick={() => requestCode({ isResend: Boolean(pendingRequest) })}>
              Reintentar
            </Button>
          </Alert>
        ) : result && result.citas.length === 0 ? (
          <EmptyState
            title="No encontramos citas asociadas a este RUT y correo"
            action={
              onGoToBooking ? (
                <Button variant="primary" onClick={onGoToBooking}>
                  Reservar una hora
                </Button>
              ) : null
            }
          >
            El vínculo verificado para <strong className="numeric">{result.rut}</strong> no tiene
            citas asignadas actualmente. Si necesitas incorporar citas anteriores o reservadas por
            secretaría, solicita una recuperación asistida.
          </EmptyState>
        ) : result && result.citas.length > 0 ? (
          <>
            <p className="my-appointments-summary" role="status">
              {result.citas.length === 1
                ? 'Encontramos 1 cita vinculada al RUT '
                : `Encontramos ${result.citas.length} citas vinculadas al RUT `}
              <strong className="numeric">{result.rut}</strong>. El historial se cerrará al salir de
              esta pestaña o tras 5 minutos sin actividad.
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

      <div className="recovery-confirm-box">
        <Button
          variant="text"
          aria-expanded={recoveryOpen}
          onClick={() => {
            setRecoveryOpen((open) => !open);
            setRecoveryError('');
            setRecoverySuccess('');
          }}
        >
          <KeyRound size={16} aria-hidden="true" />
          {recoveryOpen
            ? 'Ocultar confirmación de recuperación asistida'
            : '¿Secretaría te envió un código de recuperación asistida?'}
        </Button>

        {recoveryOpen && (
          <form className="recovery-confirm-form" onSubmit={handleConfirmRecovery} noValidate>
            <p className="muted">
              Si secretaría inició una vinculación o cambio de correo para tus citas, ingresa el
              identificador de solicitud y el código de 6 dígitos recibido en tu nuevo correo.
            </p>
            <div className="form-grid">
              <Field id="recovery-solicitud-id" label="Identificador de solicitud">
                <input
                  id="recovery-solicitud-id"
                  type="text"
                  autoComplete="off"
                  value={recoveryId}
                  onChange={(event) => {
                    setRecoveryId(event.target.value);
                    if (recoveryError) setRecoveryError('');
                  }}
                />
              </Field>
              <Field id="recovery-code" label="Código de recuperación (6 dígitos)">
                <input
                  id="recovery-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={recoveryCode}
                  onChange={(event) => {
                    setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    if (recoveryError) setRecoveryError('');
                  }}
                />
              </Field>
            </div>
            {recoveryError && <Alert>{recoveryError}</Alert>}
            {recoverySuccess && <Alert tone="success">{recoverySuccess}</Alert>}
            <div className="button-group">
              <Button variant="primary" type="submit" disabled={recoveryLoading}>
                {recoveryLoading ? 'Confirmando…' : 'Confirmar recuperación'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
