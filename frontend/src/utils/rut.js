/**
 * Utilidad Frontend de Validación y Formateo de RUT Chileno (Módulo 11) — MED-11 (A-03 / A-04)
 */

export function cleanRut(rut) {
  if (!rut || typeof rut !== 'string') return '';
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function calculateDv(bodyStr) {
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

export function formatRutInput(rut) {
  const cleaned = cleanRut(rut);
  if (cleaned.length <= 1) return cleaned;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

export function validateRutClient(rut) {
  if (typeof rut !== 'string' || !/^(?:\d{1,8}|\d{1,2}(?:\.\d{3})+)-?[0-9kK]$/.test(rut.trim())) {
    return { valid: false, message: 'Ingrese un RUT con números, puntos opcionales y dígito verificador.' };
  }
  const cleaned = cleanRut(rut);
  if (cleaned.length < 8 || cleaned.length > 9) {
    return { valid: false, message: 'Ingrese un RUT de 7 u 8 dígitos más dígito verificador.' };
  }
  const body = cleaned.slice(0, -1);
  const dvProvided = cleaned.slice(-1);
  if (!/^\d+$/.test(body)) {
    return { valid: false, message: 'Formato numérico inválido.' };
  }
  const dvExpected = calculateDv(body);
  if (dvProvided !== dvExpected) {
    return {
      valid: false,
      message: `Dígito verificador inválido (para ${body} corresponde -${dvExpected}).`,
    };
  }
  return { valid: true, message: 'RUT chileno válido (Módulo 11 verificado).' };
}
