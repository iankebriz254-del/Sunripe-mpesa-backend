// Safaricom's STK Push API requires the phone number in the format
// 2547XXXXXXXX or 2541XXXXXXXX (no "+", no leading 0).
// Customers will type it in all sorts of formats, so we normalize here.

/**
 * Converts common Kenyan phone formats into Safaricom's required
 * 2547XXXXXXXX / 2541XXXXXXXX format.
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX, 7XXXXXXXX
 * Returns null if the number cannot be normalized.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d]/g, ''); // strip spaces, +, dashes

  if (digits.startsWith('0') && digits.length === 10) {
    digits = '254' + digits.slice(1);
  } else if (digits.startsWith('254') && digits.length === 12) {
    // already correct
  } else if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
    digits = '254' + digits;
  } else {
    return null;
  }

  return isValidSafaricomNumber(digits) ? digits : null;
}

function isValidSafaricomNumber(digits) {
  return /^254(7|1)\d{8}$/.test(digits);
}

module.exports = { normalizePhone, isValidSafaricomNumber };
