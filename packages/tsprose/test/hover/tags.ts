import { createTagKit, defineBlock, s } from 'tsprose';

/**
 * Paragraph of running text. Accepts only inline content.
 * @example <P center>Hello</P>
 */
export const P = defineBlock({
  name: 'paragraph',
  children: 'inline',
  ref: 'optional',
  props: {
    /** Center the paragraph horizontally. */
    center: s.optional(s.boolean()),
    /** Serif font for quotations. */
    serif: s.optional(s.boolean()),
  },
});

const kit = createTagKit({
  common: {
    refable: {
      /** Put the element into the table of contents (true) or with a custom title (string). */
      toc: s.optional(s.union(s.boolean(), s.string())),
    },
  },
});

/** A callout box with an icon. */
export const Callout = kit.defineBlock({
  name: 'callout',
  props: {
    /** Icon name from the icon set. */
    icon: s.string(),
  },
  children: 'block',
  ref: 'optional',
});

/** Level-one heading preset. */
export const H1 = defineBlock({
  name: 'heading',
  props: { /** 1..3 */ level: s.enum([1, 2, 3]) },
  children: 'inline',
}).with({ level: 1 });

/** Answer check. */
export const Check = defineBlock({
  name: 'check',
  props: s.exclusive(
    s.object({
      /** The answer is "yes". */
      yes: s.literal(true),
    }),
    s.object({
      /** Expected answer value. */
      answer: s.number(),
    }),
  ),
});
