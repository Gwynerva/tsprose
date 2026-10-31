// Fixture tags shared by runtime and type tests. No test cases live here.
import { defineBlock, defineInline, isTextNode, s, type BlockDef, type InlineDef, type Tag } from 'tsprose';

//
// Inline
//

export const B = defineInline({ name: 'bold', children: 'inline', props: { accent: s.optional(s.boolean()) } });
export const I = defineInline({ name: 'italic', children: 'inline' });
export const Br = defineInline({ name: 'br' });

export const M = defineInline({
  name: 'math',
  children: { of: 'inline', max: 1 },
  props: { currentColor: s.optional(s.boolean()) },
  ref: 'optional',
  data: ({ children }) => ({ tex: children.map((c) => (isTextNode(c) ? c.text : '')).join('') }),
});

//
// Blocks
//

export const P = defineBlock({
  name: 'paragraph',
  children: 'inline',
  ref: 'optional',
  props: { center: s.optional(s.boolean()), serif: s.optional(s.boolean()) },
  data: ({ props }) => ({ center: !!props.center }),
});

export const Qed = defineBlock({ name: 'qed' });

export const Image = defineBlock({
  name: 'image',
  props: { src: s.string(), width: s.optional(s.number()) },
  ref: 'optional',
})
  .key((node) => node.props.src)
  .derive(async (node) => ({ bytes: node.props.src.length * 100 }));

export const Proof = defineBlock({ name: 'proof', children: 'block' });

export const Theorem = defineBlock({
  name: 'theorem',
  props: { title: s.string(), level: s.optional(s.number()) },
  children: { of: [P, Proof, Qed], pattern: 'paragraph+ proof? qed?' },
  ref: 'required',
  data: ({ props, children }) => ({ slug: props.title.toLowerCase(), count: children.length }),
}).key((node) => node.props.title);

export const Heading = defineBlock({
  name: 'heading',
  props: { level: s.enum([1, 2, 3]) },
  children: 'inline',
  ref: 'optional',
}).key((node) => node.children.map((c) => (isTextNode(c) ? c.text : '')).join(''));
export const H1 = Heading.with({ level: 1 });
export const H2 = Heading.with({ level: 2 });

/** Block-only container with a data callback — the registry cycle sentinel. */
export const Sec = defineBlock({
  name: 'section',
  children: 'block',
  ref: 'optional',
  data: ({ children }) => ({ count: children.length }),
});

export const Details = defineBlock({
  name: 'details',
  props: { title: s.optional(s.string()) },
  children: 'block',
  ref: 'required',
});

//
// Recursive and mutually recursive (explicit interface form)
//

export interface ItemDef extends BlockDef<'item', {}, () => readonly (Tag<ItemDef> | typeof P)[], 'optional', number> {}
export const Item: Tag<ItemDef> = defineBlock<ItemDef>({
  name: 'item',
  ref: 'optional',
  children: () => [Item, P],
  data: ({ children }) => children.length,
});

export interface TrDef extends BlockDef<'tr', {}, () => readonly Tag<TdDef>[]> {}
export interface TdDef extends BlockDef<'td', { center: ReturnType<typeof s.optional<boolean>> }, 'any'> {}
export const Tr: Tag<TrDef> = defineBlock<TrDef>({ name: 'tr', children: () => [Td] });
export const Td: Tag<TdDef> = defineBlock<TdDef>({ name: 'td', props: { center: s.optional(s.boolean()) }, children: 'any' });
export const Table = defineBlock({ name: 'table', children: () => [Tr], ref: 'optional' });

export interface EmDef extends InlineDef<'em', {}, () => readonly (Tag<EmDef> | typeof B)[]> {}
export const Em: Tag<EmDef> = defineInline<EmDef>({ name: 'em', children: () => [Em, B] });

export const allTags = [B, I, Br, M, P, Qed, Image, Proof, Theorem, Heading, Sec, Details, Item, Tr, Td, Table, Em] as const;
