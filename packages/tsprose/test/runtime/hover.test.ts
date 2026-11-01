// Editor experience guard: JSDoc written on tags and on prop specs must show up on hover in JSX,
// and wrong attribute values must be type errors. Uses the classic TypeScript language service
// (@typescript/typescript6) because the TypeScript 7 beta API exposes no quick info yet.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let ts: typeof import('@typescript/typescript6') | undefined;
try {
  ts = require('@typescript/typescript6');
} catch {
  ts = undefined;
}

const root = join(import.meta.dirname, '..', '..').replace(/\\/g, '/');
const files = ['test/hover/doc.tsx', 'test/hover/tags.ts'].map(
  (f) => `${root}/${f}`,
);

describe.skipIf(!ts)('hover documentation (language service)', () => {
  const T = ts!;
  const options: import('@typescript/typescript6').CompilerOptions = {
    strict: true,
    jsx: T.JsxEmit.ReactJSX,
    jsxImportSource: 'tsprose',
    module: T.ModuleKind.ESNext,
    moduleResolution: T.ModuleResolutionKind.Bundler,
    target: T.ScriptTarget.ESNext,
    lib: ['lib.es2024.d.ts', 'lib.dom.d.ts'],
    paths: {
      tsprose: [`${root}/src/index.ts`],
      'tsprose/jsx-runtime': [`${root}/src/jsx-runtime.ts`],
      'tsprose/jsx-dev-runtime': [`${root}/src/jsx-dev-runtime.ts`],
    },
    skipLibCheck: true,
    noEmit: true,
  };
  const ls = T.createLanguageService(
    {
      getScriptFileNames: () => files,
      getScriptVersion: () => '1',
      getScriptSnapshot: (f) =>
        existsSync(f)
          ? T.ScriptSnapshot.fromString(readFileSync(f, 'utf8'))
          : undefined,
      getCurrentDirectory: () => root,
      getCompilationSettings: () => options,
      getDefaultLibFileName: (o) => T.getDefaultLibFilePath(o),
      fileExists: T.sys.fileExists,
      readFile: T.sys.readFile,
      readDirectory: T.sys.readDirectory,
      directoryExists: T.sys.directoryExists,
      getDirectories: T.sys.getDirectories,
    },
    T.createDocumentRegistry(),
  );
  const doc = files[0]!;
  const text = readFileSync(doc, 'utf8');
  const hover = (needle: string) => {
    const info = ls.getQuickInfoAtPosition(doc, text.indexOf(needle) + 1);
    return info ? T.displayPartsToString(info.documentation) : undefined;
  };

  it('shows tag documentation', () => {
    expect(hover('<P center serif>')).toBe(
      'Paragraph of running text. Accepts only inline content.',
    );
    expect(hover('<Callout')).toBe('A callout box with an icon.');
    expect(hover('<H1>')).toBe('Level-one heading preset.');
  });

  it('shows prop documentation, including kit common props', () => {
    expect(hover('center serif>')).toBe('Center the paragraph horizontally.');
    expect(hover('serif>')).toBe('Serif font for quotations.');
    expect(hover('icon="info"')).toBe('Icon name from the icon set.');
    expect(hover('toc="Note"')).toBe(
      'Put the element into the table of contents (true) or with a custom title (string).',
    );
    // whole-object schema (s.exclusive of s.object members) keeps member prop docs
    expect(hover('answer={42}')).toBe('Expected answer value.');
  });

  it('reports a wrong attribute value as a type error', () => {
    const messages = ls
      .getSemanticDiagnostics(doc)
      .map((d) => T.flattenDiagnosticMessageText(d.messageText, ' '));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(
      "Type 'string' is not assignable to type 'boolean | undefined'",
    );
  });
});
