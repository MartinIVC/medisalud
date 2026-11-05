import React, { useEffect, useId, useRef } from 'react';
import { AlertCircle, CheckCircle2, Circle, Lock, User, X } from 'lucide-react';
import { formatRutInput } from '../../utils/rut.js';
import { onlyMobileSubscriberDigits, parseChileanMobileDigits } from '../../utils/phone.js';
import DoctorPhoto from '../DoctorPhoto.jsx';

export function Button({ variant = 'secondary', className = '', type = 'button', ...props }) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props} />;
}

export function Field({ id, label, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ tone = 'error', children }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

const statusConfig = {
  DISPONIBLE: { label: 'Disponible', Icon: Circle, className: 'available' },
  RESERVADO: { label: 'Reservado', Icon: User, className: 'reserved' },
  BLOQUEADO: { label: 'Bloqueado', Icon: Lock, className: 'blocked' },
};
export function StatusIndicator({ status }) {
  const { label, Icon, className } = statusConfig[status] || statusConfig.BLOQUEADO;
  return (
    <span className={`status status-${className}`}>
      <Icon size={15} aria-hidden="true" />
      {label}
    </span>
  );
}

export function Dialog({ open, title, onClose, busy = false, className = '', children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const dialog = ref.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    // Disabling the submitting button can move native focus to the document body.
    if (open && !dialog.contains(document.activeElement)) {
      dialog.querySelector('h2')?.focus({ preventScroll: true });
    }
  }, [open, busy]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`.trim()}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId} tabIndex={-1}>
          {title}
        </h2>
        <Button
          aria-label="Cerrar diálogo"
          className="icon-button"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} aria-hidden="true" />
        </Button>
      </div>
      <div className="dialog-content">{open ? children : null}</div>
    </dialog>
  );
}

export function formatDate(value, options = {}) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...options,
  }).format(new Date(`${value}T12:00:00`));
}

export function AppointmentDetails({ appointment, showPhoto = false }) {
  return (
    <dl className="appointment-details">
      <div>
        <dt>Profesional</dt>
        <dd className={showPhoto ? 'appointment-doctor' : undefined}>
          {showPhoto && (
            <DoctorPhoto
              url={appointment.foto_url}
              name={appointment.medico_nombre}
              className="doctor-photo-sm"
            />
          )}
          <span>{appointment.medico_nombre}</span>
        </dd>
      </div>
      <div>
        <dt>Especialidad</dt>
        <dd>{appointment.especialidad_nombre}</dd>
      </div>
      <div>
        <dt>Fecha y hora</dt>
        <dd>
          {formatDate(appointment.fecha)}
          <br />
          <span className="numeric">
            {appointment.hora_inicio}–{appointment.hora_fin}
          </span>
        </dd>
      </div>
      <div>
        <dt>Lugar de atención</dt>
        <dd>{appointment.box_atencion || '—'}</dd>
      </div>
    </dl>
  );
}

export function PatientFields({
  prefix,
  values,
  onChange,
  errors = {},
  rutError,
  readOnly = false,
}) {
  const fields = [
    { key: 'rut', label: 'RUT', autoComplete: 'off', placeholder: '12.345.678-5', maxLength: 15 },
    { key: 'nombre', label: 'Nombre completo', autoComplete: 'name', maxLength: 150 },
    {
      key: 'email',
      label: 'Correo electrónico',
      autoComplete: 'email',
      type: 'email',
      maxLength: 150,
    },
  ];
  return (
    <div className="form-grid">
      {fields.map(({ key, label, ...props }) => {
        const id = `${prefix}-${key}`;
        const error = errors[`paciente_${key}`] || (key === 'rut' ? rutError : '');
        return (
          <Field key={key} id={id} label={label} error={error}>
            <input
              {...props}
              id={id}
              required
              readOnly={readOnly}
              value={values[key]}
              onChange={(event) =>
                onChange(
                  key,
                  key === 'rut' ? formatRutInput(event.target.value) : event.target.value,
                )
              }
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </Field>
        );
      })}
      <Field
        id={`${prefix}-telefono`}
        label="Teléfono móvil"
        error={errors.paciente_telefono}
        hint="Ingresa los 8 dígitos después de +56 9."
      >
        <div className="phone-input">
          <span aria-hidden="true">+56 9</span>
          <input
            id={`${prefix}-telefono`}
            aria-label="Teléfono móvil, ocho dígitos después de +56 9"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            pattern="[0-9]{8}"
            maxLength={8}
            readOnly={readOnly}
            value={onlyMobileSubscriberDigits(values.telefono.replace(/^\+569/, ''))}
            onChange={(event) =>
              onChange('telefono', `+569${onlyMobileSubscriberDigits(event.target.value)}`)
            }
            onPaste={(event) => {
              if (readOnly) return;
              event.preventDefault();
              onChange(
                'telefono',
                `+569${parseChileanMobileDigits(event.clipboardData.getData('text'))}`,
              );
            }}
            aria-invalid={Boolean(errors.paciente_telefono)}
            aria-describedby={`${prefix}-telefono-hint${errors.paciente_telefono ? ` ${prefix}-telefono-error` : ''}`}
          />
        </div>
      </Field>
    </div>
  );
}
