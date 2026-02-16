export function hash(text: string, length: number): string {
  const ALPHABET =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }

  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[h % 62];
    h = ((h << 5) + h + i) >>> 0;
  }

  return out;
}
