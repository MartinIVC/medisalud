import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, Clock, ShieldCheck, Stethoscope } from 'lucide-react';
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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-teal-50/60 p-4 sm:p-6">
      <section className="w-full max-w-lg space-y-5 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-lg shadow-slate-900/5 sm:p-8">
        <div className="border-b border-slate-100 pb-5">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <Stethoscope className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Gestión de cita
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Respuesta a tu cita</h1>
        </div>
        {loading && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-r-transparent" />
            Cargando detalle de la cita…
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        {appointment && (
          <>
            <p className="text-sm leading-6 text-slate-500">
              Revisa tu cita antes de confirmar asistencia o cancelar.
            </p>
            <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <dt className="font-semibold text-slate-500">Código</dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900">{appointment.codigo_reserva}</dd>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <dt className="flex items-center gap-1.5 font-semibold text-slate-500"><Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />Profesional</dt>
                <dd className="mt-1 font-medium text-slate-900">{appointment.medico_nombre}</dd>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <dt className="font-semibold text-slate-500">Especialidad</dt>
                <dd className="mt-1 font-medium text-slate-900">{appointment.especialidad_nombre}</dd>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <dt className="flex items-center gap-1.5 font-semibold text-slate-500"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />Fecha y hora</dt>
                <dd className="mt-1 flex items-center gap-1.5 font-medium text-slate-900">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden="true" />
                  {appointment.fecha} · {appointment.hora_inicio}–{appointment.hora_fin}
                </dd>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100 sm:col-span-2">
                <dt className="font-semibold text-slate-500">Lugar</dt>
                <dd className="mt-1 font-medium text-slate-900">{appointment.box_atencion}</dd>
              </div>
            </dl>
            {appointment.estado === 'CANCELADA' ? (
              <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"><AlertCircle className="h-5 w-5" aria-hidden="true" />Esta cita ya fue cancelada.</p>
            ) : actionDone ? (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                Tu respuesta quedó registrada.
              </p>
            ) : (
              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button
                  disabled={submitting}
                  onClick={() => respond('CONFIRMAR')}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 py-2 font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Confirmar asistencia
                </button>
                <button
                  disabled={submitting}
                  onClick={() => respond('CANCELAR')}
                  className="min-h-12 flex-1 rounded-xl border border-rose-200 bg-white px-3 py-2 font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-600/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar cita
                </button>
              </div>
            )}
          </>
        )}
        {reply && (
          <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            {reply}
          </p>
        )}
      </section>
    </main>
  );
}
