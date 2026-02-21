import type { ProseElement, RawElement } from './element.js';

export type TakenIds = Map<string, ProseElement>;

export type IdMaker = (args: {
  rawElement: RawElement;
  takenIds?: TakenIds;
  slugify?: (str: string) => string;
}) => string;

export const defaultIdMaker: IdMaker = ({ rawElement, takenIds, slugify }) => {
  let id = '';

  const humanReadable = rawElement.uniqueName || rawElement.slug;
  if (humanReadable) {
    id = slugify ? slugify(humanReadable) : humanReadable;
  } else {
    id = rawElement.schema.name + '-' + rawElement.hash.substring(0, 9);
  }

  if (takenIds) {
    if (rawElement.uniqueName) {
      // Unique elements keep their id; colliding elements get deduplicated ids
      if (takenIds.has(id)) {
        const collidingProse = takenIds.get(id)!;
        takenIds.delete(id);

        const newIdForColliding =
          collidingProse.schema.name + '-' + collidingProse.id;

        let candidate = newIdForColliding;
        let counter = 1;
        while (takenIds.has(candidate)) {
          candidate = `${newIdForColliding}-${counter++}`;
        }

        collidingProse.id = candidate;
        takenIds.set(candidate, collidingProse);
      }
    } else {
      // Non-unique elements find the next available id
      let candidate = id;
      let counter = 1;
      while (takenIds.has(candidate)) {
        candidate = `${id}-${counter++}`;
      }
      id = candidate;
    }
  }

  return id;
};
