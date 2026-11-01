import { sha256 } from '@noble/hashes/sha2.js';

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const encoder = new TextEncoder();

/**
 * Content hash: SHA-256 of the text, first 11 bytes (88 bits) encoded as 16 base62 chars.
 * Identical in Bun, Node and browsers; URL/ID safe.
 */
export function hashText(text: string): string {
  const digest = sha256(encoder.encode(text));
  let n = 0n;
  for (let i = 0; i < 11; i++) {
    n = (n << 8n) | BigInt(digest[i]!);
  }
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(16, '0');
}

/** Deterministic JSON: object keys sorted, `undefined` members dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}
