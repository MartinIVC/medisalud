import React, { useRef, useState } from 'react';
import { CheckCircle2, Mail, Plus, ShieldCheck, Stethoscope, User } from 'lucide-react';
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
    `mt-1 min-h-12 w-full rounded-xl border bg-white py-2 pl-10 pr-3 text-sm shadow-sm transition focus:outline-none focus:ring-4 ${
      errors[field] ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200 focus:border-teal-600 focus:ring-teal-600/10'
    }`;

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-teal-200 bg-teal-100/70 p-5 shadow-md shadow-teal-950/5 sm:p-8">
      <div className="mb-6 border-b border-slate-100 pb-5">
        <p className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Panel de secretaría
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Crear médico</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          El médico quedará activo y aparecerá en los catálogos. El registro no crea horarios
          automáticamente.
        </p>
      </div>

      {createdDoctor ? (
        <div className="space-y-5">
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
          >
            <h2 className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />Médico creado correctamente</h2>
            <p className="mt-1 text-sm">
              {createdDoctor.nombre} · {createdDoctor.rut}
            </p>
            <p className="mt-1 text-sm">Sin horarios configurados</p>
          </div>
          {catalogRefreshFailed && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
            >
              El registro se guardó, pero no pudimos actualizar los catálogos. Recárgalos antes de
              crear otro médico.
              <button
                type="button"
                onClick={async () => setCatalogRefreshFailed(!(await onRefreshCatalogs()))}
                className="ml-2 min-h-11 underline font-semibold"
              >
                Recargar catálogos
              </button>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
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
              className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
            >
              Configurar horarios
            </button>
          </div>
        </div>
      ) : (
        <>
          {specialtiesLoading ? (
            <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Cargando especialidades…
            </p>
          ) : specialtiesError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
            >
              <p>{specialtiesError}</p>
              <button
                type="button"
                onClick={onRefreshCatalogs}
                className="mt-2 min-h-11 underline font-semibold"
              >
                Reintentar
              </button>
            </div>
          ) : specialties.length === 0 ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <p>
                No hay especialidades disponibles. Recarga el catálogo o consulta al responsable del
                sistema.
              </p>
              <button
                type="button"
                onClick={onRefreshCatalogs}
                className="mt-2 min-h-11 underline font-semibold"
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
              <label htmlFor="doctor-rut" className="block text-sm font-semibold text-slate-700">
                RUT *
              </label>
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
                  className={fieldClass('rut')}
                />
              </div>
              {errors.rut && (
                <p id="doctor-rut-error" role="alert" className="mt-1 text-sm text-rose-800">
                  {errors.rut}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="doctor-name" className="block text-sm font-semibold text-slate-700">
                Nombre completo *
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="doctor-name"
                  ref={(node) => {
                    refs.current.nombre = node;
                  }}
                  value={form.nombre}
                  onChange={(event) => updateField('nombre', event.target.value)}
                  autoComplete="name"
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
              <label htmlFor="doctor-email" className="block text-sm font-semibold text-slate-700">
                Correo electrónico *
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="doctor-email"
                  ref={(node) => {
                    refs.current.email = node;
                  }}
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  autoComplete="email"
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
                <Stethoscope className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
                  aria-describedby={errors.especialidad_id ? 'doctor-specialty-error' : undefined}
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
                <p id="doctor-specialty-error" role="alert" className="mt-1 text-sm text-rose-800">
                  {errors.especialidad_id}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="doctor-box" className="block text-sm font-semibold text-slate-700">
                Box de atención *
              </label>
              <div className="relative">
                <Plus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
              <p role="alert" className="sm:col-span-2 text-sm text-rose-800">
                {errors.form}
              </p>
            )}
            <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
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
                className="min-h-11 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar médico'}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
