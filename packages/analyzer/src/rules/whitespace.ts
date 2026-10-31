import { transform } from '@tsprose/transform';
import { forEachJsxElement, rangeOf, type EsNode } from '../estree.js';
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
  forEachJsxElement(program, (element) => {
    const children = (element.children as EsNode[]) ?? [];
    children.forEach((child, i) => {
      if (child.type !== 'JSXExpressionContainer') return;
      const expr = child.expression as EsNode;
      if (expr.type !== 'Literal' || expr.value !== ' ') return;
      const prev = children[i - 1];
      const next = children[i + 1];
      const nl = (n: EsNode | undefined, edge: 'start' | 'end') => {
        if (!n || n.type !== 'JSXText') return false;
        const [s, e] = rangeOf(n);
        const text = source.slice(s, e);
        const ws = edge === 'start' ? text.match(/^[ \t\r\n\f]*/)![0] : text.match(/[ \t\r\n\f]*$/)![0];
        return /[\r\n]/.test(ws);
      };
      // Safe to remove only when a line break already separates the neighbours.
      const safe = nl(prev, 'end') || nl(next, 'start');
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
