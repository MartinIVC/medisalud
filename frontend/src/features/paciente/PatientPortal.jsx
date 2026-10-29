import React from 'react';
import { formatRutInput } from '../../utils/rut.js';

export default function PatientPortal({ state, actions }) {
  const {
    availabilityError, bookingStep, disponibilidad, fieldTouched, groupedBlocks,
    loadingDisp, medicosFiltrados, pacienteEmail, pacienteNombre, pacienteRut,
    pacienteTelefono, reservaResult, rutCheck, selectedBloque, selectedEsp,
    selectedFecha, selectedMedico, especialidades, submittingReserva,
    reservationFieldErrors,
  } = state;
  const {
    fetchDisponibilidad, handleReservarSubmit, resetRequestKey, setBookingStep,
    setFieldTouched, setPacienteEmail, setPacienteNombre, setPacienteRut,
    setPacienteTelefono, setReservaResult, setSelectedBloque, setSelectedEsp,
    setSelectedFecha, setSelectedMedico,
  } = actions;
  return (
          <div className="space-y-5">
            <section className="rounded-2xl bg-teal-900 text-white p-6 md:p-8">
              <p className="text-sm font-semibold text-teal-200">Atención médica, más simple</p>
              <h1 className="text-2xl md:text-3xl font-bold mt-1">Reserva tu hora</h1>
              <p className="mt-2 text-sm text-teal-100">Elige un horario, completa tus datos y confirma tu reserva.</p>
              <ol aria-label="Pasos de la reserva" className="flex flex-wrap gap-2 mt-5 text-sm">
                {['Elegir hora', 'Tus datos', 'Revisar y reservar'].map((step, index) => (
                  <li key={step} className={`px-3 py-1.5 rounded-full ${index === (selectedBloque ? bookingStep === 'datos' ? 1 : 2 : 0) ? 'bg-white text-teal-900 font-semibold' : 'bg-teal-800 text-teal-100'}`}>
                    {index + 1}. {step}
                  </li>
                ))}
              </ol>
            </section>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna Izquierda: Filtros A-01 (MED-9) */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-800">
                  Elige una hora
                </h2>
                <span className="text-xs font-mono bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200">
                  Disponibilidad
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Filtra por especialidad, profesional o fecha. También puedes dejar el profesional en “Cualquiera”.
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="patient-specialty" className="block text-sm font-semibold text-slate-700 mb-1">
                    Especialidad Médica
                  </label>
                  <select
                    id="patient-specialty"
                    value={selectedEsp}
                    onChange={(e) => {
                      resetRequestKey();
                      setSelectedEsp(e.target.value);
                      setSelectedMedico('');
                      setSelectedBloque(null);
                      setReservaResult(null);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="">Todas las especialidades</option>
                    {especialidades.map((esp) => (
                      <option key={esp.id} value={esp.id}>
                        {esp.nombre} ({esp.total_medicos} especialistas)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="patient-doctor" className="block text-sm font-semibold text-slate-700 mb-1">
                    Profesional ({medicosFiltrados.length} disponibles)
                  </label>
                  <select
                    id="patient-doctor"
                    value={selectedMedico}
                    onChange={(e) => { resetRequestKey(); setSelectedMedico(e.target.value); setSelectedBloque(null); setReservaResult(null); }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="">Cualquiera</option>
                    {medicosFiltrados.map((med) => (
                      <option key={med.id} value={med.id}>
                        {med.nombre} — {med.especialidad_nombre} ({med.box_atencion})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="patient-date" className="block text-sm font-semibold text-slate-700 mb-1">
                    Fecha
                  </label>
                  <input
                    id="patient-date"
                    type="date"
                    value={selectedFecha}
                    onChange={(e) => { resetRequestKey(); setSelectedFecha(e.target.value); setSelectedBloque(null); setReservaResult(null); }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={fetchDisponibilidad}
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  Buscar horarios
                </button>
              </div>
            </section>

            {/* Columna Central/Derecha: Grilla de Horarios A-02 y Formulario A-03..A-06 */}
            <section className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      Horarios disponibles
                    </h2>
                    <p className="text-xs text-slate-500">
                      Selecciona el horario que te acomode. Los resultados se agrupan por profesional y jornada.
                    </p>
                  </div>
                  <div className="text-sm px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {disponibilidad.total_cupos_libres || 0} horarios
                  </div>
                </div>

                {loadingDisp ? (
                  <div role="status" aria-live="polite" className="py-12 text-center text-sm text-slate-500">
                    Buscando horarios…
                  </div>
                ) : availabilityError ? (
                  <div role="alert" className="py-8 text-center bg-rose-50 border border-rose-200 rounded-lg p-4">
                    <p className="font-semibold text-rose-900">No pudimos cargar la información</p>
                    <p className="text-sm text-rose-800 mt-1">{availabilityError}</p>
                    <button type="button" onClick={fetchDisponibilidad} className="mt-3 min-h-11 px-4 rounded-lg bg-teal-700 text-white font-semibold">Reintentar</button>
                  </div>
                ) : disponibilidad.bloques?.length === 0 ? (
                  <div className="py-8 text-center bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="font-semibold text-amber-900">
                      {medicosFiltrados.length === 0 ? 'No hay profesionales disponibles' : 'No hay horas para esta fecha'}
                    </p>
                    <p className="text-sm text-amber-800 mt-1">
                      {medicosFiltrados.length === 0 ? 'Prueba otra especialidad.' : 'Prueba otra fecha o quita el filtro de profesional.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {Object.entries(groupedBlocks).map(([group, blocks]) => <section key={group} aria-label={`Horarios de ${group}`}>
                      <h3 className="font-semibold text-slate-700 mb-2">{group}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {blocks.map((b) => {
                      const isSelected = selectedBloque?.agenda_id === b.agenda_id;
                      return (
                        <button
                          key={b.agenda_id}
                          type="button"
                          onClick={() => {
                            resetRequestKey();
                            setSelectedBloque(b);
                            setReservaResult(null);
                            setBookingStep('datos');
                          }}
                          className={`text-left p-3.5 rounded-xl border transition ${
                            isSelected
                              ? 'border-teal-600 bg-teal-50/80 ring-2 ring-teal-600'
                              : 'border-slate-200 hover:border-teal-500 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-base font-bold text-teal-900">
                              {b.hora_inicio} – {b.hora_fin}
                            </span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              {b.duracion_min} min
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-800 mt-1.5 truncate">
                            {b.medico_nombre}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {b.especialidad_nombre}
                          </p>
                        </button>
                      );
                    })}
                      </div>
                    </section>)}
                  </div>
                )}
              </div>

              {/* Formulario de Reserva Web con Validación de RUT (MED-11 / CU-02) */}
              {selectedBloque && (
                <div className="bg-white rounded-xl shadow-sm border-2 border-teal-600 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">
                        {bookingStep === 'revision' ? 'Revisa tu reserva' : bookingStep === 'confirmacion' ? 'Reserva confirmada' : 'Tus datos'}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {new Date(`${selectedBloque.fecha}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
                        <strong>
                          {selectedBloque.hora_inicio} a {selectedBloque.hora_fin}
                        </strong>{' '}
                        con <strong>{selectedBloque.medico_nombre}</strong> ({selectedBloque.especialidad_nombre})
                      </p>
                    </div>
                  </div>

                  {bookingStep === 'revision' && <div className="mb-4 rounded-lg bg-teal-50 border border-teal-200 p-4 text-sm text-teal-950">
                    <p className="font-semibold">Comprueba tus datos antes de reservar</p>
                    <p className="mt-2">{pacienteNombre} · RUT {pacienteRut}</p>
                    <p>{pacienteEmail} · {pacienteTelefono}</p>
                    <button type="button" onClick={() => { setBookingStep('datos'); setReservaResult(null); }} className="mt-2 min-h-11 underline font-semibold">Editar mis datos</button>
                  </div>}

                  {bookingStep !== 'confirmacion' && <form onSubmit={handleReservarSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="patient-rut" className="block text-sm font-semibold text-slate-700 mb-1">
                        RUT *
                      </label>
                      <input
                        id="patient-rut"
                        type="text"
                        required
                        autoComplete="off"
                        aria-invalid={Boolean((fieldTouched.rut && rutCheck && !rutCheck.valid) || reservationFieldErrors.paciente_rut)}
                        aria-describedby={[fieldTouched.rut && rutCheck ? 'patient-rut-local-error' : null, reservationFieldErrors.paciente_rut ? 'patient-rut-server-error' : null].filter(Boolean).join(' ') || undefined}
                        placeholder="Ej: 12.345.678-5"
                        value={pacienteRut}
                        readOnly={bookingStep === 'revision'}
                        onBlur={() => setFieldTouched({ ...fieldTouched, rut: true })}
                        onChange={(e) => { setPacienteRut(formatRutInput(e.target.value)); setFieldTouched({ ...fieldTouched, rut: true }); setReservaResult(null); }}
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                          rutCheck
                            ? rutCheck.valid
                              ? 'border-emerald-500 focus:ring-emerald-500 bg-emerald-50/30'
                              : 'border-rose-500 focus:ring-rose-500 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-teal-600'
                        }`}
                      />
                      {rutCheck && fieldTouched.rut && (
                        <p
                          id="patient-rut-local-error"
                          className={`text-[11px] mt-1 font-medium ${
                            rutCheck.valid ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {rutCheck.message}
                        </p>
                      )}
                      {reservationFieldErrors.paciente_rut && <p id="patient-rut-server-error" role="alert" className="mt-1 text-xs font-medium text-rose-800">{reservationFieldErrors.paciente_rut}</p>}
                    </div>

                    <div>
                      <label htmlFor="patient-name" className="block text-sm font-semibold text-slate-700 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        id="patient-name"
                        type="text"
                        required
                        aria-invalid={Boolean(reservationFieldErrors.paciente_nombre)}
                        aria-describedby={reservationFieldErrors.paciente_nombre ? 'patient-name-error' : undefined}
                        placeholder="Nombre y Apellidos"
                        value={pacienteNombre}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => { setPacienteNombre(e.target.value); setReservaResult(null); }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                      {reservationFieldErrors.paciente_nombre && <p id="patient-name-error" role="alert" className="mt-1 text-xs text-rose-800">{reservationFieldErrors.paciente_nombre}</p>}
                    </div>

                    <div>
                      <label htmlFor="patient-email" className="block text-sm font-semibold text-slate-700 mb-1">
                        Correo electrónico *
                      </label>
                      <input
                        id="patient-email"
                        type="email"
                        required
                        autoComplete="email"
                        aria-invalid={Boolean(reservationFieldErrors.paciente_email)}
                        aria-describedby={reservationFieldErrors.paciente_email ? 'patient-email-error' : undefined}
                        placeholder="nombre@ejemplo.cl"
                        value={pacienteEmail}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => { setPacienteEmail(e.target.value); setReservaResult(null); }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                      {reservationFieldErrors.paciente_email && <p id="patient-email-error" role="alert" className="mt-1 text-xs text-rose-800">{reservationFieldErrors.paciente_email}</p>}
                    </div>

                    <div>
                      <label htmlFor="patient-phone" className="block text-sm font-semibold text-slate-700 mb-1">
                        Teléfono móvil *
                      </label>
                      <input
                        id="patient-phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        aria-invalid={Boolean(reservationFieldErrors.paciente_telefono)}
                        aria-describedby={reservationFieldErrors.paciente_telefono ? 'patient-phone-error' : undefined}
                        placeholder="+56 9 1234 5678"
                        value={pacienteTelefono}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => { setPacienteTelefono(e.target.value); setReservaResult(null); }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                      {reservationFieldErrors.paciente_telefono && <p id="patient-phone-error" role="alert" className="mt-1 text-xs text-rose-800">{reservationFieldErrors.paciente_telefono}</p>}
                    </div>

                    <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          resetRequestKey();
                          setSelectedBloque(null);
                          setReservaResult(null);
                          setBookingStep('datos');
                        }}
                        className="min-h-11 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-100"
                      >
                        Cambiar hora
                      </button>
                      <button
                        type="submit"
                        disabled={submittingReserva}
                        className="min-h-11 px-6 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm shadow transition disabled:opacity-50"
                      >
                        {submittingReserva ? 'Procesando reserva…' : bookingStep === 'revision' ? 'Reservar' : 'Continuar'}
                      </button>
                    </div>
                  </form>
                  }

                  {/* Resultado A-05 (Éxito) o A-06 (Rechazo) */}
                  {reservaResult && (
                    <div
                      className={`mt-5 p-4 rounded-xl border ${
                        reservaResult.type === 'success'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                          : 'bg-rose-50 border-rose-300 text-rose-950'
                      }`}
                    >
                      {reservaResult.type === 'success' ? (
                        <div>
                          <h4 className="text-xl font-bold">Tu hora está reservada</h4>
                          <p className="mt-1 text-sm">Código de reserva: <strong className="font-mono">{reservaResult.data.reserva.codigo_reserva}</strong></p>
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-sm">
                            <div><dt className="font-semibold">Profesional</dt><dd>{reservaResult.data.reserva.medico_nombre}</dd></div>
                            <div><dt className="font-semibold">Especialidad</dt><dd>{reservaResult.data.reserva.especialidad_nombre}</dd></div>
                            <div><dt className="font-semibold">Fecha y hora</dt><dd>{reservaResult.data.reserva.fecha} · {reservaResult.data.reserva.hora_inicio}–{reservaResult.data.reserva.hora_fin}</dd></div>
                            <div><dt className="font-semibold">Lugar</dt><dd>{reservaResult.data.reserva.box_atencion}</dd></div>
                          </dl>
                          <p className="mt-4 text-sm">El comprobante quedó en cola para enviarse a <strong>{pacienteEmail}</strong>.</p>
                          <button type="button" onClick={() => { resetRequestKey(); setSelectedBloque(null); setReservaResult(null); setBookingStep('datos'); setPacienteRut(''); setPacienteNombre(''); setPacienteEmail(''); setPacienteTelefono('+569'); }}
                            className="mt-4 min-h-11 rounded-lg bg-teal-700 px-4 py-2 text-white font-semibold">Reservar otra hora</button>
                        </div>
                      ) : (
                        <div>
                          <h4 className="text-sm font-bold mt-2">No se pudo completar la reserva</h4>
                          <p role="alert" className="text-sm mt-1">{reservaResult.data.mensaje || reservaResult.data.error || 'Revisa la información e intenta nuevamente.'}</p>
                          {reservaResult.status === 409 && <button type="button" onClick={() => { resetRequestKey(); setReservaResult(null); setSelectedBloque(null); setBookingStep('datos'); fetchDisponibilidad(); }} className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 py-2 font-semibold">Elegir otra hora</button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
          </div>
  );
}
