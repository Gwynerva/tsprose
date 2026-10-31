import { describe, expectTypeOf, it } from 'vitest';
import type { NodeOf, Tag, BaseNode } from 'tsprose';
import { KB, KCallout, KDetails, KHr } from '../fixtures/kit.js';
import { Qed } from '../fixtures/tags.js';

type Has<T, K extends string> = K extends keyof T ? true : false;

describe('kit common props', () => {
  it('refable tags get toc/snippet, every tag gets debugLabel', () => {
    type CalloutProps = Parameters<typeof KCallout>[0];
    expectTypeOf<CalloutProps>().toHaveProperty('toc');
    expectTypeOf<CalloutProps>().toHaveProperty('snippet');
    expectTypeOf<CalloutProps>().toHaveProperty('debugLabel');
    expectTypeOf<CalloutProps['toc']>().toEqualTypeOf<string | boolean | undefined>();

    type HrProps = Parameters<typeof KHr>[0];
    expectTypeOf<Has<HrProps, 'debugLabel'>>().toEqualTypeOf<true>();
    expectTypeOf<Has<HrProps, 'toc'>>().toEqualTypeOf<false>();
  });

  it('per-tag opt-out removes the prop', () => {
    type DetailsProps = Parameters<typeof KDetails>[0];
    expectTypeOf<Has<DetailsProps, 'toc'>>().toEqualTypeOf<true>();
    expectTypeOf<Has<DetailsProps, 'snippet'>>().toEqualTypeOf<false>();
  });

  it('meta is typed', () => {
    type Meta = NodeOf<typeof KCallout>['meta'];
    expectTypeOf<Meta['title']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Meta['toc']>().toEqualTypeOf<string | boolean | undefined>();
    expectTypeOf<NodeOf<typeof KCallout>>().toExtend<BaseNode>();
  });

  it('JSX usage', () => {
    <KCallout icon="i" toc="Note" snippet={{ search: true }}>
      <Qed />
    </KCallout>;
    <KHr debugLabel="x" />;
    // @ts-expect-error toc is not available on non-referable tags
    <KHr toc />;
    // @ts-expect-error snippet opted out
    <KDetails $="d" title="T" snippet={{}}><Qed /></KDetails>;
  });

  it('adopted tags keep their definition and gain common props', () => {
    expectTypeOf<typeof KB>().toExtend<Tag<any, any, any, any>>();
    expectTypeOf<NodeOf<typeof KB>['type']>().toEqualTypeOf<'paragraph'>();
    expectTypeOf<Parameters<typeof KB>[0]>().toHaveProperty('toc');
  });
});
