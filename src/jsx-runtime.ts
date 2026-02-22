import { normalizeChildren } from './children.js';
import { mixSchema } from './default/mix.js';
import type { ToRawElement } from './element.js';
import { makeRawElement } from './elementUtils.js';
import { TSProseError } from './error.js';

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
