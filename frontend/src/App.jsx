import React, { useEffect, useState, useCallback } from 'react';
import { formatRutInput, validateRutClient } from './utils/rut';
import CrearMedico from './components/CrearMedico';

export default function App() {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const appointmentToken = new URLSearchParams(window.location.search).get('cita_token');
  const [appointmentReply, setAppointmentReply] = useState('');
  const [appointmentDetails, setAppointmentDetails] = useState(null);
  const [appointmentLoading, setAppointmentLoading] = useState(Boolean(appointmentToken));
  const [appointmentError, setAppointmentError] = useState('');
  const [appointmentActionDone, setAppointmentActionDone] = useState(false);

  const [activeTab, setActiveTab] = useState('paciente'); // 'paciente' | 'secretaria'
  const [secretaryView, setSecretaryView] = useState('agenda');
  const [secretaryToken, setSecretaryToken] = useState(() => sessionStorage.getItem('medisalud-secretaria-token') || '');
  const [secretaryPassword, setSecretaryPassword] = useState('');
  const [secretaryError, setSecretaryError] = useState('');
  const [receptionBlock, setReceptionBlock] = useState(null);
  const [receptionData, setReceptionData] = useState({ nombre: '', rut: '', email: '', telefono: '+569', origen: 'PRESENCIAL' });
  const [receptionError, setReceptionError] = useState('');
  const [especialidades, setEspecialidades] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [catalogosLoading, setCatalogosLoading] = useState(false);
  const [catalogosError, setCatalogosError] = useState('');
  const [pendingMedicoDraft, setPendingMedicoDraft] = useState(null);

  // Filtros Portal Paciente (MED-9: A-01)
  const [selectedEsp, setSelectedEsp] = useState('');
  const [selectedMedico, setSelectedMedico] = useState('');
  const [selectedFecha, setSelectedFecha] = useState(todayStr);
  const [disponibilidad, setDisponibilidad] = useState({ bloques: [], latencia_ms: 0 });
  const [loadingDisp, setLoadingDisp] = useState(false);

  // Modal / Formulario Reserva (MED-11: A-03, A-04, A-05, A-06)
  const [selectedBloque, setSelectedBloque] = useState(null);
  const [pacienteRut, setPacienteRut] = useState('');
  const [pacienteNombre, setPacienteNombre] = useState('');
  const [pacienteEmail, setPacienteEmail] = useState('');
  const [pacienteTelefono, setPacienteTelefono] = useState('+569');
  const [reservaResult, setReservaResult] = useState(null); // { type: 'success' | 'error', data }
  const [submittingReserva, setSubmittingReserva] = useState(false);
  const [bookingStep, setBookingStep] = useState('datos');
  const [fieldTouched, setFieldTouched] = useState({});
  const [availabilityError, setAvailabilityError] = useState('');

  // Estado Panel Secretaría (MED-10)
  const [secMedicoId, setSecMedicoId] = useState('1');
  const [secFecha, setSecFecha] = useState(todayStr);
  const [secHoraInicio, setSecHoraInicio] = useState('09:00');
  const [secHoraFin, setSecHoraFin] = useState('13:00');
  const [secDuracion, setSecDuracion] = useState('30');
  const [secMotivoBloqueo, setSecMotivoBloqueo] = useState('Licencia médica profesional');
  const [secAgendas, setSecAgendas] = useState([]);
  const [secFeedback, setSecFeedback] = useState(null);
  const [secError, setSecError] = useState('');
  const [scheduleDetailsOpen, setScheduleDetailsOpen] = useState(false);

  const fetchCatalogos = useCallback(async () => {
    setCatalogosLoading(true);
    setCatalogosError('');
    try {
      const [espResponse, medResponse] = await Promise.all([
        fetch('/api/especialidades'),
        fetch('/api/medicos'),
      ]);
      const [espRes, medRes] = await Promise.all([espResponse.json(), medResponse.json()]);
      if (!espResponse.ok || !medResponse.ok || !espRes.ok || !medRes.ok) {
        throw new Error('No pudimos cargar las especialidades y los médicos.');
      }
      setEspecialidades(espRes.especialidades);
      setMedicos(medRes.medicos);
      return true;
    } catch {
      setCatalogosError('No pudimos cargar las especialidades y los médicos. Revisa tu conexión e intenta nuevamente.');
      return false;
    } finally {
      setCatalogosLoading(false);
    }
  }, []);

  const fetchDisponibilidad = useCallback(async () => {
    setLoadingDisp(true);
    setAvailabilityError('');
    try {
      const params = new URLSearchParams();
      if (selectedEsp) params.set('especialidad_id', selectedEsp);
      if (selectedMedico) params.set('medico_id', selectedMedico);
      if (selectedFecha) params.set('fecha', selectedFecha);

      const res = await fetch(`/api/disponibilidad?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setDisponibilidad(data);
      } else {
        setAvailabilityError('No pudimos cargar los horarios. Intenta nuevamente.');
      }
    } catch {
      setAvailabilityError('No pudimos cargar los horarios. Revisa tu conexión e intenta nuevamente.');
    } finally {
      setLoadingDisp(false);
    }
  }, [selectedEsp, selectedMedico, selectedFecha]);

  const fetchSecAgendas = useCallback(async () => {
    if (!secretaryToken) return;
    const params = new URLSearchParams();
    if (secMedicoId) params.set('medico_id', secMedicoId);
    if (secFecha) params.set('fecha', secFecha);
    try {
      const res = await fetch(`/api/agendas?${params.toString()}`, { headers: { Authorization: `Bearer ${secretaryToken}` } });
      if (res.status === 401) {
        sessionStorage.removeItem('medisalud-secretaria-token');
        setSecretaryToken('');
        setSecretaryError('Tu sesión terminó. Inicia sesión nuevamente para continuar.');
        setSecAgendas([]);
        return;
      }
      const data = await res.json();
      if (data.ok) { setSecAgendas(data.bloques); setSecError(''); }
      else setSecError(data.error || 'No pudimos cargar la agenda. Intenta nuevamente.');
    } catch {
      setSecError('No pudimos cargar la agenda. Revisa tu conexión e intenta nuevamente.');
    }
  }, [secMedicoId, secFecha, secretaryToken]);

  useEffect(() => {
    fetchCatalogos();
  }, [fetchCatalogos]);

  useEffect(() => {
    fetchDisponibilidad();
  }, [fetchDisponibilidad]);

  useEffect(() => {
    if (!appointmentToken) return;
    fetch(`/api/citas/responder?token=${encodeURIComponent(appointmentToken)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'No pudimos cargar el detalle de la cita.');
        setAppointmentDetails(data.cita);
      })
      .catch((error) => setAppointmentError(error.message))
      .finally(() => setAppointmentLoading(false));
  }, [appointmentToken]);

  useEffect(() => {
    if (activeTab === 'secretaria') {
      fetchSecAgendas();
    }
  }, [activeTab, fetchSecAgendas]);

  useEffect(() => {
    if (activeTab === 'secretaria' && secretaryToken) fetchCatalogos();
  }, [activeTab, secretaryToken, secretaryView, fetchCatalogos]);

  useEffect(() => {
    if (activeTab !== 'secretaria' || !secretaryToken) return undefined;
    const timer = window.setInterval(fetchSecAgendas, 2000);
    return () => window.clearInterval(timer);
  }, [activeTab, secretaryToken, fetchSecAgendas]);

  async function loginSecretary(event) {
    event.preventDefault();
    setSecretaryError('');
    try {
      const response = await fetch('/api/auth/secretaria', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: secretaryPassword }),
      });
      const data = await response.json();
      if (!response.ok) { setSecretaryError(data.error || 'No fue posible iniciar sesión.'); return; }
      sessionStorage.setItem('medisalud-secretaria-token', data.token);
      setSecretaryToken(data.token);
      setSecretaryPassword('');
    } catch {
      setSecretaryError('No pudimos iniciar sesión. Revisa tu conexión e intenta nuevamente.');
    }
  }

  const refreshDoctorCatalogs = useCallback(async () => {
    const refreshed = await fetchCatalogos();
    await fetchDisponibilidad();
    return refreshed;
  }, [fetchCatalogos, fetchDisponibilidad]);

  function handleDoctorSessionExpired(draft) {
    setPendingMedicoDraft(draft);
    setSecretaryView('create-medico');
    sessionStorage.removeItem('medisalud-secretaria-token');
    setSecretaryToken('');
    setSecAgendas([]);
    setSecretaryError('Tu sesión expiró. Inicia sesión nuevamente; conservamos el formulario en esta página.');
  }

  async function submitReceptionBooking(event) {
    event.preventDefault();
    if (!receptionBlock) return;
    setReceptionError('');
    try {
    const response = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secretaryToken}`, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        agenda_id: receptionBlock.agenda_id, paciente_nombre: receptionData.nombre,
        paciente_rut: receptionData.rut, paciente_email: receptionData.email,
        paciente_telefono: receptionData.telefono, origen: receptionData.origen,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      setReceptionBlock(null);
      setReceptionData({ nombre: '', rut: '', email: '', telefono: '+569', origen: 'PRESENCIAL' });
      fetchSecAgendas(); fetchDisponibilidad();
    } else setReceptionError(data.error || data.mensaje || 'No se pudo registrar la reserva. Revisa los datos e intenta nuevamente.');
    } catch {
      setReceptionError('No pudimos conectar con el sistema. Los datos siguen en el formulario; inténtalo nuevamente.');
    }
  }

  async function replyToAppointment(action) {
    setAppointmentReply('');
    try {
    const response = await fetch('/api/citas/responder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: appointmentToken, accion: action }),
    });
    const data = await response.json();
    if (response.ok) {
      setAppointmentActionDone(true);
      setAppointmentDetails((current) => ({ ...current, estado: action === 'CANCELAR' ? 'CANCELADA' : 'CONFIRMADA' }));
    }
    setAppointmentReply(response.ok
      ? action === 'CANCELAR' ? 'La cita fue cancelada y el cupo quedó liberado.' : 'Gracias. Registramos que asistirás.'
      : data.error || 'No fue posible actualizar la cita.');
    } catch {
      setAppointmentReply('No pudimos actualizar la cita. Revisa tu conexión e intenta nuevamente.');
    }
  }

  const medicosFiltrados = selectedEsp
    ? medicos.filter((m) => String(m.especialidad_id) === String(selectedEsp))
    : medicos;

  const rutCheck = pacienteRut ? validateRutClient(pacienteRut) : null;
  const selectedDaypart = (time) => Number(time.slice(0, 2)) < 12 ? 'Mañana' : 'Tarde';
  const groupedBlocks = (disponibilidad.bloques || []).reduce((groups, block) => {
    const key = `${block.medico_nombre} · ${selectedDaypart(block.hora_inicio)}`;
    (groups[key] ||= []).push(block);
    return groups;
  }, {});

  async function handleReservarSubmit(e) {
    e.preventDefault();
    if (!selectedBloque) return;
    if (bookingStep === 'datos') {
      setFieldTouched({ rut: true });
      if (rutCheck && !rutCheck.valid) return;
      setBookingStep('revision');
      return;
    }
    setSubmittingReserva(true);
    setReservaResult(null);

    try {
      const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenda_id: selectedBloque.agenda_id,
          origen: 'WEB',
          paciente_rut: pacienteRut,
          paciente_nombre: pacienteNombre,
          paciente_email: pacienteEmail,
          paciente_telefono: pacienteTelefono,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setReservaResult({ type: 'success', data });
        setBookingStep('confirmacion');
        fetchDisponibilidad();
      } else {
        setReservaResult({ type: 'error', data: res.status >= 500
          ? { ...data, mensaje: 'No pudimos completar la reserva. Tus datos siguen guardados; inténtalo nuevamente.' }
          : data });
        if (res.status === 409) {
          fetchDisponibilidad();
        }
      }
    } catch (err) {
      setReservaResult({
        type: 'error',
        data: { mensaje: 'No pudimos conectar con el sistema. Tus datos siguen guardados; inténtalo nuevamente.' },
      });
    } finally {
      setSubmittingReserva(false);
    }
  }

  async function handleConfigurarAgenda(e) {
    e.preventDefault();
    setSecFeedback(null);
    const res = await fetch('/api/agendas/configurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secretaryToken}` },
      body: JSON.stringify({
        medico_id: Number(secMedicoId),
        fecha: secFecha,
        hora_inicio: secHoraInicio,
        hora_fin: secHoraFin,
        duracion_min: Number(secDuracion),
      }),
    });
    const data = await res.json();
    setSecFeedback(data);
    fetchSecAgendas();
    fetchDisponibilidad();
  }

  async function handleBloquearDia(esFeriadoGlobal = false) {
    const medico = medicos.find((item) => String(item.id) === String(secMedicoId));
    const alcance = esFeriadoGlobal ? 'todos los profesionales' : medico?.nombre || 'el profesional seleccionado';
    const tipo = esFeriadoGlobal ? 'feriado' : 'ausencia';
    if (!window.confirm(`Vas a registrar un ${tipo} para ${alcance} el ${secFecha}. Se bloquearán los horarios disponibles de esa jornada. ¿Continuar?`)) return;
    setSecFeedback(null);
    const res = await fetch('/api/agendas/bloquear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secretaryToken}` },
      body: JSON.stringify({
        medico_id: Number(secMedicoId),
        fecha: secFecha,
        es_feriado_global: esFeriadoGlobal,
        motivo: esFeriadoGlobal ? `Día Festivo Global: ${secMotivoBloqueo}` : secMotivoBloqueo,
      }),
    });
    const data = await res.json();
    setSecFeedback(data);
    fetchSecAgendas();
    fetchDisponibilidad();
  }

  async function handleToggleBloque(bloque) {
    const endpoint = bloque.estado === 'BLOQUEADO' ? '/api/agendas/desbloquear' : '/api/agendas/bloquear';
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secretaryToken}` },
      body: JSON.stringify({
        agenda_id: bloque.agenda_id,
        motivo: secMotivoBloqueo || 'Bloqueo manual por secretaría (MED-10)',
      }),
    });
    fetchSecAgendas();
    fetchDisponibilidad();
  }

  function moveSecretaryDate(days) {
    setSecFecha((current) => {
      const date = new Date(`${current}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    });
  }

  function logoutSecretary() {
    sessionStorage.removeItem('medisalud-secretaria-token');
    setSecretaryToken('');
    setSecAgendas([]);
    setSecFeedback(null);
    setSecretaryError('');
    setSecretaryView('agenda');
    setPendingMedicoDraft(null);
  }

  if (appointmentToken) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <section className="max-w-md w-full rounded-xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-bold text-slate-800">Respuesta a tu cita</h1>
          {appointmentLoading && <p role="status" className="text-sm text-slate-600">Cargando detalle de la cita…</p>}
          {appointmentError && <p role="alert" className="text-sm text-rose-800">{appointmentError}</p>}
          {appointmentDetails && <>
            <p className="text-sm text-slate-600">Revisa tu cita antes de confirmar asistencia o cancelar.</p>
            <dl className="rounded-lg bg-slate-50 p-4 space-y-2 text-sm">
              <div><dt className="font-semibold">Código</dt><dd>{appointmentDetails.codigo_reserva}</dd></div>
              <div><dt className="font-semibold">Profesional</dt><dd>{appointmentDetails.medico_nombre}</dd></div>
              <div><dt className="font-semibold">Especialidad</dt><dd>{appointmentDetails.especialidad_nombre}</dd></div>
              <div><dt className="font-semibold">Fecha y hora</dt><dd>{appointmentDetails.fecha} · {appointmentDetails.hora_inicio}–{appointmentDetails.hora_fin}</dd></div>
              <div><dt className="font-semibold">Lugar</dt><dd>{appointmentDetails.box_atencion}</dd></div>
            </dl>
            {appointmentDetails.estado === 'CANCELADA' ? <p className="text-sm font-semibold text-rose-800">Esta cita ya fue cancelada.</p> : appointmentActionDone ? <p role="status" className="text-sm font-semibold text-emerald-800">Tu respuesta quedó registrada.</p> : <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => replyToAppointment('CONFIRMAR')} className="min-h-11 flex-1 rounded-lg bg-teal-700 text-white px-3 py-2 font-semibold">Confirmar asistencia</button>
              <button onClick={() => replyToAppointment('CANCELAR')} className="min-h-11 flex-1 rounded-lg border border-rose-300 text-rose-800 px-3 py-2 font-semibold">Cancelar cita</button>
            </div>}
          </>}
          {appointmentReply && <p role="status" className="text-sm text-slate-700">{appointmentReply}</p>}
        </section>
      </main>
    );
  }

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

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
        {activeTab === 'secretaria' && !secretaryToken ? (
          <section className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800">Acceso de secretaría</h2>
            <p className="text-sm text-slate-600 mt-1">Ingrese la contraseña configurada para este entorno.</p>
            <form className="mt-4 space-y-3" onSubmit={loginSecretary}>
              <label htmlFor="secretary-password" className="block text-sm font-semibold text-slate-700">Contraseña</label>
              <input id="secretary-password" type="password" autoComplete="current-password" required value={secretaryPassword}
                onChange={(event) => setSecretaryPassword(event.target.value)}
                className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {secretaryError && <p role="alert" className="text-sm text-rose-700">{secretaryError}</p>}
              <button className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm">Iniciar sesión</button>
            </form>
          </section>
        ) : activeTab === 'paciente' ? (
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
                    onChange={(e) => { setSelectedMedico(e.target.value); setSelectedBloque(null); setReservaResult(null); }}
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
                    onChange={(e) => { setSelectedFecha(e.target.value); setSelectedBloque(null); setReservaResult(null); }}
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
                    <button type="button" onClick={() => setBookingStep('datos')} className="mt-2 min-h-11 underline font-semibold">Editar mis datos</button>
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
                        aria-invalid={Boolean(fieldTouched.rut && rutCheck && !rutCheck.valid)}
                        placeholder="Ej: 12.345.678-5"
                        value={pacienteRut}
                        readOnly={bookingStep === 'revision'}
                        onBlur={() => setFieldTouched({ ...fieldTouched, rut: true })}
                        onChange={(e) => { setPacienteRut(formatRutInput(e.target.value)); setFieldTouched({ ...fieldTouched, rut: true }); }}
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
                          className={`text-[11px] mt-1 font-medium ${
                            rutCheck.valid ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {rutCheck.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="patient-name" className="block text-sm font-semibold text-slate-700 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        id="patient-name"
                        type="text"
                        required
                        placeholder="Nombre y Apellidos"
                        value={pacienteNombre}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => setPacienteNombre(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
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
                        placeholder="nombre@ejemplo.cl"
                        value={pacienteEmail}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => setPacienteEmail(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
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
                        placeholder="+56 9 1234 5678"
                        value={pacienteTelefono}
                        readOnly={bookingStep === 'revision'}
                        onChange={(e) => setPacienteTelefono(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>

                    <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
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
                          <button type="button" onClick={() => { setSelectedBloque(null); setReservaResult(null); setBookingStep('datos'); setPacienteRut(''); setPacienteNombre(''); setPacienteEmail(''); setPacienteTelefono('+569'); }}
                            className="mt-4 min-h-11 rounded-lg bg-teal-700 px-4 py-2 text-white font-semibold">Reservar otra hora</button>
                        </div>
                      ) : (
                        <div>
                          <h4 className="text-sm font-bold mt-2">No se pudo completar la reserva</h4>
                          <p role="alert" className="text-sm mt-1">{reservaResult.data.mensaje || 'Revisa la información e intenta nuevamente.'}</p>
                          {reservaResult.data.codigo_error === 'COLISION_TRANSACCIONAL' && <button type="button" onClick={() => { setReservaResult(null); setBookingStep('datos'); fetchDisponibilidad(); }} className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 py-2 font-semibold">Elegir otra hora</button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
          </div>
        ) : secretaryView === 'create-medico' ? (
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
                  <h2 className="text-xl font-bold text-slate-900">Agenda del día</h2>
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
                <button type="button" onClick={() => { const first = secAgendas.find((b) => b.estado === 'DISPONIBLE'); if (first) setReceptionBlock(first); }} disabled={!secAgendas.some((b) => b.estado === 'DISPONIBLE')} className="min-h-11 lg:self-end px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">Nueva reserva</button>
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
                    {b.estado === 'DISPONIBLE' && <button type="button" onClick={() => setReceptionBlock(b)} className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">Reservar recepción</button>}
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
                            <button type="button" onClick={() => setReceptionBlock(b)}
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
                <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" onKeyDown={(event) => { if (event.key === 'Escape') setReceptionBlock(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setReceptionBlock(null); }}>
                <form role="dialog" aria-modal="true" aria-labelledby="quick-booking-title" onSubmit={submitReceptionBooking} className="grid h-full w-full min-w-0 grid-cols-1 content-start gap-3 overflow-y-auto bg-white p-5 shadow-xl">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0"><h3 id="quick-booking-title" className="font-semibold text-lg">Nueva reserva</h3><p className="mt-1 text-sm text-slate-600">{receptionBlock.fecha} · {receptionBlock.hora_inicio}–{receptionBlock.hora_fin} · {receptionBlock.medico_nombre}</p></div>
                    <button type="button" onClick={() => setReceptionBlock(null)} className="min-h-11 px-3 text-sm underline">Cerrar</button>
                  </div>
                  <label className="block min-w-0 text-sm font-semibold">Origen de la reserva
                  <select autoFocus value={receptionData.origen} onChange={(e) => setReceptionData({ ...receptionData, origen: e.target.value })}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                    <option value="PRESENCIAL">Presencial</option><option value="TELEFONO">Telefónica</option>
                  </select></label>
                  <label className="block min-w-0 text-sm font-semibold">RUT<input required placeholder="12.345.678-5" value={receptionData.rut} onChange={(e) => setReceptionData({ ...receptionData, rut: formatRutInput(e.target.value) })}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label>
                  <label className="block min-w-0 text-sm font-semibold">Nombre completo<input required placeholder="Nombre y apellidos" value={receptionData.nombre} onChange={(e) => setReceptionData({ ...receptionData, nombre: e.target.value })}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label>
                  <label className="block min-w-0 text-sm font-semibold">Correo electrónico<input required type="email" placeholder="nombre@ejemplo.cl" value={receptionData.email} onChange={(e) => setReceptionData({ ...receptionData, email: e.target.value })}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label>
                  <label className="block min-w-0 text-sm font-semibold">Teléfono<input required type="tel" placeholder="+56 9 1234 5678" value={receptionData.telefono} onChange={(e) => setReceptionData({ ...receptionData, telefono: e.target.value })}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label>
                  {receptionError && <p role="alert" className="text-sm text-rose-800">{receptionError}</p>}
                  <button className="min-h-11 rounded-lg bg-teal-700 text-white font-semibold px-4 text-sm">Reservar</button>
                </form>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
