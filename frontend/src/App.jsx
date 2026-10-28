import React, { useEffect, useState, useCallback } from 'react';
import { formatRutInput, validateRutClient } from './utils/rut';

export default function App() {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const appointmentToken = new URLSearchParams(window.location.search).get('cita_token');
  const [appointmentReply, setAppointmentReply] = useState('');

  const [activeTab, setActiveTab] = useState('paciente'); // 'paciente' | 'secretaria'
  const [secretaryToken, setSecretaryToken] = useState(() => sessionStorage.getItem('medisalud-secretaria-token') || '');
  const [secretaryPassword, setSecretaryPassword] = useState('');
  const [secretaryError, setSecretaryError] = useState('');
  const [receptionBlock, setReceptionBlock] = useState(null);
  const [receptionData, setReceptionData] = useState({ nombre: '', rut: '', email: '', telefono: '+569', origen: 'PRESENCIAL' });
  const [health, setHealth] = useState(null);
  const [especialidades, setEspecialidades] = useState([]);
  const [medicos, setMedicos] = useState([]);

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

  // Estado Panel Secretaría (MED-10)
  const [secMedicoId, setSecMedicoId] = useState('1');
  const [secFecha, setSecFecha] = useState(todayStr);
  const [secHoraInicio, setSecHoraInicio] = useState('09:00');
  const [secHoraFin, setSecHoraFin] = useState('13:00');
  const [secDuracion, setSecDuracion] = useState('30');
  const [secMotivoBloqueo, setSecMotivoBloqueo] = useState('Licencia médica profesional');
  const [secAgendas, setSecAgendas] = useState([]);
  const [secFeedback, setSecFeedback] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ ok: false });
    }
  }, []);

  const fetchCatalogos = useCallback(async () => {
    const [espRes, medRes] = await Promise.all([
      fetch('/api/especialidades').then((r) => r.json()),
      fetch('/api/medicos').then((r) => r.json()),
    ]);
    if (espRes.ok) setEspecialidades(espRes.especialidades);
    if (medRes.ok) setMedicos(medRes.medicos);
  }, []);

  const fetchDisponibilidad = useCallback(async () => {
    setLoadingDisp(true);
    try {
      const params = new URLSearchParams();
      if (selectedEsp) params.set('especialidad_id', selectedEsp);
      if (selectedMedico) params.set('medico_id', selectedMedico);
      if (selectedFecha) params.set('fecha', selectedFecha);

      const res = await fetch(`/api/disponibilidad?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setDisponibilidad(data);
      }
    } finally {
      setLoadingDisp(false);
    }
  }, [selectedEsp, selectedMedico, selectedFecha]);

  const fetchSecAgendas = useCallback(async () => {
    if (!secretaryToken) return;
    const params = new URLSearchParams();
    if (secMedicoId) params.set('medico_id', secMedicoId);
    if (secFecha) params.set('fecha', secFecha);
    const res = await fetch(`/api/agendas?${params.toString()}`, { headers: { Authorization: `Bearer ${secretaryToken}` } });
    const data = await res.json();
    if (data.ok) setSecAgendas(data.bloques);
  }, [secMedicoId, secFecha, secretaryToken]);

  useEffect(() => {
    fetchHealth();
    fetchCatalogos();
  }, [fetchHealth, fetchCatalogos]);

  useEffect(() => {
    fetchDisponibilidad();
  }, [fetchDisponibilidad]);

  useEffect(() => {
    if (activeTab === 'secretaria') {
      fetchSecAgendas();
    }
  }, [activeTab, fetchSecAgendas]);

  useEffect(() => {
    if (activeTab !== 'secretaria' || !secretaryToken) return undefined;
    const timer = window.setInterval(fetchSecAgendas, 2000);
    return () => window.clearInterval(timer);
  }, [activeTab, secretaryToken, fetchSecAgendas]);

  async function loginSecretary(event) {
    event.preventDefault();
    setSecretaryError('');
    const response = await fetch('/api/auth/secretaria', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: secretaryPassword }),
    });
    const data = await response.json();
    if (!response.ok) { setSecretaryError(data.error || 'No fue posible iniciar sesión.'); return; }
    sessionStorage.setItem('medisalud-secretaria-token', data.token);
    setSecretaryToken(data.token);
    setSecretaryPassword('');
  }

  async function submitReceptionBooking(event) {
    event.preventDefault();
    if (!receptionBlock) return;
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
    setSecFeedback(data);
    if (response.ok) {
      setReceptionBlock(null);
      setReceptionData({ nombre: '', rut: '', email: '', telefono: '+569', origen: 'PRESENCIAL' });
      fetchSecAgendas(); fetchDisponibilidad(); fetchHealth();
    }
  }

  async function replyToAppointment(action) {
    const response = await fetch('/api/citas/responder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: appointmentToken, accion: action }),
    });
    const data = await response.json();
    setAppointmentReply(response.ok
      ? action === 'CANCELAR' ? 'La cita fue cancelada y el cupo quedó liberado.' : 'Gracias. Registramos que asistirás.'
      : data.error || 'No fue posible actualizar la cita.');
  }

  const medicosFiltrados = selectedEsp
    ? medicos.filter((m) => String(m.especialidad_id) === String(selectedEsp))
    : medicos;

  const rutCheck = pacienteRut ? validateRutClient(pacienteRut) : null;

  async function handleReservarSubmit(e) {
    e.preventDefault();
    if (!selectedBloque) return;
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
        fetchDisponibilidad();
        fetchHealth();
      } else {
        setReservaResult({ type: 'error', data });
        if (res.status === 409) {
          fetchDisponibilidad();
        }
      }
    } catch (err) {
      setReservaResult({
        type: 'error',
        data: { mensaje: `Error de conexión: ${err.message}` },
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
    fetchHealth();
  }

  async function handleBloquearDia(esFeriadoGlobal = false) {
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
    fetchHealth();
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
    fetchHealth();
  }

  if (appointmentToken) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <section className="max-w-md w-full rounded-xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-bold text-slate-800">Respuesta a tu cita</h1>
          <p className="text-sm text-slate-600">Selecciona si asistirás o si necesitas liberar el horario reservado.</p>
          <div className="flex gap-3">
            <button onClick={() => replyToAppointment('CONFIRMAR')} className="flex-1 rounded bg-teal-700 text-white px-3 py-2 font-semibold">Asistiré</button>
            <button onClick={() => replyToAppointment('CANCELAR')} className="flex-1 rounded bg-rose-700 text-white px-3 py-2 font-semibold">Cancelar cita</button>
          </div>
          {appointmentReply && <p role="status" className="text-sm text-slate-700">{appointmentReply}</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Barra superior institucional */}
      <header className="bg-teal-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-teal-600 rounded-full">
                Sprint 1 — MVP Operativo
              </span>
              <span className="text-xs text-teal-200">
                MED-15 · MED-9 · MED-10 · MED-16 · MED-11
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-1">
              Centro Médico Medisalud — Sistema de Reserva de Citas en Línea
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('paciente')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === 'paciente'
                  ? 'bg-white text-teal-900 shadow'
                  : 'bg-teal-700 text-teal-100 hover:bg-teal-600'
              }`}
            >
              Portal Paciente (CU-01 / CU-02)
            </button>
            <button
              onClick={() => setActiveTab('secretaria')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === 'secretaria'
                  ? 'bg-white text-teal-900 shadow'
                  : 'bg-teal-700 text-teal-100 hover:bg-teal-600'
              }`}
            >
              Panel Secretaría (MED-10)
            </button>
          </div>
        </div>

        {/* Estado en vivo de MED-15 y MED-9 */}
        {health?.ok && (
          <div className="bg-teal-950/70 border-t border-teal-700 text-xs text-teal-100">
            <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  <strong className="text-emerald-400">● PostgreSQL (MED-15):</strong> CONECTADO ({health.ping_ms} ms)
                </span>
                <span>
                  <strong>Especialidades:</strong> {health.resumen.especialidades}
                </span>
                <span>
                  <strong>Médicos Activos:</strong> {health.resumen.medicos_activos}
                </span>
                <span>
                  <strong>Cupos Libres:</strong> {health.resumen.bloques_disponibles}
                </span>
                <span>
                  <strong>Reservas Confirmadas:</strong> {health.resumen.citas_confirmadas}
                </span>
                <span>
                  <strong>Bloqueados (MED-10):</strong> {health.resumen.bloques_bloqueados}
                </span>
              </div>
              <div>
                <span className="px-2 py-0.5 rounded bg-emerald-900/80 text-emerald-300 font-mono">
                  Latencia Consulta MED-9: {disponibilidad.latencia_ms} ms (&lt; 2000 ms)
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
        {activeTab === 'secretaria' && !secretaryToken ? (
          <section className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800">Acceso de secretaría</h2>
            <p className="text-sm text-slate-600 mt-1">Ingrese la contraseña configurada para este entorno.</p>
            <form className="mt-4 space-y-3" onSubmit={loginSecretary}>
              <input type="password" autoComplete="current-password" required value={secretaryPassword}
                onChange={(event) => setSecretaryPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {secretaryError && <p role="alert" className="text-sm text-rose-700">{secretaryError}</p>}
              <button className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm">Iniciar sesión</button>
            </form>
          </section>
        ) : activeTab === 'paciente' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna Izquierda: Filtros A-01 (MED-9) */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-800">
                  1. Consultar Disponibilidad (A-01)
                </h2>
                <span className="text-xs font-mono bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200">
                  MED-9 / CU-01
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Seleccione especialidad médica, profesional y fecha para consultar en tiempo real los bloques libres en PostgreSQL.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Especialidad Médica
                  </label>
                  <select
                    value={selectedEsp}
                    onChange={(e) => {
                      setSelectedEsp(e.target.value);
                      setSelectedMedico('');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="">Todas las especialidades (4 áreas)</option>
                    {especialidades.map((esp) => (
                      <option key={esp.id} value={esp.id}>
                        {esp.nombre} ({esp.total_medicos} especialistas)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Profesional Médico ({medicosFiltrados.length} disponibles)
                  </label>
                  <select
                    value={selectedMedico}
                    onChange={(e) => setSelectedMedico(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="">Todos los profesionales</option>
                    {medicosFiltrados.map((med) => (
                      <option key={med.id} value={med.id}>
                        {med.nombre} — {med.especialidad_nombre} ({med.box_atencion})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Fecha de Atención
                  </label>
                  <input
                    type="date"
                    value={selectedFecha}
                    onChange={(e) => setSelectedFecha(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={fetchDisponibilidad}
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  Actualizar Horarios Disponibles
                </button>
              </div>
            </section>

            {/* Columna Central/Derecha: Grilla de Horarios A-02 y Formulario A-03..A-06 */}
            <section className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      2. Bloques Horarios Disponibles (A-02)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Se muestran exclusivamente los cupos con estado DISPONIBLE (excluyendo bloques reservados o bloqueados por secretaría — CA-02).
                    </p>
                  </div>
                  <div className="text-xs font-mono px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {disponibilidad.total_cupos_libres || 0} cupos libres · {disponibilidad.latencia_ms} ms
                  </div>
                </div>

                {loadingDisp ? (
                  <div className="py-12 text-center text-sm text-slate-500">
                    Consultando agenda en PostgreSQL...
                  </div>
                ) : disponibilidad.bloques?.length === 0 ? (
                  <div className="py-10 text-center bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="font-semibold text-amber-900">
                      No hay bloques disponibles para los filtros seleccionados (CA-02).
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      Los horarios pueden haber sido reservados o bloqueados por secretaría. Pruebe seleccionando otra fecha o profesional.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
                    {disponibilidad.bloques.map((b) => {
                      const isSelected = selectedBloque?.agenda_id === b.agenda_id;
                      return (
                        <button
                          key={b.agenda_id}
                          type="button"
                          onClick={() => {
                            setSelectedBloque(b);
                            setReservaResult(null);
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
                            {b.especialidad_nombre} · {b.box_atencion}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Formulario de Reserva Web con Validación de RUT (MED-11 / CU-02) */}
              {selectedBloque && (
                <div className="bg-white rounded-xl shadow-sm border-2 border-teal-600 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">
                        3. Solicitar Reserva e Ingresar RUT (A-03 / CU-02)
                      </h3>
                      <p className="text-xs text-slate-600">
                        Horario seleccionado: <strong>{selectedBloque.fecha}</strong> de{' '}
                        <strong>
                          {selectedBloque.hora_inicio} a {selectedBloque.hora_fin}
                        </strong>{' '}
                        con <strong>{selectedBloque.medico_nombre}</strong> ({selectedBloque.especialidad_nombre})
                      </p>
                    </div>
                    <span className="text-xs font-mono bg-teal-50 text-teal-800 px-2.5 py-1 rounded border border-teal-200">
                      MED-11 &amp; MED-16 (SELECT FOR UPDATE)
                    </span>
                  </div>

                  {/* Botones de autocompletado rápido para demostrar CA-01 y CA-02 en vivo */}
                  <div className="mb-4 p-3 rounded-lg bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700">
                      Datos rápidos de prueba (Evaluación Criterios de Aceptación):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPacienteRut('12.345.678-5');
                          setPacienteNombre('Martín Verdugo Contreras');
                          setPacienteEmail('martin.paciente@medisalud.cl');
                          setPacienteTelefono('+56987654321');
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800 font-medium"
                      >
                        Cargar RUT Válido (CA-02 / A-05)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPacienteRut('12.345.678-9');
                          setPacienteNombre('Paciente Prueba Rechazo');
                          setPacienteEmail('rechazo@medisalud.cl');
                          setPacienteTelefono('+56911223344');
                        }}
                        className="px-2.5 py-1 rounded bg-rose-700 text-white hover:bg-rose-800 font-medium"
                      >
                        Cargar RUT Inválido (CA-01 / A-06)
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleReservarSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                        RUT del Paciente (Validación Módulo 11) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: 12.345.678-5"
                        value={pacienteRut}
                        onChange={(e) => setPacienteRut(formatRutInput(e.target.value))}
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                          rutCheck
                            ? rutCheck.valid
                              ? 'border-emerald-500 focus:ring-emerald-500 bg-emerald-50/30'
                              : 'border-rose-500 focus:ring-rose-500 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-teal-600'
                        }`}
                      />
                      {rutCheck && (
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
                      <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                        Nombre Completo *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Nombre y Apellidos"
                        value={pacienteNombre}
                        onChange={(e) => setPacienteNombre(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                        Correo Electrónico (Para comprobante A-05) *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="paciente@ejemplo.cl"
                        value={pacienteEmail}
                        onChange={(e) => setPacienteEmail(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                        Teléfono Móvil *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="+56912345678"
                        value={pacienteTelefono}
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
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={submittingReserva}
                        className="px-6 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm shadow transition disabled:opacity-50"
                      >
                        {submittingReserva
                          ? 'Validando RUT y Bloqueando Cupo en BD...'
                          : 'Confirmar Reserva Médica (A-03)'}
                      </button>
                    </div>
                  </form>

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
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">
                              {reservaResult.data.actividad_bpmn}
                            </span>
                            <span className="text-xs font-mono">
                              Transacción PostgreSQL: {reservaResult.data.latencia_ms} ms
                            </span>
                          </div>
                          <h4 className="text-base font-bold mt-2">
                            ✅ ¡Reserva Confirmada! Código Único:{' '}
                            <span className="font-mono underline">
                              {reservaResult.data.reserva.codigo_reserva}
                            </span>
                          </h4>
                          <p className="text-xs mt-1">{reservaResult.data.mensaje}</p>
                          {reservaResult.data.comprobante_correo && (
                            <pre className="mt-3 p-3 rounded bg-white border border-emerald-200 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                              {reservaResult.data.comprobante_correo.body}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-200 text-rose-900">
                            {reservaResult.data.actividad_bpmn || 'A-06 Informar rechazo'}
                          </span>
                          <h4 className="text-sm font-bold mt-2">
                            ❌ Solicitud Rechazada ({reservaResult.data.codigo_error})
                          </h4>
                          <p className="text-xs mt-1">{reservaResult.data.mensaje}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* Panel Administrativo de Secretaría (MED-10) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5 h-fit">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800">
                    Parametrización de Agenda
                  </h2>
                  <span className="text-xs font-mono bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200">
                    MED-10 / RF-03
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Configure bloques de 15, 20 o 30 minutos para los 15 especialistas o registre bloqueos por días festivos y licencias médicas.
                </p>
              </div>

              <form onSubmit={handleConfigurarAgenda} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Profesional Médico (15 Especialistas)
                  </label>
                  <select
                    value={secMedicoId}
                    onChange={(e) => setSecMedicoId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {medicos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} ({m.especialidad_nombre})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Fecha a Configurar / Consultar
                  </label>
                  <input
                    type="date"
                    value={secFecha}
                    onChange={(e) => setSecFecha(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Hora Inicio
                    </label>
                    <input
                      type="time"
                      value={secHoraInicio}
                      onChange={(e) => setSecHoraInicio(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Hora Fin
                    </label>
                    <input
                      type="time"
                      value={secHoraFin}
                      onChange={(e) => setSecHoraFin(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Duración de Bloque (CA-01: 15, 20 o 30 min)
                  </label>
                  <select
                    value={secDuracion}
                    onChange={(e) => setSecDuracion(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-teal-900"
                  >
                    <option value="15">15 minutos por bloque</option>
                    <option value="20">20 minutos por bloque</option>
                    <option value="30">30 minutos por bloque</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  Generar Bloques Horarios (CA-01)
                </button>
              </form>

              <hr className="border-slate-200" />

              {/* Bloqueo de feriados o licencias médicas (CA-02) */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800">
                  Bloqueo de Licencias o Días Festivos (CA-02)
                </h3>
                <input
                  type="text"
                  value={secMotivoBloqueo}
                  onChange={(e) => setSecMotivoBloqueo(e.target.value)}
                  placeholder="Motivo del bloqueo..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => handleBloquearDia(false)}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-xs transition"
                  >
                    Bloquear Jornada del Médico (Licencia Médica)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBloquearDia(true)}
                    className="w-full bg-rose-700 hover:bg-rose-800 text-white font-semibold py-2 rounded-lg text-xs transition"
                  >
                    Bloquear Fecha como Feriado (Todos los Médicos)
                  </button>
                </div>
              </div>

              {secFeedback && (
                <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
                  <strong>{secFeedback.jira}:</strong> {secFeedback.mensaje || secFeedback.error}
                </div>
              )}
            </section>

            {/* Tabla de estado de bloques del médico */}
            <section className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    Estado Sincronizado de Bloques en PostgreSQL
                  </h2>
                  <p className="text-xs text-slate-500">
                    Vista de secretaría con los estados DISPONIBLE, RESERVADO y BLOQUEADO en tiempo real.
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 rounded">
                  Total bloques: {secAgendas.length}
                </span>
              </div>

              <div className="overflow-x-auto">
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
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              b.estado === 'DISPONIBLE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : b.estado === 'RESERVADO'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {b.estado}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {b.estado === 'RESERVADO'
                            ? `${b.paciente_nombre} (${b.paciente_rut}) — Cód: ${b.codigo_reserva}`
                            : b.estado === 'BLOQUEADO'
                            ? b.motivo_bloqueo
                            : 'Habilitado en Portal Web (A-02)'}
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
                <form onSubmit={submitReceptionBooking} className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2 flex justify-between items-center">
                    <h3 className="font-semibold text-sm">Reserva rápida · {receptionBlock.hora_inicio}–{receptionBlock.hora_fin}</h3>
                    <button type="button" onClick={() => setReceptionBlock(null)} className="text-xs underline">Cerrar</button>
                  </div>
                  <select value={receptionData.origen} onChange={(e) => setReceptionData({ ...receptionData, origen: e.target.value })}
                    className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="PRESENCIAL">Presencial</option><option value="TELEFONO">Telefónica</option>
                  </select>
                  <input required placeholder="RUT" value={receptionData.rut} onChange={(e) => setReceptionData({ ...receptionData, rut: e.target.value })}
                    className="rounded border border-slate-300 px-3 py-2 text-sm" />
                  <input required placeholder="Nombre completo" value={receptionData.nombre} onChange={(e) => setReceptionData({ ...receptionData, nombre: e.target.value })}
                    className="rounded border border-slate-300 px-3 py-2 text-sm" />
                  <input required type="email" placeholder="Correo" value={receptionData.email} onChange={(e) => setReceptionData({ ...receptionData, email: e.target.value })}
                    className="rounded border border-slate-300 px-3 py-2 text-sm" />
                  <input required type="tel" placeholder="Teléfono +569..." value={receptionData.telefono} onChange={(e) => setReceptionData({ ...receptionData, telefono: e.target.value })}
                    className="rounded border border-slate-300 px-3 py-2 text-sm" />
                  <button className="rounded bg-teal-700 text-white font-semibold px-3 py-2 text-sm">Confirmar reserva</button>
                </form>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
