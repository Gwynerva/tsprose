import type { RawElement } from './element.js';
import { TSProseError } from './error.js';
import type { LinkableTag } from './tag.js';
import {
  defineAutoUnique,
  defineUnique,
  type AutoUnique,
  type ToUnique,
} from './unique.js';

export const DOCUMENT_PREFIX = '__TSPROSE_document';
export const DOCUMENT_AUTO_ID = '__TSPROSE_documentAutoId';

//
// Types
//

export interface Document<
  UniquesTemplate extends DocumentUniquesTemplate = DocumentUniquesTemplate,
> {
  [DOCUMENT_PREFIX]: true;
  documentId: string;
  uniques: DocumentUniques<UniquesTemplate>;
  rawProse: RawElement;
}

export type DocumentUniquesTemplate<
  Template extends Record<string, LinkableTag> = Record<string, LinkableTag>,
> = Template;
export type DocumentUniques<
  UniquesTemplate extends DocumentUniquesTemplate = DocumentUniquesTemplate,
> = {
  [UniqueName in keyof UniquesTemplate]: ToUnique<UniquesTemplate[UniqueName]>;
};

export type DocumentContentCreator<
  UniquesTemplate extends DocumentUniquesTemplate = DocumentUniquesTemplate,
> = (context: {
  uniques: DocumentUniques<UniquesTemplate>;
  autoUnique: () => AutoUnique;
}) => RawElement;

export type DocumentFinalizer<
  UniquesTemplate extends DocumentUniquesTemplate = DocumentUniquesTemplate,
> = (
  contentCreator: DocumentContentCreator<UniquesTemplate>,
) => Document<UniquesTemplate>;

//
// defineDocument
//

export function defineDocument(): DocumentFinalizer<{}>;
export function defineDocument<
  UniquesTemplate extends DocumentUniquesTemplate,
>(documentParameters: {
  uniques: UniquesTemplate;
}): DocumentFinalizer<UniquesTemplate>;
export function defineDocument<UniquesTemplate extends DocumentUniquesTemplate>(
  documentId: string,
  documentParameters: {
    uniques: UniquesTemplate;
  },
): DocumentFinalizer<UniquesTemplate>;
export function defineDocument(
  arg1?: string | { uniques: DocumentUniquesTemplate },
  arg2?: { uniques: DocumentUniquesTemplate },
): DocumentFinalizer {
  const documentId = typeof arg1 === 'string' ? arg1 : DOCUMENT_AUTO_ID;

  const uniquesTemplate =
    typeof arg1 === 'object' && 'uniques' in arg1
      ? arg1.uniques
      : arg2 && 'uniques' in arg2
        ? arg2.uniques
        : ({} as DocumentUniquesTemplate);

  const uniques = Object.fromEntries(
    Object.entries(uniquesTemplate).map(([key, value]) => [
      key,
      defineUnique({
        documentId,
        name: key,
        tag: value,
      }),
    ]),
  );

  let autoUniquesCounter = 1;
  const autoUnique = () =>
    defineAutoUnique({
      documentId,
      name: `auto-unique-${autoUniquesCounter++}`,
    });

  function finalizeDocument(contentCreator: DocumentContentCreator): Document {
    const rawProse = contentCreator({ uniques, autoUnique });

    for (const unique of Object.values(uniques)) {
      try {
        unique.rawElement;
      } catch {
        throw new TSProseError(
          `Unique "${unique.name}" for <${unique.tag.tagName}> was not used in the document content!\nAll uniques defined in the document must be used in the content creator function!`,
        );
      }
    }

    return {
      [DOCUMENT_PREFIX]: true,
      documentId,
      uniques,
      rawProse,
    };
  }

  return finalizeDocument;
}

//
// isDocument
//

export function isDocument(document: any): document is Document {
  return Boolean(document?.[DOCUMENT_PREFIX] === true);
}

//
// injectDocumentId
//

export function injectDocumentId(
  documentId: string,
  injectTo: string,
  defineDocumentAlias?: string,
): string {
  const funcName = defineDocumentAlias ?? 'defineDocument';
  const escapedFuncName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedId = documentId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const regex = new RegExp(`\\b${escapedFuncName}\\((\\s*)(?!['"\`])`, 'g');

  return injectTo.replace(regex, (match, whitespace, offset) => {
    const afterChar = injectTo[offset + match.length];

    if (afterChar === ')' || afterChar === undefined) {
      // defineDocument() → defineDocument('id')
      return `${funcName}(${whitespace}'${escapedId}'`;
    }
    // defineDocument({ → defineDocument('id', {
    return `${funcName}('${escapedId}',${whitespace}`;
  });
}
