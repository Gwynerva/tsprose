// A small "site dialect" written the way a real integrator would, against the published API.
import { createTagKit, defineBlock, defineInline, defineRefs, defineDocument, refSchema, s, type BlockDef, type Tag } from 'tsprose';

export const B = defineInline({ name: 'bold', children: 'inline' });
export const P = defineBlock({ name: 'paragraph', children: 'inline', ref: 'optional' });

export const { defineBlock: block, defineInline: inline } = createTagKit({
  common: { refable: { toc: s.optional(s.union(s.boolean(), s.string())) } },
  meta: { title: s.optional(s.string()) },
  wrapLooseInline: P,
  onElement({ node, props }) {
    if (typeof props.title === 'string') node.meta.title = props.title;
  },
});

export const Theorem = block({
  name: 'theorem',
  props: { title: s.string() },
  children: { of: [P], min: 1 },
  ref: 'required',
  data: ({ props }) => ({ slug: props.title.toLowerCase() }),
});

export const Link = inline({ name: 'link', props: { to: refSchema() }, children: 'inline' });

export interface ItemDef extends BlockDef<'item', {}, () => readonly (Tag<ItemDef> | typeof P)[], 'optional'> {}
export const Item: Tag<ItemDef> = defineBlock<ItemDef>({ name: 'item', ref: 'optional', children: () => [Item, P] });

export const refs = defineRefs(import.meta.url, { main: Theorem });

export const article = defineDocument(
  () => (
    <>
      <Theorem $={refs.main} title="Main" toc>
        <P>
          Body with <B>bold</B> and a <Link to={refs.main}>self link</Link>.
        </P>
      </Theorem>
      <Item>
        <Item>
          <P>nested</P>
        </Item>
      </Item>
      Loose text becomes a paragraph.
    </>
  ),
  { refs },
);

declare module 'tsprose' {
  interface Registry {
    bold: typeof B;
    paragraph: typeof P;
    theorem: typeof Theorem;
    link: typeof Link;
    item: typeof Item;
  }
}
