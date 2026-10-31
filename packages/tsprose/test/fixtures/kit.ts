// An Erudit-like tag kit: common `toc`/`snippet` props on referable tags, `title` meta, paragraph autowrap.
import { createTagKit, s } from 'tsprose';
import { P } from './tags.js';

export const SnippetSchema = s.object({
  title: s.optional(s.string()),
  description: s.optional(s.string()),
  search: s.optional(s.boolean()),
});

export const kit = createTagKit({
  common: {
    always: { debugLabel: s.optional(s.string()) },
    refable: { toc: s.optional(s.union(s.boolean(), s.string())), snippet: s.optional(SnippetSchema) },
  },
  meta: { title: s.optional(s.string()) },
  wrapLooseInline: P,
  onElement({ node, props, report }) {
    const toc = node.meta.toc;
    const snippetTitle = (node.meta.snippet as { title?: string } | undefined)?.title;
    const title = typeof toc === 'string' ? toc : snippetTitle ?? (typeof props.title === 'string' ? props.title : undefined);
    if (title !== undefined) node.meta.title = title;
    if (toc === true && title === undefined) {
      report('kit/toc-title', `<${node.type}> is in the table of contents but has no title`, 'warning');
    }
  },
  onInclude(node) {
    delete node.meta.toc;
    delete node.meta.snippet;
  },
});

export const KCallout = kit.defineBlock({
  name: 'callout',
  props: { icon: s.string() },
  children: 'block',
  ref: 'optional',
});

export const KDetails = kit.defineBlock({
  name: 'kdetails',
  props: { title: s.string() },
  children: 'block',
  ref: 'required',
  common: { snippet: false },
});

export const KHr = kit.defineBlock({ name: 'khr' });

export const KB = kit.adopt(P);
