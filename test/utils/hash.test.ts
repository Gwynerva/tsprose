import { describe, it, expect } from 'vitest';

import { hash } from '@src/utils/hash';

describe('hash', () => {
  it('returns a string of the requested length', () => {
    expect(hash('hello', 8)).toHaveLength(8);
    expect(hash('hello', 1)).toHaveLength(1);
    expect(hash('hello', 32)).toHaveLength(32);
  });

  it('is deterministic', () => {
    expect(hash('test', 10)).toBe(hash('test', 10));
  });

  it('only contains URL-friendly characters (letters and numbers)', () => {
    const result = hash('anything here!@#$%^&*()', 64);
    expect(result).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('produces different hashes for different inputs', () => {
    expect(hash('abc', 10)).not.toBe(hash('def', 10));
  });

  it('produces different hashes for different lengths', () => {
    const short = hash('same', 4);
    const long = hash('same', 8);
    expect(long).not.toBe(short + hash('same', 4).slice(0, 4));
  });
});
