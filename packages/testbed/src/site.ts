// Build "the site": load, compile the corpus, render HTML, serialize JSON — what a generator does.
import {
  compileCorpus,
  toJSON,
  fromJSON,
  createProse,
  type CompileResult,
  type CorpusIndex,
  type ProseNode,
} from 'tsprose';
import { hooks } from './hooks.js';
import { kit } from './kit.js';
import { loadCorpus, type Importer } from './loader.js';
import { renderDocument } from './render.js';
import { allTags } from './tags.js';
import { slugifyRu } from './slugify.js';

export interface BuiltDocument {
  readonly id: string;
  readonly result: CompileResult;
  readonly html: string;
  readonly json: string;
}

export interface BuildStats {
  readonly documents: number;
  readonly nodes: number;
  readonly errors: number;
  readonly warnings: number;
  readonly loadMs: number;
  readonly compileMs: number;
  readonly renderMs: number;
  readonly jsonMs: number;
}

export const prose = createProse({ tags: Object.values(allTags) });

export const numbering = {
  statement: 'statement',
  term: 'statement',
  important: 'statement',
  problem: 'problem',
  problems: 'problem',
};

export async function buildSite(
  root: string,
  options: { delay?: number; concurrency?: number; importer?: Importer } = {},
): Promise<{ built: BuiltDocument[]; stats: BuildStats; index: CorpusIndex }> {
  const t0 = performance.now();
  const { corpus } = await loadCorpus(root, options.importer);
  const t1 = performance.now();
  const { results, index, diagnostics } = await compileCorpus(corpus, {
    kit: kit.kit,
    hooks,
    numbering,
    slugify: slugifyRu,
    context: { delay: options.delay ?? 0 },
    concurrency: options.concurrency ?? 8,
  });
  const t2 = performance.now();
  const built: BuiltDocument[] = [];
  let nodes = 0;
  const href = (
    target: { documentId: string | undefined; name: string } | string,
  ) =>
    typeof target === 'string'
      ? target
      : `/${target.documentId ?? ''}#${target.name}`;
  for (const [id, result] of results) {
    const html = renderDocument(result.root as unknown as ProseNode, {
      derived: result.derived,
      documentId: id,
      href,
    });
    built.push({ id, result, html, json: '' });
    nodes += result.ids.size;
  }
  const t3 = performance.now();
  for (const doc of built) {
    const json = JSON.stringify(
      toJSON({
        root: doc.result.root,
        documentId: doc.id,
        refs: doc.result.refs,
        derived: doc.result.derived,
      }),
    );
    (doc as { json: string }).json = json;
    const back = fromJSON(JSON.parse(json), { prose });
    // Documents with error diagnostics carry their invalid props into JSON on purpose; only clean ones must round-trip cleanly.
    const hadErrors = doc.result.diagnostics.some(
      (d) => d.severity === 'error',
    );
    if (!hadErrors && back.diagnostics.length)
      throw new Error(
        `JSON round trip failed for ${doc.id}: ${back.diagnostics[0]!.message}`,
      );
  }
  const t4 = performance.now();
  return {
    built,
    index,
    stats: {
      documents: built.length,
      nodes,
      errors: diagnostics.filter((d) => d.severity === 'error').length,
      warnings: diagnostics.filter((d) => d.severity === 'warning').length,
      loadMs: t1 - t0,
      compileMs: t2 - t1,
      renderMs: t3 - t2,
      jsonMs: t4 - t3,
    },
  };
}
