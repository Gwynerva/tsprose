import { describe, expectTypeOf, it } from 'vitest';

import {
  defineDocument,
  DOCUMENT_PREFIX,
  type Document,
  type DocumentFinalizer,
  type DocumentUniques,
  type DocumentUniquesTemplate,
} from '@src/document';
import type { RawElement } from '@src/element';
import type { AutoUnique, ToUnique } from '@src/unique';
import type { LinkableTag } from '@src/tag';

import { Details, P, QED } from './playground.test';

describe('Document Uniques Template', () => {
  it('should not allow non-linkable tags', () => {
    type NonLinkableTagTemplate =
      DocumentUniquesTemplate<// @ts-expect-error <QED> is non linkable, so this should error
      {
        invalidUnique: typeof QED;
      }>;

    type NotTagTemplate =
      DocumentUniquesTemplate<// @ts-expect-error string is not a tag, so this should error
      {
        invalidUnique: string;
      }>;
  });
});

describe('Document Uniques', () => {
  it('should infer unique names from keys and tags from values', () => {
    type UniquesTemplate = DocumentUniquesTemplate<{
      paragraphUnique: typeof P;
      detailsUnique: typeof Details;
    }>;

    type Uniques = DocumentUniques<UniquesTemplate>;

    expectTypeOf<Uniques>().toEqualTypeOf<{
      paragraphUnique: ToUnique<typeof P>;
      detailsUnique: ToUnique<typeof Details>;
    }>();
  });
});

describe('Document Finalizer', () => {
  it('should infer types correctly', () => {
    type NoUniques = Parameters<DocumentFinalizer<{}>>;
    expectTypeOf<NoUniques>().toEqualTypeOf<
      [
        contentCreator: (context: {
          uniques: {};
          autoUnique: () => AutoUnique;
        }) => RawElement,
      ]
    >();

    type WithUniques = Parameters<
      DocumentFinalizer<{
        paragraphUnique: typeof P;
        detailsUnique: typeof Details;
      }>
    >;
    expectTypeOf<WithUniques>().toEqualTypeOf<
      [
        contentCreator: (context: {
          uniques: {
            paragraphUnique: ToUnique<typeof P>;
            detailsUnique: ToUnique<typeof Details>;
          };
          autoUnique: () => AutoUnique;
        }) => RawElement,
      ]
    >();

    type WithGenericUniques = Parameters<DocumentFinalizer>;
    expectTypeOf<WithGenericUniques>().toEqualTypeOf<
      [
        contentCreator: (context: {
          uniques: { [key: string]: ToUnique<LinkableTag> };
          autoUnique: () => AutoUnique;
        }) => RawElement,
      ]
    >();
  });
});

describe('Document', () => {
  it('should infer types correctly', () => {
    type NoUniquesDocument = ReturnType<DocumentFinalizer<{}>>;
    expectTypeOf<NoUniquesDocument>().toEqualTypeOf<{
      [DOCUMENT_PREFIX]: true;
      documentId: string;
      uniques: {};
      rawProse: RawElement;
    }>();

    type WithUniquesDocument = ReturnType<
      DocumentFinalizer<{
        paragraphUnique: typeof P;
        detailsUnique: typeof Details;
      }>
    >;
    expectTypeOf<WithUniquesDocument>().toEqualTypeOf<{
      [DOCUMENT_PREFIX]: true;
      documentId: string;
      uniques: {
        paragraphUnique: ToUnique<typeof P>;
        detailsUnique: ToUnique<typeof Details>;
      };
      rawProse: RawElement;
    }>();

    type WithGenericUniquesDocument = ReturnType<DocumentFinalizer>;
    expectTypeOf<WithGenericUniquesDocument>().toEqualTypeOf<{
      [DOCUMENT_PREFIX]: true;
      documentId: string;
      uniques: { [key: string]: ToUnique<LinkableTag> };
      rawProse: RawElement;
    }>();
  });
});

describe('defineDocument', () => {
  it('should allow defining a document with no uniques', () => {
    const document = defineDocument()({} as any);
    expectTypeOf(document).toEqualTypeOf<Document<{}>>();
  });

  it('should allow defining a document with uniques', () => {
    const document = defineDocument({
      uniques: {
        paragraphUnique: P,
        detailsUnique: Details,
      },
    })({} as any);
    expectTypeOf(document).toEqualTypeOf<
      Document<{
        paragraphUnique: typeof P;
        detailsUnique: typeof Details;
      }>
    >();
  });

  it('should allow defining a document with a custom ID', () => {
    const document = defineDocument('customDocumentId', {
      uniques: {
        paragraphUnique: P,
        detailsUnique: Details,
      },
    })({} as any);
    expectTypeOf(document).toEqualTypeOf<
      Document<{
        paragraphUnique: typeof P;
        detailsUnique: typeof Details;
      }>
    >();
  });
});
