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
const { default: useSecretaryPortal } = await import('../src/features/secretaria/useSecretaryPortal.js');
const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

test('an older availability response cannot replace a newer filter result', async () => {
  const pending = [];
  globalThis.fetch = (url, options) => new Promise((resolve) => pending.push({ url, options, resolve }));
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
    if (url.startsWith('/api/disponibilidad')) return jsonResponse({ ok: true, bloques: [], latencia_ms: 0 });
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
    if (url === '/api/medicos') return jsonResponse({ ok: true, medicos: [] });
    if (url === '/api/auth/secretaria') return jsonResponse({ ok: true, token: 'temporary-token' });
    if (url.startsWith('/api/agendas')) return jsonResponse({ error: 'Sesión vencida' }, 401);
    throw new Error(`Unexpected request: ${url}`);
  };
  const { result } = renderHook(() => useSecretaryPortal({ activeTab: 'secretaria', refreshAvailability: async () => {} }));
  await waitFor(() => assert.deepEqual(result.current.state.medicos, []));
  act(() => {
    result.current.actions.setSecretaryView('agenda');
    result.current.actions.setPendingMedicoDraft({ nombre: 'Dra. Borrador', email: 'borrador@example.cl' });
    result.current.actions.setSecretaryPassword('clave');
  });
  await act(async () => result.current.actions.loginSecretary({ preventDefault() {} }));
  await waitFor(() => assert.ok(requests.some((url) => url.startsWith('/api/agendas')), requests.join(', ')));
  await waitFor(() => assert.equal(result.current.state.secretaryError, 'Tu sesión terminó. Inicia sesión nuevamente para continuar.'));

  assert.equal(result.current.state.secretaryToken, '');
  assert.equal(result.current.state.secretaryView, 'agenda');
  assert.deepEqual(result.current.state.pendingMedicoDraft, { nombre: 'Dra. Borrador', email: 'borrador@example.cl' });
  assert.equal(sessionStorage.getItem('medisalud-secretaria-token'), null);
});
