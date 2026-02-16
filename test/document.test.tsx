import { describe, expect, it } from 'vitest';

import {
  defineDocument,
  DOCUMENT_AUTO_ID,
  DOCUMENT_PREFIX,
  injectDocumentId,
} from '@src/document';
import { isRawElement } from '@src/elementUtils';

import {
  paragraphSchema,
  P,
  type ParagraphRawElement,
} from './playground.test';

describe('defineDocument', () => {
  it('should create a document with no args', () => {
    const doc = defineDocument()(() => <P>Hello</P>);

    expect(doc[DOCUMENT_PREFIX]).toBe(true);
    expect(doc.documentId).toBe(DOCUMENT_AUTO_ID);
    expect(doc.uniques).toEqual({});
    expect(isRawElement(doc.rawProse, paragraphSchema)).toBe(true);
  });

  it('should create a document with explicit id and uniques', () => {
    const doc = defineDocument('my-doc', {
      uniques: { intro: P },
    })(({ uniques }) => <P $={uniques.intro}>Intro</P>);

    expect(doc.documentId).toBe('my-doc');
    expect(doc.uniques.intro.name).toBe('intro');
    expect(doc.uniques.intro.tag).toBe(P);
  });

  it('should create a document with uniques but no explicit id', () => {
    const doc = defineDocument({
      uniques: { intro: P },
    })(({ uniques }) => <P $={uniques.intro}>Intro</P>);

    expect(doc.documentId).toBe(DOCUMENT_AUTO_ID);
    expect(doc.uniques.intro.name).toBe('intro');
  });

  it('should throw when a defined unique is not used', () => {
    const finalize = defineDocument({
      uniques: { intro: P, unused: P },
    });

    expect(() =>
      finalize(({ uniques }) => <P $={uniques.intro}>Only intro</P>),
    ).toThrow(/not used in the document content/);
  });

  it('should support autoUnique', () => {
    const doc = defineDocument()(({ autoUnique }) => (
      <P $={autoUnique()}>Auto</P>
    ));

    expect(doc[DOCUMENT_PREFIX]).toBe(true);
    const pElement = doc.rawProse as ParagraphRawElement;
    expect(isRawElement(pElement, paragraphSchema)).toBe(true);
    expect(pElement.uniqueName).toBe('auto-unique-1');
  });
});

describe('injectDocumentId', () => {
  it('should inject id into defineDocument() with no args', () => {
    expect(injectDocumentId('myId', 'defineDocument()')).toBe(
      "defineDocument('myId')",
    );
  });

  it('should inject id into defineDocument() with object arg', () => {
    expect(injectDocumentId('myId', 'defineDocument({ uniques: {} })')).toBe(
      "defineDocument('myId',{ uniques: {} })",
    );
  });

  it('should not inject when a string id already exists (single quotes)', () => {
    expect(
      injectDocumentId('myId', "defineDocument('existingId', { uniques: {} })"),
    ).toBe("defineDocument('existingId', { uniques: {} })");
  });

  it('should not inject when a string id already exists (double quotes)', () => {
    expect(injectDocumentId('myId', 'defineDocument("existingId")')).toBe(
      'defineDocument("existingId")',
    );
  });

  it('should not inject when a template literal id already exists', () => {
    expect(injectDocumentId('myId', 'defineDocument(`existingId`)')).toBe(
      'defineDocument(`existingId`)',
    );
  });

  it('should use alias when provided', () => {
    expect(
      injectDocumentId('myId', 'myDefDoc({ uniques: {} })', 'myDefDoc'),
    ).toBe("myDefDoc('myId',{ uniques: {} })");
  });

  it('should handle multiline code', () => {
    const input = 'defineDocument(\n  { uniques: {} }\n)';
    const expected = "defineDocument('myId',\n  { uniques: {} }\n)";
    expect(injectDocumentId('myId', input)).toBe(expected);
  });

  it('should inject into multiple defineDocument calls', () => {
    const input =
      'const a = defineDocument(); const b = defineDocument({ x: 1 })';
    const expected =
      "const a = defineDocument('myId'); const b = defineDocument('myId',{ x: 1 })";
    expect(injectDocumentId('myId', input)).toBe(expected);
  });

  it('should escape single quotes in the document id', () => {
    expect(injectDocumentId("it's", 'defineDocument()')).toBe(
      "defineDocument('it\\'s')",
    );
  });

  it('should escape backslashes in the document id', () => {
    expect(injectDocumentId('back\\slash', 'defineDocument()')).toBe(
      "defineDocument('back\\\\slash')",
    );
  });

  it('should not affect unrelated code', () => {
    const code = 'const x = someOtherFunction(); defineDocument()';
    expect(injectDocumentId('myId', code)).toBe(
      "const x = someOtherFunction(); defineDocument('myId')",
    );
  });

  it('should not match partial function names', () => {
    const code = 'mydefineDocument()';
    expect(injectDocumentId('myId', code)).toBe('mydefineDocument()');
  });

  it('should handle alias that does not appear in code', () => {
    const code = 'defineDocument()';
    expect(injectDocumentId('myId', code, 'myAlias')).toBe('defineDocument()');
  });
});
