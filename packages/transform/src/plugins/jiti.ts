import { mayContainJsx, transform } from '../transform.js';
import { shouldTransform, type PluginOptions } from './unplugin.js';

export interface JitiTransformInput {
  readonly source: string;
  readonly filename?: string | undefined;
  readonly ts?: boolean | undefined;
  [key: string]: unknown;
}

/**
 * Wrap a jiti `transform` option so prose files pass through the TSProse whitespace rule first:
 *
 * ```ts
 * const jiti = createJiti(root, { transform: withTSProse(myTransform) });
 * ```
 */
export function withTSProse<T extends JitiTransformInput, R>(next: (opts: T) => R, options: PluginOptions = {}): (opts: T) => R {
  return (opts) => {
    const filename = opts.filename;
    if (!filename || !shouldTransform(filename, options.include) || !mayContainJsx(opts.source)) return next(opts);
    const result = transform(opts.source, filename, options);
    return next(result.code !== opts.source ? { ...opts, source: result.code } : opts);
  };
}

/** Pre-transform a single source (for loaders that expose a plain `(source, filename)` hook). */
export function transformSource(source: string, filename: string, options: PluginOptions = {}): string {
  if (!shouldTransform(filename, options.include) || !mayContainJsx(source)) return source;
  return transform(source, filename, options).code;
}
