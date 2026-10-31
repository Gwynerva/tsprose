import { describe, expect, it } from 'vitest';
import { matchesGlob } from '../src/glob.js';

describe('matchesGlob', () => {
  it.each([
    ['content/a.tsx', 'content/**/*.tsx', true],
    ['content/01-foundations/01-polynomials/01-special-products/article.tsx', 'content/**/*.tsx', true],
    ['content\\01-foundations\\02-equations\\article.tsx', 'content/**/*.tsx', true],
    ['site/content/x/y.tsx', '**/content/**/*.tsx', true],
    ['content/x/y.ts', 'content/**/*.tsx', false],
    ['news/x.tsx', 'content/**/*.tsx', false],
    ['content/x.tsx', 'content/*.tsx', true],
    ['content/a/x.tsx', 'content/*.tsx', false],
    ['a.b', 'a?b', true],
    ['content/x.tsx', '**', true],
  ])('%s ~ %s → %s', (path, glob, expected) => {
    expect(matchesGlob(path, glob)).toBe(expected);
  });
});
