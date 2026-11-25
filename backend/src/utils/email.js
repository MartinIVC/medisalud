/**
 * Normalización y validación compartida de correos electrónicos (MED-29).
 * Conserva puntos y alias '+' en la parte local; unifica espacios y mayúsculas/minúsculas.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f<>]/;
const EMAIL_FORMAT_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_EMAIL_LENGTH = 150;

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function validateEmail(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      valid: false,
      normalized: '',
      reason: 'Ingresa un correo electrónico válido.',
    };
  }
  const trimmed = value.trim();
  if (
    trimmed.length > MAX_EMAIL_LENGTH ||
    CONTROL_CHARS_REGEX.test(trimmed) ||
    !EMAIL_FORMAT_REGEX.test(trimmed)
  ) {
    return {
      valid: false,
      normalized: '',
      reason: 'Ingresa un correo válido de hasta 150 caracteres.',
    };
  }
  return {
    valid: true,
    normalized: trimmed.toLowerCase(),
    reason: null,
  };
}

module.exports = {
  normalizeEmail,
  validateEmail,
  MAX_EMAIL_LENGTH,
};
