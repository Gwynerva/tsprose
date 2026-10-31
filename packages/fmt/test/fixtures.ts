import { createTagKit, defineBlock, defineInline, s } from 'tsprose';
import { inlineContainerFromTags, kindOfFromTags } from '../src/kinds.js';

export const B = defineInline({ name: 'bold', children: 'inline', props: { accent: s.optional(s.boolean()) } });
export const M = defineInline({ name: 'math', children: { of: 'inline', max: 1 }, props: { currentColor: s.optional(s.boolean()) } });
export const Dep = defineInline({ name: 'dep', children: 'inline', props: { on: s.unknown() } });
export const Br = defineInline({ name: 'br' });
export const P = defineBlock({ name: 'paragraph', children: 'inline', ref: 'optional', props: { center: s.optional(s.boolean()) } });
export const Qed = defineBlock({ name: 'qed' });
// Block containers wrap loose inline content in paragraphs, like an Erudit-style kit does.
const kit = createTagKit({ wrapLooseInline: P });
export const Sec = kit.defineBlock({ name: 'section', children: 'block', props: { title: s.optional(s.string()) } });
export const Image = defineBlock({ name: 'image', props: { src: s.string(), width: s.optional(s.string()), invert: s.optional(s.string()) } });
export const Li = kit.defineBlock({ name: 'li', children: 'block' });
export const List = defineBlock({ name: 'list', children: () => [Li], props: { ordered: s.optional(s.boolean()) } });

export const tags = { B, M, Dep, Br, P, Qed, Sec, Image, Li, List };
export const kindOf = kindOfFromTags(tags, ['QED']);
export const isInlineContainer = inlineContainerFromTags(tags);
