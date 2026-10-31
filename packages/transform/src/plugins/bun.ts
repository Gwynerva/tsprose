import { readFile } from 'node:fs/promises';
import { mayContainJsx, transform } from '../transform.js';
import { shouldTransform, type PluginOptions } from './unplugin.js';

/** The part of Bun's `BunPlugin` type this plugin uses (inlined so `@types/bun` is not required). */
export interface TSProseBunPlugin {
  name: string;
  setup(build: {
    onLoad(
      constraints: { filter: RegExp },
      callback: (args: { path: string }) => Promise<{ contents: string; loader: 'tsx' | 'jsx' } | undefined>,
    ): unknown;
  }): void;
}

/**
 * Bun plugin: `Bun.plugin(tsproseBun())` in a preload script, or `plugins: [tsproseBun()]` in `Bun.build`.
 */
export function tsproseBun(options: PluginOptions = {}): TSProseBunPlugin {
  return {
    name: 'tsprose-transform',
    setup(build) {
      build.onLoad({ filter: /\.(tsx|jsx)$/ }, async (args) => {
        if (!shouldTransform(args.path, options.include)) return undefined;
        const source = await readFile(args.path, 'utf8');
        if (!mayContainJsx(source)) return undefined;
        const result = transform(source, args.path, options);
        // Parse errors: hand Bun the original source so it reports them itself.
        if (result.errors.length || result.code === source) return undefined;
        return { contents: result.code, loader: args.path.endsWith('.jsx') ? 'jsx' : 'tsx' };
      });
    },
  };
}

export default tsproseBun;
