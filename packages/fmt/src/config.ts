import {
  loadTsproseConfig,
  type TsproseConfig,
} from '@tsprose/transform/tooling';
import type { Kind } from './format.js';
import {
  inlineContainerFromTags,
  kindOfFromLists,
  kindOfFromTags,
  optionsFromDescription,
  type TagsDescriptionLike,
} from './kinds.js';
import type { PipelineOptions, PreFormat } from './pipeline.js';

/**
 * Formatter options from a `tsprose.config.ts` (see `TsproseConfig` in `@tsprose/transform/tooling`). Tag kinds come
 * from the first of `manifest`, `tags` (+ `inlineComponents`) or `inlineTags`/`blockTags`/`inlineContainers`.
 */
export function fmtOptionsFromConfig(config: TsproseConfig): PipelineOptions {
  let kindOf: ((name: string) => Kind) | undefined;
  let isInlineContainer: ((name: string) => boolean) | undefined;
  let blockCalls = config.blockCalls;
  if (config.manifest && typeof config.manifest === 'object') {
    const fromManifest = optionsFromDescription(
      config.manifest as TagsDescriptionLike,
    );
    kindOf = fromManifest.kindOf;
    isInlineContainer = fromManifest.isInlineContainer;
    blockCalls = [...fromManifest.blockCalls, ...(config.blockCalls ?? [])];
  } else if (config.tags) {
    const tags = config.tags as Parameters<typeof kindOfFromTags>[0];
    kindOf = kindOfFromTags(tags, config.inlineComponents ?? []);
    isInlineContainer = inlineContainerFromTags(tags);
  } else if (config.inlineTags) {
    kindOf = kindOfFromLists(config.inlineTags, config.blockTags ?? []);
    const inline = new Set([
      ...config.inlineTags,
      ...(config.inlineContainers ?? []),
    ]);
    isInlineContainer = (name) => inline.has(name);
  }
  const compact =
    config.separateBlocks === true && config.compactContainers?.length
      ? new Set(config.compactContainers)
      : undefined;
  return {
    printWidth: config.printWidth,
    indent: config.indent,
    transform: config.transform,
    kindOf,
    isInlineContainer,
    blockCalls,
    separateBlocks: compact
      ? (name: string | undefined) => name === undefined || !compact.has(name)
      : config.separateBlocks,
    closing: config.closing,
    opening: config.opening,
    preFormat: config.preFormat as PreFormat | undefined,
    refFirst: config.refFirst,
  };
}

/** Load a `tsprose.config.ts` (or a JSON tags description) as formatter options, with the loader's warnings. */
export async function loadFmtConfig(
  path: string,
): Promise<{ options: PipelineOptions; warnings: readonly string[] }> {
  const loaded = await loadTsproseConfig(path);
  return {
    options: fmtOptionsFromConfig(loaded.config),
    warnings: loaded.warnings,
  };
}
