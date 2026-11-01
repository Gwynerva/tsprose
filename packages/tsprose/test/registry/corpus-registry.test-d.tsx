/// <reference path="./registry.d.ts" />
import { describe, expectTypeOf, it } from 'vitest';
import { defineInline, ref, refSchema, type RefTarget } from 'tsprose';
import { Theorem } from '../fixtures/tags.js';

const Uses = defineInline({
  name: 'uses',
  props: { theorem: refSchema(Theorem) },
});
const Link = defineInline({ name: 'link', props: { to: refSchema() } });

describe('CorpusRegistry-driven ref()', () => {
  it('checks document ids and element names', () => {
    ref('dem/1');
    ref('dem/1', 'solution');
    ref('section/limits');
    // @ts-expect-error unknown document
    ref('dem/2');
    // @ts-expect-error unknown element
    ref('dem/1', 'nope');
    // @ts-expect-error section declares no elements
    ref('section/limits', 'intro');
  });

  it('knows the target tag', () => {
    expectTypeOf(ref('ref/lagrange', 'lagrange')).toEqualTypeOf<
      RefTarget<'theorem'>
    >();
    <Uses theorem={ref('ref/lagrange', 'lagrange')} />;
    // @ts-expect-error a paragraph is not a theorem
    <Uses theorem={ref('ref/lagrange', 'note')} />;
    <Link to={ref('ref/lagrange', 'note')} />;
    <Link to={ref('dem/1')} />;
  });
});
