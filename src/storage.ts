import type { ProseElement, ToProseElement } from './element.js';
import type { Schema } from './schema.js';
import { walkPre } from './walk.js';

export type ProseStorage = Record<string, any>;

export interface ProseWithStorage {
  prose: ProseElement;
  storage: ProseStorage;
}

// Method shorthand extraction produces a bivariant function, allowing
// specific creators (e.g. ElementStorageCreator<BoldSchema>) to be stored
// in a Record<string, ElementStorageCreator<Schema>> without contravariance errors.
interface _StorageCreatorMethod<TSchema extends Schema> {
  creator(
    element: ToProseElement<TSchema>,
  ): null | TSchema['Storage'] | Promise<null | TSchema['Storage']>;
}

export type ElementStorageCreator<TSchema extends Schema> =
  TSchema['Storage'] extends undefined
    ? never
    : _StorageCreatorMethod<TSchema>['creator'];

export async function fillProseStorage(args: {
  prose: ProseElement;
  storageCreators: Record<string, ElementStorageCreator<Schema>>;
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
