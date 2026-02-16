import { mixSchema } from './default/mix.js';
import { textSchema } from './default/text.js';
import type { RawElement } from './element.js';
import { isRawElement, makeRawElement } from './elementUtils.js';
import { isUnique } from './unique.js';
import { hash } from './utils/hash.js';

export type NormalizedChildren = RawElement[] | undefined;

export function normalizeChildren(
  children: any,
  childStep?: (child: RawElement) => void,
): NormalizedChildren {
  if (children === undefined) {
    return undefined;
  }

  const childrenArray = Array.isArray(children) ? children : [children];
  if (childrenArray.length === 0) {
    return undefined;
  }

  const normalizedChildren: RawElement[] = [];
  for (const child of childrenArray) {
    //
    // <Mix>
    //

    if (isRawElement(child, mixSchema)) {
      const subNormalized = normalizeChildren(child.children, childStep);
      if (subNormalized) {
        normalizedChildren.push(...subNormalized);
      }
      continue;
    }

    //
    // Raw Element
    //

    if (isRawElement(child)) {
      const clone = structuredClone(child);
      childStep?.(clone);
      normalizedChildren.push(clone);
      continue;
    }

    //
    // Unique
    //

    if (isUnique(child)) {
      const clone = structuredClone(child.rawElement);
      clone.slug = clone.uniqueName;
      delete clone.uniqueName;
      childStep?.(clone);
      normalizedChildren.push(clone);
      continue;
    }

    //
    // Array
    //

    if (Array.isArray(child)) {
      const subNormalized = normalizeChildren(child, childStep);
      if (subNormalized) {
        normalizedChildren.push(...subNormalized);
      }
      continue;
    }

    //
    // Skip falsy values (null, false, empty string, etc.) but not 0
    //

    if (
      child === undefined ||
      child === null ||
      child === false ||
      child === ''
    ) {
      continue;
    }

    //
    // Something else. Just stringify and maybe merge with previous text node if possible.
    //

    const strChild = String(child);

    const textRawElement = makeRawElement({
      schema: textSchema,
      elementHandler: (element) => {
        element.data = strChild;
      },
    });

    childStep?.(textRawElement);

    const lastNormalized = normalizedChildren.at(-1);

    if (isRawElement(lastNormalized, textSchema)) {
      lastNormalized.data += strChild;
      lastNormalized.hash = hash(lastNormalized.data, 12);
    } else {
      normalizedChildren.push(textRawElement);
    }
  }

  return normalizedChildren;
}
