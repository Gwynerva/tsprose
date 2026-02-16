import { normalizeChildren } from './children.js';
import { mixSchema } from './default/mix.js';
import type { RawElement, ToRawElement } from './element.js';
import { makeRawElement } from './elementUtils.js';
import { TSProseError } from './error.js';

declare global {
  namespace JSX {
    /** No intrinsic elements to avoid first letter casing confusion. */
    interface IntrinsicElements {}

    /**
     * Unfortunately, JSX/TSX tag constructions (<...>) always return general JSX.Element type.
     * No matter what tag you use, it will be widened to JSX.Element loosing all generics.
     * This prevents some cool compile/editor time checkings like prohibiting certain tags in specific contexts (blocks in inliners and etc.)
     * All this has to be done in runtime or with other tools, like ESLint.
     *
     * @todo Remove this when TypeScript supports proper JSX/TSX generics.
     * @see [TypeScript issue](https://github.com/microsoft/TypeScript/issues/21699)
     */
    type Element = RawElement;
  }
}

export function Fragment(props: {
  children: {};
}): ToRawElement<typeof mixSchema> {
  const children = normalizeChildren(props?.children);

  if (!children) {
    throw new TSProseError(`JSX Fragment must have at least one child!`);
  }

  return makeRawElement({
    schema: mixSchema,
    elementHandler: (element) => {
      element.children = children;
    },
  });
}

export function jsx(tag: any, props: any) {
  if (tag === Fragment) {
    return Fragment(props);
  }

  return tag(props);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
