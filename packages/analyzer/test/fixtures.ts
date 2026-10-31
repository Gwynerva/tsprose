import { createTagKit, defineBlock, defineInline, s } from 'tsprose';
import type { Manifest } from '../src/types.js';

export const B = defineInline({ name: 'bold', children: 'inline' });
export const M = defineInline({ name: 'math', children: { of: 'inline', max: 1 }, ref: 'optional' });
export const P = defineBlock({ name: 'paragraph', children: 'inline', ref: 'optional', props: { center: s.optional(s.boolean()) } });
export const Qed = defineBlock({ name: 'qed' });
export const Proof = defineBlock({ name: 'proof', children: 'block' });
export const Theorem = defineBlock({
  name: 'theorem',
  props: { title: s.string() },
  children: { of: [P, Proof, Qed], pattern: 'paragraph+ proof? qed?' },
  ref: 'required',
});
export const Heading = defineBlock({ name: 'heading', props: { level: s.enum([1, 2]) }, children: 'inline' });
export const H1 = Heading.with({ level: 1 });

const kit = createTagKit({ common: { refable: { toc: s.optional(s.boolean()) } }, wrapLooseInline: P });
export const Callout = kit.defineBlock({ name: 'callout', children: 'block', ref: 'optional' });

export const manifest: Manifest = {
  tags: { B, M, P, Qed, Proof, Theorem, H1, Heading, Callout },
  inlineComponents: ['QedMark'],
};

export const manifestWrapping: Manifest = { ...manifest, wrapsLooseInline: true };
export const manifestTransform: Manifest = { ...manifest, transform: true };
