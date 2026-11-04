import React, { useMemo, useRef, useState } from 'react';
import { Alert, Button, Field } from './ui';
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

  return (
    <section className="doctor-registration">
      <div className="section-heading">
        <div>
          <p className="section-context">Profesionales</p>
          <h1>Registrar médico</h1>
          <p className="muted">
            El registro activa al profesional. Los horarios se configuran después.
          </p>
        </div>
      </div>
      {createdDoctor ? (
        <div className="doctor-success">
          <Alert tone="success">
            Médico creado correctamente: {createdDoctor.nombre} · {createdDoctor.rut}
          </Alert>
          <p>El profesional todavía no tiene horarios configurados.</p>
          {catalogRefreshFailed && (
            <Alert tone="warning">
              El registro se guardó, pero no pudimos actualizar los catálogos.
              <Button onClick={async () => setCatalogRefreshFailed(!(await onRefreshCatalogs()))}>
                Recargar catálogos
              </Button>
            </Alert>
          )}
          <div className="form-actions">
            <Button onClick={createAnother}>Crear otro médico</Button>
            <Button variant="primary" onClick={() => onContinueScheduling(createdDoctor.id)}>
              Configurar horarios
            </Button>
          </div>
        </div>
      ) : (
        <div className="doctor-layout">
          <div>
            {specialtiesLoading ? (
              <p role="status" className="loading-state">
                Cargando especialidades…
              </p>
            ) : specialtiesError ? (
              <Alert>
                {specialtiesError}
                <Button onClick={onRefreshCatalogs}>Reintentar</Button>
              </Alert>
            ) : (
              !specialties.length && (
                <Alert tone="warning">
                  No hay especialidades disponibles.
                  <Button onClick={onRefreshCatalogs}>Recargar catálogo</Button>
                </Alert>
              )
            )}
            {formError && <Alert>{formError}</Alert>}
            <form noValidate onSubmit={submit}>
              <div className="form-grid">
                {Object.entries(fieldLabels).map(([key, label]) => (
                  <Field
                    key={key}
                    id={`doctor-${key}`}
                    label={label}
                    error={errors[key]}
                    className={key === 'box_atencion' ? 'span-full' : ''}
                  >
                    {key === 'especialidad_id' ? (
                      <select
                        id={`doctor-${key}`}
                        ref={(node) => {
                          refs.current[key] = node;
                        }}
                        value={form[key]}
                        onChange={(event) => updateField(key, event.target.value)}
                        disabled={
                          specialtiesLoading || Boolean(specialtiesError) || !specialties.length
                        }
                        aria-invalid={Boolean(errors[key])}
                        aria-describedby={errors[key] ? `doctor-${key}-error` : undefined}
                      >
                        <option value="">Selecciona una especialidad</option>
                        {specialties.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`doctor-${key}`}
                        ref={(node) => {
                          refs.current[key] = node;
                        }}
                        value={form[key]}
                        onChange={(event) => updateField(key, event.target.value)}
                        type={key === 'email' ? 'email' : 'text'}
                        autoComplete={key === 'nombre' ? 'name' : key === 'email' ? 'email' : 'off'}
                        maxLength={key === 'rut' ? 15 : key === 'box_atencion' ? 20 : 150}
                        placeholder={
                          key === 'rut'
                            ? '12.345.678-5'
                            : key === 'box_atencion'
                              ? 'Box 101'
                              : undefined
                        }
                        aria-invalid={Boolean(errors[key])}
                        aria-describedby={errors[key] ? `doctor-${key}-error` : undefined}
                      />
                    )}
                  </Field>
                ))}
              </div>
              {errors.form && <Alert>{errors.form}</Alert>}
              <div className="form-actions">
                <Button
                  disabled={saving}
                  onClick={() => {
                    onClearDraft();
                    onCancel();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={
                    saving || specialtiesLoading || Boolean(specialtiesError) || !specialties.length
                  }
                >
                  {saving ? 'Guardando…' : 'Guardar médico'}
                </Button>
              </div>
            </form>
          </div>
          <aside className="doctor-preview" aria-label="Resumen del profesional">
            <h2>Datos del profesional</h2>
            <dl>
              <dt>Nombre</dt>
              <dd>{form.nombre.trim() || 'Por completar'}</dd>
              <dt>Especialidad</dt>
              <dd>{selectedSpecialtyName}</dd>
              <dt>Box de atención</dt>
              <dd>{form.box_atencion.trim() || 'Por asignar'}</dd>
              <dt>Correo electrónico</dt>
              <dd>{form.email.trim() || 'Por completar'}</dd>
            </dl>
          </aside>
        </div>
      )}
    </section>
  );
}
