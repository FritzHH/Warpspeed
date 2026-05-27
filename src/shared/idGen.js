/* eslint-disable */
// Crypto-random 13-digit EAN-13 ID generator, shared between the tenant
// app and Cloud Functions (Node 22+). Browser and Node both expose
// `crypto.getRandomValues` as a global. CommonJS format so the file is
// safe to copy into functions/shared/ via the predeploy hook.

export function generateEAN13Barcode() {
  const arr = crypto.getRandomValues(new Uint8Array(12));
  const digits = Array.from(arr, (b) => b % 10);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return digits.join("") + String(checkDigit);
}

