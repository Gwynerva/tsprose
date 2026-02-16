import { describe, expect, it } from 'vitest';

import {
  defineAutoUnique,
  defineUnique,
  isAutoUnique,
  isUnique,
  UNIQUE_PREFIX,
} from '@src/unique';

import { P, Details } from './playground.test';

describe('isUnique', () => {
  it('should return true for a unique created with defineUnique', () => {
    const unique = defineUnique({
      documentId: 'doc1',
      name: 'myUnique',
      tag: P,
    });
    expect(isUnique(unique)).toBe(true);
  });

  it('should return true when tag matches', () => {
    const unique = defineUnique({
      documentId: 'doc1',
      name: 'myUnique',
      tag: P,
    });
    expect(isUnique(unique, P)).toBe(true);
  });

  it('should return false when tag does not match', () => {
    const unique = defineUnique({
      documentId: 'doc1',
      name: 'myUnique',
      tag: P,
    });
    expect(isUnique(unique, Details)).toBe(false);
  });

  it('should return true for auto uniques (without tag check)', () => {
    const autoUnique = defineAutoUnique({
      documentId: 'doc1',
      name: 'autoUnique',
    });
    expect(isUnique(autoUnique)).toBe(true);
  });

  it('should return false for non-unique objects', () => {
    expect(isUnique({})).toBe(false);
    expect(isUnique({ [UNIQUE_PREFIX]: false })).toBe(false);
    expect(isUnique('string')).toBe(false);
    expect(isUnique(42)).toBe(false);
  });

  it('should return false for null and undefined', () => {
    expect(isUnique(null)).toBe(false);
    expect(isUnique(undefined)).toBe(false);
  });
});

describe('isAutoUnique', () => {
  it('should return true for an auto unique', () => {
    const autoUnique = defineAutoUnique({
      documentId: 'doc1',
      name: 'autoUnique',
    });
    expect(isAutoUnique(autoUnique)).toBe(true);
  });

  it('should return false for a regular unique', () => {
    const unique = defineUnique({
      documentId: 'doc1',
      name: 'myUnique',
      tag: P,
    });
    expect(isAutoUnique(unique)).toBe(false);
  });

  it('should return false for non-unique objects', () => {
    expect(isAutoUnique({})).toBe(false);
    expect(isAutoUnique(null)).toBe(false);
    expect(isAutoUnique(undefined)).toBe(false);
  });
});
