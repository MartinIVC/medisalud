import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { idempotencyKeyFor, requestApi } from '../../api/client.js';
import { validateRutClient } from '../../utils/rut.js';

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

export default function usePatientPortal({ medicos, especialidades }) {
  const [selectedEsp, setSelectedEsp] = useState('');
  const [selectedMedico, setSelectedMedico] = useState('');
  const [selectedFecha, setSelectedFecha] = useState(localToday);
  const [disponibilidad, setDisponibilidad] = useState({ bloques: [], latencia_ms: 0 });
  const [loadingDisp, setLoadingDisp] = useState(false);
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
        if (response.ok && response.data.ok) setDisponibilidad(response.data);
        else setAvailabilityError('No pudimos cargar los horarios. Intenta nuevamente.');
      } catch {
        if (!signal?.aborted && requestId === availabilityRequestRef.current) {
          setAvailabilityError(
            'No pudimos cargar los horarios. Revisa tu conexión e intenta nuevamente.',
          );
        }
      } finally {
        if (requestId === availabilityRequestRef.current) setLoadingDisp(false);
      }
    },
    [selectedEsp, selectedMedico, selectedFecha],
  );

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

  const state = {
    availabilityError,
    bookingStep,
    disponibilidad,
    fieldTouched,
    groupedBlocks,
    loadingDisp,
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
    setSelectedEsp,
    setSelectedFecha,
    setSelectedMedico,
  };
  return { state, actions };
}
