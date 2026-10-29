import React, { useEffect, useState } from 'react';
import { requestApi } from '../../api/client';

export default function AppointmentResponse({ token }) {
  const [reply, setReply] = useState('');
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionDone, setActionDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    requestApi(`/api/citas/responder?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(({ ok, data }) => {
        if (!ok || !data.ok)
          throw new Error(data.error || 'No pudimos cargar el detalle de la cita.');
        setAppointment(data.cita);
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
      const data = response.data;
      if (response.ok) {
        setActionDone(true);
        setAppointment((current) => ({ ...current, estado: data.estado }));
      }
      setReply(
        response.ok
          ? action === 'CANCELAR'
            ? 'La cita fue cancelada y el cupo quedó actualizado.'
            : 'Gracias. Registramos que asistirás.'
          : data.error || 'No fue posible actualizar la cita.',
      );
    } catch {
      setReply('No pudimos actualizar la cita. Revisa tu conexión e intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
      <section className="max-w-md w-full rounded-xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Respuesta a tu cita</h1>
        {loading && (
          <p role="status" className="text-sm text-slate-600">
            Cargando detalle de la cita…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-800">
            {error}
          </p>
        )}
        {appointment && (
          <>
            <p className="text-sm text-slate-600">
              Revisa tu cita antes de confirmar asistencia o cancelar.
            </p>
            <dl className="rounded-lg bg-slate-50 p-4 space-y-2 text-sm">
              <div>
                <dt className="font-semibold">Código</dt>
                <dd>{appointment.codigo_reserva}</dd>
              </div>
              <div>
                <dt className="font-semibold">Profesional</dt>
                <dd>{appointment.medico_nombre}</dd>
              </div>
              <div>
                <dt className="font-semibold">Especialidad</dt>
                <dd>{appointment.especialidad_nombre}</dd>
              </div>
              <div>
                <dt className="font-semibold">Fecha y hora</dt>
                <dd>
                  {appointment.fecha} · {appointment.hora_inicio}–{appointment.hora_fin}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Lugar</dt>
                <dd>{appointment.box_atencion}</dd>
              </div>
            </dl>
            {appointment.estado === 'CANCELADA' ? (
              <p className="text-sm font-semibold text-rose-800">Esta cita ya fue cancelada.</p>
            ) : actionDone ? (
              <p role="status" className="text-sm font-semibold text-emerald-800">
                Tu respuesta quedó registrada.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  disabled={submitting}
                  onClick={() => respond('CONFIRMAR')}
                  className="min-h-11 flex-1 rounded-lg bg-teal-700 text-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  Confirmar asistencia
                </button>
                <button
                  disabled={submitting}
                  onClick={() => respond('CANCELAR')}
                  className="min-h-11 flex-1 rounded-lg border border-rose-300 text-rose-800 px-3 py-2 font-semibold disabled:opacity-50"
                >
                  Cancelar cita
                </button>
              </div>
            )}
          </>
        )}
        {reply && (
          <p role="status" className="text-sm text-slate-700">
            {reply}
          </p>
        )}
      </section>
    </main>
  );
}
