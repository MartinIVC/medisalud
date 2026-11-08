import React, { useEffect, useState } from 'react';
import { requestApi } from '../../api/client';
import { Alert, AppointmentDetails, Button, Dialog, formatDate } from '../../components/ui';

export default function AppointmentResponse({ token }) {
  const [reply, setReply] = useState('');
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionDone, setActionDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestApi(`/api/citas/responder?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(({ ok, data }) => {
        if (!controller.signal.aborted) {
          if (!ok || !data.ok)
            throw new Error(data.error || 'No pudimos cargar el detalle de la cita.');
          setAppointment(data.cita);
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);
  async function respond(action) {
    setReply('');
    setSubmitting(true);
    try {
      const response = await requestApi('/api/citas/responder', {
        method: 'POST',
        body: { token, accion: action },
      });
      if (response.ok) {
        setActionDone(true);
        setAppointment((current) => ({ ...current, estado: response.data.estado }));
      }
      setReply(
        response.ok
          ? action === 'CANCELAR'
            ? 'La cita fue cancelada y el cupo quedó actualizado.'
            : 'Gracias. Registramos que asistirás.'
          : response.data.error || 'No fue posible actualizar la cita.',
      );
    } catch {
      setReply('No pudimos actualizar la cita. Revisa tu conexión e intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="/">
            medisalud<span>Centro médico</span>
          </a>
        </div>
      </header>
      <main className="main-content response-page">
        <p className="section-context">Tu atención</p>
        <h1>Respuesta a tu cita</h1>
        <p className="muted">Revisa los datos antes de confirmar tu asistencia.</p>
        {loading && (
          <p className="loading-state" role="status">
            Cargando detalle de la cita…
          </p>
        )}
        {error && <Alert>{error}</Alert>}
        {appointment && (
          <>
            <div className="reservation-code">
              <div>
                <span>Código de reserva</span>
                <strong>{appointment.codigo_reserva}</strong>
              </div>
            </div>
            <AppointmentDetails appointment={appointment} />
            {appointment.estado === 'CANCELADA' ? (
              <Alert tone="warning">{reply || 'Esta cita fue cancelada.'}</Alert>
            ) : actionDone ? (
              <Alert tone="success">{reply || 'Gracias. Registramos que asistirás.'}</Alert>
            ) : (
              <div className="form-actions">
                <Button
                  variant="primary"
                  disabled={submitting}
                  onClick={() => respond('CONFIRMAR')}
                >
                  {submitting ? 'Actualizando…' : 'Confirmar asistencia'}
                </Button>
                <Button
                  variant="danger"
                  disabled={submitting}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancelar cita
                </Button>
              </div>
            )}
            {!actionDone && reply && <Alert tone="error">{reply}</Alert>}
          </>
        )}
        <Dialog
          open={confirmCancel}
          title="Cancelar tu cita"
          busy={submitting}
          onClose={() => setConfirmCancel(false)}
        >
          <p>
            Se cancelará la cita con {appointment?.medico_nombre}, el{' '}
            {formatDate(appointment?.fecha)} a las {appointment?.hora_inicio}. El horario quedará
            disponible.
          </p>
          <div className="form-actions">
            <Button disabled={submitting} onClick={() => setConfirmCancel(false)}>
              Conservar cita
            </Button>
            <Button
              variant="danger"
              disabled={submitting}
              onClick={async () => {
                await respond('CANCELAR');
                setConfirmCancel(false);
              }}
            >
              {submitting ? 'Cancelando…' : 'Confirmar cancelación'}
            </Button>
          </div>
        </Dialog>
      </main>
    </div>
  );
}
