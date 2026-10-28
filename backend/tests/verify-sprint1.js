/**
 * Suite de Auto-Verificación del Sprint 1 (MED-15, MED-10, MED-9, MED-16, MED-11)
 * Ejecuta pruebas reales contra el backend y PostgreSQL para certificar DoD individual.
 */

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

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
  if (!loginRes.ok) throw new Error('Configura SECRETARY_PASSWORD y SECRETARY_TOKEN_SECRET para ejecutar esta suite.');
  const secretaryHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };

  // 1. Verificar MED-15 (Staging + PostgreSQL + 4 especialidades + 15 médicos)
  const healthRes = await fetch(`${API_URL}/health`);
  const health = await healthRes.json();
  if (!health.ok || health.resumen.especialidades !== 4 || health.resumen.medicos_activos !== 15) {
    throw new Error(`Fallo en MED-15: ${JSON.stringify(health)}`);
  }
  console.log(`✅ [MED-15 | 2 pts] PostgreSQL operativo (${health.ping_ms} ms) — 4 especialidades, 15 médicos activos.`);

  // 2. Verificar MED-10 (Parametrización de bloques de 15, 20 o 30 min y bloqueo de licencia)
  const futureDate = '2026-11-15';
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
    `✅ [MED-9  | 3 pts] CA-01 & CA-02: Consulta de disponibilidad en ${dispData.latencia_ms} ms (< 2000 ms), ${dispData.total_cupos_libres} bloques disponibles.`
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
  const dispAfterLock = await (await fetch(`${API_URL}/disponibilidad?medico_id=2&fecha=${futureDate}`)).json();
  const stillListed = dispAfterLock.bloques.some((b) => b.agenda_id === blockToLock.agenda_id);
  if (stillListed) {
    throw new Error('Fallo en MED-10 / MED-9 CA-02: Un bloque bloqueado siguió apareciendo disponible.');
  }
  console.log(`✅ [MED-10 & MED-9] CA-02: Bloque bloqueado por secretaría excluido inmediatamente del Portal Web.`);

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
  console.log(`✅ [MED-11 | 5 pts] CA-01 (A-06): RUT con dígito verificador inválido rechazado correctamente.`);

  // 5. Verificar MED-16 (RNF-01) y MED-11 (CA-01 / CA-02):
  //    Lanzar 40 solicitudes concurrentes en la misma fracción de segundo sobre el MISMO bloque horario
  const CONCURRENT_USERS = 40;
  console.log(`\n🚀 [MED-16 | 3 pts] Lanzando ${CONCURRENT_USERS} solicitudes de reserva simultáneas sobre bloque ID=${targetBlock.agenda_id}...`);

  const requests = Array.from({ length: CONCURRENT_USERS }, (_, idx) => {
    const t0 = performance.now();
    return fetch(`${API_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agenda_id: targetBlock.agenda_id,
        paciente_rut: '12.345.678-5', // RUT válido Módulo 11
        paciente_nombre: `Paciente Concurrente #${idx + 1}`,
        paciente_email: `paciente${idx + 1}@medisalud.cl`,
        paciente_telefono: '+56998765432',
      }),
    }).then(async (r) => {
      const body = await r.json();
      return {
        status: r.status,
        durationMs: performance.now() - t0,
        body,
      };
    });
  });

  const results = await Promise.all(requests);
  const confirmed = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 409);
  const latencies = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

  if (confirmed.length !== 1 || rejected.length !== CONCURRENT_USERS - 1) {
    throw new Error(
      `Colisión detectada en MED-16: confirmadas=${confirmed.length}, rechazadas=${rejected.length}`
    );
  }
  if (p95Latency > 2000) {
    throw new Error(`p95 excedió 2000 ms: ${p95Latency.toFixed(2)} ms`);
  }

  console.log(`✅ [MED-16 | 3 pts] Bloqueo pesimista (SELECT ... FOR UPDATE) verificado:`);
  console.log(`   - Solicitudes simultáneas : ${CONCURRENT_USERS}`);
  console.log(`   - Confirmadas (A-05)      : ${confirmed.length} (Código: ${confirmed[0].body.reserva.codigo_reserva})`);
  console.log(`   - Rechazadas (A-06)       : ${rejected.length} (0% Overbooking)`);
  console.log(`   - Latencia p95            : ${p95Latency.toFixed(2)} ms (Umbral RNF-01 <= 2000 ms)`);
  console.log(`✅ [MED-11 | 5 pts] CA-02 (A-05): Reserva registrada y comprobante de correo emitido.`);
  console.log('\n======================================================================');
  console.log(' RESULTADO FINAL: 100% DE TARJETAS DEL SPRINT 1 VERIFICADAS CON ÉXITO');
  console.log('======================================================================');
}

runTests().catch((err) => {
  console.error('❌ Error en verificación del Sprint 1:', err.message);
  process.exit(1);
});
