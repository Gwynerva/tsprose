import { transform } from '@tsprose/transform';
import { classifyJsxChild, hasNewline, leadingWhitespace, trailingWhitespace } from '@tsprose/transform/tooling';
import { forEachJsxContainer, rangeOf, type EsNode } from '../estree.js';
import type { Finding, Manifest } from '../types.js';

/**
 * Without the transform: a line break between inline content silently drops the space in JSX —
 * report it with an autofix that inserts `{' '}`.
 * With the transform: `{' '}` hacks are redundant where a line break already separates content.
 */
export function checkWhitespace(program: EsNode, source: string, fileName: string, manifest: Manifest): Finding[] {
  const isBlock = (name: string) => manifest.tags[name]?.def.kind === 'block';
  const findings: Finding[] = [];
  if (!manifest.transform) {
    const result = transform(source, fileName, { isBlock, sourceMap: false });
    for (const ins of result.insertions) {
      if (ins.between !== 'text') continue;
      findings.push({
        code: 'whitespace/lost-space',
        rule: 'whitespace',
        severity: 'warning',
        message: 'Line break between inline content drops the space in JSX; insert {\' \'} or enable @tsprose/transform',
        range: [ins.offset, ins.offset],
        fix: { range: [ins.offset, ins.offset], text: "{' '}" },
      });
    }
    return findings;
  }
  forEachJsxContainer(program, (container) => {
    const children = (container.children as EsNode[]) ?? [];
    children.forEach((child, i) => {
      if (classifyJsxChild(child, source).kind !== 'space') return;
      // A line break at the edge of the neighbouring text already separates the content.
      const brokenAt = (n: EsNode | undefined, edge: 'start' | 'end') => {
        if (!n || n.type !== 'JSXText') return false;
        const [s, e] = rangeOf(n);
        const text = source.slice(s, e);
        return hasNewline(edge === 'start' ? leadingWhitespace(text) : trailingWhitespace(text));
      };
      const safe = brokenAt(children[i - 1], 'end') || brokenAt(children[i + 1], 'start');
      const range = rangeOf(child);
      findings.push({
        code: 'whitespace/space-hack',
        rule: 'whitespace',
        severity: 'warning',
        message: safe ? "{' '} is redundant: the line break is a space with @tsprose/transform" : "{' '} on one line: write a plain space instead",
        range,
        fix: safe ? { range, text: '' } : undefined,
      });
    });
  });
  return findings;
}
