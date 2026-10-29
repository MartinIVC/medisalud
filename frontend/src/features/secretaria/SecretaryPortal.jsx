import React from 'react';
import { formatRutInput } from '../../utils/rut';
import CrearMedico from '../../components/CrearMedico';

export default function SecretaryPortal({ state, actions }) {
  const {
    secretaryView, secretaryToken, especialidades, catalogosLoading, catalogosError,
    pendingMedicoDraft, secMedicoId, medicos, secFecha, todayStr, secAgendas,
    secError, scheduleDetailsOpen, secHoraInicio, secHoraFin, secDuracion,
    secMotivoBloqueo, secFeedback, receptionBlock, receptionData,
    receptionFieldErrors, receptionError, submittingReception,
  } = state;
  const {
    setSecretaryView, refreshDoctorCatalogs, handleDoctorSessionExpired,
    setPendingMedicoDraft, logoutSecretary, setSecMedicoId, setSecFeedback,
    setSecError, setScheduleDetailsOpen, setSecHoraInicio, setSecHoraFin,
    setSecDuracion, setSecMotivoBloqueo, handleConfigurarAgenda,
    handleBloquearDia, setSecFecha, moveSecretaryDate, fetchSecAgendas,
    openReceptionBooking, handleToggleBloque, closeReceptionBooking,
    receptionDialogRef, submitReceptionBooking, updateReceptionField,
  } = actions;
  return (
secretaryView === 'create-medico' ? (
          <div className="space-y-5">
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setSecretaryView('agenda')} className="min-h-11 px-4 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">Volver a la agenda</button>
              <button type="button" onClick={logoutSecretary} className="min-h-11 px-4 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">Cerrar sesión</button>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-3 flex justify-end">
              <button type="button" onClick={() => setSecretaryView('create-medico')} className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Crear médico</button>
            </div>
            <section className="order-2 lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5 h-fit">
              <details open={scheduleDetailsOpen} onToggle={(event) => setScheduleDetailsOpen(event.currentTarget.open)}>
              <summary className="cursor-pointer min-h-11 flex items-center font-semibold text-teal-900">Configurar horarios y registrar ausencias</summary>
              <div className="pt-4 space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800">
                    Configurar horarios
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Define los bloques de atención o registra un feriado o una ausencia.
                </p>
              </div>

              <form onSubmit={handleConfigurarAgenda} className="space-y-3">
                <div>
                  <label htmlFor="schedule-doctor" className="block text-sm font-semibold text-slate-700 mb-1">
                    Profesional
                  </label>
                  <select
                    id="schedule-doctor"
                    value={secMedicoId}
                    onChange={(e) => setSecMedicoId(e.target.value)}
                    className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {medicos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} ({m.especialidad_nombre})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="schedule-date" className="block text-sm font-semibold text-slate-700 mb-1">
                    Fecha
                  </label>
                  <input
                    id="schedule-date"
                    type="date"
                    value={secFecha}
                    onChange={(e) => setSecFecha(e.target.value)}
                    className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="schedule-start" className="block text-sm font-semibold text-slate-700 mb-1">
                      Hora Inicio
                    </label>
                    <input
                    id="schedule-start"
                    type="time"
                    value={secHoraInicio}
                    onChange={(e) => setSecHoraInicio(e.target.value)}
                    className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="schedule-end" className="block text-sm font-semibold text-slate-700 mb-1">
                      Hora Fin
                    </label>
                    <input
                      id="schedule-end"
                      type="time"
                      value={secHoraFin}
                      onChange={(e) => setSecHoraFin(e.target.value)}
                    className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="schedule-duration" className="block text-sm font-semibold text-slate-700 mb-1">
                    Duración de cada horario
                  </label>
                  <select
                    id="schedule-duration"
                    value={secDuracion}
                    onChange={(e) => setSecDuracion(e.target.value)}
                    className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-teal-900"
                  >
                    <option value="15">15 minutos por bloque</option>
                    <option value="20">20 minutos por bloque</option>
                    <option value="30">30 minutos por bloque</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-11 bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  Guardar horarios
                </button>
              </form>

              <hr className="border-slate-200" />

              {/* Bloqueo de feriados o licencias médicas (CA-02) */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800">
                  Registrar ausencia o feriado
                </h3>
                <label htmlFor="absence-reason" className="block text-sm font-semibold text-slate-700">Motivo
                <input
                  id="absence-reason"
                  type="text"
                  value={secMotivoBloqueo}
                  onChange={(e) => setSecMotivoBloqueo(e.target.value)}
                  placeholder="Motivo del bloqueo..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                /></label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => handleBloquearDia(false)}
                  className="w-full min-h-11 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm transition"
                  >
                    Bloquear jornada del profesional
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBloquearDia(true)}
                    className="w-full bg-amber-700 hover:bg-amber-800 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                  >
                    Bloquear fecha para todos los profesionales
                  </button>
                </div>
              </div>

              {secFeedback && (
                <div role={secFeedback.ok ? 'status' : 'alert'} className={`p-3 rounded-lg text-sm ${secFeedback.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900'}`}>
                  {secFeedback.mensaje || secFeedback.error}
                </div>
              )}
              </div>
              </details>
            </section>

            {/* Tabla de estado de bloques del médico */}
            <section className="order-1 lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
                <div>
                  <h2 id="secretary-agenda-title" tabIndex={-1} className="text-xl font-bold text-slate-900">Agenda del día</h2>
                  <p className="text-sm text-slate-600 mt-1">Revisa los horarios y registra una reserva desde recepción.</p>
                </div>
                <button type="button" onClick={logoutSecretary} className="min-h-11 self-start lg:self-auto px-4 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cerrar sesión</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 mb-5">
                <label className="text-sm font-semibold text-slate-700">Profesional
                  <select aria-label="Profesional de la agenda" value={secMedicoId} onChange={(e) => setSecMedicoId(e.target.value)} className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 font-normal">
                    {medicos.map((m) => <option key={m.id} value={m.id}>{m.nombre} · {m.especialidad_nombre}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">Fecha
                  <input aria-label="Fecha de la agenda" type="date" value={secFecha} onChange={(e) => setSecFecha(e.target.value)} className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 font-normal" />
                </label>
                <div className="flex gap-2 items-end">
                  <button type="button" onClick={() => moveSecretaryDate(-1)} className="min-h-11 px-3 rounded-lg border border-slate-300 text-sm font-semibold">Anterior</button>
                  <button type="button" onClick={() => setSecFecha(todayStr)} className="min-h-11 px-3 rounded-lg border border-slate-300 text-sm font-semibold">Hoy</button>
                  <button type="button" onClick={() => moveSecretaryDate(1)} className="min-h-11 px-3 rounded-lg border border-slate-300 text-sm font-semibold">Siguiente</button>
                </div>
                <button type="button" onClick={(event) => { const first = secAgendas.find((b) => b.estado === 'DISPONIBLE'); if (first) openReceptionBooking(first, event); }} disabled={!secAgendas.some((b) => b.estado === 'DISPONIBLE')} className="min-h-11 lg:self-end px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">Nueva reserva</button>
              </div>

              {secError && <div role="alert" className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">{secError}<button onClick={fetchSecAgendas} className="ml-3 underline font-semibold">Reintentar</button></div>}

              {secAgendas.length === 0 && !secError && <p role="status" className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600">No hay horarios configurados para este profesional y fecha.</p>}

              <div className="md:hidden space-y-3">
                {secAgendas.map((b) => <article key={b.agenda_id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-bold text-slate-900">{b.hora_inicio}–{b.hora_fin}</h3><p className="text-sm text-slate-600">{b.duracion_min} minutos</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${b.estado === 'DISPONIBLE' ? 'bg-emerald-100 text-emerald-900' : b.estado === 'RESERVADO' ? 'bg-blue-100 text-blue-900' : 'bg-amber-100 text-amber-900'}`}>
                      {b.estado === 'DISPONIBLE' ? '✓ Disponible' : b.estado === 'RESERVADO' ? '● Reservado' : '■ Bloqueado'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{b.estado === 'RESERVADO' ? `${b.paciente_nombre} (${b.paciente_rut})` : b.estado === 'BLOQUEADO' ? b.motivo_bloqueo : 'Listo para reservar'}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {b.estado === 'DISPONIBLE' && <button type="button" onClick={(event) => openReceptionBooking(b, event)} className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">Reservar recepción</button>}
                    {b.estado !== 'RESERVADO' && <button type="button" onClick={() => handleToggleBloque(b)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">{b.estado === 'BLOQUEADO' ? 'Habilitar' : 'Bloquear'}</button>}
                  </div>
                </article>)}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                      <th className="py-2 px-3">Horario</th>
                      <th className="py-2 px-3">Duración</th>
                      <th className="py-2 px-3">Estado</th>
                      <th className="py-2 px-3">Detalle / Paciente / Motivo</th>
                      <th className="py-2 px-3 text-right">Acción Secretaría</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {secAgendas.map((b) => (
                      <tr key={b.agenda_id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {b.hora_inicio} – {b.hora_fin}
                        </td>
                        <td className="py-2.5 px-3">{b.duracion_min} min</td>
                        <td className="py-2.5 px-3">
                          <span aria-label={`Estado: ${b.estado === 'DISPONIBLE' ? 'Disponible' : b.estado === 'RESERVADO' ? 'Reservado' : 'Bloqueado'}`}
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              b.estado === 'DISPONIBLE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : b.estado === 'RESERVADO'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {b.estado === 'DISPONIBLE' ? '✓ Disponible' : b.estado === 'RESERVADO' ? '● Reservado' : '■ Bloqueado'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {b.estado === 'RESERVADO'
                            ? `${b.paciente_nombre} (${b.paciente_rut}) — Cód: ${b.codigo_reserva}`
                            : b.estado === 'BLOQUEADO'
                            ? b.motivo_bloqueo
                            : 'Disponible para reservar'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {b.estado === 'DISPONIBLE' && (
                            <button type="button" onClick={(event) => openReceptionBooking(b, event)}
                              className="px-2.5 py-1 rounded font-semibold bg-teal-700 text-white hover:bg-teal-800 mr-2">
                              Reservar recepción
                            </button>
                          )}
                          {b.estado !== 'RESERVADO' && (
                            <button
                              type="button"
                              onClick={() => handleToggleBloque(b)}
                              className={`px-2.5 py-1 rounded font-semibold ${
                                b.estado === 'BLOQUEADO'
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
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
                <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReceptionBooking(); }}>
                <form ref={receptionDialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-booking-title" onSubmit={submitReceptionBooking} className="flex h-full w-full max-w-md min-w-0 flex-col gap-3 overflow-y-auto bg-white p-5 shadow-xl">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0"><h3 id="quick-booking-title" className="font-semibold text-lg">Nueva reserva</h3><p className="mt-1 text-sm text-slate-600">{receptionBlock.fecha} · {receptionBlock.hora_inicio}–{receptionBlock.hora_fin} · {receptionBlock.medico_nombre}</p></div>
                    <button type="button" onClick={closeReceptionBooking} className="min-h-11 px-3 text-sm underline">Cerrar</button>
                  </div>
                  <label className="block w-full min-w-0 text-sm font-semibold">Origen de la reserva
                  <select autoFocus value={receptionData.origen} onChange={(e) => updateReceptionField('origen', e.target.value)}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                    <option value="PRESENCIAL">Presencial</option><option value="TELEFONO">Telefónica</option>
                  </select></label>
                  <label htmlFor="reception-rut" className="block w-full min-w-0 text-sm font-semibold">RUT
                    <input id="reception-rut" required placeholder="12.345.678-5" value={receptionData.rut} aria-invalid={Boolean(receptionFieldErrors.paciente_rut)} aria-describedby={receptionFieldErrors.paciente_rut ? 'reception-rut-error' : undefined} onChange={(e) => updateReceptionField('rut', formatRutInput(e.target.value))}
                      className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                    {receptionFieldErrors.paciente_rut && <span id="reception-rut-error" className="mt-1 block text-xs text-rose-800">{receptionFieldErrors.paciente_rut}</span>}
                  </label>
                  <label htmlFor="reception-name" className="block w-full min-w-0 text-sm font-semibold">Nombre completo
                    <input id="reception-name" required placeholder="Nombre y apellidos" value={receptionData.nombre} aria-invalid={Boolean(receptionFieldErrors.paciente_nombre)} aria-describedby={receptionFieldErrors.paciente_nombre ? 'reception-name-error' : undefined} onChange={(e) => updateReceptionField('nombre', e.target.value)}
                      className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                    {receptionFieldErrors.paciente_nombre && <span id="reception-name-error" className="mt-1 block text-xs text-rose-800">{receptionFieldErrors.paciente_nombre}</span>}
                  </label>
                  <label htmlFor="reception-email" className="block w-full min-w-0 text-sm font-semibold">Correo electrónico
                    <input id="reception-email" required type="email" placeholder="nombre@ejemplo.cl" value={receptionData.email} aria-invalid={Boolean(receptionFieldErrors.paciente_email)} aria-describedby={receptionFieldErrors.paciente_email ? 'reception-email-error' : undefined} onChange={(e) => updateReceptionField('email', e.target.value)}
                      className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                    {receptionFieldErrors.paciente_email && <span id="reception-email-error" className="mt-1 block text-xs text-rose-800">{receptionFieldErrors.paciente_email}</span>}
                  </label>
                  <label htmlFor="reception-phone" className="block w-full min-w-0 text-sm font-semibold">Teléfono
                    <input id="reception-phone" required type="tel" placeholder="+56 9 1234 5678" value={receptionData.telefono} aria-invalid={Boolean(receptionFieldErrors.paciente_telefono)} aria-describedby={receptionFieldErrors.paciente_telefono ? 'reception-phone-error' : undefined} onChange={(e) => updateReceptionField('telefono', e.target.value)}
                      className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                    {receptionFieldErrors.paciente_telefono && <span id="reception-phone-error" className="mt-1 block text-xs text-rose-800">{receptionFieldErrors.paciente_telefono}</span>}
                  </label>
                  {receptionError && <p role="alert" className="text-sm text-rose-800">{receptionError}</p>}
                  <button disabled={submittingReception} className="min-h-11 rounded-lg bg-teal-700 text-white font-semibold px-4 text-sm disabled:opacity-50">{submittingReception ? 'Procesando…' : 'Reservar'}</button>
                </form>
                </div>
              )}
            </section>
          </div>
        )
  );
}
