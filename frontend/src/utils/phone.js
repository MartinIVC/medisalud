export function onlyMobileSubscriberDigits(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);
}

export function parseChileanMobileDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  if (digits.startsWith('569') && digits.length === 11) return digits.slice(3);
  if (digits.startsWith('56') && digits.length === 10) return digits.slice(2);
  if (digits.startsWith('9') && digits.length === 9) return digits.slice(1);

  return digits.slice(0, 8);
}
