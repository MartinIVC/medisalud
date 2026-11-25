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
globalThis.sessionStorage = dom.window.sessionStorage;
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
const { act, cleanup, fireEvent, render, waitFor } = await import('@testing-library/react');
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
const { default: MisCitas } = await server.ssrLoadModule('/src/features/paciente/MisCitas.jsx');
const { default: RecuperacionCitas } = await server.ssrLoadModule(
  '/src/features/secretaria/RecuperacionCitas.jsx',
);

after(async () => {
  cleanup();
  await server.close();
  dom.window.close();
});
afterEach(cleanup);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

test('Consultar mis citas solicita código con RUT y correo y muestra las citas verificadas', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method,
      body: options.body ? JSON.parse(options.body) : null,
    });
    if (url === '/api/reservas/mis-citas/solicitudes') {
      return json(
        {
          ok: true,
          solicitud_id: 'sol_consulta_123456789012345678',
          expira_en: new Date(Date.now() + 600_000).toISOString(),
          reenvio_disponible_en: new Date(Date.now() + 60_000).toISOString(),
          mensaje: 'Si los datos coinciden, recibirás un código para consultar tus citas.',
        },
        202,
      );
    }
    if (url === '/api/reservas/mis-citas/verificar') {
      return json({
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
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const screen = renderPatientPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));

    assert.ok(screen.getByRole('heading', { name: 'Consulta tus citas.' }));
    const rutInput = screen.getByLabelText('RUT del paciente');
    const emailInput = screen.getByLabelText('Correo electrónico');
    fireEvent.change(rutInput, { target: { value: '123456785' } });
    fireEvent.change(emailInput, { target: { value: 'ana.perez+citas@example.cl' } });
    assert.equal(rutInput.value, '12.345.678-5');

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));

    assert.ok(
      await screen.findByText(
        'Si los datos coinciden, recibirás un código para consultar tus citas.',
      ),
    );
    const codeInput = screen.getByLabelText('Código de consulta (6 dígitos)');
    fireEvent.change(codeInput, { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver mis citas' }));

    assert.ok(await screen.findByText('MED-2026-DEMO1'));
    assert.ok(screen.getByText('Dr. Alejandro Soto Rojas'));
    assert.ok(screen.getByText('Confirmada'));
    assert.ok(screen.getByText('MED-2026-DEMO2'));
    assert.ok(screen.getByText('Cancelada'));

    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, '/api/reservas/mis-citas/solicitudes');
    assert.deepEqual(requests[0].body, {
      rut: '12.345.678-5',
      correo: 'ana.perez+citas@example.cl',
    });
    assert.equal(requests[1].url, '/api/reservas/mis-citas/verificar');
    assert.deepEqual(requests[1].body, {
      solicitud_id: 'sol_consulta_123456789012345678',
      codigo: '482913',
    });

    // Salir de la pestaña descarta los resultados al volver
    fireEvent.click(screen.getByRole('button', { name: 'Reservar hora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));
    assert.equal(screen.queryByText('MED-2026-DEMO1'), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('Consultar mis citas muestra estado vacío tras verificar un vínculo sin citas', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === '/api/reservas/mis-citas/solicitudes') {
      return json(
        {
          ok: true,
          solicitud_id: 'sol_empty_12345678901234567890',
          expira_en: new Date(Date.now() + 600_000).toISOString(),
          reenvio_disponible_en: new Date(Date.now() + 60_000).toISOString(),
          mensaje: 'Si los datos coinciden, recibirás un código para consultar tus citas.',
        },
        202,
      );
    }
    if (url === '/api/reservas/mis-citas/verificar') {
      return json({
        ok: true,
        jira: 'MED-29',
        rut: '12.345.678-5',
        total: 0,
        citas: [],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const screen = renderPatientPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));
    fireEvent.change(screen.getByLabelText('RUT del paciente'), {
      target: { value: '12.345.678-5' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'vacio@example.cl' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    const codeInput = await screen.findByLabelText('Código de consulta (6 dígitos)');
    fireEvent.change(codeInput, { target: { value: '111222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver mis citas' }));

    assert.ok(await screen.findByText('No encontramos citas asociadas a este RUT y correo'));
    fireEvent.click(screen.getByRole('button', { name: 'Reservar una hora' }));
    assert.ok(screen.getByRole('heading', { name: /Tu próxima hora/i }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('Consultar mis citas valida RUT y correo inválidos sin llamar a la API', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('No debía llamar a la API con entradas inválidas');
  };

  try {
    const screen = renderPatientPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    assert.ok(screen.getByText('Ingresa tu RUT para consultar tus citas.'));
    assert.ok(screen.getByText('Ingresa un correo electrónico válido.'));
    assert.equal(fetchCalls, 0);

    fireEvent.change(screen.getByLabelText('RUT del paciente'), {
      target: { value: '12.345.678-9' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'sin-arroba' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    assert.ok(screen.getByText('El dígito verificador no coincide.'));
    assert.ok(screen.getByText('Ingresa un correo electrónico válido.'));
    assert.equal(fetchCalls, 0);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('MisCitas descarta el historial por inactividad e ignora respuestas tardías tras limpiar', async () => {
  const originalFetch = globalThis.fetch;
  let resolveVerify;
  globalThis.fetch = async (url) => {
    if (url === '/api/reservas/mis-citas/solicitudes') {
      return json(
        {
          ok: true,
          solicitud_id: 'sol_late_123456789012345678901',
          expira_en: new Date(Date.now() + 600_000).toISOString(),
          reenvio_disponible_en: new Date(Date.now() + 60_000).toISOString(),
          mensaje: 'Si los datos coinciden, recibirás un código para consultar tus citas.',
        },
        202,
      );
    }
    if (url === '/api/reservas/mis-citas/verificar') {
      return new Promise((resolve) => {
        resolveVerify = resolve;
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const screen = render(React.createElement(MisCitas, { inactivityTimeoutMs: 200 }));
    fireEvent.change(screen.getByLabelText('RUT del paciente'), {
      target: { value: '12.345.678-5' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'ana@example.cl' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    const codeInput = await screen.findByLabelText('Código de consulta (6 dígitos)');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver mis citas' }));

    await waitFor(() => assert.equal(typeof resolveVerify, 'function'));
    // Limpiar mientras la verificación está en vuelo -> respuesta tardía debe ignorarse
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    await act(async () => {
      resolveVerify(
        json({
          ok: true,
          rut: '12.345.678-5',
          total: 1,
          citas: [{ id: 9, codigo_reserva: 'MED-LATE', estado: 'CONFIRMADA' }],
        }),
      );
    });
    assert.equal(screen.queryByText('MED-LATE'), null);

    // Ahora probar expiración por inactividad con respuesta inmediata
    globalThis.fetch = async (url) => {
      if (url === '/api/reservas/mis-citas/solicitudes') {
        return json(
          {
            ok: true,
            solicitud_id: 'sol_exp_1234567890123456789012',
            expira_en: new Date(Date.now() + 600_000).toISOString(),
            reenvio_disponible_en: new Date(Date.now() + 60_000).toISOString(),
            mensaje: 'Si los datos coinciden, recibirás un código para consultar tus citas.',
          },
          202,
        );
      }
      return json({
        ok: true,
        rut: '12.345.678-5',
        total: 1,
        citas: [
          {
            id: 5,
            codigo_reserva: 'MED-EXP',
            fecha: '2027-01-20',
            hora_inicio: '09:00',
            hora_fin: '09:30',
            medico_nombre: 'Dra. Prueba',
            especialidad_nombre: 'General',
            box_atencion: 'Box 1',
            estado: 'CONFIRMADA',
          },
        ],
      });
    };
    fireEvent.change(screen.getByLabelText('RUT del paciente'), {
      target: { value: '12.345.678-5' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'ana@example.cl' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    const codeInput2 = await screen.findByLabelText('Código de consulta (6 dígitos)');
    fireEvent.change(codeInput2, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver mis citas' }));

    assert.ok(await screen.findByText('MED-EXP'));
    await waitFor(() => assert.equal(Boolean(screen.queryByText('MED-EXP')), false), {
      timeout: 1000,
    });
    assert.ok(screen.getByText(/se cerró automáticamente por inactividad/i));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('RecuperacionCitas permite a secretaría buscar, emitir y revocar solicitudes asistidas', async () => {
  const originalFetch = globalThis.fetch;
  let pendingList = [];
  globalThis.fetch = async (url) => {
    if (url === '/api/secretaria/recuperacion-citas/buscar') {
      return json({
        ok: true,
        rut: '12.345.678-5',
        citas: [
          {
            id: 15,
            codigo_reserva: 'MED-2026-OLD1',
            fecha: '2027-01-20',
            hora_inicio: '10:00',
            hora_fin: '10:30',
            medico_nombre: 'Dr. Soto',
            especialidad_nombre: 'General',
            box_atencion: 'Box 101',
            estado: 'CONFIRMADA',
            origen: 'PRESENCIAL',
            vinculada: false,
          },
        ],
        solicitudes_pendientes: pendingList,
      });
    }
    if (url === '/api/secretaria/recuperacion-citas/solicitudes') {
      pendingList = [
        {
          id: 'sol_rec_1234567890123456789012',
          correo_destino: 'nuevo@example.cl',
          citas_ids: [15],
          estado_envio: 'PENDIENTE',
          motivo: 'Validación presencial',
          secretaria_usuario: 'secretaria.demo',
        },
      ];
      return json(
        {
          ok: true,
          solicitud_id: 'sol_rec_1234567890123456789012',
          correo_destino: 'nuevo@example.cl',
          citas_ids: [15],
        },
        202,
      );
    }
    if (url.includes('/revocar')) {
      pendingList = [];
      return json({ ok: true, revocada: true });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const screen = render(
      React.createElement(RecuperacionCitas, { token: 'sec-token', onUnauthorized: () => {} }),
    );
    fireEvent.change(screen.getByLabelText('RUT del paciente'), {
      target: { value: '12.345.678-5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar citas del paciente' }));

    assert.ok(await screen.findByText('MED-2026-OLD1'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Correo de destino'), {
      target: { value: 'nuevo@example.cl' },
    });
    fireEvent.change(screen.getByLabelText('Motivo de la recuperación'), {
      target: { value: 'Validación presencial' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Enviar código de recuperación \(1 seleccionada\)/ }),
    );

    const revokeBtn = await screen.findByRole('button', { name: 'Revocar' });
    assert.ok(screen.getAllByText(/sol_rec_1234567890123456789012/).length >= 1);
    fireEvent.click(revokeBtn);
    assert.ok(await screen.findByText(/revocada correctamente/i));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('flujo end-to-end en StrictMode: reservar con OTP, confirmar reserva y luego consultar mis citas', async () => {
  const originalFetch = globalThis.fetch;
  const dialogPrototype = dom.window.HTMLDialogElement.prototype;
  const originalShowModal = dialogPrototype.showModal;
  const originalClose = dialogPrototype.close;
  dialogPrototype.showModal = function () {
    this.setAttribute('open', '');
  };
  dialogPrototype.close = function () {
    this.removeAttribute('open');
  };

  let createdBooking = null;
  let linkedPair = null;
  const slot = {
    agenda_id: 77,
    medico_nombre: 'Dr. Alejandro Soto Rojas',
    especialidad_nombre: 'Medicina General',
    box_atencion: 'Box 101',
    fecha: '2027-01-20',
    hora_inicio: '10:00',
    hora_fin: '10:30',
    duracion_min: 30,
  };

  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url === '/api/especialidades')
      return json({ ok: true, especialidades: [{ id: 1, nombre: 'Medicina General' }] });
    if (url === '/api/medicos')
      return json({
        ok: true,
        medicos: [
          { id: 1, nombre: slot.medico_nombre, especialidad_id: 1, box_atencion: 'Box 101' },
        ],
      });
    if (url.startsWith('/api/disponibilidad')) return json({ ok: true, bloques: [slot] });
    if (url === '/api/reservas/verificacion-correo/solicitudes') {
      return json(
        {
          ok: true,
          solicitud_id: 'sol_e2e_res_123456789012345678',
          rut: '12.345.678-5',
          correo: body.correo.trim().toLowerCase(),
          expira_en: new Date(Date.now() + 600_000).toISOString(),
          reenvio_disponible_en: new Date(Date.now() + 60_000).toISOString(),
        },
        202,
      );
    }
    if (url === '/api/reservas/verificacion-correo/verificar') {
      assert.equal(body.codigo, '123456');
      return json({
        ok: true,
        autorizacion_reserva: 'auth_e2e_12345678901234567890123456789012',
        expira_en: new Date(Date.now() + 600_000).toISOString(),
        rut: '12.345.678-5',
        correo: 'paciente.e2e+demo@example.cl',
      });
    }
    if (url === '/api/reservas') {
      assert.equal(body.autorizacion_reserva, 'auth_e2e_12345678901234567890123456789012');
      linkedPair = {
        rut: '12.345.678-5',
        correo: body.paciente_email.trim().toLowerCase(),
      };
      createdBooking = {
        id: 501,
        codigo_reserva: 'MED-2026-E2E1',
        ...slot,
        estado: 'CONFIRMADA',
        asistencia_estado: 'PENDIENTE',
      };
      return json({ ok: true, reserva: createdBooking }, 201);
    }
    if (url === '/api/reservas/mis-citas/solicitudes') {
      assert.equal(body.rut, linkedPair.rut);
      assert.equal(body.correo.trim().toLowerCase(), linkedPair.correo);
      return json(
        {
          ok: true,
          solicitud_id: 'sol_e2e_con_123456789012345678',
          expira_en: new Date(Date.now() + 600_000).toISOString(),
          reenvio_disponible_en: new Date(Date.now() + 60_000).toISOString(),
          mensaje: 'Si los datos coinciden, recibirás un código para consultar tus citas.',
        },
        202,
      );
    }
    if (url === '/api/reservas/mis-citas/verificar') {
      assert.equal(body.solicitud_id, 'sol_e2e_con_123456789012345678');
      assert.equal(body.codigo, '654321');
      return json({
        ok: true,
        rut: linkedPair.rut,
        total: 1,
        citas: [createdBooking],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx');
    const screen = render(React.createElement(React.StrictMode, null, React.createElement(App)));

    // 1. Elegir bloque y completar datos en el diálogo
    fireEvent.click(
      await screen.findByRole('button', { name: '10:00, Dr. Alejandro Soto Rojas, 30 minutos' }),
    );
    fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '123456785' } });
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Paciente E2E' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'Paciente.E2E+Demo@Example.CL' },
    });
    fireEvent.change(screen.getByLabelText('Teléfono móvil, ocho dígitos después de +56 9'), {
      target: { value: '12345678' },
    });

    // 2. Solicitar OTP y verificarlo
    fireEvent.click(screen.getByRole('button', { name: 'Verificar correo y continuar' }));
    const otpInput = await screen.findByLabelText('Código de verificación (6 dígitos)');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar código' }));

    // 3. Paso de revisión: avisa que aún no está reservada y al confirmar crea la cita
    assert.ok(await screen.findByText(/Tu hora aún no está reservada/i));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    assert.ok(await screen.findByRole('heading', { name: 'Comprobante de reserva' }));
    assert.ok(screen.getByText('MED-2026-E2E1'));

    // 4. Ir a "Consultar mis citas" con el mismo RUT y correo en minúsculas y ver la cita creada
    fireEvent.click(screen.getByRole('button', { name: 'Consultar mis citas' }));
    fireEvent.change(screen.getByLabelText('RUT del paciente'), {
      target: { value: '12.345.678-5' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'paciente.e2e+demo@example.cl' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    const lookupCode = await screen.findByLabelText('Código de consulta (6 dígitos)');
    fireEvent.change(lookupCode, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver mis citas' }));

    assert.ok(await screen.findByText('MED-2026-E2E1'));
    assert.ok(screen.getByText('Confirmada'));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    dialogPrototype.showModal = originalShowModal;
    dialogPrototype.close = originalClose;
  }
});
