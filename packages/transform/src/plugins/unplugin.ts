import { createUnplugin, type UnpluginInstance } from 'unplugin';
import {
  mayContainJsx,
  transform,
  type TransformOptions,
} from '../transform.js';

export interface PluginOptions extends TransformOptions {
  /** Files to transform (default: every `.tsx`/`.jsx` outside node_modules). */
  readonly include?: ((id: string) => boolean) | RegExp | undefined;
}

export function shouldTransform(
  id: string,
  include: PluginOptions['include'],
): boolean {
  const clean = id.split('?')[0]!;
  if (clean.includes('/node_modules/') || clean.includes('\\node_modules\\'))
    return false;
  if (include === undefined) return /\.(tsx|jsx)$/.test(clean);
  return include instanceof RegExp ? include.test(clean) : include(clean);
}

/** unplugin instance: `.vite()`, `.rollup()`, `.esbuild()`, `.webpack()`, … */
export const tsprose: UnpluginInstance<PluginOptions | undefined, false> =
  createUnplugin<PluginOptions | undefined, false>((options = {}) => ({
    name: 'tsprose-transform',
    enforce: 'pre',
    transformInclude(id) {
      return shouldTransform(id, options.include);
    },
    transform(code, id) {
      if (!mayContainJsx(code)) return null;
      const result = transform(code, id.split('?')[0]!, options);
      // Parse errors: leave the file alone so the bundler reports them on the original source.
      if (result.errors.length || result.code === code) return null;
      return { code: result.code, map: result.map };
    },
  }));

export default tsprose;
