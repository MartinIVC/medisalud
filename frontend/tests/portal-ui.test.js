import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { useState } from 'react';
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
const { act, cleanup, fireEvent, render, waitFor } = await import('@testing-library/react');
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { default: SecretaryPortal } = await server.ssrLoadModule(
  '/src/features/secretaria/SecretaryPortal.jsx',
);
after(async () => {
  cleanup();
  await server.close();
  dom.window.close();
});
afterEach(cleanup);

function SecretaryHarness() {
  const [doctorId, setDoctorId] = useState('1');
  const state = {
    secretaryView: 'agenda',
    secretaryToken: 'test',
    especialidades: [
      { id: 1, nombre: 'General' },
      { id: 2, nombre: 'Sin médicos' },
    ],
    medicos: [
      {
        id: 1,
        nombre: 'Dra. Prueba',
        especialidad_id: 1,
        especialidad_nombre: 'General',
        box_atencion: 'Box 1',
      },
    ],
    secMedicoId: doctorId,
    secFecha: '2027-01-15',
    todayStr: '2027-01-15',
    secAgendas: [],
    secMotivoBloqueo: 'Motivo de prueba',
    secHoraInicio: '09:00',
    secHoraFin: '13:00',
    secDuracion: '30',
    receptionData: { nombre: '', rut: '', email: '', telefono: '+569' },
  };
  return React.createElement(SecretaryPortal, {
    state,
    actions: { setSecMedicoId: setDoctorId, setSecFeedback() {} },
  });
}

test('returning from an empty specialty restores a usable doctor selection', () => {
  const screen = render(React.createElement(SecretaryHarness));
  const specialty = screen.getByLabelText('Especialidad');
  const doctor = screen.getByLabelText('Profesional');
  const configure = screen.getAllByRole('button', { name: 'Configurar horarios', exact: true })[0];
  fireEvent.change(specialty, { target: { value: '2' } });
  assert.equal(doctor.disabled, true);
  assert.equal(configure.disabled, true);
  fireEvent.change(specialty, { target: { value: '' } });
  assert.equal(doctor.value, '1');
  assert.equal(doctor.disabled, false);
  assert.equal(configure.disabled, false);
});

test('a dialog recovers focus when disabling submission moves it outside', async () => {
  const { Dialog } = await server.ssrLoadModule('/src/components/ui/index.jsx');
  const prototype = dom.window.HTMLDialogElement.prototype;
  const originalShow = prototype.showModal;
  const originalClose = prototype.close;
  prototype.showModal = function () {
    this.setAttribute('open', '');
    this.querySelector('button').focus();
  };
  prototype.close = function () {
    this.removeAttribute('open');
  };
  try {
    const properties = { open: true, title: 'Configurar horarios', onClose() {} };
    const screen = render(React.createElement(Dialog, { ...properties, busy: false }));
    document.activeElement.blur();
    assert.equal(document.activeElement, document.body);
    screen.rerender(React.createElement(Dialog, { ...properties, busy: true }));
    assert.equal(
      document.activeElement,
      screen.getByRole('heading', { name: 'Configurar horarios' }),
    );
    cleanup();
  } finally {
    prototype.showModal = originalShow;
    prototype.close = originalClose;
  }
});

test('patient UI permits retrying transient conflicts and requires another time for taken slots', async () => {
  const { default: PatientPortal } = await server.ssrLoadModule(
    '/src/features/paciente/PatientPortal.jsx',
  );
  const slot = {
    agenda_id: 7,
    medico_nombre: 'Dra. Prueba',
    fecha: '2027-01-15',
    hora_inicio: '09:00',
    hora_fin: '09:30',
    duracion_min: 30,
  };
  const state = {
    selectedFecha: '2027-01-15',
    today: '2027-01-15',
    selectedBloque: slot,
    especialidades: [{ id: 1, nombre: 'General' }],
    medicosFiltrados: [],
    disponibilidad: { bloques: [slot] },
    groupedBlocks: { 'Dra. Prueba · Mañana': [slot] },
    fieldTouched: {},
    pacienteRut: '12.345.678-5',
    pacienteNombre: 'Paciente',
    pacienteEmail: 'paciente@example.cl',
    pacienteTelefono: '+56912345678',
    bookingStep: 'revision',
    reservationFieldErrors: {},
    reservaResult: { type: 'error', status: 409, data: { code: 'CONCURRENT_RESERVATION' } },
  };
  const actions = {
    handleReservarSubmit(event) {
      event.preventDefault();
    },
  };
  const screen = render(React.createElement(PatientPortal, { state, actions }));
  assert.equal(
    screen.getByRole('button', { name: 'Reintentar reserva', exact: true }).disabled,
    false,
  );
  assert.equal(screen.queryByRole('button', { name: 'Elegir otra hora', exact: true }), null);
  screen.rerender(
    React.createElement(PatientPortal, {
      state: {
        ...state,
        reservaResult: {
          type: 'error',
          status: 409,
          data: { code: 'SLOT_TAKEN', mensaje: 'Horario ocupado.' },
        },
      },
      actions,
    }),
  );
  assert.equal(
    screen.getByRole('button', { name: 'Confirmar reserva', exact: true }).disabled,
    true,
  );
  assert.ok(screen.getByRole('button', { name: 'Elegir otra hora', exact: true }));
});

