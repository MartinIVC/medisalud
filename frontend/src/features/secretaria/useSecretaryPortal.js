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
  const [secretaryPassword, setSecretaryPassword] = useState('');
  const [secretaryError, setSecretaryError] = useState('');
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
  const [catalogosLoading, setCatalogosLoading] = useState(false);
  const [catalogosError, setCatalogosError] = useState('');
  const [pendingMedicoDraft, setPendingMedicoDraft] = useState(null);
  const [secMedicoId, setSecMedicoId] = useState('1');
  const [secFecha, setSecFecha] = useState(todayStr);
  const [secHoraInicio, setSecHoraInicio] = useState('09:00');
  const [secHoraFin, setSecHoraFin] = useState('13:00');
  const [secDuracion, setSecDuracion] = useState('30');
  const [secMotivoBloqueo, setSecMotivoBloqueo] = useState('Licencia médica profesional');
  const [secAgendas, setSecAgendas] = useState([]);
  const secretaryRequestRef = useRef(0);
  const [secFeedback, setSecFeedback] = useState(null);
  const [secError, setSecError] = useState('');
  const [scheduleDetailsOpen, setScheduleDetailsOpen] = useState(false);

  useEffect(() => {
    if (!receptionBlock) return undefined;
    const dialog = receptionDialogRef.current;
    if (!dialog) return undefined;
    const selector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    dialog.querySelector(selector)?.focus();
    const trapFocus = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeReceptionBooking();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.querySelectorAll(selector)];
      if (!elements.length) return;
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, [receptionBlock]);

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
    sessionStorage.removeItem('medisalud-secretaria-token');
    setSecretaryToken('');
    setSecretaryError('Tu sesión terminó. Inicia sesión nuevamente para continuar.');
    setSecAgendas([]);
  }, []);

  const fetchSecAgendas = useCallback(
    async ({ signal } = {}) => {
      if (!secretaryToken) return;
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
          setSecAgendas(response.data.bloques);
          setSecError('');
        } else
          setSecError(response.data.error || 'No pudimos cargar la agenda. Intenta nuevamente.');
      } catch {
        if (!signal?.aborted && requestId === secretaryRequestRef.current) {
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
    setSecretaryError('');
    try {
      const response = await requestApi('/api/auth/secretaria', {
        method: 'POST',
        body: { password: secretaryPassword },
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
    }
  }

  const refreshDoctorCatalogs = useCallback(async () => {
    const refreshed = await fetchCatalogos();
    await refreshAvailability();
    return refreshed;
  }, [fetchCatalogos, refreshAvailability]);

  function handleDoctorSessionExpired(draft) {
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

  async function handleBloquearDia(esFeriadoGlobal = false) {
    const doctor = medicos.find((item) => String(item.id) === String(secMedicoId));
    const alcance = esFeriadoGlobal
      ? 'todos los profesionales'
      : doctor?.nombre || 'el profesional seleccionado';
    const tipo = esFeriadoGlobal ? 'feriado' : 'ausencia';
    if (
      !window.confirm(
        `Vas a registrar un ${tipo} para ${alcance} el ${secFecha}. Se bloquearán los horarios disponibles de esa jornada. ¿Continuar?`,
      )
    )
      return;
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
          motivo: esFeriadoGlobal ? `Día Festivo Global: ${secMotivoBloqueo}` : secMotivoBloqueo,
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
        error: 'No pudimos conectar con el sistema. El bloqueo no fue confirmado.',
      });
    }
  }

  async function handleToggleBloque(block) {
    const endpoint =
      block.estado === 'BLOQUEADO' ? '/api/agendas/desbloquear' : '/api/agendas/bloquear';
    try {
      const result = await requestApi(endpoint, {
        method: 'POST',
        token: secretaryToken,
        onUnauthorized: handleSecretaryUnauthorized,
        body: {
          agenda_id: block.agenda_id,
          motivo: secMotivoBloqueo || 'Bloqueo manual por secretaría (MED-10)',
        },
      });
      if (!result.ok) setSecFeedback(result.data);
      else {
        fetchSecAgendas();
        refreshAvailability();
      }
    } catch {
      setSecFeedback({
        ok: false,
        error: 'No pudimos conectar con el sistema. El estado del bloque no fue confirmado.',
      });
    }
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

  const state = {
    secretaryView,
    secretaryToken,
    secretaryPassword,
    secretaryError,
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
    secAgendas,
    secFeedback,
    secError,
    scheduleDetailsOpen,
    todayStr,
  };
  const actions = {
    setSecretaryView,
    setSecretaryPassword,
    loginSecretary,
    setPendingMedicoDraft,
    refreshDoctorCatalogs,
    handleDoctorSessionExpired,
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
