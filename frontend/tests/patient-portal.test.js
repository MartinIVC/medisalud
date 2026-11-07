import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const { default: usePatientPortal } = await import('../src/features/paciente/usePatientPortal.js');
const { default: useSecretaryPortal } =
  await import('../src/features/secretaria/useSecretaryPortal.js');
const { requestApi } = await import('../src/api/client.js');
const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('an older availability response cannot replace a newer filter result', async () => {
  const pending = [];
  globalThis.fetch = (url, options) =>
    new Promise((resolve) => pending.push({ url, options, resolve }));
  const { result } = renderHook(() => usePatientPortal({ medicos: [], especialidades: [] }));

  await waitFor(() => assert.equal(pending.length, 1));
  act(() => result.current.actions.setSelectedFecha('2027-01-15'));
  await waitFor(() => assert.equal(pending.length, 2));
  pending[1].resolve(jsonResponse({ ok: true, bloques: [], latencia_ms: 2 }));
  await waitFor(() => assert.equal(result.current.state.disponibilidad.latencia_ms, 2));
  pending[0].resolve(jsonResponse({ ok: true, bloques: [], latencia_ms: 1 }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.current.state.disponibilidad.latencia_ms, 2);
});

test('a retry after a network error reuses the same reservation idempotency key', async () => {
  const reservationHeaders = [];
  let reservationAttempts = 0;
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('/api/disponibilidad'))
      return jsonResponse({ ok: true, bloques: [], latencia_ms: 0 });
    if (url === '/api/reservas') {
      reservationHeaders.push(options.headers.get('Idempotency-Key'));
      reservationAttempts += 1;
      if (reservationAttempts === 1) throw new TypeError('connection reset');
      return jsonResponse({ ok: true, reserva: { codigo_reserva: 'MED-TEST-1' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const { result } = renderHook(() => usePatientPortal({ medicos: [], especialidades: [] }));
  await waitFor(() => assert.equal(result.current.state.loadingDisp, false));
  act(() => {
    result.current.actions.setSelectedBloque({ agenda_id: 42 });
    result.current.actions.setPacienteRut('12.345.678-5');
    result.current.actions.setPacienteNombre('Paciente de prueba');
    result.current.actions.setPacienteEmail('prueba@example.cl');
    result.current.actions.setPacienteTelefono('+56912345678');
    result.current.actions.setBookingStep('revision');
  });

  await act(async () => result.current.actions.handleReservarSubmit({ preventDefault() {} }));
  assert.equal(result.current.state.reservaResult.type, 'error');
  await act(async () => result.current.actions.handleReservarSubmit({ preventDefault() {} }));

  assert.equal(reservationAttempts, 2);
  assert.equal(reservationHeaders[0], reservationHeaders[1]);
  assert.equal(result.current.state.reservaResult.type, 'success');
});

test('an expired secretary session preserves the doctor draft for the next login', async () => {
  sessionStorage.clear();
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url === '/api/especialidades') return jsonResponse({ ok: true, especialidades: [] });
    if (url === '/api/medicos')
      return jsonResponse({
        ok: true,
        medicos: [{ id: 1, nombre: 'Médico de prueba', especialidad_id: 1 }],
      });
    if (url === '/api/auth/secretaria') return jsonResponse({ ok: true, token: 'temporary-token' });
    if (url.startsWith('/api/agendas')) return jsonResponse({ error: 'Sesión vencida' }, 401);
    throw new Error(`Unexpected request: ${url}`);
  };
  const { result } = renderHook(() =>
    useSecretaryPortal({ activeTab: 'secretaria', refreshAvailability: async () => {} }),
  );
  await waitFor(() => assert.equal(result.current.state.catalogosLoading, false));
  act(() => {
    result.current.actions.setSecretaryView('agenda');
    result.current.actions.setPendingMedicoDraft({
      nombre: 'Dra. Borrador',
      email: 'borrador@example.cl',
    });
    result.current.actions.setSecretaryPassword('clave');
  });
  await act(async () => result.current.actions.loginSecretary({ preventDefault() {} }));
  await waitFor(() =>
    assert.ok(
      requests.some((url) => url.startsWith('/api/agendas')),
      requests.join(', '),
    ),
  );
  await waitFor(() =>
    assert.equal(
      result.current.state.secretaryError,
      'Tu sesión terminó. Inicia sesión nuevamente para continuar.',
    ),
  );

  assert.equal(result.current.state.secretaryToken, '');
  assert.equal(result.current.state.secretaryView, 'agenda');
  assert.deepEqual(result.current.state.pendingMedicoDraft, {
    nombre: 'Dra. Borrador',
    email: 'borrador@example.cl',
  });
  assert.equal(sessionStorage.getItem('medisalud-secretaria-token'), null);
});

test('secretary login sends the individual username and logout revokes the session', async () => {
  sessionStorage.clear();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/especialidades') return jsonResponse({ ok: true, especialidades: [] });
    if (url === '/api/medicos') return jsonResponse({ ok: true, medicos: [] });
    calls.push({ url, options });
    if (url === '/api/auth/secretaria') return jsonResponse({ ok: true, token: 'sesion-ficticia' });
    if (url === '/api/auth/secretaria/logout') return jsonResponse({ ok: true });
    throw new Error(`Solicitud inesperada: ${url}`);
  };
  const { result } = renderHook(() =>
    useSecretaryPortal({ activeTab: 'paciente', refreshAvailability: async () => {} }),
  );
  await waitFor(() => assert.equal(result.current.state.catalogosLoading, false));
  act(() => {
    result.current.actions.setSecretaryUsername('secretaria.demo');
    result.current.actions.setSecretaryPassword('Clave ficticia 2026');
  });
  await act(async () => result.current.actions.loginSecretary({ preventDefault() {} }));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    username: 'secretaria.demo',
    password: 'Clave ficticia 2026',
  });
  assert.equal(result.current.state.secretaryPassword, '');
  assert.equal(sessionStorage.getItem('medisalud-secretaria-token'), 'sesion-ficticia');
  await act(async () => result.current.actions.logoutSecretary());
  assert.equal(calls[1].options.headers.get('Authorization'), 'Bearer sesion-ficticia');
  assert.equal(result.current.state.secretaryToken, '');
  assert.equal(sessionStorage.getItem('medisalud-secretaria-token'), null);
});

