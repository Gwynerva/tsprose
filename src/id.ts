import type { RawElement } from './element.js';

export type IdMaker = (
  rawElement: RawElement,
  takenIds?: Set<string>,
) => string;

export const defaultIdMaker: IdMaker = (rawElement, takenIds) => {
  takenIds ||= new Set<string>();
  let id = '';

  const humanReadable = rawElement.uniqueName || rawElement.slug;
  if (humanReadable) {
    id = humanReadable;
  } else {
    id = rawElement.schema.name + '-' + rawElement.hash.substring(0, 9);
  }

  let candidate = id;
  let counter = 1;
  while (takenIds.has(candidate)) {
    candidate = `${id}-${counter++}`;
  }

  return candidate;
};
