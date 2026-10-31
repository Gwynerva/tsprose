import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { describeTags } from 'tsprose';
import { main } from '../src/cli.js';
import { manifestWrapping } from './fixtures.js';

let dir: string;
let tagsJson: string;
const logs: string[] = [];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tsprose-check-'));
  tagsJson = join(dir, 'tags.json');
  await writeFile(tagsJson, JSON.stringify(describeTags(manifestWrapping.tags)));
  await writeFile(join(dir, 'good.tsx'), 'const x = <P>text</P>;\n');
  vi.spyOn(console, 'log').mockImplementation((...args) => void logs.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args) => void logs.push(args.join(' ')));
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const file = async (name: string, source: string) => {
  const path = join(dir, name);
  await writeFile(path, source);
  return path;
};

describe('tsprose check exit codes', () => {
  it('0 without errors', async () => {
    expect(await main(['check', join(dir, 'good.tsx'), '--config', tagsJson])).toBe(0);
  });

  it('1 on error findings', async () => {
    const bad = await file('bad.tsx', 'const x = <P>text <Qed /></P>;\n');
    expect(await main(['check', bad, '--config', tagsJson])).toBe(1);
  });

  it('1 on parse errors, and --fix leaves the broken file alone', async () => {
    const source = 'const x = (\n  <P>\n    word{" "}\n    <B>b</B>\n  </P>\n);\nconst y = <P>unclosed;\n';
    const broken = await file('broken.tsx', source);
    expect(await main(['check', broken, '--config', tagsJson, '--fix'])).toBe(1);
    expect(await readFile(broken, 'utf8')).toBe(source);
  });

  it('2 on usage and setup errors', async () => {
    const good = join(dir, 'good.tsx');
    expect(await main(['lint', good])).toBe(2);
    expect(await main(['check', good])).toBe(2);
    expect(await main(['check', good, '--config'])).toBe(2);
    expect(await main(['check', good, '--config', tagsJson, '--rules', 'children,nope'])).toBe(2);
    expect(await main(['check', good, '--config', tagsJson, '--bogus'])).toBe(2);
    expect(await main(['check', join(dir, 'missing'), '--config', tagsJson])).toBe(2);
    expect(await main(['check', good, '--config', join(dir, 'missing.json')])).toBe(2);
  });

  it('--rules limits the rules', async () => {
    const bad = await file('bad-props.tsx', 'const x = <P centre>text</P>;\n');
    expect(await main(['check', bad, '--config', tagsJson, '--rules', 'children'])).toBe(0);
    expect(await main(['check', bad, '--config', tagsJson, '--rules', 'props'])).toBe(1);
  });

  it('--fix writes the fixed file (transform mode: redundant space hacks)', async () => {
    const path = await file('fix.tsx', "const x = (\n  <P>\n    word{' '}\n    <B>b</B>\n  </P>\n);\n");
    expect(await main(['check', path, '--config', tagsJson, '--fix'])).toBe(0);
    expect(await readFile(path, 'utf8')).toBe('const x = (\n  <P>\n    word\n    <B>b</B>\n  </P>\n);\n');
  });

  it('a config module with a JSON manifest path goes through toManifest', async () => {
    await writeFile(join(dir, 'tsprose.config.mjs'), "export default { manifest: './tags.json', printWidth: 100 };");
    const bad = await file('bad2.tsx', 'const x = <P>text <Qed /></P>;\n');
    expect(await main(['check', bad, '--config', join(dir, 'tsprose.config.mjs')])).toBe(1);
    expect(logs.some((l) => l.includes('children/kind'))).toBe(true);
  });
});
