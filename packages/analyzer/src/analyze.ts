import { readFile } from 'node:fs/promises';
import { parseSync } from 'oxc-parser';
import { forEachJsxElement, type EsNode } from './estree.js';
import { checkChildren } from './rules/children.js';
import { checkProps } from './rules/props.js';
import { checkRefs } from './rules/refs.js';
import { checkWhitespace } from './rules/whitespace.js';
import { checkBraces } from './rules/braces.js';
import type { Finding, Located, Manifest, RuleName } from './types.js';

export interface AnalyzeOptions {
  readonly manifest: Manifest;
  readonly rules?: readonly RuleName[] | undefined;
}

const ALL_RULES: readonly RuleName[] = ['children', 'props', 'refs', 'whitespace', 'braces'];

/** Run the rules over an already parsed ESTree program (used by the CLI and the ESLint plugin). */
export function analyzeProgram(program: EsNode, source: string, fileName: string, options: AnalyzeOptions): Finding[] {
  const rules = new Set(options.rules ?? ALL_RULES);
  const findings: Finding[] = [];
  if (rules.has('children') || rules.has('props')) {
    forEachJsxElement(program, (element) => {
      if (rules.has('children')) findings.push(...checkChildren(element, source, options.manifest));
      if (rules.has('props')) findings.push(...checkProps(element, options.manifest));
    });
  }
  if (rules.has('refs')) findings.push(...checkRefs(program));
  if (rules.has('whitespace')) findings.push(...checkWhitespace(program, source, fileName, options.manifest));
  if (rules.has('braces')) findings.push(...checkBraces(program, source));
  return findings.sort((a, b) => a.range[0] - b.range[0]);
}

export function analyzeSource(source: string, fileName: string, options: AnalyzeOptions): { findings: Located[]; errors: string[] } {
  const parsed = parseSync(fileName, source, { sourceType: 'module', lang: fileName.endsWith('.jsx') ? 'jsx' : 'tsx' });
  const findings = analyzeProgram(parsed.program as unknown as EsNode, source, fileName, options);
  const lineStarts = computeLineStarts(source);
  return {
    findings: findings.map((f) => ({ ...f, file: fileName, ...positionOf(lineStarts, f.range[0]) })),
    errors: parsed.errors.map((e) => e.message),
  };
}

export async function analyzeFiles(files: readonly string[], options: AnalyzeOptions): Promise<{ findings: Located[]; errors: { file: string; message: string }[] }> {
  const findings: Located[] = [];
  const errors: { file: string; message: string }[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const result = analyzeSource(source, file, options);
    findings.push(...result.findings);
    errors.push(...result.errors.map((message) => ({ file, message })));
  }
  return { findings, errors };
}

/** Apply fixes to a source (non-overlapping, last to first). */
export function applyFixes(source: string, findings: readonly Finding[]): string {
  const fixes = findings.flatMap((f) => (f.fix ? [f.fix] : [])).sort((a, b) => b.range[0] - a.range[0]);
  let out = source;
  let lastStart = Number.POSITIVE_INFINITY;
  for (const fix of fixes) {
    if (fix.range[1] > lastStart) continue; // overlapping: skip
    out = out.slice(0, fix.range[0]) + fix.text + out.slice(fix.range[1]);
    lastStart = fix.range[0];
  }
  return out;
}

export function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    if (ch === 10) starts.push(i + 1);
    else if (ch === 13) {
      if (source.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    }
  }
  return starts;
}

export function positionOf(lineStarts: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
}

export function formatFinding(f: Located): string {
  return `${f.file}:${f.line}:${f.column} ${f.severity} ${f.code} ${f.message}`;
}
