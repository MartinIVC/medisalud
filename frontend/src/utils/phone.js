export function onlyMobileSubscriberDigits(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);
}

export function parseChileanMobileDigits(value) {
  let digits = String(value ?? '').replace(/\D/g, '');

  if (digits.startsWith('569')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('56')) {
    digits = digits.slice(2);
    if (digits.startsWith('9') && digits.length === 9) digits = digits.slice(1);
  } else if (digits.startsWith('9') && digits.length === 9) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 8);
}
