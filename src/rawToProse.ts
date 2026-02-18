import type {
  LinkableProseElement,
  ProseElement,
  RawElement,
} from './element.js';
import { makeProseElement } from './elementUtils.js';
import { TSProseError } from './error.js';
import { defaultIdMaker, type IdMaker, type TakenIds } from './id.js';
import { isWalkStop, walkPost } from './walk.js';

export type RawToProseStep = (elements: {
  rawElement: RawElement;
  proseElement: ProseElement;
}) => void | Promise<void>;

export interface RawToProseResult {
  prose: ProseElement;
  takenIds: TakenIds;
  uniques: Record<string, LinkableProseElement>;
}

export async function rawToProse(args: {
  rawProse: RawElement;
  takenIds?: TakenIds;
  pre?: (rawElement: RawElement) => void | Promise<void>;
  post?: (proseElement: ProseElement) => void | Promise<void>;
  step?: RawToProseStep;
  idMaker?: IdMaker;
  slugify?: (str: string) => string;
}): Promise<RawToProseResult> {
  const { rawProse, pre, post, step, slugify } = args;
  const idMaker = args.idMaker || defaultIdMaker;
  const takenIds: TakenIds = new Map(args.takenIds);
  const uniques: Record<string, LinkableProseElement> = {};

  const prose = await walkPost<RawElement, ProseElement>(
    rawProse,
    async (rawElement, children) => {
      if (pre) {
        await pre(rawElement);
      }

      const proseElement = makeProseElement({
        schema: rawElement.schema,
      });

      if (rawElement.data) {
        proseElement.data = rawElement.data;
      }
      if (rawElement.storageKey) {
        proseElement.storageKey = rawElement.storageKey;
      }
      if (children) {
        proseElement.children = children;
      }

      if (rawElement.schema.linkable) {
        const elementId = idMaker({ rawElement, takenIds, slugify });
        if (!elementId.trim()) {
          throw new TSProseError(
            `Empty ID generated from "${rawElement.schema.name}" element!\nThis might happen because of wrongly configured "idMaker" or obscure element data that was passed to create an ID!`,
          );
        }
        if (takenIds.has(elementId)) {
          throw new TSProseError(
            `Element ID collision: "${elementId}" is already taken!\nMake sure "idMaker" you are using generates non-repeating IDs!`,
          );
        }
        proseElement.id = elementId;
        takenIds.set(elementId, proseElement);

        if (rawElement.uniqueName) {
          if (uniques[rawElement.uniqueName]) {
            throw new TSProseError(
              `Duplicate uniqueName: "${rawElement.uniqueName}" is already used by another element!\nIf you are using document prose, make sure not to directly insert imported or manually created external uniques as their names might intersect with document-level uniques names!`,
            );
          }
          uniques[rawElement.uniqueName] = proseElement as LinkableProseElement;
        }
      }

      if (post) {
        await post(proseElement);
      }

      if (step) {
        await step({
          rawElement,
          proseElement,
        });
      }

      return proseElement;
    },
  );

  if (isWalkStop(prose)) {
    throw new TSProseError('Raw to Prose walk cannot be manually stopped!');
  }

  return {
    prose,
    takenIds,
    uniques,
  };
}
