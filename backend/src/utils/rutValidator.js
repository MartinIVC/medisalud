/**
 * MED-11 (RF-02 / Actividad A-04): Validación algorítmica de RUT chileno (Módulo 11)
 */

function cleanRut(rut) {
  if (!rut || typeof rut !== 'string') return '';
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

function calculateDv(bodyStr) {
  let sum = 0;
  let multiplier = 2;

  for (let i = bodyStr.length - 1; i >= 0; i--) {
    sum += parseInt(bodyStr.charAt(i), 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

function formatRut(rut) {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 2) return cleaned;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

function validateRut(rut) {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 8 || cleaned.length > 9) {
    return {
      valid: false,
      formatted: rut || '',
      reason: 'El RUT debe contener entre 7 y 8 dígitos más su dígito verificador.',
    };
  }

  const body = cleaned.slice(0, -1);
  const dvProvided = cleaned.slice(-1);

  if (!/^\d+$/.test(body)) {
    return {
      valid: false,
      formatted: rut,
      reason: 'El cuerpo del RUT solo puede contener números.',
    };
  }

  const dvExpected = calculateDv(body);
  if (dvProvided !== dvExpected) {
    return {
      valid: false,
      formatted: formatRut(cleaned),
      reason: `Dígito verificador inválido para el RUT ingresado (se esperaba -${dvExpected}).`,
    };
  }

  return {
    valid: true,
    formatted: formatRut(cleaned),
    reason: null,
  };
}

module.exports = {
  cleanRut,
  calculateDv,
  formatRut,
  validateRut,
};
