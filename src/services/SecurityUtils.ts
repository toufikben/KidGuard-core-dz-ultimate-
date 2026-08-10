const textEncoder = new TextEncoder();

function getCrypto(): Crypto | null {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
  return null;
}

export function randomHex(bytes = 16): string {
  const cryptoApi = getCrypto();
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random generator is unavailable');
  }
  const values = new Uint8Array(bytes);
  cryptoApi.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function randomDigits(length: number): string {
  if (!Number.isInteger(length) || length < 1) throw new Error('Invalid digit length');
  const cryptoApi = getCrypto();
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random generator is unavailable');
  }
  const values = new Uint32Array(length);
  cryptoApi.getRandomValues(values);
  return Array.from(values, (value) => String(value % 10)).join('');
}

export async function hashPin(pin: string): Promise<string> {
  const cryptoApi = getCrypto();
  if (!cryptoApi?.subtle) throw new Error('Web Crypto API is unavailable');
  const digest = await cryptoApi.subtle.digest('SHA-256', textEncoder.encode(pin));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, expectedHash: string): Promise<boolean> {
  const actualHash = await hashPin(pin);
  if (actualHash.length !== expectedHash.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    mismatch |= actualHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return mismatch === 0;
}