test('logout immediately closes local access and warns if server revocation fails', async () => {
  sessionStorage.setItem('medisalud-secretaria-token', 'sesion-ficticia');
  let rejectLogout;
  globalThis.fetch = async (url) => {
    if (url === '/api/especialidades') return jsonResponse({ ok: true, especialidades: [] });
    if (url === '/api/medicos') return jsonResponse({ ok: true, medicos: [] });
    if (url === '/api/auth/secretaria/logout') {
      return new Promise((_resolve, reject) => {
        rejectLogout = reject;
      });
    }
    throw new Error(`Solicitud inesperada: ${url}`);
  };
  const { result } = renderHook(() =>
    useSecretaryPortal({ activeTab: 'paciente', refreshAvailability: async () => {} }),
  );
  await waitFor(() => assert.equal(result.current.state.catalogosLoading, false));
  let logoutPromise;
  act(() => {
    logoutPromise = result.current.actions.logoutSecretary();
  });
  assert.equal(result.current.state.secretaryToken, '');
  assert.equal(sessionStorage.getItem('medisalud-secretaria-token'), null);
  await act(async () => {
    rejectLogout(new Error('Sin conexión'));
    await logoutPromise;
  });
  assert.match(result.current.state.secretaryLogoutError, /no pudimos confirmar su cierre/);
  sessionStorage.clear();
});

