// Benchmarks: build a corpus end to end, measure phases, memory, id stability and hash collisions.
// Usage: bun bench/run.ts [root=content] [--delay 0] [--concurrency 8]
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { compile, defineDocument, isTextNode, walk, type BaseNode, type Document } from 'tsprose';
import { analyzeSource } from '@tsprose/analyzer';
import { format, kindOfFromTags } from '@tsprose/fmt';
import { hooks } from '../src/hooks.js';
import { kit } from '../src/kit.js';
import { loadCorpus } from '../src/loader.js';
import { buildSite, numbering } from '../src/site.js';
import { allTags, P } from '../src/tags.js';
import { slugifyRu } from '../src/slugify.js';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--')) ?? join(import.meta.dirname, '..', 'content');
const delay = Number(args[args.indexOf('--delay') + 1] || 0) || 0;
const concurrency = Number(args[args.indexOf('--concurrency') + 1] || 8) || 8;

const mb = (n: number) => (n / 1024 / 1024).toFixed(0) + ' MB';
const ms = (n: number) => n.toFixed(0) + ' ms';

console.log(`root: ${root}`);
const heap0 = process.memoryUsage().heapUsed;

// 1. Full site build
const built = await buildSite(root, { delay, concurrency });
const heap1 = process.memoryUsage().heapUsed;
console.log(`documents: ${built.stats.documents}, referable nodes: ${built.stats.nodes}, errors: ${built.stats.errors}, warnings: ${built.stats.warnings}`);
const byCode = new Map<string, number>();
for (const doc of built.built) for (const d of doc.result.diagnostics) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
if (byCode.size) console.log(`diagnostics by code: ${[...byCode].map(([c, n]) => `${c}=${n}`).join(', ')}`);
console.log(`load ${ms(built.stats.loadMs)} · compile ${ms(built.stats.compileMs)} · render ${ms(built.stats.renderMs)} · json round-trip ${ms(built.stats.jsonMs)} · heap +${mb(heap1 - heap0)}`);
const htmlBytes = built.built.reduce((n, d) => n + d.html.length, 0);
const jsonBytes = built.built.reduce((n, d) => n + d.json.length, 0);
console.log(`html ${mb(htmlBytes)} · json ${mb(jsonBytes)} · references: ${built.index.edges().length}`);

// 2. Hash collisions: same hash must mean same canonical content
const byHash = new Map<string, string>();
let collisions = 0;
let hashed = 0;
for (const doc of built.built) {
  for (const [node, hash] of doc.result.hashes) {
    if (isTextNode(node)) continue;
    hashed++;
    const sig = JSON.stringify([node.type, node.props, node.data, (node.children ?? []).length]);
    const prev = byHash.get(hash);
    if (prev === undefined) byHash.set(hash, sig);
    else if (prev !== sig) collisions++;
  }
}
console.log(`hashes: ${hashed} nodes, ${byHash.size} distinct, ${collisions} collisions`);

// 3. Largest document: single compile time (dev cycle), fmt, check
const { documents } = await loadCorpus(root);
let largest: { id: string; file: string; document: Document; size: number } | undefined;
for (const d of documents) {
  const size = (await stat(d.file)).size;
  if (!largest || size > largest.size) largest = { ...d, size };
}
if (largest) {
  const source = await readFile(largest.file, 'utf8');
  const t0 = performance.now();
  const single = await compile(largest.document, { documentId: largest.id, kit: kit.kit, hooks, numbering, slugify: slugifyRu });
  const t1 = performance.now();
  const kindOf = kindOfFromTags(allTags, ['QED', 'MathValueCheck', 'RootsCheck']);
  for (let i = 0; i < 3; i++) format(source, largest.file, { kindOf });
  const t2 = performance.now();
  const fmt = format(source, largest.file, { kindOf });
  const t3 = performance.now();
  const manifest = { tags: allTags, wrapsLooseInline: true, transform: true, inlineComponents: ['QED'] };
  const check = analyzeSource(source, largest.file, { manifest });
  const t4 = performance.now();
  console.log(`largest: ${largest.id} (${source.split('\n').length} lines, ${(largest.size / 1024).toFixed(0)} KB): compile ${ms(t1 - t0)} (${single.ids.size} ids, ${single.diagnostics.length} diags) · fmt ${ms(t3 - t2)} (idempotent: ${!format(fmt.code, largest.file, { kindOf }).changed}) · check ${ms(t4 - t3)} (${check.findings.length} findings)`);

  // 4. Id stability: insert a paragraph at the beginning — ids of the untouched elements must not move.
  // Elements are paired by document order (the new paragraph is the first referable node of the new tree).
  const shifted = defineDocument(() => [P({ children: 'A new first paragraph.' }), largest!.document.content()], { refs: largest.document.refs });
  const after = await compile(shifted, { documentId: largest.id, kit: kit.kit, hooks, numbering, slugify: slugifyRu });
  const sequence = (root: BaseNode) => {
    const out: { hash: string | undefined; id: string }[] = [];
    walk(root, (n) => {
      if (!isTextNode(n) && n.id) out.push({ hash: undefined, id: n.id });
    });
    return out;
  };
  const beforeSeq = sequence(single.root);
  const afterSeq = sequence(after.root).slice(1);
  let same = 0;
  let changed = 0;
  const changedIds: string[] = [];
  for (let i = 0; i < Math.min(beforeSeq.length, afterSeq.length); i++) {
    if (beforeSeq[i]!.id === afterSeq[i]!.id) same++;
    else {
      changed++;
      if (changedIds.length < 5) changedIds.push(`${beforeSeq[i]!.id} → ${afterSeq[i]!.id}`);
    }
  }
  console.log(`id stability after inserting a paragraph at the top: ${same} unchanged, ${changed} changed${changed ? ` (e.g. ${changedIds.join('; ')})` : ''}`);
}

// 5. Per-file transform/format/check sweep (editor-like loop)
let swept = 0;
let fmtTotal = 0;
let checkTotal = 0;
const kindOf = kindOfFromTags(allTags, ['QED']);
const manifest = { tags: allTags, wrapsLooseInline: true, transform: true, inlineComponents: ['QED'] };
async function sweep(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await sweep(full);
    else if (entry.name.endsWith('.tsx')) {
      const source = await readFile(full, 'utf8');
      const a = performance.now();
      format(source, full, { kindOf });
      const b = performance.now();
      analyzeSource(source, full, { manifest });
      const c = performance.now();
      fmtTotal += b - a;
      checkTotal += c - b;
      swept++;
    }
  }
}
await sweep(root);
console.log(`sweep: ${swept} files · fmt ${ms(fmtTotal)} total (${(fmtTotal / Math.max(1, swept)).toFixed(1)} ms/file) · check ${ms(checkTotal)} total`);

// Walk sanity: count all nodes
let total = 0;
for (const doc of built.built) walk(doc.result.root as BaseNode, () => void total++);
console.log(`total nodes: ${total}`);