for (const outcome of ['success', 'error']) {
  test(`returning during a pending reservation preserves ${outcome} and the next action`, async () => {
    globalThis.sessionStorage = dom.window.sessionStorage;
    sessionStorage.clear();
    const originalFetch = globalThis.fetch;
    let finishReservation;
    const slot = {
      agenda_id: 7,
      medico_nombre: 'Dra. Prueba',
      fecha: '2027-01-15',
      hora_inicio: '09:00',
      hora_fin: '09:30',
      duracion_min: 30,
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    globalThis.fetch = async (url) => {
      if (url === '/api/especialidades')
        return json({ ok: true, especialidades: [{ id: 1, nombre: 'General' }] });
      if (url === '/api/medicos')
        return json({ ok: true, medicos: [{ id: 1, nombre: 'Dra. Prueba', especialidad_id: 1 }] });
      if (url.startsWith('/api/disponibilidad')) return json({ ok: true, bloques: [slot] });
      if (url === '/api/reservas')
        return new Promise((resolve) => {
          finishReservation = resolve;
        });
      throw new Error(`Unexpected request: ${url}`);
    };
    try {
      const { default: App } = await server.ssrLoadModule('/src/App.jsx');
      const screen = render(React.createElement(App));
      fireEvent.click(
        await screen.findByRole('button', { name: '09:00, Dra. Prueba, 30 minutos', exact: true }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Continuar', exact: true }));
      fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '12.345.678-5' } });
      fireEvent.change(screen.getByLabelText('Nombre completo'), {
        target: { value: 'Paciente de prueba' },
      });
      fireEvent.change(screen.getByLabelText('Correo electrónico'), {
        target: { value: 'paciente@example.cl' },
      });
      fireEvent.change(screen.getByLabelText('Teléfono móvil, ocho dígitos después de +56 9'), {
        target: { value: '12345678' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Revisar reserva', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva', exact: true }));
      await waitFor(() => assert.equal(typeof finishReservation, 'function'));
      fireEvent.click(screen.getByRole('button', { name: 'Secretaría', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Reserva tu hora', exact: true }));
      assert.equal(screen.getByRole('button', { name: 'Reservando…', exact: true }).disabled, true);
      assert.equal(screen.queryByLabelText('Fecha de atención'), null);
      await act(async () =>
        finishReservation(
          outcome === 'success'
            ? json({ ok: true, reserva: { ...slot, codigo_reserva: 'MED-PENDING' } })
            : json({ code: 'VALIDATION_ERROR', mensaje: 'Revisa los datos de la reserva.' }, 400),
        ),
      );
      if (outcome === 'success') {
        assert.ok(
          await screen.findByRole('heading', { name: 'Comprobante de reserva', exact: true }),
        );
        assert.ok(screen.getByText('MED-PENDING'));
      } else {
        assert.ok(await screen.findByText('Revisa los datos de la reserva.'));
        fireEvent.click(screen.getByRole('button', { name: 'Editar datos', exact: true }));
        assert.ok(screen.getByRole('heading', { name: 'Datos del paciente', exact: true }));
        assert.equal(screen.getByLabelText('RUT').readOnly, false);
        assert.equal(screen.getByLabelText('RUT').value, '12.345.678-5');
      }
      cleanup();
    } finally {
      globalThis.fetch = originalFetch;
      sessionStorage.clear();
    }
  });
}
