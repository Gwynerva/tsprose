import { describe, expectTypeOf, it } from 'vitest';
import {
  s,
  type InferOutput,
  type InferProps,
  type StandardSchemaV1,
} from 'tsprose';

describe('s inference', () => {
  it('primitives and combinators', () => {
    expectTypeOf<
      InferOutput<ReturnType<typeof s.string>>
    >().toEqualTypeOf<string>();
    expectTypeOf<
      InferOutput<ReturnType<typeof s.number>>
    >().toEqualTypeOf<number>();
    expectTypeOf<
      InferOutput<ReturnType<typeof s.boolean>>
    >().toEqualTypeOf<boolean>();
    const lit = s.literal('x');
    expectTypeOf<InferOutput<typeof lit>>().toEqualTypeOf<'x'>();
    const en = s.enum([1, 2, 'three']);
    expectTypeOf<InferOutput<typeof en>>().toEqualTypeOf<1 | 2 | 'three'>();
    const opt = s.optional(s.string());
    expectTypeOf<InferOutput<typeof opt>>().toEqualTypeOf<string | undefined>();
    const arr = s.array(s.number());
    expectTypeOf<InferOutput<typeof arr>>().toEqualTypeOf<number[]>();
    const obj = s.object({ a: s.string(), b: s.optional(s.number()) });
    expectTypeOf<InferOutput<typeof obj>>().toEqualTypeOf<{
      a: string;
      b?: number | undefined;
    }>();
    const uni = s.union(s.string(), s.literal(1));
    expectTypeOf<InferOutput<typeof uni>>().toEqualTypeOf<string | 1>();
    const rec = s.record(s.boolean());
    expectTypeOf<InferOutput<typeof rec>>().toEqualTypeOf<
      Record<string, boolean>
    >();
  });

  it('InferProps makes undefined-including props optional', () => {
    type P = InferProps<{
      a: ReturnType<typeof s.string>;
      b: ReturnType<typeof s.optional<number>>;
    }>;
    expectTypeOf<P>().toEqualTypeOf<{ a: string; b?: number | undefined }>();
  });

  it('s values are Standard Schema', () => {
    expectTypeOf(s.string()).toExtend<StandardSchemaV1<string, string>>();
  });

  it('foreign Standard Schema values infer their output', () => {
    type Zodish = {
      '~standard': {
        version: 1;
        vendor: 'zod';
        validate: (v: unknown) => { value: 'a' | 'b' };
        types?: { input: string; output: 'a' | 'b' };
      };
    };
    expectTypeOf<InferOutput<Zodish>>().toEqualTypeOf<'a' | 'b'>();
    expectTypeOf<InferProps<{ x: Zodish }>>().toEqualTypeOf<{ x: 'a' | 'b' }>();
  });
});
