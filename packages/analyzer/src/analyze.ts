import { readFile } from 'node:fs/promises';
import { computeLineStarts, parseProse, positionOf } from '@tsprose/transform/tooling';
import { forEachJsxElement, type EsNode } from './estree.js';
import { checkChildren } from './rules/children.js';
import { checkProps } from './rules/props.js';
import { checkRefs } from './rules/refs.js';
import { checkWhitespace } from './rules/whitespace.js';
import { checkBraces } from './rules/braces.js';
import type { Finding, Located, Manifest, RuleName } from './types.js';

export { computeLineStarts, positionOf };

export interface AnalyzeOptions {
  readonly manifest: Manifest;
  readonly rules?: readonly RuleName[] | undefined;
}

export const ALL_RULES: readonly RuleName[] = ['children', 'props', 'refs', 'whitespace', 'braces'];

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
  if (rules.has('braces')) findings.push(...checkBraces(program, source, options.manifest));
  return findings.sort((a, b) => a.range[0] - b.range[0]);
}

/**
 * Parse and analyze one file. A file with parse errors gets no findings (the recovered AST would produce noise and
 * unsafe fixes): only `errors`.
 */
export function analyzeSource(source: string, fileName: string, options: AnalyzeOptions): { findings: Located[]; errors: string[] } {
  const parsed = parseProse(source, fileName);
  const errors = parsed.errors.map((e) => e.message);
  if (errors.length) return { findings: [], errors };
  const findings = analyzeProgram(parsed.program, source, fileName, options);
  const lineStarts = computeLineStarts(source);
  return {
    findings: findings.map((f) => ({ ...f, file: fileName, ...positionOf(lineStarts, f.range[0]) })),
    errors,
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

/**
 * Fix a source until no fixable finding is left (overlapping fixes need more than one pass), then report what
 * remains. Nothing is fixed in a file with parse errors, and a pass that would break parsing is not applied.
 */
export function fixSource(
  source: string,
  fileName: string,
  options: AnalyzeOptions,
  maxPasses = 10,
): { code: string; findings: Located[]; errors: string[]; passes: number } {
  let code = source;
  let result = analyzeSource(code, fileName, options);
  let passes = 0;
  while (passes < maxPasses && !result.errors.length && result.findings.some((f) => f.fix)) {
    const next = applyFixes(code, result.findings);
    if (next === code) break;
    const nextResult = analyzeSource(next, fileName, options);
    if (nextResult.errors.length) break;
    code = next;
    result = nextResult;
    passes++;
  }
  return { code, findings: result.findings, errors: result.errors, passes };
}

export function formatFinding(f: Located): string {
  return `${f.file}:${f.line}:${f.column} ${f.severity} ${f.code} ${f.message}`;
}
