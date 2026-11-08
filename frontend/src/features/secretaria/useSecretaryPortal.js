import { useCallback, useEffect, useRef, useState } from 'react';
import { idempotencyKeyFor, requestApi } from '../../api/client.js';
import { formatRutInput } from '../../utils/rut.js';

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

export default function useSecretaryPortal({ activeTab, refreshAvailability }) {
  const todayStr = localToday();
  const [secretaryView, setSecretaryView] = useState('agenda');
  const [secretaryToken, setSecretaryToken] = useState(
    () => sessionStorage.getItem('medisalud-secretaria-token') || '',
  );
  const [secretaryUsername, setSecretaryUsername] = useState('');
  const [secretaryPassword, setSecretaryPassword] = useState('');
  const [secretaryError, setSecretaryError] = useState('');
  const [secretaryLogoutError, setSecretaryLogoutError] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const loginPendingRef = useRef(false);
  const logoutPendingRef = useRef(false);
  const [receptionBlock, setReceptionBlock] = useState(null);
  const receptionRequestRef = useRef(null);
  const receptionTriggerRef = useRef(null);
  const receptionDialogRef = useRef(null);
  const [receptionData, setReceptionData] = useState({
    nombre: '',
    rut: '',
    email: '',
    telefono: '+569',
    origen: 'PRESENCIAL',
  });
  const [receptionError, setReceptionError] = useState('');
  const [receptionFieldErrors, setReceptionFieldErrors] = useState({});
  const [submittingReception, setSubmittingReception] = useState(false);
  const [especialidades, setEspecialidades] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [catalogosLoading, setCatalogosLoading] = useState(true);
  const [catalogosError, setCatalogosError] = useState('');
  const [pendingMedicoDraft, setPendingMedicoDraft] = useState(null);
  const [secMedicoId, setSecMedicoId] = useState('1');
  const [secFecha, setSecFecha] = useState(todayStr);
  const [secHoraInicio, setSecHoraInicio] = useState('09:00');
  const [secHoraFin, setSecHoraFin] = useState('13:00');
  const [secDuracion, setSecDuracion] = useState('30');
  const [secMotivoBloqueo, setSecMotivoBloqueo] = useState('Licencia médica profesional');
  const [secAgendas, setSecAgendas] = useState([]);
  const [secAgendasKey, setSecAgendasKey] = useState('');
  const secretaryRequestRef = useRef(0);
  const [secFeedback, setSecFeedback] = useState(null);
  const [secError, setSecError] = useState('');
  const [scheduleDetailsOpen, setScheduleDetailsOpen] = useState(false);

  const fetchCatalogos = useCallback(async () => {
    setCatalogosLoading(true);
    setCatalogosError('');
    try {
      const [specialties, doctors] = await Promise.all([
        requestApi('/api/especialidades'),
        requestApi('/api/medicos'),
      ]);
      if (!specialties.ok || !doctors.ok || !specialties.data.ok || !doctors.data.ok) {
        throw new Error('No pudimos cargar las especialidades y los médicos.');
      }
      setEspecialidades(specialties.data.especialidades);
      setMedicos(doctors.data.medicos);
      setSecMedicoId((current) =>
        doctors.data.medicos.some((doctor) => String(doctor.id) === String(current))
          ? current
          : String(doctors.data.medicos[0]?.id || ''),
      );
      return true;
    } catch {
      setCatalogosError(
        'No pudimos cargar las especialidades y los médicos. Revisa tu conexión e intenta nuevamente.',
      );
      return false;
    } finally {
      setCatalogosLoading(false);
    }
  }, []);

  const handleSecretaryUnauthorized = useCallback(() => {
    if (!secretaryToken || sessionStorage.getItem('medisalud-secretaria-token') !== secretaryToken)
      return;
    sessionStorage.removeItem('medisalud-secretaria-token');
    setSecretaryToken('');
    setSecretaryError('Tu sesión terminó. Inicia sesión nuevamente para continuar.');
    setSecAgendas([]);
  }, [secretaryToken]);

  const fetchSecAgendas = useCallback(
    async ({ signal } = {}) => {
      if (!secretaryToken || !secMedicoId || !secFecha) return;
      const requestId = ++secretaryRequestRef.current;
      const params = new URLSearchParams();
      if (secMedicoId) params.set('medico_id', secMedicoId);
      if (secFecha) params.set('fecha', secFecha);
      try {
        const response = await requestApi(`/api/agendas?${params.toString()}`, {
          token: secretaryToken,
          signal,
          onUnauthorized: handleSecretaryUnauthorized,
        });
        if (signal?.aborted || requestId !== secretaryRequestRef.current) return;
        if (response.status === 401) return;
        if (response.ok && response.data.ok) {
          setSecAgendasKey(`${secMedicoId}:${secFecha}`);
          setSecAgendas(response.data.bloques);
          setSecError('');
        } else {
          setSecAgendasKey(`${secMedicoId}:${secFecha}`);
          setSecAgendas([]);
          setSecError(response.data.error || 'No pudimos cargar la agenda. Intenta nuevamente.');
        }
      } catch {
        if (!signal?.aborted && requestId === secretaryRequestRef.current) {
          setSecAgendasKey(`${secMedicoId}:${secFecha}`);
          setSecAgendas([]);
          setSecError('No pudimos cargar la agenda. Revisa tu conexión e intenta nuevamente.');
        }
      }
    },
    [secMedicoId, secFecha, secretaryToken, handleSecretaryUnauthorized],
  );

  useEffect(() => {
    fetchCatalogos();
  }, [fetchCatalogos]);

  useEffect(() => {
    if (activeTab === 'secretaria' && secretaryToken) fetchCatalogos();
  }, [activeTab, secretaryToken, secretaryView, fetchCatalogos]);

  useEffect(() => {
    if (activeTab !== 'secretaria' || !secretaryToken || secretaryView !== 'agenda')
      return undefined;
    let active = true;
    let timer;
    let controller;
    const poll = async () => {
      controller = new AbortController();
      await fetchSecAgendas({ signal: controller.signal });
      if (active) timer = window.setTimeout(poll, 2000);
    };
    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [activeTab, secretaryToken, secretaryView, fetchSecAgendas]);

  async function loginSecretary(event) {
    event.preventDefault();
    if (loginPendingRef.current || logoutPendingRef.current) return;
    loginPendingRef.current = true;
    setLoginPending(true);
    setSecretaryError('');
    setSecretaryLogoutError('');
    try {
      const response = await requestApi('/api/auth/secretaria', {
        method: 'POST',
        body: { username: secretaryUsername, password: secretaryPassword },
      });
      if (!response.ok) {
        setSecretaryError(response.data.error || 'No fue posible iniciar sesión.');
        return;
      }
      sessionStorage.setItem('medisalud-secretaria-token', response.data.token);
      setSecretaryToken(response.data.token);
      setSecretaryPassword('');
    } catch {
      setSecretaryError('No pudimos iniciar sesión. Revisa tu conexión e intenta nuevamente.');
    } finally {
      loginPendingRef.current = false;
      setLoginPending(false);
    }
  }

  const refreshDoctorCatalogs = useCallback(async () => {
    const refreshed = await fetchCatalogos();
    await refreshAvailability();
    return refreshed;
  }, [fetchCatalogos, refreshAvailability]);

  function handleDoctorSessionExpired(draft) {
    if (!secretaryToken || sessionStorage.getItem('medisalud-secretaria-token') !== secretaryToken)
      return;
    setPendingMedicoDraft(draft);
    setSecretaryView('create-medico');
    sessionStorage.removeItem('medisalud-secretaria-token');
    setSecretaryToken('');
    setSecAgendas([]);
    setSecretaryError(
      'Tu sesión expiró. Inicia sesión nuevamente; conservamos el formulario en esta página.',
    );
  }

  function openReceptionBooking(block, event) {
    receptionRequestRef.current = null;
    receptionTriggerRef.current = event?.currentTarget || document.activeElement;
    setReceptionBlock(block);
  }

  function closeReceptionBooking() {
    receptionRequestRef.current = null;
    setReceptionBlock(null);
    const trigger = receptionTriggerRef.current;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      else document.getElementById('secretary-agenda-title')?.focus();
    });
  }

  function updateReceptionField(field, value) {
    setReceptionData((current) => ({ ...current, [field]: value }));
    setReceptionFieldErrors((current) => ({ ...current, [field]: undefined }));
    setReceptionError('');
  }

  async function submitReceptionBooking(event) {
    event.preventDefault();
    if (!receptionBlock) return;
    setReceptionError('');
    setReceptionFieldErrors({});
    setSubmittingReception(true);
    try {
      const body = {
        agenda_id: receptionBlock.agenda_id,
        paciente_nombre: receptionData.nombre,
        paciente_rut: receptionData.rut,
        paciente_email: receptionData.email,
        paciente_telefono: receptionData.telefono,
        origen: receptionData.origen,
      };
      const response = await requestApi('/api/reservas', {
        method: 'POST',
        token: secretaryToken,
        headers: { 'Idempotency-Key': idempotencyKeyFor(receptionRequestRef, body) },
        body,
        onUnauthorized: handleSecretaryUnauthorized,
      });
      if (response.ok) {
        closeReceptionBooking();
        setSecFeedback({
          ok: true,
          mensaje:
            response.data?.mensaje ||
            'La cita quedó reservada con éxito. Se envió el comprobante por correo al paciente.',
        });
        setReceptionData({
          nombre: '',
          rut: '',
          email: '',
          telefono: '+569',
          origen: 'PRESENCIAL',
        });
        fetchSecAgendas();
        refreshAvailability();
      } else {
        setReceptionError(
          response.data.error ||
            response.data.mensaje ||
            'No se pudo registrar la reserva. Revisa los datos e inténtalo nuevamente.',
        );
        setReceptionFieldErrors(response.data.fields || {});
      }
    } catch {
      setReceptionError(
        'No pudimos conectar con el sistema. Los datos siguen en el formulario; inténtalo nuevamente.',
      );
    } finally {
      setSubmittingReception(false);
    }
  }

  async function handleConfigurarAgenda(event) {
    event.preventDefault();
    setSecFeedback(null);
    try {
      const response = await requestApi('/api/agendas/configurar', {
        method: 'POST',
        token: secretaryToken,
        onUnauthorized: handleSecretaryUnauthorized,
        body: {
          medico_id: Number(secMedicoId),
          fecha: secFecha,
          hora_inicio: secHoraInicio,
          hora_fin: secHoraFin,
          duracion_min: Number(secDuracion),
        },
      });
      setSecFeedback(response.data);
      if (response.ok) {
        fetchSecAgendas();
        refreshAvailability();
      }
    } catch {
      setSecFeedback({
        ok: false,
        error: 'No pudimos conectar con el sistema. La configuración sigue en el formulario.',
      });
    }
  }

  async function handleBloquearDia(esFeriadoGlobal = false, motivo = secMotivoBloqueo) {
    const motivoLimpio = String(motivo || '').trim();
    setSecFeedback(null);
    try {
      const response = await requestApi('/api/agendas/bloquear', {
        method: 'POST',
        token: secretaryToken,
        onUnauthorized: handleSecretaryUnauthorized,
        body: {
          medico_id: Number(secMedicoId),
          fecha: secFecha,
          es_feriado_global: esFeriadoGlobal,
          motivo: esFeriadoGlobal ? `Día Festivo Global: ${motivoLimpio}` : motivoLimpio,
        },
      });
      setSecFeedback(response.data);
      if (response.ok) {
        fetchSecAgendas();
        refreshAvailability();
      }
      return response.ok;
    } catch {
      setSecFeedback({
        ok: false,
        error: 'No pudimos conectar con el sistema. El bloqueo no fue confirmado.',
      });
      return false;
    }
  }

  async function handleToggleBloque(block, motivo = secMotivoBloqueo) {
    const endpoint =
      block.estado === 'BLOQUEADO' ? '/api/agendas/desbloquear' : '/api/agendas/bloquear';
    try {
      const result = await requestApi(endpoint, {
        method: 'POST',
        token: secretaryToken,
        onUnauthorized: handleSecretaryUnauthorized,
        body: {
          agenda_id: block.agenda_id,
          motivo: motivo || 'Bloqueo manual por secretaría (MED-10)',
        },
      });
      if (!result.ok) {
        setSecFeedback(result.data);
        return false;
      }
      setSecFeedback(result.data);
      fetchSecAgendas();
      refreshAvailability();
      return true;
    } catch {
      setSecFeedback({
        ok: false,
        error: 'No pudimos conectar con el sistema. El estado del bloque no fue confirmado.',
      });
      return false;
    }
  }

  function moveSecretaryDate(days) {
    setSecFecha((current) => {
      const date = new Date(`${current}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    });
  }

  async function logoutSecretary() {
    if (logoutPendingRef.current) return;
    logoutPendingRef.current = true;
    setLogoutPending(true);
    setSecretaryLogoutError('');
    const tokenToRevoke = secretaryToken;
    sessionStorage.removeItem('medisalud-secretaria-token');
    setSecretaryToken('');
    secretaryRequestRef.current += 1;
    setSecAgendas([]);
    setSecAgendasKey('');
    setSecFeedback(null);
    setSecretaryError('');
    setSecretaryView('agenda');
    setPendingMedicoDraft(null);
    setReceptionBlock(null);
    setReceptionData({ nombre: '', rut: '', email: '', telefono: '+569', origen: 'PRESENCIAL' });
    setReceptionError('');
    setReceptionFieldErrors({});
    receptionRequestRef.current = null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await requestApi('/api/auth/secretaria/logout', {
        method: 'POST',
        token: tokenToRevoke,
        signal: controller.signal,
      });
      if (!response.ok && response.status !== 401) {
        throw new Error('No se confirmó la revocación.');
      }
    } catch {
      setSecretaryLogoutError(
        'La sesión se cerró en este navegador, pero no pudimos confirmar su cierre en el servidor. Podría seguir activa hasta que venza.',
      );
    } finally {
      window.clearTimeout(timeout);
      logoutPendingRef.current = false;
      setLogoutPending(false);
    }
  }

  const state = {
    secretaryView,
    secretaryToken,
    secretaryUsername,
    secretaryPassword,
    secretaryError,
    secretaryLogoutError,
    loginPending,
    logoutPending,
    receptionBlock,
    receptionDialogRef,
    receptionData,
    receptionError,
    receptionFieldErrors,
    submittingReception,
    especialidades,
    medicos,
    catalogosLoading,
    catalogosError,
    pendingMedicoDraft,
    secMedicoId,
    secFecha,
    secHoraInicio,
    secHoraFin,
    secDuracion,
    secMotivoBloqueo,
    secAgendas: secAgendasKey === `${secMedicoId}:${secFecha}` ? secAgendas : [],
    secAgendasLoading: Boolean(secMedicoId) && secAgendasKey !== `${secMedicoId}:${secFecha}`,
    secFeedback,
    secError: secAgendasKey === `${secMedicoId}:${secFecha}` ? secError : '',
    scheduleDetailsOpen,
    todayStr,
  };
  const actions = {
    setSecretaryView,
    setSecretaryUsername,
    setSecretaryPassword,
    loginSecretary,
    setPendingMedicoDraft,
    refreshDoctorCatalogs,
    handleDoctorSessionExpired,
    handleSecretaryUnauthorized,
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
    submitReceptionBooking,
    updateReceptionField,
    receptionDialogRef,
    formatRutInput,
  };
  return { state, actions };
}
