import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli.js';
import { format } from '../src/format.js';
import { formatAsync } from '../src/pipeline.js';
import { isInlineContainer, kindOf } from './fixtures.js';

const options = { printWidth: 60, kindOf, isInlineContainer };

describe('template literal children classify like string literals', () => {
  it.each([
    ['space', 'const x = <P>a{` `}<B>b</B></P>;', "const x = <P>a{' '}<B>b</B></P>;"],
    ['glue', 'const x = <P>a{``}<B>b</B></P>;', 'const x = <P>a{""}<B>b</B></P>;'],
    ['paragraph break', 'const x = <Li>\n  a\n  {`\\u2029`}\n  b\n</Li>;', 'const x = <Li>\n  a\n  {"\\u2029"}\n  b\n</Li>;'],
  ])('%s', (_name, template, literal) => {
    expect(format(template, 'doc.tsx', options).code).toBe(format(literal, 'doc.tsx', options).code);
  });
});

describe('preFormat keeps prose templates only when the pairs match', () => {
  const src = 'const x = (\n  <P>\n    {m`a+b`} and {m`c`}\n  </P>\n);';

  it('restores templates whose tag and text are unchanged', async () => {
    const out = await formatAsync(src, 'doc.tsx', { ...options, preFormat: (code) => code.replace('m`a+b`', 'm `a+b`') });
    expect(out.code).toContain('{m`a+b`}');
  });

  it('keeps the formatter output when a pair differs', async () => {
    const out = await formatAsync(src, 'doc.tsx', { ...options, preFormat: (code) => code.replace('m`c`', 'm`d`') });
    expect(out.code).toContain('{m`d`}');
  });
});

describe('tsprose-fmt arguments', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tsprose-fmt-'));
    await writeFile(join(dir, 'a.tsx'), 'const x = <P>text</P>;\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('--help exits 0', async () => {
    expect(await main(['--help'])).toBe(0);
  });

  it.each([
    [['--width', 'abc', 'a.tsx']],
    [['--width', '0', 'a.tsx']],
    [['--width']],
    [['--config']],
    [['--bogus', 'a.tsx']],
    [[]],
  ])('%j exits 2', async (argv) => {
    expect(await main(argv)).toBe(2);
  });

  it('missing paths and configs exit 2', async () => {
    expect(await main(['--check', join(dir, 'nope')])).toBe(2);
    expect(await main(['--check', join(dir, 'a.tsx'), '--config', join(dir, 'nope.ts')])).toBe(2);
  });

  it('--check on a formatted file exits 0', async () => {
    expect(await main(['--check', join(dir, 'a.tsx'), '--width', '80'])).toBe(0);
  });
});
