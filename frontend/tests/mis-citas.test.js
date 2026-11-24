import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ isIntersecting: true, target }]);
  }
  unobserve() {}
  disconnect() {}
};

const { MotionGlobalConfig } = await import('motion/react');
MotionGlobalConfig.skipAnimations = true;
const { cleanup, fireEvent, render } = await import('@testing-library/react');
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});

const { default: PatientPortal } = await server.ssrLoadModule(
  '/src/features/paciente/PatientPortal.jsx',
);

after(async () => {
  cleanup();
  await server.close();
  dom.window.close();
});
afterEach(cleanup);

function renderPatientPortal() {
  const state = {
    disponibilidad: { bloques: [] },
    loadingDisp: false,
    availabilityError: '',
    selectedEsp: '',
    selectedMedico: '',
    selectedFecha: '2027-01-15',
    selectedBloque: null,
    especialidades: [{ id: 1, nombre: 'Medicina General' }],
    medicosFiltrados: [
      {
        id: 1,
        nombre: 'Dr. Alejandro Soto Rojas',
        especialidad_id: 1,
        especialidad_nombre: 'Medicina General',
        box_atencion: 'Box 101',
      },
    ],
    groupedBlocks: {},
    pacienteRut: '',
    pacienteNombre: '',
    pacienteEmail: '',
    pacienteTelefono: '+569',
    reservaResult: null,
    submittingReserva: false,
    bookingStep: 'datos',
    fieldTouched: {},
    rutCheck: null,
    reservationFieldErrors: {},
    catalogosLoading: false,
    catalogosError: '',
    today: '2027-01-15',
  };
  const noop = () => {};
  const actions = {
    setSelectedEsp: noop,
    setSelectedMedico: noop,
    setSelectedFecha: noop,
    setSelectedBloque: noop,
    setReservaResult: noop,
    setBookingStep: noop,
    setPacienteRut: noop,
    setPacienteNombre: noop,
    setPacienteEmail: noop,
    setPacienteTelefono: noop,
    setFieldTouched: noop,
    fetchDisponibilidad: noop,
    handleReservarSubmit: noop,
    resetRequestKey: noop,
    retryCatalogos: noop,
  };
  return render(React.createElement(PatientPortal, { state, actions }));
}

test('Consultar mis citas muestra las reservas de un RUT válido', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(url);
    return new Response(
      JSON.stringify({
        ok: true,
        jira: 'MED-29',
        rut: '12.345.678-5',
        total: 2,
        citas: [
          {
            id: 1,
            codigo_reserva: 'MED-2026-DEMO1',
            fecha: '2027-01-20',
            hora_inicio: '10:00',
            hora_fin: '10:30',
            medico_nombre: 'Dr. Alejandro Soto Rojas',
            especialidad_nombre: 'Medicina General',
            box_atencion: 'Box 101',
            estado: 'CONFIRMADA',
            asistencia_estado: 'PENDIENTE',
          },
          {
            id: 2,
            codigo_reserva: 'MED-2026-DEMO2',
            fecha: '2027-01-10',
            hora_inicio: '11:30',
            hora_fin: '12:00',
            medico_nombre: 'Dra. Patricia Morales Silva',
            especialidad_nombre: 'Pediatría',
            box_atencion: 'Box 201',
            estado: 'CANCELADA',
            asistencia_estado: 'CANCELADA',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const screen = renderPatientPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));

    assert.ok(screen.getByRole('heading', { name: 'Consulta tus citas.' }));
    const input = screen.getByLabelText('RUT del paciente');
    fireEvent.change(input, { target: { value: '123456785' } });
    assert.equal(input.value, '12.345.678-5');

    fireEvent.click(screen.getByRole('button', { name: 'Consultar citas' }));

    assert.ok(await screen.findByText('MED-2026-DEMO1'));
    assert.ok(screen.getByText('Dr. Alejandro Soto Rojas'));
    assert.ok(screen.getByText('Medicina General'));
    assert.ok(screen.getByText('Box 101'));
    assert.ok(screen.getByText('10:00–10:30'));
    assert.ok(screen.getByText('Confirmada'));
    assert.ok(screen.getByText('MED-2026-DEMO2'));
    assert.ok(screen.getByText('Dra. Patricia Morales Silva'));
    assert.ok(screen.getByText('Pediatría'));
    assert.ok(screen.getByText('Box 201'));
    assert.ok(screen.getByText('Cancelada'));
    assert.equal(requestedUrls.length, 1);
    assert.equal(requestedUrls[0], '/api/reservas/mis-citas?rut=12.345.678-5');
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('Consultar mis citas muestra un mensaje claro cuando un RUT válido no tiene reservas', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        jira: 'MED-29',
        rut: '12.345.678-5',
        total: 0,
        citas: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    const screen = renderPatientPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));
    fireEvent.change(screen.getByLabelText('RUT del paciente'), {
      target: { value: '12.345.678-5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar citas' }));

    assert.ok(await screen.findByText('No encontramos citas asociadas a este RUT'));
    fireEvent.click(screen.getByRole('button', { name: 'Reservar una hora' }));
    assert.ok(screen.getByRole('heading', { name: /Tu próxima hora/i }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('Consultar mis citas valida RUT inválido o vacío sin llamar a la API', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('No debía llamar a la API con un RUT inválido');
  };

  try {
    const screen = renderPatientPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));

    // Caso 1: RUT vacío
    fireEvent.click(screen.getByRole('button', { name: 'Consultar citas' }));
    assert.ok(screen.getByText('Ingresa tu RUT para consultar tus citas.'));
    assert.equal(fetchCalls, 0);

    // Caso 2: RUT con dígito verificador inválido
    const input = screen.getByLabelText('RUT del paciente');
    fireEvent.change(input, { target: { value: '12.345.678-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar citas' }));
    assert.ok(screen.getByText('El dígito verificador no coincide.'));
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(fetchCalls, 0);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
