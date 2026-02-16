import { describe, expectTypeOf, it } from 'vitest';

import {
  defineUnique,
  type ToUnique,
  type Unique,
  type AutoUnique,
} from '@src/unique';

import {
  type ParagraphRawElement,
  Details,
  P,
  paragraphSchema,
  QED,
} from './playground.test';
import type { ToTag } from '@src/tag';

describe('Unique', () => {
  it('should accept only linkable tags', () => {
    type ValidTrueLinkable = ToUnique<typeof P>;
    type ValidAlwaysLinkable = ToUnique<typeof Details>;
    // @ts-expect-error qed schema is not linkable
    type InvalidFalseLinkable = ToUnique<typeof QED>;
  });

  it('should widen correctly', () => {
    expectTypeOf<ToUnique<typeof P>>().toExtend<Unique>();
    expectTypeOf<AutoUnique>().toExtend<Unique>();
    // Concrete unique does not have `auto` property
    expectTypeOf<ToUnique<typeof P>>().not.toExtend<AutoUnique>();
  });

  it('should be incompatible with uniques of different tag names', () => {
    type UniqueP = ToUnique<typeof P>;
    type UniqueDetails = ToUnique<typeof Details>;
    // @ts-expect-error
    const pToDetails: UniqueDetails = {} as UniqueP;
    // @ts-expect-error
    const detailsToP: UniqueP = {} as UniqueDetails;

    type UniqueAnotherP = ToUnique<
      ToTag<typeof paragraphSchema, 'AnotherP', any>
    >;
    // @ts-expect-error Even tags that produce the same raw element must not be compatible if their tag names differ
    const pToAnotherP: UniqueAnotherP = {} as UniqueP;
  });
});

describe('defineUnique', () => {
  it('should infer types correctly', () => {
    const unique = defineUnique({
      documentId: 'doc1',
      name: 'uniqueP',
      tag: P,
    });
    expectTypeOf<typeof unique>().toEqualTypeOf<ToUnique<typeof P>>();
    expectTypeOf<typeof unique.tag>().toEqualTypeOf<typeof P>();
    expectTypeOf<typeof unique.rawElement>().toEqualTypeOf<
      ReturnType<typeof P>
    >();
    // we can't be sure this paragraph was created via the P tag!
    expectTypeOf<
      typeof unique.rawElement
    >().not.toEqualTypeOf<ParagraphRawElement>();
  });

  it('should not allow defining unique for non-linkable tags', () => {
    defineUnique({
      documentId: 'doc1',
      name: 'uniqueQED',
      // @ts-expect-error QED is not linkable
      tag: QED,
    });
  });
});
