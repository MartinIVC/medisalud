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

function SecretaryHarness({ agendas = [], secFecha = '2027-01-15', todayStr = '2027-01-15' }) {
  const [doctorId, setDoctorId] = useState('1');
  const [view, setView] = useState('agenda');
  const state = {
    secretaryView: view,
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
    secFecha,
    todayStr,
    secAgendas: agendas,
    secMotivoBloqueo: 'Motivo de prueba',
    secHoraInicio: '09:00',
    secHoraFin: '13:00',
    secDuracion: '30',
    receptionData: { nombre: '', rut: '', email: '', telefono: '+569' },
  };
  return React.createElement(SecretaryPortal, {
    state,
    actions: {
      setSecretaryView: setView,
      setSecMedicoId: setDoctorId,
      setSecFecha() {},
      setSecFeedback() {},
      setPendingMedicoDraft() {},
      fetchSecAgendas() {},
    },
  });
}

test('el registro se abre desde Profesionales y vuelve al listado al cancelar', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, medicos: [] }));
  try {
    const screen = render(React.createElement(SecretaryHarness));
    assert.equal(screen.queryByRole('button', { name: 'Registrar médico' }), null);
    fireEvent.click(screen.getByRole('button', { name: 'Profesionales' }));
    await screen.findByRole('button', { name: 'Registrar médico' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar médico' }));
    assert.ok(screen.getByRole('heading', { name: 'Registrar médico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    assert.ok(screen.getByRole('heading', { name: 'Profesionales' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar médico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver a profesionales' }));
    assert.ok(screen.getByRole('heading', { name: 'Profesionales' }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('al gestionar citas desde Profesionales se limpian los filtros anteriores de la agenda', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        medicos: [
          {
            id: 1,
            nombre: 'Dra. Prueba',
            rut: 'RUT ficticio',
            especialidad_nombre: 'General',
            activo: true,
            citas_futuras: 1,
            proxima_cita_fecha: '2027-01-15',
          },
        ],
      }),
    );
  try {
    const screen = render(React.createElement(SecretaryHarness));
    fireEvent.click(screen.getByRole('button', { name: /Disponibles/ }));
    fireEvent.change(screen.getByLabelText('Buscar en la agenda'), {
      target: { value: 'otro paciente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Profesionales' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Gestionar citas en agenda' }));
    assert.equal(screen.getByLabelText('Buscar en la agenda').value, '');
    assert.equal(
      screen.getByRole('button', { name: /Todos/ }).getAttribute('aria-pressed'),
      'true',
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

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

test('secretary actions expand beside the selected schedule and follow its status', () => {
  const agendas = [
    {
      agenda_id: 1,
      hora_inicio: '09:00',
      hora_fin: '09:30',
      estado: 'DISPONIBLE',
      duracion_min: 30,
      box_atencion: 'Box 1',
      futuro: true,
    },
    {
      agenda_id: 2,
      hora_inicio: '09:30',
      hora_fin: '10:00',
      estado: 'RESERVADO',
      paciente_nombre: 'Paciente ficticio',
      paciente_rut: 'RUT ficticio',
      codigo_reserva: 'DEMO',
      futuro: true,
      cita_id: 2,
    },
    {
      agenda_id: 3,
      hora_inicio: '10:00',
      hora_fin: '10:30',
      estado: 'BLOQUEADO',
      duracion_min: 30,
      box_atencion: 'Box 1',
      futuro: true,
    },
    {
      agenda_id: 4,
      hora_inicio: '11:00',
      hora_fin: '11:30',
      estado: 'RESERVADO',
      paciente_nombre: 'Paciente ficticio',
      futuro: false,
      cita_id: 4,
    },
    {
      agenda_id: 5,
      hora_inicio: '11:30',
      hora_fin: '12:00',
      estado: 'RESERVADO',
      paciente_nombre: 'Paciente ficticio',
      futuro: true,
    },
    {
      agenda_id: 6,
      hora_inicio: '08:00',
      hora_fin: '08:30',
      estado: 'DISPONIBLE',
      duracion_min: 30,
      box_atencion: 'Box 1',
      futuro: false,
    },
    {
      agenda_id: 7,
      hora_inicio: '08:30',
      hora_fin: '09:00',
      estado: 'BLOQUEADO',
      duracion_min: 30,
      box_atencion: 'Box 1',
      futuro: false,
    },
  ];
  const screen = render(React.createElement(SecretaryHarness, { agendas }));
  const rows = [...screen.container.querySelectorAll('.agenda-row')];
  assert.equal(screen.queryByLabelText('Acciones del horario seleccionado'), null);
  fireEvent.click(rows[0]);
  let panel = screen.getByLabelText('Acciones del horario seleccionado');
  assert.equal(rows[0].getAttribute('aria-expanded'), 'true');
  assert.equal(rows[0].nextElementSibling, panel);
  assert.equal(panel.parentElement, rows[0].parentElement);
  assert.ok(panel.parentElement.classList.contains('is-expanded'));
  assert.ok(screen.getByRole('button', { name: 'Registrar cita' }));
  assert.ok(screen.getByRole('button', { name: 'Bloquear horario' }));
  fireEvent.click(rows[1]);
  panel = screen.getByLabelText('Acciones del horario seleccionado');
  assert.equal(rows[1].nextElementSibling, panel);
  assert.ok(screen.getByRole('button', { name: 'Cambiar cita' }));
  assert.ok(screen.getByRole('button', { name: 'Cancelar cita' }));
  assert.equal(screen.queryByRole('button', { name: 'Registrar cita' }), null);
  fireEvent.click(rows[2]);
  assert.equal(
    rows[2].nextElementSibling,
    screen.getByLabelText('Acciones del horario seleccionado'),
  );
  assert.ok(screen.getByRole('button', { name: 'Desbloquear horario' }));
  fireEvent.click(rows[2]);
  assert.equal(screen.queryByLabelText('Acciones del horario seleccionado'), null);
  assert.equal(rows[2].getAttribute('aria-expanded'), 'false');
  fireEvent.click(rows[3]);
  panel = screen.getByLabelText('Acciones del horario seleccionado');
  assert.match(panel.textContent, /hora ya pasó/);
  assert.doesNotMatch(panel.textContent, /11:00|Paciente ficticio|Reservado/);
  fireEvent.click(rows[4]);
  assert.match(
    screen.getByLabelText('Acciones del horario seleccionado').textContent,
    /datos no están disponibles/,
  );
  fireEvent.click(rows[5]);
  panel = screen.getByLabelText('Acciones del horario seleccionado');
  assert.equal(screen.queryByRole('button', { name: 'Registrar cita' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Bloquear horario' }), null);
  assert.match(panel.textContent, /No se puede modificar ni reservar un horario cuya hora ya pasó/);
  fireEvent.click(rows[6]);
  panel = screen.getByLabelText('Acciones del horario seleccionado');
  assert.equal(screen.queryByRole('button', { name: 'Desbloquear horario' }), null);
  assert.match(panel.textContent, /No se puede modificar ni reservar un horario cuya hora ya pasó/);
});

for (const providerConfigured of [true, false]) {
  test(`appointment management reports a pending email when provider is ${providerConfigured ? 'configured' : 'missing'}`, async () => {
    const originalFetch = globalThis.fetch;
    const dialogPrototype = dom.window.HTMLDialogElement.prototype;
    const originalShowModal = dialogPrototype.showModal;
    const originalClose = dialogPrototype.close;
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    globalThis.fetch = async (url) => {
      if (url === '/api/reservas/42/gestionar') {
        return json({
          ok: true,
          correo_aviso: {
            estado: 'PENDIENTE',
            proveedor_configurado: providerConfigured,
          },
        });
      }
      throw new Error(`Solicitud inesperada: ${url}`);
    };
    dialogPrototype.showModal = function () {
      this.setAttribute('open', '');
    };
    dialogPrototype.close = function () {
      this.removeAttribute('open');
    };

    try {
      const screen = render(
        React.createElement(SecretaryHarness, {
          agendas: [
            {
              agenda_id: 42,
              cita_id: 42,
              hora_inicio: '09:00',
              hora_fin: '09:30',
              fecha: '2027-01-15',
              estado: 'RESERVADO',
              duracion_min: 30,
              box_atencion: 'Box 1',
              paciente_nombre: 'Paciente ficticio',
              codigo_reserva: 'MED-DEMO-42',
              medico_nombre: 'Dra. Prueba',
              medico_id: 1,
              futuro: true,
            },
          ],
        }),
      );
      fireEvent.click(screen.container.querySelector('.agenda-row'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
      fireEvent.change(screen.getByLabelText('Motivo del cambio'), {
        target: { value: 'Prueba de aceptación' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

      const expectedMessage = providerConfigured
        ? 'La cita fue cancelada. Se solicitó el envío del aviso por correo.'
        : 'La cita fue cancelada. El aviso por correo quedó pendiente: falta configurar SMTP o SendGrid.';
      await waitFor(() => assert.ok(screen.getByText(expectedMessage)));
      assert.doesNotMatch(screen.getByText(expectedMessage).textContent, /entregado|recibido/i);
    } finally {
      globalThis.fetch = originalFetch;
      dialogPrototype.showModal = originalShowModal;
      dialogPrototype.close = originalClose;
    }
  });
}

test('past dates disable day-level scheduling and blocking actions in read-only mode', () => {
  const screen = render(
    React.createElement(SecretaryHarness, {
      agendas: [],
      secFecha: '2027-01-14',
      todayStr: '2027-01-15',
    }),
  );
  const configureButtons = screen.getAllByRole('button', {
    name: 'Configurar horarios',
    exact: true,
  });
  assert.equal(configureButtons.length, 1);
  assert.equal(configureButtons[0].disabled, true);
  assert.equal(
    screen.getByRole('button', { name: 'Registrar ausencia o feriado', exact: true }).disabled,
    true,
  );
  assert.ok(screen.getByText('Fecha pasada en modo de consulta.'));
  assert.ok(screen.getByText('No se registraron horarios de atención para esta fecha.'));
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
    const dialogPrototype = dom.window.HTMLDialogElement.prototype;
    const originalShowModal = dialogPrototype.showModal;
    const originalDialogClose = dialogPrototype.close;
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
    dialogPrototype.showModal = function () {
      this.setAttribute('open', '');
      this.querySelector('button')?.focus();
    };
    dialogPrototype.close = function () {
      this.removeAttribute('open');
    };
    try {
      const { default: App } = await server.ssrLoadModule('/src/App.jsx');
      const screen = render(React.createElement(App));
      const slotButton = await screen.findByRole('button', {
        name: '09:00, Dra. Prueba, 30 minutos',
        exact: true,
      });
      assert.equal(screen.queryByRole('region', { name: 'Hora seleccionada' }), null);
      fireEvent.click(slotButton);
      assert.ok(screen.getByRole('dialog', { name: 'Completa tus datos' }));
      assert.equal(screen.queryByRole('region', { name: 'Hora seleccionada' }), null);
      fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '12.345.678-5' } });
      fireEvent.change(screen.getByLabelText('Nombre completo'), {
        target: { value: 'Paciente de prueba' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar diálogo', exact: true }));
      assert.equal(slotButton.getAttribute('aria-pressed'), 'true');
      assert.equal(document.activeElement, slotButton);
      const selection = screen.getByRole('region', { name: 'Hora seleccionada' });
      assert.ok(slotButton.closest('section').contains(selection));
      const resume = screen.getByRole('button', { name: 'Completar reserva', exact: true });
      fireEvent.click(resume);
      assert.ok(screen.getByRole('dialog', { name: 'Completa tus datos' }));
      assert.equal(screen.getByLabelText('RUT').value, '12.345.678-5');
      assert.equal(screen.getByLabelText('Nombre completo').value, 'Paciente de prueba');
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar diálogo', exact: true }));
      assert.equal(document.activeElement, resume);
      fireEvent.click(resume);
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
      dialogPrototype.showModal = originalShowModal;
      dialogPrototype.close = originalDialogClose;
      cleanup();
      sessionStorage.clear();
    }
  });
}

test('portals render doctor photos with zoom dialog and secretary photo upload controls', async () => {
  const { default: PatientPortal } = await server.ssrLoadModule(
    '/src/features/paciente/PatientPortal.jsx',
  );
  const prototype = dom.window.HTMLDialogElement.prototype;
  const originalShow = prototype.showModal;
  const originalClose = prototype.close;
  prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  prototype.close = function () {
    this.removeAttribute('open');
  };
  try {
    const slot = {
      agenda_id: 7,
      medico_nombre: 'Dra. Prueba',
      especialidad_nombre: 'General',
      box_atencion: 'Box 1',
      fecha: '2027-01-15',
      hora_inicio: '09:00',
      hora_fin: '09:30',
      duracion_min: 30,
      foto_url: '/api/medicos/1/foto?v=1',
    };
    const patientScreen = render(
      React.createElement(PatientPortal, {
        state: {
          selectedFecha: '2027-01-15',
          today: '2027-01-15',
          selectedEsp: '',
          selectedMedico: '1',
          selectedBloque: slot,
          especialidades: [{ id: 1, nombre: 'General' }],
          medicosFiltrados: [
            {
              id: 1,
              nombre: 'Dra. Prueba',
              especialidad_nombre: 'General',
              box_atencion: 'Box 1',
              foto_url: '/api/medicos/1/foto?v=1',
            },
          ],
          disponibilidad: { bloques: [slot] },
          groupedBlocks: { 'Dra. Prueba · Mañana': [slot] },
          fieldTouched: {},
          pacienteRut: '',
          pacienteNombre: '',
          pacienteEmail: '',
          pacienteTelefono: '+569',
          bookingStep: 'datos',
          reservationFieldErrors: {},
          reservaResult: null,
        },
        actions: {},
      }),
    );
    const zoomButtons = patientScreen.getAllByRole('button', {
      name: 'Ampliar foto de Dra. Prueba',
      exact: true,
    });
    assert.ok(zoomButtons.length >= 2);
    fireEvent.click(zoomButtons[0]);
    assert.ok(patientScreen.getByRole('dialog', { name: 'Foto ampliada de Dra. Prueba' }));
    cleanup();

    const secretaryScreen = render(React.createElement(SecretaryHarness));
    assert.ok(secretaryScreen.getByLabelText('Foto de Dra. Prueba'));
    assert.ok(secretaryScreen.getByText('Añadir foto'));
  } finally {
    prototype.showModal = originalShow;
    prototype.close = originalClose;
  }
});

test('desvinculación exige gestionar citas futuras y confirma con motivo cuando no existen', async () => {
  const { default: Profesionales } = await server.ssrLoadModule(
    '/src/features/secretaria/Profesionales.jsx',
  );
  const originalFetch = globalThis.fetch;
  const prototype = dom.window.HTMLDialogElement.prototype;
  const originalShow = prototype.showModal;
  const originalClose = prototype.close;
  prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  prototype.close = function () {
    this.removeAttribute('open');
  };
  const calls = [];
  const agendaSelections = [];
  const doctors = [
    {
      id: 1,
      nombre: 'Doctora de prueba',
      rut: 'RUT ficticio',
      especialidad_nombre: 'General',
      activo: true,
      citas_futuras: 2,
      proxima_cita_fecha: '2027-02-15',
      foto_url: '/api/medicos/1/foto?v=1',
    },
    {
      id: 2,
      nombre: 'Doctor de prueba',
      rut: 'RUT ficticio',
      especialidad_nombre: 'General',
      activo: true,
      citas_futuras: 0,
    },
    {
      id: 3,
      nombre: 'Profesional inactivo',
      rut: 'RUT ficticio',
      especialidad_nombre: 'General',
      activo: false,
      citas_futuras: 0,
    },
  ];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(url.endsWith('/desvincular') ? { ok: true } : { ok: true, medicos: doctors }),
      { status: 200 },
    );
  };
  try {
    const screen = render(
      React.createElement(Profesionales, {
        token: 'token',
        onUnauthorized() {},
        onRefresh: async () => {},
        onBack() {},
        onAgenda: (...args) => agendaSelections.push(args),
      }),
    );
    await screen.findByRole('heading', { name: 'Doctora de prueba', level: 2 });
    assert.equal(
      screen.getByAltText('Foto de Doctora de prueba').getAttribute('src'),
      '/api/medicos/1/foto?v=1',
    );
    assert.equal(
      screen.getByAltText('Foto de Profesional inactivo').getAttribute('src'),
      '/profesional-generico.svg',
    );
    assert.ok(screen.getByText(/Profesional inactivo/));
    fireEvent.click(screen.getAllByRole('button', { name: 'Desvincular' })[0]);
    assert.ok(screen.getByText(/Tiene 2 citas futuras confirmadas/));
    assert.equal(screen.queryByRole('button', { name: 'Confirmar desvinculación' }), null);
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la agenda' }));
    assert.deepEqual(agendaSelections, [[1, '2027-02-15']]);
    assert.equal(calls.filter((call) => call.url.endsWith('/desvincular')).length, 0);
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Desvincular' })[1]);
    fireEvent.change(screen.getByLabelText('Motivo de la desvinculación'), {
      target: { value: 'Fin de atención' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desvinculación' }));
    await screen.findByText(/quedó inactivo/);
    assert.deepEqual(
      JSON.parse(calls.find((call) => call.url.endsWith('/desvincular')).options.body),
      { motivo: 'Fin de atención' },
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    prototype.showModal = originalShow;
    prototype.close = originalClose;
  }
});

test('la foto de un profesional inactivo se solicita con la sesión y se libera al salir', async () => {
  const { default: Profesionales } = await server.ssrLoadModule(
    '/src/features/secretaria/Profesionales.jsx',
  );
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const calls = [];
  const revoked = [];
  URL.createObjectURL = () => 'blob:foto-privada';
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/foto')) return new Response('foto ficticia', { status: 200 });
    return new Response(
      JSON.stringify({
        ok: true,
        medicos: [
          {
            id: 3,
            nombre: 'Profesional inactivo',
            rut: 'RUT ficticio',
            especialidad_nombre: 'General',
            activo: false,
            foto_url: '/api/secretaria/medicos/3/foto?v=1',
          },
        ],
      }),
      { status: 200 },
    );
  };
  try {
    const screen = render(
      React.createElement(Profesionales, {
        token: 'token',
        onUnauthorized() {},
        onRefresh: async () => {},
        onBack() {},
        onAgenda() {},
      }),
    );
    await waitFor(() =>
      assert.equal(
        screen.getByAltText('Foto de Profesional inactivo').getAttribute('src'),
        'blob:foto-privada',
      ),
    );
    assert.equal(
      calls.find((call) => call.url.includes('/foto')).options.headers.Authorization,
      'Bearer token',
    );
    cleanup();
    assert.deepEqual(revoked, ['blob:foto-privada']);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test('el listado filtra por nombre, RUT, especialidad y estado', async () => {
  const { default: Profesionales } = await server.ssrLoadModule(
    '/src/features/secretaria/Profesionales.jsx',
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        medicos: [
          {
            id: 1,
            nombre: 'Dra. Álvarez',
            rut: '11.111.111-1',
            especialidad_nombre: 'Pediatría',
            activo: true,
            citas_futuras: 0,
          },
          {
            id: 2,
            nombre: 'Dr. Muñoz',
            rut: '22.222.222-2',
            especialidad_nombre: 'Medicina general',
            activo: false,
            citas_futuras: 0,
          },
        ],
      }),
    );
  try {
    const screen = render(
      React.createElement(Profesionales, {
        token: 'token',
        onUnauthorized() {},
        onRefresh() {},
        onCreate() {},
        onBack() {},
        onAgenda() {},
      }),
    );
    await screen.findByRole('heading', { name: 'Dra. Álvarez' });
    const search = screen.getByLabelText('Buscar profesional');
    const status = screen.getByLabelText('Estado');
    fireEvent.change(search, { target: { value: 'pediatria' } });
    assert.ok(screen.getByRole('heading', { name: 'Dra. Álvarez' }));
    assert.equal(screen.queryByRole('heading', { name: 'Dr. Muñoz' }), null);
    fireEvent.change(status, { target: { value: 'inactivos' } });
    assert.ok(screen.getByText('No hay profesionales para estos filtros'));
    fireEvent.change(search, { target: { value: '222222222' } });
    assert.ok(screen.getByRole('heading', { name: 'Dr. Muñoz' }));
    fireEvent.change(search, { target: { value: 'munoz' } });
    assert.ok(screen.getByRole('heading', { name: 'Dr. Muñoz' }));
    fireEvent.change(status, { target: { value: 'todos' } });
    fireEvent.change(search, { target: { value: '' } });
    assert.ok(screen.getByRole('heading', { name: 'Dra. Álvarez' }));
    assert.ok(screen.getByRole('heading', { name: 'Dr. Muñoz' }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('la agenda de un profesional inactivo se consulta en modo de solo lectura', async () => {
  const { default: Profesionales } = await server.ssrLoadModule(
    '/src/features/secretaria/Profesionales.jsx',
  );
  const originalFetch = globalThis.fetch;
  const prototype = dom.window.HTMLDialogElement.prototype;
  const originalShow = prototype.showModal;
  const originalClose = prototype.close;
  prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  prototype.close = function () {
    this.removeAttribute('open');
  };
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.startsWith('/api/agendas'))
      return new Response(
        JSON.stringify({
          ok: true,
          bloques: [
            {
              agenda_id: 9,
              hora_inicio: '09:00',
              hora_fin: '09:30',
              estado: 'RESERVADO',
              paciente_nombre: 'Paciente ficticio',
              codigo_reserva: 'DEMO-1',
            },
          ],
        }),
      );
    return new Response(
      JSON.stringify({
        ok: true,
        medicos: [
          {
            id: 3,
            nombre: 'Profesional inactivo',
            rut: 'RUT ficticio',
            especialidad_nombre: 'General',
            activo: false,
          },
        ],
      }),
    );
  };
  try {
    const screen = render(
      React.createElement(Profesionales, {
        token: 'token',
        onUnauthorized() {},
        onBack() {},
        onCreate() {},
        onAgenda() {},
        onRefresh() {},
      }),
    );
    await screen.findByRole('button', { name: 'Consultar agenda' });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar agenda' }));
    await screen.findByText('Paciente ficticio · DEMO-1');
    assert.ok(screen.getByText(/modo de solo lectura/));
    assert.equal(screen.queryByRole('button', { name: 'Desvincular' }), null);
    fireEvent.change(screen.getByLabelText('Fecha de la agenda'), {
      target: { value: '2025-01-12' },
    });
    await waitFor(() =>
      assert.ok(
        calls.some((url) => url.includes('medico_id=3') && url.includes('fecha=2025-01-12')),
      ),
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    prototype.showModal = originalShow;
    prototype.close = originalClose;
  }
});
