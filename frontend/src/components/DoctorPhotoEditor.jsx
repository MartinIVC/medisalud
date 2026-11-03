import React, { useEffect, useState } from 'react';
import { requestApi } from '../api/client.js';
import DoctorPhoto from './DoctorPhoto.jsx';

const MAX_BYTES = 2 * 1024 * 1024;

export default function DoctorPhotoEditor({ doctor, token, onSaved, onUnauthorized }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    setFile(null);
    setPreview(null);
    setMessage('');
  }, [doctor.id]);

  function chooseFile(event) {
    const selected = event.target.files?.[0];
    setFile(null);
    setPreview(null);
    setMessage('');
    if (!selected) return;
    if (!['image/png', 'image/jpeg'].includes(selected.type)) {
      setMessage('Selecciona una imagen PNG o JPEG.');
      return;
    }
    if (selected.size > MAX_BYTES) {
      setMessage('La foto no puede superar 2 MiB.');
      return;
    }
    setFile(selected);
  }

  async function savePhoto() {
    if (!file || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const result = await requestApi(`/api/medicos/${doctor.id}/foto`, {
        method: 'PUT',
        token,
        onUnauthorized,
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!result.ok) {
        setMessage(result.data.mensaje || 'No pudimos guardar la foto. Intenta nuevamente.');
        return;
      }
      await onSaved();
      setFile(null);
      setPreview(null);
      setMessage('Foto guardada.');
    } catch {
      setMessage('No pudimos guardar la foto. Revisa tu conexión e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DoctorPhoto
        url={preview || doctor.foto_url}
        name={doctor.nombre}
        className="h-12 w-12 rounded-xl"
      />
      <label className="cursor-pointer rounded-lg border border-teal-700 px-3 py-2 text-xs font-semibold text-teal-800">
        {doctor.foto_url ? 'Reemplazar foto' : 'Añadir foto'}
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={chooseFile}
          className="sr-only"
          aria-label={`Foto de ${doctor.nombre}`}
        />
      </label>
      {file && (
        <button
          type="button"
          disabled={saving}
          onClick={savePhoto}
          className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar foto'}
        </button>
      )}
      {file && <span className="text-xs text-slate-600">Vista previa antes de guardar</span>}
      {message && (
        <span role="status" className="w-full text-xs text-slate-700">
          {message}
        </span>
      )}
    </div>
  );
}
