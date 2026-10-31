// Which type constructs keep property JSDoc under the TypeScript 7 checker?
export interface Src {
  /** doc-a */
  a: string;
  /** doc-b */
  b?: number;
}
type Homomorphic<T> = { [K in keyof T]: T[K] };
type WithAs<T> = { [K in keyof T as K extends 'a' ? K : never]: T[K] } & { [K in keyof T as K extends 'b' ? K : never]?: T[K] };
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Inter<T> = Pick<T, 'a'> & { extra: 1 };

export declare const v1: Src;
export declare const v2: Homomorphic<Src>;
export declare const v3: WithAs<Src>;
export declare const v4: Simplify<WithAs<Src>>;
export declare const v5: Omit<Simplify<WithAs<Src>>, never>;
export declare const v6: Inter<Src>;
export declare const v7: Omit<Src, never> & { x: 1 };
export declare const v8: Pick<Src, 'a' | 'b'>;
export declare const v9: { -readonly [K in keyof Src]: Src[K] };

declare function constDef<const P extends Record<string, unknown>>(p: P): { [K in keyof P]: P[K] };
declare function plainDef<P extends Record<string, unknown>>(p: P): { [K in keyof P]: P[K] };
declare function identity<P extends Record<string, unknown>>(p: P): P;
declare function nested<const P extends Record<string, unknown>>(def: { props: P }): { [K in keyof P]: P[K] };
export const v10 = constDef({ /** doc-c */ c: 1 });
export const v11 = plainDef({ /** doc-c */ c: 1 });
export const v12 = identity({ /** doc-c */ c: 1 });
export const v13 = { /** doc-d */ d: 1 };
export const v14 = nested({ props: { /** doc-e */ e: 1 } });
