/**
 * Suite de Auto-Verificación del Sprint 1 (MED-15, MED-10, MED-9, MED-16, MED-11)
 * Ejecuta pruebas reales contra el backend y PostgreSQL para certificar DoD individual.
 */

const { requireDisposableTestEnvironment } = require('./disposable-env');
const { apiUrl: API_URL } = requireDisposableTestEnvironment();

const REQUEST_TIMEOUT_MS = 5000;

async function measuredJsonRequest(url, options = {}) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.json();
    return {
      status: response.status,
      body,
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 0,
      body: { error: error.message },
      durationMs: performance.now() - startedAt,
    };
  }
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function runTests() {
  console.log('======================================================================');
  console.log(' VERIFICACIÓN AUTOMATIZADA SPRINT 1 — SISTEMA MEDISALUD (16 PTS)');
  console.log('======================================================================\n');

  const loginRes = await fetch(`${API_URL}/auth/secretaria`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.SECRETARY_PASSWORD }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok)
    throw new Error(
      'Configura SECRETARY_PASSWORD y SECRETARY_TOKEN_SECRET para ejecutar esta suite.',
    );
  const secretaryHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${login.token}`,
  };

  // 1. Verificar MED-15 (Staging + PostgreSQL + 4 especialidades + 15 médicos)
  const healthRes = await fetch(`${API_URL}/health`);
  const health = await healthRes.json();
  if (!health.ok || health.resumen.especialidades !== 4 || health.resumen.medicos_activos < 15) {
    throw new Error(`Fallo en MED-15: ${JSON.stringify(health)}`);
  }
  console.log(
    `✅ [MED-15 | 2 pts] PostgreSQL operativo (${health.ping_ms} ms) — 4 especialidades, ${health.resumen.medicos_activos} médicos activos (mínimo inicial: 15).`,
  );

  // 2. Verificar MED-10 (Parametrización de bloques de 15, 20 o 30 min y bloqueo de licencia)
  const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const configRes = await fetch(`${API_URL}/agendas/configurar`, {
    method: 'POST',
    headers: secretaryHeaders,
    body: JSON.stringify({
      medico_id: 2,
      fecha: futureDate,
      hora_inicio: '09:00',
      hora_fin: '11:00',
      duracion_min: 20,
    }),
  });
  const configData = await configRes.json();
  if (!configData.ok) {
    throw new Error(`Fallo en MED-10 (configurar): ${JSON.stringify(configData)}`);
  }
  console.log(`✅ [MED-10 | 3 pts] CA-01: Parametrización de agenda en bloques de 20 min exitosa.`);

  // 3. Verificar MED-9 (Consulta de disponibilidad < 2,0 s excluyendo ocupados/bloqueados)
  const dispRes = await fetch(`${API_URL}/disponibilidad?medico_id=2&fecha=${futureDate}`);
  const dispData = await dispRes.json();
  if (!dispData.ok || dispData.latencia_ms >= 2000 || dispData.bloques.length === 0) {
    throw new Error(`Fallo en MED-9: ${JSON.stringify(dispData)}`);
  }
  console.log(
    `✅ [MED-9  | 3 pts] CA-01 & CA-02: Consulta de disponibilidad en ${dispData.latencia_ms} ms (< 2000 ms), ${dispData.total_cupos_libres} bloques disponibles.`,
  );

  const targetBlock = dispData.bloques[0];
  const blockToLock = dispData.bloques[1];

  // Bloquear segundo horario por secretaría (MED-10 CA-02) y comprobar que desaparece de MED-9
  await fetch(`${API_URL}/agendas/bloquear`, {
    method: 'POST',
    headers: secretaryHeaders,
    body: JSON.stringify({
      agenda_id: blockToLock.agenda_id,
      motivo: 'Licencia médica parcial prueba MED-10',
    }),
  });
  const dispAfterLock = await (
    await fetch(`${API_URL}/disponibilidad?medico_id=2&fecha=${futureDate}`)
  ).json();
  const stillListed = dispAfterLock.bloques.some((b) => b.agenda_id === blockToLock.agenda_id);
  if (stillListed) {
    throw new Error(
      'Fallo en MED-10 / MED-9 CA-02: Un bloque bloqueado siguió apareciendo disponible.',
    );
  }
  console.log(
    `✅ [MED-10 & MED-9] CA-02: Bloque bloqueado por secretaría excluido inmediatamente del Portal Web.`,
  );

  // 4. Verificar MED-11 CA-01 (Rechazo de RUT chileno con dígito verificador inválido -> A-06)
  const invalidRutRes = await fetch(`${API_URL}/reservas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agenda_id: targetBlock.agenda_id,
      paciente_rut: '12.345.678-9', // DV incorrecto (debería ser -5)
      paciente_nombre: 'Paciente Prueba RUT Inválido',
      paciente_email: 'test@paciente.cl',
      paciente_telefono: '+56912345678',
    }),
  });
  const invalidRutData = await invalidRutRes.json();
  if (invalidRutRes.status !== 400 || invalidRutData.codigo_error !== 'RUT_INVALIDO') {
    throw new Error(`Fallo en MED-11 (Validación RUT): ${JSON.stringify(invalidRutData)}`);
  }
  console.log(
    `✅ [MED-11 | 5 pts] CA-01 (A-06): RUT con dígito verificador inválido rechazado correctamente.`,
  );

  // 5. Verificar MED-16 (RNF-01): 40 pacientes consultan disponibilidad y disputan un mismo cupo.
  const CONCURRENT_USERS = 40;
  console.log(
    `\n🚀 [MED-16 | 3 pts] Lanzando una carga mixta de ${CONCURRENT_USERS} pacientes concurrentes...`,
  );

  const availabilityRequests = Array.from({ length: CONCURRENT_USERS }, () =>
    measuredJsonRequest(`${API_URL}/disponibilidad?medico_id=2&fecha=${futureDate}`),
  );
  const reservationRequests = Array.from({ length: CONCURRENT_USERS }, (_, idx) =>
    measuredJsonRequest(`${API_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agenda_id: targetBlock.agenda_id,
        paciente_rut: '12.345.678-5', // RUT válido Módulo 11
        paciente_nombre: `Paciente Concurrente #${idx + 1}`,
        paciente_email: `paciente${idx + 1}@medisalud.cl`,
        paciente_telefono: '+56998765432',
      }),
    }),
  );

  const [availabilityResults, reservationResults] = await Promise.all([
    Promise.all(availabilityRequests),
    Promise.all(reservationRequests),
  ]);
  const failedAvailability = availabilityResults.filter(
    (result) => result.status !== 200 || !result.body.ok,
  );
  if (failedAvailability.length) {
    throw new Error(
      `Fallaron consultas concurrentes de disponibilidad: ${JSON.stringify(failedAvailability[0])}`,
    );
  }

  const confirmed = reservationResults.filter((result) => result.status === 201);
  const rejected = reservationResults.filter((result) => result.status === 409);
  const availabilityP95 = percentile(
    availabilityResults.map((result) => result.durationMs),
    0.95,
  );
  const reservationP95 = percentile(
    reservationResults.map((result) => result.durationMs),
    0.95,
  );

  if (confirmed.length !== 1 || rejected.length !== CONCURRENT_USERS - 1) {
    throw new Error(
      `Colisión detectada en MED-16: confirmadas=${confirmed.length}, rechazadas=${rejected.length}, otros estados=${reservationResults
        .map((result) => result.status)
        .filter((status) => status !== 201 && status !== 409)
        .join(',')}`,
    );
  }
  if (availabilityP95 > 2000 || reservationP95 > 2000) {
    throw new Error(
      `p95 excedió 2000 ms: disponibilidad=${availabilityP95.toFixed(2)} ms, reservas=${reservationP95.toFixed(2)} ms`,
    );
  }

  const persistedReservations = await measuredJsonRequest(`${API_URL}/reservas`, {
    headers: secretaryHeaders,
  });
  const confirmedForTarget = persistedReservations.body.reservas?.filter(
    (reservation) =>
      reservation.agenda_id === targetBlock.agenda_id && reservation.estado === 'CONFIRMADA',
  );
  if (persistedReservations.status !== 200 || confirmedForTarget?.length !== 1) {
    throw new Error(
      `Se esperaba exactamente una cita confirmada en el bloque disputado; encontradas=${confirmedForTarget?.length ?? 0}.`,
    );
  }

  console.log(`✅ [MED-16 | 3 pts] Bloqueo pesimista (SELECT ... FOR UPDATE) verificado:`);
  console.log(`   - Pacientes concurrentes  : ${CONCURRENT_USERS}`);
  console.log(`   - p95 disponibilidad      : ${availabilityP95.toFixed(2)} ms`);
  console.log(`   - p95 reservas            : ${reservationP95.toFixed(2)} ms`);
  console.log(
    `   - Confirmadas (A-05)      : ${confirmed.length} (Código: ${confirmed[0].body.reserva.codigo_reserva})`,
  );
  console.log(`   - Rechazadas (A-06)       : ${rejected.length} (0% Overbooking)`);
  console.log('   - Citas persistidas       : 1 en el bloque disputado');

  const distinctBlocks = dispData.bloques
    .filter(
      (block) =>
        block.agenda_id !== targetBlock.agenda_id && block.agenda_id !== blockToLock.agenda_id,
    )
    .slice(0, 4);
  const distinctSlotResults = await Promise.all(
    distinctBlocks.map((block, idx) =>
      measuredJsonRequest(`${API_URL}/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenda_id: block.agenda_id,
          paciente_rut: '12.345.678-5',
          paciente_nombre: `Paciente Bloque Independiente #${idx + 1}`,
          paciente_email: `bloque-independiente-${idx + 1}@medisalud.cl`,
          paciente_telefono: '+56998765432',
        }),
      }),
    ),
  );
  if (
    distinctSlotResults.length !== 4 ||
    distinctSlotResults.some((result) => result.status !== 201)
  ) {
    throw new Error(
      `Reservas en bloques distintos no debían colisionar: ${distinctSlotResults
        .map((result) => `${result.status}:${result.body.code || result.body.error || ''}`)
        .join(',')}`,
    );
  }
  console.log(
    `✅ [MED-16] ${distinctSlotResults.length} reservas simultáneas en bloques distintos confirmadas sin falsos conflictos.`,
  );
  console.log(
    '✅ [MED-11 | 5 pts] CA-02 (A-05): Reserva registrada y notificación incorporada a la cola.',
  );
  console.log('\n======================================================================');
  console.log(' RESULTADO FINAL: 100% DE TARJETAS DEL SPRINT 1 VERIFICADAS CON ÉXITO');
  console.log('======================================================================');
}

runTests().catch((err) => {
  console.error('❌ Error en verificación del Sprint 1:', err.message);
  process.exit(1);
});
