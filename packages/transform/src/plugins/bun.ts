import type { BunPlugin } from 'bun';
import { mayContainJsx, transform } from '../transform.js';
import { shouldTransform, type PluginOptions } from './unplugin.js';

/**
 * Bun plugin: `Bun.plugin(tsproseBun())` in a preload script, or `plugins: [tsproseBun()]` in `Bun.build`.
 */
export function tsproseBun(options: PluginOptions = {}): BunPlugin {
  return {
    name: 'tsprose-transform',
    setup(build) {
      build.onLoad({ filter: /\.(tsx|jsx)$/ }, async (args) => {
        if (!shouldTransform(args.path, options.include)) return undefined;
        const source = await Bun.file(args.path).text();
        if (!mayContainJsx(source)) return undefined;
        const result = transform(source, args.path, options);
        return { contents: result.code, loader: args.path.endsWith('.jsx') ? 'jsx' : 'tsx' };
      });
    },
  };
}

export default tsproseBun;
