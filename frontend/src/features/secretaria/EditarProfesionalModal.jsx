import React, { useEffect, useRef, useState } from 'react';
import { requestApi } from '../../api/client.js';
import { Alert, Button, Dialog, Field } from '../../components/ui';
import DoctorPhoto from '../../components/DoctorPhoto.jsx';
import { validateRutClient } from '../../utils/rut.js';

const MAX_BYTES = 2 * 1024 * 1024;
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
  const rut = (form.rut || '').trim();
  if (!rut) errors.rut = 'Ingresa el RUT del médico.';
  else if (!rutShape.test(rut)) errors.rut = 'Usa un RUT chileno válido, sin texto adicional.';
  else {
    const result = validateRutClient(rut);
    if (!result.valid) errors.rut = result.message;
  }

  if (!(form.nombre || '').trim()) errors.nombre = 'Ingresa el nombre completo.';
  else if (form.nombre.trim().length > 150) errors.nombre = 'Máximo 150 caracteres.';

  if (!(form.email || '').trim()) errors.email = 'Ingresa el correo electrónico.';
  else if (form.email.trim().length > 150 || !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = 'Ingresa un correo válido de hasta 150 caracteres.';
  }

  if (!form.especialidad_id) errors.especialidad_id = 'Selecciona una especialidad.';
  if (!(form.box_atencion || '').trim()) errors.box_atencion = 'Ingresa el box de atención.';
  else if (form.box_atencion.trim().length > 20) errors.box_atencion = 'Máximo 20 caracteres.';

  return errors;
}

export default function EditarProfesionalModal({
  doctor,
  specialties = [],
  token,
  onClose,
  onSaved,
  onUnauthorized,
}) {
  const [form, setForm] = useState({
    rut: doctor?.rut || '',
    nombre: doctor?.nombre || '',
    email: doctor?.email || '',
    box_atencion: doctor?.box_atencion || '',
    especialidad_id: String(doctor?.especialidad_id || ''),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);
  const refs = useRef({});

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  }

  function choosePhoto(event) {
    const selected = event.target.files?.[0];
    setPhotoError('');
    if (!selected) return;
    if (!['image/png', 'image/jpeg'].includes(selected.type)) {
      setPhotoError('Selecciona una imagen PNG o JPEG.');
      return;
    }
    if (selected.size > MAX_BYTES) {
      setPhotoError('La foto no puede superar 2 MiB.');
      return;
    }
    setFile(selected);
  }

  function clearPhoto() {
    setFile(null);
    setPreview(null);
    setPhotoError('');
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
      const response = await requestApi(`/api/medicos/${doctor.id}`, {
        method: 'PUT',
        token,
        onUnauthorized,
        body: {
          rut: form.rut.trim(),
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          especialidad_id: Number(form.especialidad_id),
          box_atencion: form.box_atencion.trim(),
        },
      });

      if (!response.ok) {
        setErrors(response.data.fields || {});
        setFormError(
          response.data.error ||
            response.data.mensaje ||
            'No se pudo actualizar al profesional. Revisa los datos.',
        );
        return;
      }

      if (file) {
        const photoResponse = await requestApi(`/api/medicos/${doctor.id}/foto`, {
          method: 'PUT',
          token,
          onUnauthorized,
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!photoResponse.ok) {
          setFormError(
            photoResponse.data.mensaje ||
              'Los datos se guardaron, pero ocurrió un error al actualizar la foto.',
          );
          await onSaved?.();
          return;
        }
      }

      await onSaved?.();
      onClose();
    } catch {
      setFormError('No pudimos conectar con el sistema. Inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={Boolean(doctor)}
      title="Editar profesional"
      busy={saving}
      onClose={() => {
        if (saving) return;
        onClose();
      }}
    >
      <div className="edit-doctor-modal">
        <div className="edit-doctor-photo-section">
          <DoctorPhoto
            url={preview || doctor?.foto_url}
            name={form.nombre || doctor?.nombre || 'Profesional'}
            className="professionals-photo"
          />
          <div className="edit-doctor-photo-controls">
            <label className="button button-secondary doctor-photo-upload">
              {doctor?.foto_url || preview ? 'Reemplazar foto' : 'Añadir foto'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={choosePhoto}
                className="sr-only"
                aria-label={`Foto de ${form.nombre || doctor?.nombre || 'profesional'}`}
              />
            </label>
            {file && (
              <Button onClick={clearPhoto} disabled={saving}>
                Quitar foto nueva
              </Button>
            )}
            {file && <span className="muted text-sm">Se guardará junto con los datos.</span>}
            {photoError && <span className="field-error">{photoError}</span>}
          </div>
        </div>

        {formError && <Alert>{formError}</Alert>}

        <form noValidate onSubmit={submit}>
          <div className="form-grid">
            {Object.entries(fieldLabels).map(([key, label]) => (
              <Field
                key={key}
                id={`edit-doctor-${key}`}
                label={label}
                error={errors[key]}
                className={key === 'box_atencion' ? 'span-full' : ''}
              >
                {key === 'especialidad_id' ? (
                  <select
                    id={`edit-doctor-${key}`}
                    ref={(node) => {
                      refs.current[key] = node;
                    }}
                    value={form[key]}
                    onChange={(event) => updateField(key, event.target.value)}
                    disabled={saving}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `edit-doctor-${key}-error` : undefined}
                  >
                    <option value="">Selecciona una especialidad</option>
                    {specialties.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`edit-doctor-${key}`}
                    ref={(node) => {
                      refs.current[key] = node;
                    }}
                    value={form[key]}
                    onChange={(event) => updateField(key, event.target.value)}
                    type={key === 'email' ? 'email' : 'text'}
                    autoComplete={key === 'nombre' ? 'name' : key === 'email' ? 'email' : 'off'}
                    maxLength={key === 'rut' ? 15 : key === 'box_atencion' ? 20 : 150}
                    disabled={saving}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `edit-doctor-${key}-error` : undefined}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="form-actions">
            <Button disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
