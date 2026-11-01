import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  quoteWindowsArg,
  resolveConfigPath,
  spawnSpec,
  splitCommand,
} from '../src/command.js';

describe('splitCommand', () => {
  it.each([
    ['bunx tsprose-fmt', ['bunx', 'tsprose-fmt']],
    ['  bun   x  tsprose-fmt ', ['bun', 'x', 'tsprose-fmt']],
    [
      '"C:/Program Files/bun/bun.exe" x tsprose-fmt',
      ['C:/Program Files/bun/bun.exe', 'x', 'tsprose-fmt'],
    ],
    ["node './my tools/fmt.js'", ['node', './my tools/fmt.js']],
    ['a "" b', ['a', '', 'b']],
  ])('%s', (command, words) => {
    expect(splitCommand(command)).toEqual(words);
  });
});

describe('spawnSpec', () => {
  const args = ['--stdin', '--stdin-filepath', 'C:/My Docs/a&b/article.tsx'];

  it('POSIX: no shell, arguments untouched', () => {
    expect(spawnSpec('bunx tsprose-fmt', args, 'linux')).toEqual({
      file: 'bunx',
      args: ['tsprose-fmt', ...args],
      shell: false,
    });
  });

  it('Windows: one quoted command line through cmd.exe', () => {
    expect(spawnSpec('bunx tsprose-fmt', args, 'win32')).toEqual({
      file: 'bunx tsprose-fmt --stdin --stdin-filepath "C:/My Docs/a&b/article.tsx"',
      args: [],
      shell: true,
    });
  });

  it('rejects an empty command', () => {
    expect(() => spawnSpec('  ', [], 'linux')).toThrow(/empty/);
  });

  it('quotes what cmd.exe would interpret', () => {
    expect(quoteWindowsArg('C:\\a\\b.tsx')).toBe('C:\\a\\b.tsx');
    expect(quoteWindowsArg('a b')).toBe('"a b"');
    expect(quoteWindowsArg('x|y')).toBe('"x|y"');
    expect(quoteWindowsArg('')).toBe('""');
  });
});

describe('resolveConfigPath', () => {
  it('absolute settings are kept', () => {
    const absolute = resolve('/cfg/tsprose.config.ts');
    expect(resolveConfigPath(absolute, '/ws', '/ws/a.tsx')).toBe(absolute);
  });

  it('empty setting: no config', () => {
    expect(resolveConfigPath('', '/ws', '/ws/content/a.tsx')).toBeUndefined();
  });

  it('relative to the workspace folder, or to the document outside a workspace', () => {
    expect(
      resolveConfigPath('tsprose.config.ts', '/ws', '/ws/content/a.tsx'),
    ).toBe(resolve('/ws', 'tsprose.config.ts'));
    expect(
      resolveConfigPath('tsprose.config.ts', undefined, '/elsewhere/doc/a.tsx'),
    ).toBe(resolve('/elsewhere/doc', 'tsprose.config.ts'));
  });
});
