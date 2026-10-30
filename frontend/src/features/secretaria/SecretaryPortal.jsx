import React from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogOut,
  Plus,
  ShieldCheck,
  User,
} from 'lucide-react';
import { formatRutInput } from '../../utils/rut';
import { onlyMobileSubscriberDigits, parseChileanMobileDigits } from '../../utils/phone.js';
import CrearMedico from '../../components/CrearMedico';

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
  return secretaryView === 'create-medico' ? (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
      <div className="flex justify-end lg:col-span-3">
        <button
          type="button"
          onClick={() => setSecretaryView('create-medico')}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Crear médico
        </button>
      </div>
      <section className="order-2 h-fit space-y-5 rounded-2xl border border-teal-200 bg-teal-100/70 p-5 shadow-md shadow-teal-950/5 sm:p-6 lg:col-span-3">
        <details
          open={scheduleDetailsOpen}
          onToggle={(event) => setScheduleDetailsOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-slate-900 marker:text-teal-700">
            Configurar horarios y registrar ausencias
          </summary>
          <div className="pt-4 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Configurar horarios</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Define los bloques de atención o registra un feriado o una ausencia.
              </p>
            </div>

            <form onSubmit={handleConfigurarAgenda} className="space-y-3">
              <div>
                <label
                  htmlFor="schedule-doctor"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Profesional
                </label>
                <select
                  id="schedule-doctor"
                  value={secMedicoId}
                  onChange={(e) => setSecMedicoId(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                >
                  {medicos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} ({m.especialidad_nombre})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="schedule-date"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Fecha
                </label>
                <input
                  id="schedule-date"
                  type="date"
                  value={secFecha}
                  onChange={(e) => setSecFecha(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="schedule-start"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Hora Inicio
                  </label>
                  <input
                    id="schedule-start"
                    type="time"
                    value={secHoraInicio}
                    onChange={(e) => setSecHoraInicio(e.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                  />
                </div>
                <div>
                  <label
                    htmlFor="schedule-end"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Hora Fin
                  </label>
                  <input
                    id="schedule-end"
                    type="time"
                    value={secHoraFin}
                    onChange={(e) => setSecHoraFin(e.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="schedule-duration"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
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

              <button
                type="submit"
                className="min-h-12 w-full rounded-xl bg-teal-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20"
              >
                Guardar horarios
              </button>
            </form>

            <hr className="border-slate-200" />

            {/* Bloqueo de feriados o licencias médicas (CA-02) */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Registrar ausencia o feriado</h3>
              <label
                htmlFor="absence-reason"
                className="block text-sm font-semibold text-slate-700"
              >
                Motivo
                <input
                  id="absence-reason"
                  type="text"
                  value={secMotivoBloqueo}
                  onChange={(e) => setSecMotivoBloqueo(e.target.value)}
                  placeholder="Motivo del bloqueo..."
                  className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                />
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => handleBloquearDia(false)}
                  className="min-h-11 w-full rounded-xl bg-amber-600 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20"
                >
                  Bloquear jornada del profesional
                </button>
                <button
                  type="button"
                  onClick={() => handleBloquearDia(true)}
                  className="min-h-11 w-full rounded-xl bg-amber-700 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20"
                >
                  Bloquear fecha para todos los profesionales
                </button>
              </div>
            </div>

            {secFeedback && (
              <div
                role={secFeedback.ok ? 'status' : 'alert'}
                className={`rounded-xl border p-4 text-sm ${secFeedback.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}
              >
                {secFeedback.mensaje || secFeedback.error}
              </div>
            )}
          </div>
        </details>
      </section>

      {/* Tabla de estado de bloques del médico */}
      <section className="order-1 rounded-2xl border border-teal-200 bg-teal-100/70 p-5 shadow-md shadow-teal-950/5 sm:p-6 lg:col-span-3">
        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Administración clínica
            </p>
            <h2
              id="secretary-agenda-title"
              tabIndex={-1}
              className="text-2xl font-bold tracking-tight text-slate-900"
            >
              Agenda del día
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Revisa los horarios y registra una reserva desde recepción.
            </p>
          </div>
          <button
            type="button"
            onClick={logoutSecretary}
            className="flex min-h-11 self-start items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 lg:self-auto"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(170px,auto)_auto_auto]">
          <label className="text-sm font-semibold text-slate-700">
            <span className="mb-1.5 flex items-center gap-2"><User className="h-4 w-4 text-slate-400" aria-hidden="true" />Profesional</span>
            <select
              aria-label="Profesional de la agenda"
              value={secMedicoId}
              onChange={(e) => setSecMedicoId(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
            >
              {medicos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} · {m.especialidad_nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            <span className="mb-1.5 flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />Fecha</span>
            <input
              aria-label="Fecha de la agenda"
              type="date"
              value={secFecha}
              onChange={(e) => setSecFecha(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
            />
          </label>
          <div className="flex items-end gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => moveSecretaryDate(-1)}
              className="flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 sm:px-3 sm:text-sm"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setSecFecha(todayStr)}
              className="min-h-11 rounded-lg bg-white px-3 text-xs font-semibold text-teal-800 shadow-sm ring-1 ring-slate-200 transition hover:bg-teal-50 sm:text-sm"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => moveSecretaryDate(1)}
              className="flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 sm:px-3 sm:text-sm"
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
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50 lg:self-end"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nueva reserva
          </button>
        </div>

        {secError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            {secError}
            <button onClick={fetchSecAgendas} className="ml-3 font-semibold underline decoration-rose-300 underline-offset-4">
              Reintentar
            </button>
          </div>
        )}

        {secAgendas.length === 0 && !secError && (
          <p
            role="status"
            className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600"
          >
            <Calendar className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
            No hay horarios configurados para este profesional y fecha.
          </p>
        )}

        <div className="space-y-3 md:hidden">
          {secAgendas.map((b) => (
            <article key={b.agenda_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    {b.hora_inicio}–{b.hora_fin}
                  </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{b.duracion_min} minutos</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${b.estado === 'DISPONIBLE' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : b.estado === 'RESERVADO' ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'}`}
                >
                  {b.estado === 'DISPONIBLE'
                    ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Disponible</>
                    : b.estado === 'RESERVADO'
                      ? <><User className="h-3.5 w-3.5" aria-hidden="true" />Reservado</>
                      : <>Bloqueado</>}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {b.estado === 'RESERVADO'
                  ? `${b.paciente_nombre} (${b.paciente_rut})`
                  : b.estado === 'BLOQUEADO'
                    ? b.motivo_bloqueo
                    : 'Listo para reservar'}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {b.estado === 'DISPONIBLE' && (
                  <button
                    type="button"
                    onClick={(event) => openReceptionBooking(b, event)}
                    className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
                  >
                    Reservar recepción
                  </button>
                )}
                {b.estado !== 'RESERVADO' && (
                  <button
                    type="button"
                    onClick={() => handleToggleBloque(b)}
                    className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {b.estado === 'BLOQUEADO' ? 'Habilitar' : 'Bloquear'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3">Duración</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Detalle / Paciente / Motivo</th>
                <th className="px-4 py-3 text-right">Acción Secretaría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {secAgendas.map((b) => (
                <tr key={b.agenda_id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                    {b.hora_inicio} – {b.hora_fin}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.duracion_min} min</td>
                  <td className="px-4 py-3">
                    <span
                      aria-label={`Estado: ${b.estado === 'DISPONIBLE' ? 'Disponible' : b.estado === 'RESERVADO' ? 'Reservado' : 'Bloqueado'}`}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        b.estado === 'DISPONIBLE'
                          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                          : b.estado === 'RESERVADO'
                            ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                      }`}
                    >
                      {b.estado === 'DISPONIBLE'
                        ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Disponible</>
                        : b.estado === 'RESERVADO'
                          ? <><User className="h-3.5 w-3.5" aria-hidden="true" />Reservado</>
                          : 'Bloqueado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.estado === 'RESERVADO'
                      ? `${b.paciente_nombre} (${b.paciente_rut}) — Cód: ${b.codigo_reserva}`
                      : b.estado === 'BLOQUEADO'
                        ? b.motivo_bloqueo
                        : 'Disponible para reservar'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.estado === 'DISPONIBLE' && (
                      <button
                        type="button"
                        onClick={(event) => openReceptionBooking(b, event)}
                        className="mr-2 rounded-lg bg-teal-700 px-3 py-2 font-semibold text-white transition hover:bg-teal-800"
                      >
                        Reservar recepción
                      </button>
                    )}
                    {b.estado !== 'RESERVADO' && (
                      <button
                        type="button"
                        onClick={() => handleToggleBloque(b)}
                        className={`rounded-lg px-3 py-2 font-semibold transition ${
                          b.estado === 'BLOQUEADO'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {b.estado === 'BLOQUEADO' ? 'Habilitar' : 'Bloquear'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {receptionBlock && (
          <div
            className="fixed inset-0 z-40 flex justify-end bg-slate-950/50 backdrop-blur-sm"
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
              className="flex h-full w-full max-w-md min-w-0 flex-col gap-4 overflow-y-auto rounded-l-2xl bg-white p-5 shadow-2xl sm:p-6"
            >
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-700"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Recepción</p>
                  <h3 id="quick-booking-title" className="text-xl font-bold tracking-tight text-slate-900">
                    Nueva reserva
                  </h3>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                    <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {receptionBlock.fecha} · {receptionBlock.hora_inicio}–{receptionBlock.hora_fin}{' '}
                    · {receptionBlock.medico_nombre}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeReceptionBooking}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900"
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
                  className="mt-1 block min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
                >
                  <option value="PRESENCIAL">Presencial</option>
                  <option value="TELEFONO">Telefónica</option>
                </select>
              </label>
              <label htmlFor="reception-rut" className="block w-full min-w-0 text-sm font-semibold text-slate-700">
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
                  className="mt-1 block min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/10"
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
                  <span className="border-r border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600">
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
                    className="min-h-12 min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2 text-sm font-normal tracking-wide focus:outline-none"
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
                <p role="alert" className="text-sm text-rose-800">
                  {receptionError}
                </p>
              )}
              <button
                disabled={submittingReception}
                className="min-h-12 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingReception ? 'Procesando…' : 'Reservar'}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