test('a late unauthorized response from an old session cannot close the new session', async () => {
  sessionStorage.setItem('medisalud-secretaria-token', 'sesion-anterior');
  let finishPreviousRequest;
  globalThis.fetch = async (url) => {
    if (url === '/api/especialidades') return jsonResponse({ ok: true, especialidades: [] });
    if (url === '/api/medicos') return jsonResponse({ ok: true, medicos: [] });
    if (url === '/api/auth/secretaria/logout') return jsonResponse({ ok: true });
    if (url === '/api/auth/secretaria') return jsonResponse({ ok: true, token: 'sesion-nueva' });
    if (url === '/api/pendiente') {
      return new Promise((resolve) => {
        finishPreviousRequest = resolve;
      });
    }
    throw new Error(`Solicitud inesperada: ${url}`);
  };
  const { result } = renderHook(() =>
    useSecretaryPortal({ activeTab: 'paciente', refreshAvailability: async () => {} }),
  );
  await waitFor(() => assert.equal(result.current.state.catalogosLoading, false));
  const oldDoctorExpiration = result.current.actions.handleDoctorSessionExpired;
  const previousRequest = requestApi('/api/pendiente', {
    token: 'sesion-anterior',
    onUnauthorized: result.current.actions.handleSecretaryUnauthorized,
  });
  await act(async () => result.current.actions.logoutSecretary());
  await act(async () => result.current.actions.loginSecretary({ preventDefault() {} }));
  await act(async () => {
    finishPreviousRequest(jsonResponse({ error: 'Sesión vencida' }, 401));
    await previousRequest;
    oldDoctorExpiration({ nombre: 'Borrador anterior' });
  });
  assert.equal(result.current.state.secretaryToken, 'sesion-nueva');
  assert.equal(sessionStorage.getItem('medisalud-secretaria-token'), 'sesion-nueva');
  assert.equal(result.current.state.pendingMedicoDraft, null);
  sessionStorage.clear();
});

