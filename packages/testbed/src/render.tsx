// HTML renderer: an exhaustive map over the registry — a missing tag is a compile-time error.
import type { ProseNode, TextNode } from 'tsprose';

type ElementNode = Exclude<ProseNode, TextNode>;
type Renderers = { [K in ElementNode['type']]: (node: Extract<ElementNode, { type: K }>, r: RenderContext) => string };

export interface RenderContext {
  readonly derived: ReadonlyMap<string, unknown>;
  readonly documentId: string | undefined;
  readonly href: (target: { documentId: string | undefined; name: string } | string) => string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderChildren(children: readonly ProseNode[] | undefined, r: RenderContext): string {
  return (children ?? []).map((c) => render(c, r)).join('');
}

export function render(node: ProseNode, r: RenderContext): string {
  if (node.type === 'text') return esc(node.text);
  const fn = renderers[node.type] as (n: ProseNode, r: RenderContext) => string;
  return fn(node, r);
}

const idAttr = (node: { id?: string | undefined }) => (node.id ? ` id="${esc(node.id)}"` : '');
const box = (tag: string, cls: string, node: { id?: string | undefined; children?: readonly ProseNode[] | undefined }, r: RenderContext, inner?: string) =>
  `<${tag} class="${cls}"${idAttr(node)}>${inner ?? renderChildren(node.children, r)}</${tag}>`;

const math = (node: { derived?: string | undefined; data: { tex: string } }, r: RenderContext) => {
  const d = node.derived ? (r.derived.get(node.derived) as { html?: string } | undefined) : undefined;
  return d?.html ?? esc(node.data.tex);
};

const linkTarget = (to: unknown, r: RenderContext): string => {
  if (typeof to === 'string') return to;
  const t = to as { $ref?: { documentId: string | undefined; name: string }; scope?: { documentId: string | undefined }; name?: string };
  if (t.$ref) return r.href(t.$ref);
  if (t.name) return r.href({ documentId: t.scope?.documentId, name: t.name });
  return '#';
};

export const renderers: Renderers = {
  paragraph: (n, r) => box('p', n.props.center ? 'p center' : 'p', n, r),
  bold: (n, r) => box('strong', n.props.accent ? 'accent' : 'b', n, r),
  italic: (n, r) => box('em', 'i', n, r),
  br: () => '<br>',
  inlineMath: (n, r) => `<span class="m"${idAttr(n)}>${math(n, r)}</span>`,
  captionSecondary: (n, r) => box('small', 'caption-secondary', n, r),
  caption: (n, r) => box('figcaption', 'caption', n, r),
  ref: (n, r) => `<a class="ref" href="${esc(linkTarget(n.props.to, r))}">${renderChildren(n.children, r)}</a>`,
  dep: (n, r) => `<a class="dep" href="${esc(linkTarget(n.props.on, r))}">${renderChildren(n.children, r)}</a>`,
  heading: (n, r) => box(`h${n.props.level}`, 'h', n, r),
  hr: () => '<hr>',
  blockMath: (n, r) => `<div class="math"${idAttr(n)}>${math(n, r)}</div>`,
  callout: (n, r) => box('aside', `callout ${n.props.icon}`, n, r, `<b>${esc(n.props.title)}</b>${renderChildren(n.children, r)}`),
  details: (n, r) => box('details', 'details', n, r, `<summary>${esc(n.props.title ?? '')}</summary>${renderChildren(n.children, r)}`),
  diagram: (n) => `<pre class="diagram"${idAttr(n)}>${esc(n.data.source)}</pre>`,
  flex: (n, r) => box('div', 'flex', n, r),
  image: (n, r) => {
    const size = n.derived ? (r.derived.get(n.derived) as { width: number; height: number } | undefined) : undefined;
    return `<figure${idAttr(n)}><img src="${esc(n.props.src)}"${size ? ` width="${size.width}" height="${size.height}"` : ''}>${renderChildren(n.children, r)}</figure>`;
  },
  video: (n, r) => `<figure${idAttr(n)}><video src="${esc(n.props.src)}"${n.props.autoplay ? ' autoplay' : ''}></video>${renderChildren(n.children, r)}</figure>`,
  gallery: (n, r) => box('div', 'gallery', n, r),
  listItem: (n, r) => box('li', 'li', n, r),
  list: (n, r) => box(n.props.ordered ? 'ol' : 'ul', 'list', n, r),
  tableData: (n, r) => `<td${n.props.center ? ' class="center"' : ''}${n.props.hspan ? ` colspan="${n.props.hspan}"` : ''}>${renderChildren(n.children, r)}</td>`,
  tableRow: (n, r) => `<tr>${renderChildren(n.children, r)}</tr>`,
  table: (n, r) => box('table', 'table', n, r),
  statement: (n, r) => accent('statement', n, r),
  statementMain: (n, r) => box('div', 'main', n, r),
  statementSection: (n, r) => box('section', 'section', n, r, `<h4>${esc(n.props.title)}</h4>${renderChildren(n.children, r)}`),
  statementProof: (n, r) => box('section', 'proof', n, r),
  term: (n, r) => accent('term', n, r),
  termMain: (n, r) => box('div', 'main', n, r),
  termSection: (n, r) => box('section', 'section', n, r, `<h4>${esc(n.props.title)}</h4>${renderChildren(n.children, r)}`),
  important: (n, r) => accent('important', n, r),
  importantMain: (n, r) => box('div', 'main', n, r),
  importantSection: (n, r) => box('section', 'section', n, r, `<h4>${esc(n.props.title)}</h4>${renderChildren(n.children, r)}`),
  problemDescription: (n, r) => box('div', 'description', n, r),
  problemHint: (n, r) => box('details', 'hint', n, r),
  problemNote: (n, r) => box('div', 'note', n, r),
  problemSolution: (n, r) => box('details', 'solution', n, r),
  problemAnswer: (n, r) => box('details', 'answer', n, r),
  problemSection: (n, r) => box('section', 'problem-section', n, r, `<h5>${esc(n.props.title)}</h5>${renderChildren(n.children, r)}`),
  problemCheck: (n, r) => `<form class="check"${idAttr(n)}><label>${esc(n.props.label ?? '')}</label>${renderChildren(n.children, r)}</form>`,
  subProblem: (n, r) => box('div', 'subproblem', n, r, `<b>${esc(n.props.label)}</b>${renderChildren(n.children, r)}`),
  problem: (n, r) => box('article', `problem ${n.props.level}`, n, r, `<h3>${esc(n.props.title)}</h3>${renderChildren(n.children, r)}`),
  problems: (n, r) => box('article', `problems ${n.props.level}`, n, r, `<h3>${esc(n.props.title)}</h3>${renderChildren(n.children, r)}`),
};

function accent(kind: string, n: { id?: string | undefined; props: { title: string }; children?: readonly ProseNode[] | undefined; meta: Record<string, unknown> }, r: RenderContext): string {
  const number = typeof n.meta.number === 'number' ? ` ${n.meta.number}` : '';
  return `<section class="accent ${kind}"${idAttr(n)}><h3>${esc(n.props.title)}${number}</h3>${renderChildren(n.children, r)}</section>`;
}

export function renderDocument(root: ProseNode, r: RenderContext): string {
  return `<!doctype html><html><body>${root.type === 'text' ? '' : renderChildren(root.children as ProseNode[] | undefined, r)}</body></html>`;
}
