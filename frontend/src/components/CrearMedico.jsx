import React, { useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Mail,
  MapPin,
  Plus,
  ShieldCheck,
  Stethoscope,
  User,
} from 'lucide-react';
import { validateRutClient } from '../utils/rut';
import { requestApi } from '../api/client';

const emptyForm = { rut: '', nombre: '', email: '', especialidad_id: '', box_atencion: '' };
const rutShape = /^(?:\d+|\d{1,2}(?:\.\d{3})+)-?[0-9kK]$/;
const fieldLabels = {
  rut: 'RUT',
  nombre: 'Nombre completo',
  email: 'Correo electrónico',
  especialidad_id: 'Especialidad',
  box_atencion: 'Box de atención',
};

function getDoctorInitials(name = '') {
  const clean = name.replace(/^(dr\.?|dra\.?)\s+/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function validateForm(form) {
  const errors = {};
  const rut = form.rut.trim();
  if (!rut) errors.rut = 'Ingresa el RUT del médico.';
  else if (!rutShape.test(rut)) errors.rut = 'Usa un RUT chileno válido, sin texto adicional.';
  else {
    const result = validateRutClient(rut);
    if (!result.valid) errors.rut = result.message;
  }

  if (!form.nombre.trim()) errors.nombre = 'Ingresa el nombre completo.';
  else if (form.nombre.trim().length > 150) errors.nombre = 'Máximo 150 caracteres.';

  if (!form.email.trim()) errors.email = 'Ingresa el correo electrónico.';
  else if (form.email.trim().length > 150 || !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = 'Ingresa un correo válido de hasta 150 caracteres.';
  }

  if (!form.especialidad_id) errors.especialidad_id = 'Selecciona una especialidad.';
  if (!form.box_atencion.trim()) errors.box_atencion = 'Ingresa el box de atención.';
  else if (form.box_atencion.trim().length > 20) errors.box_atencion = 'Máximo 20 caracteres.';

  return errors;
}

export default function CrearMedico({
  secretaryToken,
  specialties,
  specialtiesLoading,
  specialtiesError,
  onRefreshCatalogs,
  onSessionExpired,
  initialDraft,
  onDraftChange,
  onClearDraft,
  onCancel,
  onContinueScheduling,
}) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...(initialDraft || {}) }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdDoctor, setCreatedDoctor] = useState(null);
  const [catalogRefreshFailed, setCatalogRefreshFailed] = useState(false);
  const refs = useRef({});

  const selectedSpecialtyName = useMemo(() => {
    const found = specialties.find((s) => String(s.id) === String(form.especialidad_id));
    return found?.nombre || 'Especialidad por asignar';
  }, [specialties, form.especialidad_id]);

  function updateField(field, value) {
    const next = { ...form, [field]: value };
    setForm(next);
    onDraftChange(next);
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    setFormError('');
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    const firstInvalid = Object.keys(fieldLabels).find((field) => validationErrors[field]);
    if (firstInvalid) {
      refs.current[firstInvalid]?.focus();
      return;
    }

    setSaving(true);
    try {
      const response = await requestApi('/api/medicos', {
        method: 'POST',
        token: secretaryToken,
        onUnauthorized: () => onSessionExpired(form),
        body: {
          rut: form.rut.trim(),
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          especialidad_id: Number(form.especialidad_id),
          box_atencion: form.box_atencion.trim(),
        },
      });
      const data = response.data;
      if (response.status === 401) {
        return;
      }
      if (!response.ok || !data.ok) {
        setErrors(data.fields || {});
        setFormError(
          data.error || 'No se pudo registrar al médico. Revisa los datos e inténtalo nuevamente.',
        );
        const firstServerError = Object.keys(fieldLabels).find((field) => data.fields?.[field]);
        if (firstServerError) refs.current[firstServerError]?.focus();
        return;
      }

      setCreatedDoctor(data.medico);
      setErrors({});
      onClearDraft();
      const refreshed = await onRefreshCatalogs();
      setCatalogRefreshFailed(!refreshed);
    } catch {
      setFormError(
        'No pudimos conectar con el sistema. Tus datos siguen en el formulario; inténtalo nuevamente.',
      );
    } finally {
      setSaving(false);
    }
  }

  function createAnother() {
    setCreatedDoctor(null);
    setCatalogRefreshFailed(false);
    setForm(emptyForm);
    setErrors({});
    setFormError('');
    onClearDraft();
    refs.current.rut?.focus();
  }

  const fieldClass = (field) =>
    `mt-1.5 min-h-12 w-full rounded-xl border bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:outline-none focus:ring-4 ${
      errors[field]
        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10'
        : 'border-slate-200 focus:border-teal-600 focus:ring-teal-600/10'
    }`;

  return (
    <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-teal-900/10 bg-white shadow-clinical-lg">
      <div className="bg-hero-mesh p-6 text-white sm:p-8">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Panel de secretaría · Registro Oficial
        </p>
        <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Crear médico
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-teal-100/85">
          El médico quedará activo y aparecerá en los catálogos. El registro no crea horarios
          automáticamente.
        </p>
      </div>

      <div className="p-6 sm:p-8">
        {createdDoctor ? (
          <div className="space-y-6">
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50/50 p-6 text-emerald-950 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-700">
                    Alta Clínica Completada
                  </span>
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Médico creado correctamente
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {createdDoctor.nombre} · <span className="font-mono">{createdDoctor.rut}</span>
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    Sin horarios configurados
                  </p>
                </div>
              </div>
            </div>

            {catalogRefreshFailed && (
              <div
                role="alert"
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
              >
                El registro se guardó, pero no pudimos actualizar los catálogos. Recárgalos antes de
                crear otro médico.
                <button
                  type="button"
                  onClick={async () => setCatalogRefreshFailed(!(await onRefreshCatalogs()))}
                  className="ml-2 min-h-11 font-semibold underline"
                >
                  Recargar catálogos
                </button>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={createAnother}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Crear otro médico
              </button>
              <button
                type="button"
                onClick={() => onContinueScheduling(createdDoctor.id)}
                className="min-h-11 rounded-xl bg-teal-800 px-5 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900"
              >
                Configurar horarios
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            {/* Columna Formulario */}
            <div className="lg:col-span-7">
              {specialtiesLoading ? (
                <p
                  role="status"
                  className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
                >
                  Cargando especialidades…
                </p>
              ) : specialtiesError ? (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
                >
                  <p>{specialtiesError}</p>
                  <button
                    type="button"
                    onClick={onRefreshCatalogs}
                    className="mt-2 min-h-11 font-semibold underline"
                  >
                    Reintentar
                  </button>
                </div>
              ) : specialties.length === 0 ? (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  <p>
                    No hay especialidades disponibles. Recarga el catálogo o consulta al responsable
                    del sistema.
                  </p>
                  <button
                    type="button"
                    onClick={onRefreshCatalogs}
                    className="mt-2 min-h-11 font-semibold underline"
                  >
                    Recargar catálogo
                  </button>
                </div>
              ) : null}

              {formError && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
                >
                  {formError}
                </p>
              )}

              <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="doctor-rut"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    RUT *
                  </label>
                  <div className="relative">
                    <ShieldCheck
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="doctor-rut"
                      ref={(node) => {
                        refs.current.rut = node;
                      }}
                      value={form.rut}
                      onChange={(event) => updateField('rut', event.target.value)}
                      autoComplete="off"
                      placeholder="12.345.678-5"
                      maxLength={15}
                      aria-invalid={Boolean(errors.rut)}
                      aria-describedby={errors.rut ? 'doctor-rut-error' : undefined}
                      className={`${fieldClass('rut')} font-mono`}
                    />
                  </div>
                  {errors.rut && (
                    <p id="doctor-rut-error" role="alert" className="mt-1 text-sm text-rose-800">
                      {errors.rut}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="doctor-name"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Nombre completo *
                  </label>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="doctor-name"
                      ref={(node) => {
                        refs.current.nombre = node;
                      }}
                      value={form.nombre}
                      onChange={(event) => updateField('nombre', event.target.value)}
                      autoComplete="name"
                      placeholder="Dra. Sofía Valdés"
                      maxLength={150}
                      aria-invalid={Boolean(errors.nombre)}
                      aria-describedby={errors.nombre ? 'doctor-name-error' : undefined}
                      className={fieldClass('nombre')}
                    />
                  </div>
                  {errors.nombre && (
                    <p id="doctor-name-error" role="alert" className="mt-1 text-sm text-rose-800">
                      {errors.nombre}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="doctor-email"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Correo electrónico *
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="doctor-email"
                      ref={(node) => {
                        refs.current.email = node;
                      }}
                      type="email"
                      value={form.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      autoComplete="email"
                      placeholder="profesional@medisalud.cl"
                      maxLength={150}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'doctor-email-error' : undefined}
                      className={fieldClass('email')}
                    />
                  </div>
                  {errors.email && (
                    <p id="doctor-email-error" role="alert" className="mt-1 text-sm text-rose-800">
                      {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="doctor-specialty"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Especialidad *
                  </label>
                  <div className="relative">
                    <Stethoscope
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <select
                      id="doctor-specialty"
                      ref={(node) => {
                        refs.current.especialidad_id = node;
                      }}
                      value={form.especialidad_id}
                      onChange={(event) => updateField('especialidad_id', event.target.value)}
                      disabled={
                        specialtiesLoading || Boolean(specialtiesError) || specialties.length === 0
                      }
                      aria-invalid={Boolean(errors.especialidad_id)}
                      aria-describedby={
                        errors.especialidad_id ? 'doctor-specialty-error' : undefined
                      }
                      className={`${fieldClass('especialidad_id')} appearance-none`}
                    >
                      <option value="">Selecciona una especialidad</option>
                      {specialties.map((specialty) => (
                        <option key={specialty.id} value={specialty.id}>
                          {specialty.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.especialidad_id && (
                    <p
                      id="doctor-specialty-error"
                      role="alert"
                      className="mt-1 text-sm text-rose-800"
                    >
                      {errors.especialidad_id}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="doctor-box"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Box de atención *
                  </label>
                  <div className="relative">
                    <Plus
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="doctor-box"
                      ref={(node) => {
                        refs.current.box_atencion = node;
                      }}
                      value={form.box_atencion}
                      onChange={(event) => updateField('box_atencion', event.target.value)}
                      maxLength={20}
                      placeholder="Box 101"
                      aria-invalid={Boolean(errors.box_atencion)}
                      aria-describedby={errors.box_atencion ? 'doctor-box-error' : undefined}
                      className={fieldClass('box_atencion')}
                    />
                  </div>
                  {errors.box_atencion && (
                    <p id="doctor-box-error" role="alert" className="mt-1 text-sm text-rose-800">
                      {errors.box_atencion}
                    </p>
                  )}
                </div>

                {errors.form && (
                  <p role="alert" className="text-sm text-rose-800 sm:col-span-2">
                    {errors.form}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onClearDraft();
                      onCancel();
                    }}
                    disabled={saving}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      specialtiesLoading ||
                      Boolean(specialtiesError) ||
                      specialties.length === 0
                    }
                    className="min-h-11 rounded-xl bg-teal-800 px-6 text-sm font-semibold text-white shadow-md shadow-teal-950/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : 'Guardar médico'}
                  </button>
                </div>
              </form>
            </div>

            {/* Columna Vista Previa de Credencial Médica en Tiempo Real */}
            <aside
              aria-label="Vista previa de credencial médica"
              className="rounded-3xl border border-slate-200/90 bg-gradient-to-b from-slate-50 to-white p-5 shadow-inner lg:col-span-5"
            >
              <div className="mx-auto mb-4 h-2.5 w-16 rounded-full bg-slate-200" />
              <div className="overflow-hidden rounded-2xl border border-teal-900/15 bg-white shadow-md">
                <div className="bg-hero-mesh p-5 text-white">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                      CREDENCIAL STAFF
                    </span>
                    <BadgeCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                  </div>
                  <div className="mt-4 flex items-center gap-3.5">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 font-mono text-lg font-bold text-white ring-1 ring-white/25">
                      {getDoctorInitials(form.nombre)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-bold text-white">
                        {form.nombre.trim() || 'Nombre del Profesional'}
                      </p>
                      <p className="truncate text-xs text-teal-200">{selectedSpecialtyName}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 p-5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">RUT Profesional</span>
                    <span className="font-mono font-bold text-slate-800">
                      {form.rut.trim() || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Box Asignado</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {form.box_atencion.trim() || 'Por asignar'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Correo Institucional</span>
                    <span className="max-w-[170px] truncate font-medium text-slate-700">
                      {form.email.trim() || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
