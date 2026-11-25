import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { idempotencyKeyFor, requestApi } from '../../api/client.js';
import { cleanRut, formatRutInput, validateRutClient } from '../../utils/rut.js';

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

function normalizeEmailClient(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function canonicalRutKey(value) {
  const cleaned = cleanRut(value);
  return cleaned ? formatRutInput(cleaned) : '';
}

export default function usePatientPortal({
  medicos,
  especialidades,
  catalogosLoading = false,
  catalogosError = '',
  retryCatalogos = () => {},
}) {
  const [selectedEsp, setSelectedEsp] = useState('');
  const [selectedMedico, setSelectedMedico] = useState('');
  const [selectedFecha, setSelectedFecha] = useState(localToday);
  const [disponibilidad, setDisponibilidad] = useState({ bloques: [], latencia_ms: 0 });
  const [loadingDisp, setLoadingDisp] = useState(false);
  const [availabilityKey, setAvailabilityKey] = useState(null);
  const currentAvailabilityKey = JSON.stringify([selectedEsp, selectedMedico, selectedFecha]);
  const [availabilityError, setAvailabilityError] = useState('');
  const [selectedBloque, setSelectedBloque] = useState(null);
  const [pacienteRut, setPacienteRutState] = useState('');
  const [pacienteNombre, setPacienteNombre] = useState('');
  const [pacienteEmail, setPacienteEmailState] = useState('');
  const [pacienteTelefono, setPacienteTelefono] = useState('+569');
  const [reservaResult, setReservaResult] = useState(null);
  const [submittingReserva, setSubmittingReserva] = useState(false);
  const [bookingStep, setBookingStep] = useState('datos');
  const [fieldTouched, setFieldTouched] = useState({});

  // Estado de verificación de correo para reservas web (MED-29)
  const [verificationRequest, setVerificationRequest] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationAuth, setVerificationAuth] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');

  const availabilityRequestRef = useRef(0);
  const verificationRequestSeqRef = useRef(0);
  const patientRequestRef = useRef(null);
  const rutRef = useRef('');
  const emailRef = useRef('');
  const knownDoctorIds = useRef(new Set());
  const previousCatalogIds = useRef(null);

  const resetRequestKey = useCallback(() => {
    patientRequestRef.current = null;
  }, []);

  const clearEmailVerification = useCallback(() => {
    verificationRequestSeqRef.current += 1;
    setVerificationRequest(null);
    setVerificationCode('');
    setVerificationAuth(null);
    setVerificationError('');
    setVerificationNotice('');
    setVerificationLoading(false);
  }, []);

  const setPacienteRut = useCallback(
    (value) => {
      const changed = canonicalRutKey(rutRef.current) !== canonicalRutKey(value);
      rutRef.current = value;
      setPacienteRutState(value);
      if (changed) {
        clearEmailVerification();
        resetRequestKey();
      }
    },
    [clearEmailVerification, resetRequestKey],
  );

  const setPacienteEmail = useCallback(
    (value) => {
      const changed = normalizeEmailClient(emailRef.current) !== normalizeEmailClient(value);
      emailRef.current = value;
      setPacienteEmailState(value);
      if (changed) {
        clearEmailVerification();
        resetRequestKey();
      }
    },
    [clearEmailVerification, resetRequestKey],
  );

  useEffect(() => {
    if (!verificationAuth?.expiraEn) return undefined;
    const remainingMs = new Date(verificationAuth.expiraEn).getTime() - Date.now();
    if (remainingMs <= 0) {
      setVerificationAuth(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setVerificationAuth(null), remainingMs);
    return () => window.clearTimeout(timer);
  }, [verificationAuth]);

  const hasValidEmailAuth = useMemo(() => {
    if (!verificationAuth?.token) return false;
    const sameRut = canonicalRutKey(pacienteRut) === verificationAuth.rut;
    const sameEmail = normalizeEmailClient(pacienteEmail) === verificationAuth.correo;
    return sameRut && sameEmail;
  }, [verificationAuth, pacienteRut, pacienteEmail]);

  useEffect(() => {
    if (catalogosLoading || catalogosError) return;
    const currentIds = new Set(medicos.map((doctor) => String(doctor.id)));
    currentIds.forEach((id) => knownDoctorIds.current.add(id));
    const isMissing = (id) =>
      id && knownDoctorIds.current.has(String(id)) && !currentIds.has(String(id));
    const missingFilter = isMissing(selectedMedico);
    const missingSlotDoctor = isMissing(selectedBloque?.medico_id);
    if (missingFilter) {
      setSelectedMedico('');
    }
    if (
      (missingSlotDoctor || (missingFilter && !selectedBloque?.medico_id)) &&
      !submittingReserva &&
      reservaResult?.type !== 'success'
    ) {
      setSelectedBloque(null);
      setReservaResult(null);
      setBookingStep('datos');
      patientRequestRef.current = null;
    }
  }, [
    catalogosLoading,
    catalogosError,
    medicos,
    selectedMedico,
    selectedBloque,
    submittingReserva,
    reservaResult,
  ]);

  const fetchDisponibilidad = useCallback(
    async ({ signal } = {}) => {
      const requestId = ++availabilityRequestRef.current;
      setLoadingDisp(true);
      setAvailabilityError('');
      try {
        const params = new URLSearchParams();
        if (selectedEsp) params.set('especialidad_id', selectedEsp);
        if (selectedMedico) params.set('medico_id', selectedMedico);
        if (selectedFecha) params.set('fecha', selectedFecha);
        const response = await requestApi(`/api/disponibilidad?${params.toString()}`, { signal });
        if (signal?.aborted || requestId !== availabilityRequestRef.current) return;
        setAvailabilityKey(currentAvailabilityKey);
        if (response.ok && response.data.ok) setDisponibilidad(response.data);
        else setAvailabilityError('No pudimos cargar los horarios. Intenta nuevamente.');
      } catch {
        if (!signal?.aborted && requestId === availabilityRequestRef.current) {
          setAvailabilityKey(currentAvailabilityKey);
          setAvailabilityError(
            'No pudimos cargar los horarios. Revisa tu conexión e intenta nuevamente.',
          );
        }
      } finally {
        if (requestId === availabilityRequestRef.current) setLoadingDisp(false);
      }
    },
    [selectedEsp, selectedMedico, selectedFecha, currentAvailabilityKey],
  );

  useEffect(() => {
    if (catalogosLoading || catalogosError) return;
    const currentIds = new Set(medicos.map((doctor) => String(doctor.id)));
    const removedDoctor =
      previousCatalogIds.current &&
      [...previousCatalogIds.current].some((id) => !currentIds.has(id));
    previousCatalogIds.current = currentIds;
    if (removedDoctor && !selectedMedico) fetchDisponibilidad();
  }, [catalogosLoading, catalogosError, medicos, selectedMedico, fetchDisponibilidad]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDisponibilidad({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchDisponibilidad]);

  const medicosFiltrados = useMemo(
    () =>
      selectedEsp
        ? medicos.filter((medico) => String(medico.especialidad_id) === String(selectedEsp))
        : medicos,
    [medicos, selectedEsp],
  );
  const rutCheck = pacienteRut ? validateRutClient(pacienteRut) : null;
  const reservationFieldErrors =
    reservaResult?.type === 'error' ? reservaResult.data.fields || {} : {};
  const groupedBlocks = useMemo(
    () =>
      (disponibilidad.bloques || []).reduce((groups, block) => {
        const key = `${block.medico_nombre} · ${Number(block.hora_inicio.slice(0, 2)) < 12 ? 'Mañana' : 'Tarde'}`;
        (groups[key] ||= []).push(block);
        return groups;
      }, {}),
    [disponibilidad.bloques],
  );

  async function requestBookingCode({ isResend = false } = {}) {
    const seq = ++verificationRequestSeqRef.current;
    setVerificationLoading(true);
    setVerificationError('');
    if (!isResend) setVerificationNotice('');
    try {
      const response = await requestApi('/api/reservas/verificacion-correo/solicitudes', {
        method: 'POST',
        body: {
          rut: pacienteRut,
          correo: pacienteEmail,
        },
      });
      if (seq !== verificationRequestSeqRef.current) return false;
      const data = response.data || {};
      if (response.ok && data.ok) {
        setVerificationRequest({
          solicitudId: data.solicitud_id,
          correo: data.correo || normalizeEmailClient(pacienteEmail),
          rut: data.rut || canonicalRutKey(pacienteRut),
          expiraEn: data.expira_en,
          reenvioDisponibleEn: data.reenvio_disponible_en,
        });
        setVerificationNotice(
          data.mensaje ||
            `Solicitamos el envío de un código de verificación a ${normalizeEmailClient(pacienteEmail)}.`,
        );
        if (!isResend) setVerificationCode('');
        setBookingStep('verificacion');
        return true;
      }
      if (response.status === 429) {
        if (data.fields?.reenvio_disponible_en) {
          setVerificationRequest((current) =>
            current
              ? { ...current, reenvioDisponibleEn: data.fields.reenvio_disponible_en }
              : current,
          );
        }
        setVerificationError(
          data.mensaje ||
            data.error ||
            'Espera unos segundos antes de solicitar otro código; el anterior sigue vigente.',
        );
        return false;
      }
      setVerificationError(
        data.fields?.rut ||
          data.fields?.correo ||
          data.mensaje ||
          data.error ||
          'No pudimos solicitar el código de verificación. Revisa tu RUT y correo.',
      );
      return false;
    } catch {
      if (seq === verificationRequestSeqRef.current) {
        setVerificationError(
          'No pudimos conectar con el sistema para enviar el código. Intenta nuevamente.',
        );
      }
      return false;
    } finally {
      if (seq === verificationRequestSeqRef.current) setVerificationLoading(false);
    }
  }

  async function verifyBookingEmailCode() {
    if (!verificationRequest?.solicitudId) {
      setVerificationError('Solicita primero un código de verificación.');
      return false;
    }
    const cleanCode = verificationCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setVerificationError('Ingresa el código de 6 dígitos enviado a tu correo.');
      return false;
    }
    const seq = ++verificationRequestSeqRef.current;
    setVerificationLoading(true);
    setVerificationError('');
    try {
      const response = await requestApi('/api/reservas/verificacion-correo/verificar', {
        method: 'POST',
        body: {
          solicitud_id: verificationRequest.solicitudId,
          codigo: cleanCode,
        },
      });
      if (seq !== verificationRequestSeqRef.current) return false;
      const data = response.data || {};
      if (response.ok && data.ok && data.autorizacion_reserva) {
        setVerificationAuth({
          token: data.autorizacion_reserva,
          expiraEn: data.expira_en,
          rut: data.rut || canonicalRutKey(pacienteRut),
          correo: data.correo || normalizeEmailClient(pacienteEmail),
        });
        setVerificationCode('');
        setVerificationNotice(
          'Correo verificado. Tu hora aún no está reservada: revisa tus datos y pulsa «Confirmar reserva» para finalizar.',
        );
        setBookingStep('revision');
        return true;
      }
      setVerificationError(
        data.mensaje ||
          data.error ||
          'El código ingresado no es válido o venció. Solicita uno nuevo e intenta nuevamente.',
      );
      return false;
    } catch {
      if (seq === verificationRequestSeqRef.current) {
        setVerificationError(
          'No pudimos validar el código. Revisa tu conexión e intenta nuevamente.',
        );
      }
      return false;
    } finally {
      if (seq === verificationRequestSeqRef.current) setVerificationLoading(false);
    }
  }

  function isEmailAuthStillValid() {
    return (
      hasValidEmailAuth &&
      Boolean(verificationAuth?.expiraEn) &&
      new Date(verificationAuth.expiraEn).getTime() > Date.now()
    );
  }

  async function handleReservarSubmit(event) {
    event.preventDefault();
    if (!selectedBloque) return;
    if (bookingStep === 'datos') {
      setFieldTouched({ rut: true });
      if (rutCheck && !rutCheck.valid) return;
      if (isEmailAuthStillValid()) {
        setBookingStep('revision');
        return;
      }
      await requestBookingCode();
      return;
    }
    if (bookingStep === 'verificacion') {
      await verifyBookingEmailCode();
      return;
    }
    if (!isEmailAuthStillValid()) {
      clearEmailVerification();
      setBookingStep('verificacion');
      setVerificationError(
        'La verificación de tu correo venció. Solicita un nuevo código para confirmar la reserva.',
      );
      return;
    }
    setSubmittingReserva(true);
    setReservaResult(null);
    try {
      const body = {
        agenda_id: selectedBloque.agenda_id,
        origen: 'WEB',
        paciente_rut: pacienteRut,
        paciente_nombre: pacienteNombre,
        paciente_email: pacienteEmail,
        paciente_telefono: pacienteTelefono,
        autorizacion_reserva: verificationAuth.token,
      };
      const response = await requestApi('/api/reservas', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKeyFor(patientRequestRef, body) },
        body,
      });
      const data = response.data;
      if (response.ok && data.ok) {
        setReservaResult({ type: 'success', data });
        resetRequestKey();
        clearEmailVerification();
        setBookingStep('confirmacion');
        fetchDisponibilidad();
      } else {
        if (response.status === 403 && data?.code === 'EMAIL_VERIFICATION_REQUIRED') {
          clearEmailVerification();
          resetRequestKey();
          setBookingStep('verificacion');
          setVerificationError(
            data.mensaje ||
              'La verificación de correo venció o ya fue usada. Solicita un nuevo código.',
          );
          return;
        }
        setReservaResult({
          type: 'error',
          status: response.status,
          data:
            response.status >= 500
              ? {
                  ...data,
                  mensaje:
                    'No pudimos completar la reserva. Tus datos siguen guardados; inténtalo nuevamente.',
                }
              : data,
        });
        if (response.status === 409) fetchDisponibilidad();
      }
    } catch {
      setReservaResult({
        type: 'error',
        data: {
          mensaje:
            'No pudimos conectar con el sistema. Tus datos siguen guardados; inténtalo nuevamente.',
        },
      });
    } finally {
      setSubmittingReserva(false);
    }
  }

  function changeFilter(setter, value, resetDoctor = false) {
    setter(value);
    if (resetDoctor) setSelectedMedico('');
    setSelectedBloque(null);
    setReservaResult(null);
    setBookingStep('datos');
    resetRequestKey();
  }

  const state = {
    catalogosLoading,
    catalogosError,
    today: localToday(),
    availabilityError,
    bookingStep,
    disponibilidad,
    fieldTouched,
    groupedBlocks,
    loadingDisp: loadingDisp || availabilityKey !== currentAvailabilityKey,
    medicosFiltrados,
    pacienteEmail,
    pacienteNombre,
    pacienteRut,
    pacienteTelefono,
    reservaResult,
    rutCheck,
    selectedBloque,
    selectedEsp,
    selectedFecha,
    selectedMedico,
    especialidades,
    submittingReserva,
    reservationFieldErrors,
    verificationRequest,
    verificationCode,
    verificationAuth,
    verificationLoading,
    verificationError,
    verificationNotice,
    hasValidEmailAuth,
  };
  const actions = {
    retryCatalogos,
    fetchDisponibilidad,
    handleReservarSubmit,
    requestBookingCode,
    verifyBookingEmailCode,
    clearEmailVerification,
    setVerificationCode,
    resetRequestKey,
    setBookingStep,
    setFieldTouched,
    setPacienteEmail,
    setPacienteNombre,
    setPacienteRut,
    setPacienteTelefono,
    setReservaResult,
    setSelectedBloque,
    setSelectedEsp: (value) => changeFilter(setSelectedEsp, value, true),
    setSelectedFecha: (value) => changeFilter(setSelectedFecha, value),
    setSelectedMedico: (value) => changeFilter(setSelectedMedico, value),
  };
  return { state, actions };
}
