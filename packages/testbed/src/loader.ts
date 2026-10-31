// Folder loader like Erudit's: content/<book>/<group>/<topic>/{article,practice,summary}.tsx and pages.
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Corpus, isDocument, type Document } from 'tsprose';

export interface LoadedDocument {
  readonly id: string;
  readonly file: string;
  readonly document: Document;
}

/** `content/01-foundations/02-equations/03-quadratic/article.tsx` → `foundations/equations/quadratic/article` */
export function documentIdFromPath(root: string, file: string): string {
  const rel = relative(root, file).split(sep).join('/').replace(/\.tsx?$/, '');
  return rel
    .split('/')
    .map((segment) => segment.replace(/^\d+[-+]/, ''))
    .join('/');
}

export async function* contentFiles(root: string): AsyncGenerator<string> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'assets' || entry.name === 'scripts') continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) yield* contentFiles(full);
    else if (/\.tsx$/.test(entry.name) && !entry.name.endsWith('.refs.tsx')) yield full;
  }
}

/**
 * Import every document module; the default export (or `content`) must be a Document.
 * A module's refs are bound to the document id when the document is added to the corpus,
 * so other documents' imports of `./refs` resolve by value.
 */
export type Importer = (file: string) => Promise<Record<string, unknown>>;
const defaultImporter: Importer = (file) => import(pathToFileURL(file).href) as Promise<Record<string, unknown>>;

export async function loadCorpus(root: string, importer: Importer = defaultImporter): Promise<{ corpus: Corpus; documents: LoadedDocument[] }> {
  const corpus = new Corpus();
  const documents: LoadedDocument[] = [];
  for await (const file of contentFiles(root)) {
    const mod = await importer(file);
    const doc = (isDocument(mod.default) ? mod.default : isDocument(mod.content) ? mod.content : undefined) as Document | undefined;
    if (!doc) continue;
    const id = documentIdFromPath(root, file);
    corpus.add(id, doc);
    documents.push({ id, file, document: doc });
  }
  return { corpus, documents };
}
