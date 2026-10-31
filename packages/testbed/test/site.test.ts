import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { isTextNode, select, type BaseNode } from 'tsprose';
import { buildSite } from '../src/site.js';
import { Image, M, Statement } from '../src/tags.js';
import type { TocItem } from '../src/hooks.js';

const root = join(import.meta.dirname, '..', 'content');
const brokenRoot = join(import.meta.dirname, '..', 'content-broken');
const importer = (file: string) => import(/* @vite-ignore */ file.replace(/\\/g, '/')) as Promise<Record<string, unknown>>;

describe('testbed site build', async () => {
  const site = await buildSite(root, { importer });
  const byId = new Map(site.built.map((d) => [d.id, d]));
  const article = byId.get('foundations/equations/quadratic/quadratic-formula/article')!;
  const summary = byId.get('foundations/equations/quadratic/quadratic-formula/summary')!;

  it('compiles every document without errors', () => {
    expect(site.stats.errors).toBe(0);
    expect([...byId.keys()].sort()).toEqual([
      'foundations/equations/quadratic/completing-the-square/article',
      'foundations/equations/quadratic/quadratic-formula/article',
      'foundations/equations/quadratic/quadratic-formula/summary',
    ]);
    expect(article.result.diagnostics).toEqual([]);
  });

  it('assigns readable ids from refs, keys and titles', () => {
    const ids = [...article.result.ids.keys()];
    expect(ids).toContain('discriminant');
    expect(ids).toContain('formula');
    expect(ids).toContain('square-root-example');
    expect(ids).toContain('cover');
    expect(ids).toContain('formula-korney');
    const headings = ids.filter((id) => id.startsWith('formula-korney') || id === 'diskriminant' || id === 'formula');
    expect(headings.length).toBeGreaterThan(0);
  });

  it('kit meta, numbering and hooks work', () => {
    const [term] = select(article.result.root, Statement);
    expect(term!.meta.title).toBe('Формула корней');
    expect(term!.meta.number).toBe(2);
    const toc = article.result.hooks.get('toc') as TocItem[];
    expect(toc.map((t) => t.title)).toEqual(['Формула корней']);
    // toc-marked elements nest under the nearest heading
    expect(toc[0]!.children.map((t) => [t.type, t.title, t.children.map((c) => [c.type, c.title])])).toEqual([
      ['heading', 'Дискриминант', [['diagram', 'Обзор']]],
      ['heading', 'Формула', [['table', 'Случаи дискриминанта']]],
    ]);
    const snippets = article.result.hooks.get('snippets') as { id: string }[];
    expect(snippets.map((s) => s.id)).toEqual(['discriminant', 'formula']);
    const counts = article.result.hooks.get('counts') as Record<string, number>;
    expect(counts.paragraph).toBeGreaterThan(5);
  });

  it('loose inline content is wrapped in paragraphs by the kit', () => {
    const li = select(article.result.root, Image);
    expect(li.length).toBe(1);
    const lists = article.result.root.children!.filter((c) => c.type === 'list') as BaseNode[];
    const items = lists[0]!.children as BaseNode[];
    expect(items[1]!.children!.map((c) => c.type)).toEqual(['paragraph']);
  });

  it('cross-document links resolve and back references are indexed', () => {
    const targets = article.result.outgoing.map((o) => o.target);
    expect(targets).toContainEqual({ documentId: 'foundations/equations/quadratic/completing-the-square/article', name: 'method' });
    expect(targets).toContainEqual({ documentId: 'foundations/equations/quadratic/quadratic-formula/article', name: 'formula' });
    expect([...site.backRefs.keys()]).toContain('foundations/equations/quadratic/completing-the-square/article#method');
  });

  it('summary transcludes compiled copies', () => {
    const types = summary.result.root.children!.map((c) => c.type);
    expect(types).toEqual(['heading', 'paragraph', 'statement', 'term']);
    const copy = summary.result.root.children![2] as BaseNode;
    expect(copy.meta.includedFrom).toEqual({ documentId: 'foundations/equations/quadratic/quadratic-formula/article', name: 'formula' });
    expect(copy.meta.toc).toBeUndefined();
    expect(copy.id).toBe('formula-korney');
    expect(summary.result.diagnostics).toEqual([]);
  });

  it('derive ran for math, images and problems', () => {
    const [img] = select(article.result.root, Image);
    expect(article.result.derived.get(img!.derived!)).toEqual({ width: 800, height: 600 });
    const maths = select(article.result.root, M);
    expect(maths.length).toBeGreaterThan(5);
    expect(article.result.derived.get(maths[0]!.derived!)).toMatchObject({ html: expect.stringContaining('katex') });
  });

  it('renders HTML with ids and resolved links', () => {
    expect(article.html).toContain('<section class="accent statement" id="formula">');
    expect(article.html).toContain('href="/foundations/equations/quadratic/completing-the-square/article#method"');
    expect(article.html).toContain('<span class="katex">');
    expect(summary.html).toContain('id="formula-korney"');
  });

  it('JSON is compact and round-trips', () => {
    expect(article.json).not.toContain('"pos"');
    expect(article.json).toContain('"$ref":{"documentId":"foundations/equations/quadratic/completing-the-square/article","name":"method"}');
    const parsed = JSON.parse(article.json) as { v: number; refs: Record<string, string> };
    expect(parsed.v).toBe(2);
    expect(parsed.refs.formula).toBe('formula');
  });

  it('text nodes carry no positions after compile serialization', () => {
    const texts: string[] = [];
    const visit = (n: BaseNode) => {
      for (const c of n.children ?? []) {
        if (isTextNode(c)) texts.push(c.text);
        else visit(c);
      }
    };
    visit(article.result.root);
    expect(texts.some((t) => t.endsWith('мини-головоломку с '))).toBe(true); // transform kept the space before <Dep>
    expect(texts.some((t) => t.startsWith(' неудобно'))).toBe(true); // and after it
  });
});

describe('broken content', async () => {
  const site = await buildSite(brokenRoot, { importer });

  it('reports every problem in one pass, with file and line, without stopping', () => {
    const doc = site.built[0]!;
    const codes = doc.result.diagnostics.map((d) => d.code).sort();
    expect(codes).toEqual(['children/kind', 'children/pattern', 'props/invalid', 'props/unknown', 'ref/required', 'ref/unused'].sort());
    for (const d of doc.result.diagnostics.filter((d) => d.pos)) {
      expect(d.pos!.file).toMatch(/content-broken[\\/].*\.tsx$/);
      expect(d.pos!.line).toBeGreaterThan(1);
    }
    expect(doc.html).toContain('<h1');
  });
});
