// The Erudit-like kit: common `toc`/`snippet` props on referable tags, a `title` meta, paragraph autowrap.
import {
  createTagKit,
  defineBlock,
  defineInline,
  s,
  isTextNode,
  type AnyNode,
} from 'tsprose';

export const SnippetSchema = s.object({
  title: s.optional(s.string()),
  description: s.optional(s.string()),
  seo: s.optional(s.string()),
  key: s.optional(s.boolean()),
  search: s.optional(s.boolean()),
});

export const textOf = (children: readonly AnyNode[] | undefined): string =>
  (children ?? [])
    .map((c) => (isTextNode(c) ? c.text : c.children ? textOf(c.children) : ''))
    .join('');

/** Plain core paragraph (also the autowrap target). Defined outside the kit so the kit can reference it. */
export const P = defineBlock({
  name: 'paragraph',
  children: 'inline',
  ref: 'optional',
  props: { center: s.optional(s.boolean()), serif: s.optional(s.boolean()) },
});

export const Text = defineInline({ name: 'span', children: 'inline' });

export const kit = createTagKit({
  common: {
    refable: {
      toc: s.optional(s.union(s.boolean(), s.string())),
      snippet: s.optional(SnippetSchema),
    },
  },
  meta: { title: s.optional(s.string()) },
  wrapLooseInline: P,
  key: (node) => node.meta.title as string | undefined,
  onElement({ node, props }) {
    const toc = node.meta.toc;
    const snippet = node.meta.snippet as { title?: string } | undefined;
    const title =
      typeof toc === 'string'
        ? toc
        : (snippet?.title ??
          (typeof props.title === 'string' ? props.title : undefined));
    if (title !== undefined) node.meta.title = title;
  },
  onInclude(node) {
    delete node.meta.toc;
    delete node.meta.snippet;
  },
});

export const { defineBlock: block, defineInline: inline } = kit;
