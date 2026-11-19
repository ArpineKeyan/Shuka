// Small input checks. Each returns an error message or null.
export const str = v => (typeof v === 'string' ? v.trim() : '');

export function checkEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Enter a valid email.';
}
export function checkPassword(v) {
  return typeof v === 'string' && v.length >= 8 ? null : 'Password must be at least 8 characters.';
}
export function checkName(v) {
  return v.length >= 2 && v.length <= 80 ? null : 'Name must be 2–80 characters.';
}
// Armenian numbers, e.g. +374 91 123456 or 091 123456.
export function normalizePhone(v) {
  const digits = v.replace(/[\s\-()]/g, '');
  if (/^\+374\d{8}$/.test(digits)) return digits;
  if (/^0\d{8}$/.test(digits)) return '+374' + digits.slice(1);
  return null;
}
export const phoneMessage = 'Enter an Armenian phone number, e.g. +374 91 123456.';