test('a reservation conflict refreshes availability and preserves patient data for another slot', async () => {
  let availabilityCalls = 0;
  const keys = [];
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('/api/disponibilidad')) {
      availabilityCalls += 1;
      return jsonResponse({
        ok: true,
        bloques:
          availabilityCalls === 1
            ? [{ agenda_id: 1, medico_nombre: 'Dra. Prueba', hora_inicio: '09:00' }]
            : [],
      });
    }
    if (url === '/api/reservas') {
      keys.push(options.headers.get('Idempotency-Key'));
      return keys.length === 1
        ? jsonResponse({ mensaje: 'El horario ya fue reservado.' }, 409)
        : jsonResponse({ ok: true, reserva: { codigo_reserva: 'MED-RETRY' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const { result } = renderHook(() => usePatientPortal({ medicos: [], especialidades: [] }));
  await waitFor(() => assert.equal(result.current.state.loadingDisp, false));
  act(() => {
    result.current.actions.setSelectedBloque({ agenda_id: 1 });
    result.current.actions.setPacienteRut('12.345.678-5');
    result.current.actions.setPacienteNombre('Paciente conservado');
    result.current.actions.setPacienteEmail('paciente@example.cl');
    result.current.actions.setPacienteTelefono('+56912345678');
    result.current.actions.setBookingStep('revision');
  });
  await act(async () => result.current.actions.handleReservarSubmit({ preventDefault() {} }));
  await waitFor(() => assert.equal(availabilityCalls, 2));
  assert.equal(result.current.state.reservaResult.status, 409);
  assert.equal(result.current.state.pacienteNombre, 'Paciente conservado');
  assert.equal(result.current.state.pacienteRut, '12.345.678-5');
  assert.equal(result.current.state.pacienteEmail, 'paciente@example.cl');
  assert.equal(result.current.state.pacienteTelefono, '+56912345678');
  act(() => {
    result.current.actions.setSelectedBloque({ agenda_id: 2 });
    result.current.actions.setReservaResult(null);
  });
  await act(async () => result.current.actions.handleReservarSubmit({ preventDefault() {} }));
  assert.equal(result.current.state.reservaResult.type, 'success');
  assert.notEqual(keys[0], keys[1]);
});

test('changing a filter invalidates the selected time without clearing patient data', async () => {
  globalThis.fetch = async () => jsonResponse({ ok: true, bloques: [] });
  const { result } = renderHook(() => usePatientPortal({ medicos: [], especialidades: [] }));
  await waitFor(() => assert.equal(result.current.state.loadingDisp, false));
  act(() => {
    result.current.actions.setSelectedMedico('2');
    result.current.actions.setSelectedBloque({ agenda_id: 8 });
    result.current.actions.setPacienteNombre('Paciente');
  });
  act(() => result.current.actions.setSelectedEsp('3'));
  assert.equal(result.current.state.selectedBloque, null);
  assert.equal(result.current.state.selectedMedico, '');
  assert.equal(result.current.state.pacienteNombre, 'Paciente');
});

test('catalog failure is distinguishable from an empty catalog and can be retried', async () => {
  sessionStorage.clear();
  let fail = true;
  let refreshes = 0;
  globalThis.fetch = async (url) => {
    if (fail) throw new TypeError('offline');
    return url === '/api/especialidades'
      ? jsonResponse({ ok: true, especialidades: [{ id: 1, nombre: 'Medicina General' }] })
      : jsonResponse({ ok: true, medicos: [{ id: 1, especialidad_id: 1, nombre: 'Dra. Prueba' }] });
  };
  const { result } = renderHook(() =>
    useSecretaryPortal({
      activeTab: 'paciente',
      refreshAvailability: async () => {
        refreshes += 1;
      },
    }),
  );
  assert.equal(result.current.state.catalogosLoading, true);
  await waitFor(() => assert.equal(result.current.state.catalogosLoading, false));
  assert.match(result.current.state.catalogosError, /conexión/);
  assert.deepEqual(result.current.state.especialidades, []);
  fail = false;
  await act(async () => result.current.actions.refreshDoctorCatalogs());
  assert.equal(result.current.state.catalogosError, '');
  assert.equal(result.current.state.especialidades[0].nombre, 'Medicina General');
  assert.equal(result.current.state.medicos[0].nombre, 'Dra. Prueba');
  assert.equal(refreshes, 1);
});

test('a transient concurrency conflict can be retried with the same idempotency key', async () => {
  const keys = [];
  const slot = { agenda_id: 7, medico_nombre: 'Dra. Prueba', hora_inicio: '09:00' };
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('/api/disponibilidad')) return jsonResponse({ ok: true, bloques: [slot] });
    if (url === '/api/reservas') {
      keys.push(options.headers.get('Idempotency-Key'));
      return keys.length === 1
        ? jsonResponse({ code: 'CONCURRENT_RESERVATION', mensaje: 'Intenta nuevamente.' }, 409)
        : jsonResponse({ ok: true, reserva: { codigo_reserva: 'MED-TRANSIENT' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const { result } = renderHook(() => usePatientPortal({ medicos: [], especialidades: [] }));
  await waitFor(() => assert.equal(result.current.state.loadingDisp, false));
  act(() => {
    result.current.actions.setSelectedBloque(slot);
    result.current.actions.setPacienteRut('12.345.678-5');
    result.current.actions.setPacienteNombre('Paciente');
    result.current.actions.setPacienteEmail('paciente@example.cl');
    result.current.actions.setPacienteTelefono('+56912345678');
    result.current.actions.setBookingStep('revision');
  });
  await act(async () => result.current.actions.handleReservarSubmit({ preventDefault() {} }));
  assert.equal(result.current.state.reservaResult.data.code, 'CONCURRENT_RESERVATION');
  await waitFor(() => assert.equal(result.current.state.loadingDisp, false));
  assert.equal(result.current.state.disponibilidad.bloques[0].agenda_id, 7);
  await act(async () => result.current.actions.handleReservarSubmit({ preventDefault() {} }));
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(result.current.state.reservaResult.type, 'success');
});
