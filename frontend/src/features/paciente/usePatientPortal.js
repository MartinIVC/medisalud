import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { idempotencyKeyFor, requestApi } from '../../api/client.js';
import { validateRutClient } from '../../utils/rut.js';

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
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
  const [pacienteRut, setPacienteRut] = useState('');
  const [pacienteNombre, setPacienteNombre] = useState('');
  const [pacienteEmail, setPacienteEmail] = useState('');
  const [pacienteTelefono, setPacienteTelefono] = useState('+569');
  const [reservaResult, setReservaResult] = useState(null);
  const [submittingReserva, setSubmittingReserva] = useState(false);
  const [bookingStep, setBookingStep] = useState('datos');
  const [fieldTouched, setFieldTouched] = useState({});
  const availabilityRequestRef = useRef(0);
  const patientRequestRef = useRef(null);
  const knownDoctorIds = useRef(new Set());
  const previousCatalogIds = useRef(null);

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

  function resetRequestKey() {
    patientRequestRef.current = null;
  }

  async function handleReservarSubmit(event) {
    event.preventDefault();
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
      const body = {
        agenda_id: selectedBloque.agenda_id,
        origen: 'WEB',
        paciente_rut: pacienteRut,
        paciente_nombre: pacienteNombre,
        paciente_email: pacienteEmail,
        paciente_telefono: pacienteTelefono,
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
        setBookingStep('confirmacion');
        fetchDisponibilidad();
      } else {
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
  };
  const actions = {
    retryCatalogos,
    fetchDisponibilidad,
    handleReservarSubmit,
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
