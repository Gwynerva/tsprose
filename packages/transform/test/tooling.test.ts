import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BLANK_RUN,
  classifyJsxChild,
  computeLineStarts,
  detectEol,
  hasBlankLine,
  langOf,
  loadTsproseConfig,
  missingPaths,
  parseProse,
  positionOf,
  restoreEol,
  toLf,
  walkAst,
  walkProseFiles,
  type OxcNode,
} from '../src/tooling.js';

/** Kinds of the children of the first JSX element in `jsx`. */
function kinds(jsx: string): string[] {
  const source = `const x = ${jsx};`;
  let children: OxcNode[] = [];
  walkAst<OxcNode>(parseProse(source, 'doc.tsx').program, (n) => {
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      children = n.children as OxcNode[];
      return false;
    }
  });
  return children.map((c) => classifyJsxChild(c, source).kind);
}

describe('classifyJsxChild', () => {
  it.each([
    ['text and whitespace', '<P>\n  word\n  <B>b</B>\n</P>', ['text', 'element', 'whitespace']],
    ['explicit space', "<P>a{' '}b</P>", ['text', 'space', 'text']],
    ['whitespace-only strings are spaces', "<P>a{'\\n  '}b</P>", ['text', 'space', 'text']],
    ['glue', '<P>a{""}b</P>', ['text', 'glue', 'text']],
    ['paragraph break', '<P>a{"\\u2029"}b</P>', ['text', 'break', 'text']],
    ['comment', '<P>a{/* c */}b</P>', ['text', 'comment', 'text']],
    ['static strings', "<P>{'x'}</P>", ['string']],
    ['templates without substitutions classify like strings', '<P>{` `}{``}{`\\u2029`}{`x`}</P>', ['space', 'glue', 'break', 'string']],
    ['templates with substitutions', '<P>{`a${b}`}</P>', ['template']],
    ['other literals', '<P>{1}{null}{true}</P>', ['literal', 'literal', 'literal']],
    ['elements, fragments, expressions', '<P><B>b</B><>f</>{x}{f()}</P>', ['element', 'fragment', 'expression', 'expression']],
  ])('%s', (_name, jsx, expected) => {
    expect(kinds(jsx)).toEqual(expected);
  });

  it('names elements, member and namespaced names included', () => {
    const source = 'const x = <P><List.Item /><svg:path /></P>;';
    const names: (string | undefined)[] = [];
    walkAst<OxcNode>(parseProse(source, 'doc.tsx').program, (n) => {
      if (n.type !== 'JSXExpressionContainer' && n.type === 'JSXElement') {
        for (const c of n.children as OxcNode[]) {
          const child = classifyJsxChild(c, source);
          if (child.kind === 'element') names.push(child.name);
        }
        return false;
      }
    });
    expect(names).toEqual(['List.Item', 'svg:path']);
  });
});

describe('parseProse', () => {
  it.each([
    ['a.tsx', 'tsx'],
    ['a.jsx', 'jsx'],
    ['a.ts', 'ts'],
    ['a.mts', 'ts'],
    ['a.cts', 'ts'],
    ['a.js', 'jsx'],
    ['a.tsx?v=1', 'tsx'],
  ])('%s → %s', (file, lang) => {
    expect(langOf(file)).toBe(lang);
  });

  it('reads `<T>x` in .ts files as a type assertion, not JSX', () => {
    expect(parseProse('const y = <string>x;', 'a.ts').errors).toEqual([]);
    expect(parseProse('const y = <string>x;', 'a.tsx').errors.length).toBeGreaterThan(0);
  });
});

describe('line endings', () => {
  it.each([
    ['a\nb\n', '\n'],
    ['a\r\nb\r\n', '\r\n'],
    ['a\r\nb\r\nc\n', '\r\n'],
    ['a\r\nb\nc\n', '\n'],
    ['', '\n'],
    ['a\rb\rc\r\n', '\n'],
  ])('detectEol(%j) → %j', (source, eol) => {
    expect(detectEol(source)).toBe(eol);
  });

  it('toLf normalizes CRLF, lone CR and doubled CR', () => {
    expect(toLf('a\r\nb\rc\nd\r\r\ne')).toBe('a\nb\nc\nd\ne');
  });

  it('restoreEol round-trips uniform files', () => {
    const crlf = 'a\r\n\r\nb\r\n';
    expect(restoreEol(toLf(crlf), detectEol(crlf))).toBe(crlf);
    expect(restoreEol('a\nb', '\n')).toBe('a\nb');
  });

  it('positions count CRLF and lone CR as one line break', () => {
    const source = 'a\r\nb\rc\nd';
    const starts = computeLineStarts(source);
    expect(starts).toEqual([0, 3, 5, 7]);
    expect(positionOf(starts, source.indexOf('d'))).toEqual({ line: 4, column: 1 });
  });

  it('BLANK_RUN: CRLF is not a blank line, two of them are', () => {
    expect(hasBlankLine('a\r\nb')).toBe(false);
    expect(hasBlankLine('a\r\n  \r\nb')).toBe(true);
    expect(hasBlankLine('a\r\rb')).toBe(true);
    expect('a\n\nb\n \nc'.split(BLANK_RUN)).toEqual(['a', '\n\n', 'b', '\n \n', 'c']);
  });
});

describe('files and config', () => {
  const dirs: string[] = [];
  const tempDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tsprose-tooling-'));
    dirs.push(dir);
    return dir;
  };
  afterAll(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  it('walkProseFiles skips node_modules and dot entries; missingPaths lists absent paths', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'a.tsx'), '');
    await writeFile(join(dir, 'b.ts'), '');
    await writeFile(join(dir, '.hidden.tsx'), '');
    const files: string[] = [];
    for await (const file of walkProseFiles(dir)) files.push(file);
    expect(files).toEqual([join(dir, 'a.tsx')]);
    expect(await missingPaths([dir, join(dir, 'nope')])).toEqual([join(dir, 'nope')]);
  });

  it('loads a JSON tags description as { manifest }', async () => {
    const dir = await tempDir();
    const file = join(dir, 'tags.json');
    await writeFile(file, JSON.stringify({ version: 1, tags: { P: {} } }));
    const loaded = await loadTsproseConfig(file);
    expect(loaded.config.manifest).toEqual({ version: 1, tags: { P: {} } });
    await writeFile(file, '{"nope":1}');
    await expect(loadTsproseConfig(file)).rejects.toThrow(/tags description/);
  });

  it('resolves a manifest path relative to the config and warns about conflicting keys', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'tags.json'), JSON.stringify({ version: 1, tags: {} }));
    await writeFile(join(dir, 'tsprose.config.mjs'), "export default { manifest: './tags.json', inlineTags: ['B'], compactContainers: ['Table'], printWidth: 80 };");
    const loaded = await loadTsproseConfig(join(dir, 'tsprose.config.mjs'));
    expect(loaded.config.manifest).toEqual({ version: 1, tags: {} });
    expect(loaded.config.printWidth).toBe(80);
    expect(loaded.warnings).toHaveLength(2);
    expect(loaded.warnings[0]).toMatch(/"manifest" and "inlineTags"/);
    expect(loaded.warnings[1]).toMatch(/compactContainers/);
  });
});
