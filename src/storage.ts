import type { ProseElement, ToProseElement } from './element.js';
import type { Schema } from './schema.js';
import { walkPre } from './walk.js';

export type ProseStorage = Record<string, any>;

export interface ProseWithStorage {
  prose: ProseElement;
  storage: ProseStorage;
}

export type ElementStorageCreator<TSchema extends Schema> =
  TSchema['Storage'] extends undefined
    ? never
    : (
        element: ToProseElement<TSchema>,
      ) => null | TSchema['Storage'] | Promise<null | TSchema['Storage']>;

export async function fillProseStorage(args: {
  prose: ProseElement;
  storageCreators: Record<string, ElementStorageCreator<any>>;
  alterValue?: (args: {
    element: ToProseElement<Schema>;
    storageKey: string;
    value: any;
  }) => any | Promise<any>;
  storage?: ProseStorage;
}) {
  const storage: ProseStorage = args.storage || {};

  await walkPre(args.prose, async (element) => {
    const storageKey = element.storageKey;

    // Element is not supposed to have storage
    if (!storageKey) {
      return;
    }

    // Storage was already filled
    if (storage[storageKey] !== undefined) {
      return;
    }

    const storageCreator = args.storageCreators[element.schema.name];

    let value: any = null;
    const deUndefy = (value: any) => (value === undefined ? null : value);

    if (storageCreator) {
      value = deUndefy(await storageCreator(element));
    }

    if (args.alterValue) {
      value = deUndefy(
        await args.alterValue({
          element,
          storageKey,
          value,
        }),
      );
    }

    storage[storageKey] = value;
  });

  return storage;
}
