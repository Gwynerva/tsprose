import type { Kind } from './format.js';

interface TagLike {
  readonly def: { readonly kind: 'block' | 'inline'; readonly children?: unknown };
}

/** Tags whose children are inline-only (`children: 'inline'` or `{ of: 'inline' }`): blank lines inside are spaces. */
export function inlineContainerFromTags(tags: Readonly<Record<string, TagLike>>): (name: string) => boolean {
  return (name) => {
    const tag = tags[name];
    if (!tag) return false;
    if (tag.def.kind === 'inline') return true;
    const children = tag.def.children as unknown;
    const of = children && typeof children === 'object' ? (children as { of?: unknown }).of : children;
    return of === 'inline';
  };
}

/** Build `kindOf` from a JSX-name → tag map (a TSProse manifest's `tags`). */
export function kindOfFromTags(tags: Readonly<Record<string, TagLike>>, inlineComponents: readonly string[] = []): (name: string) => Kind {
  const inline = new Set(inlineComponents);
  return (name) => tags[name]?.def.kind ?? (inline.has(name) ? 'inline' : 'unknown');
}

/** Build `kindOf` from plain name lists (no tsprose import needed, e.g. in editor integrations). */
export function kindOfFromLists(inlineTags: readonly string[], blockTags: readonly string[] = []): (name: string) => Kind {
  const inline = new Set(inlineTags);
  const block = new Set(blockTags);
  return (name) => (inline.has(name) ? 'inline' : block.has(name) ? 'block' : 'unknown');
}

/** Structural subset of tsprose's `TagsDescription` (`describeTags` output) that the formatter reads. */
export interface TagsDescriptionLike {
  readonly version: 1;
  readonly tags: Readonly<
    Record<string, { readonly kind: 'block' | 'inline'; readonly usage?: string; readonly children: { readonly context: string } }>
  >;
}

/**
 * Formatter options from a JSON tags description: tag kinds (member tags included), inline-only containers,
 * and block-producing templates (`{display\`…\`}`) — nothing to list by hand.
 */
export function optionsFromDescription(description: TagsDescriptionLike): {
  kindOf: (name: string) => Kind;
  isInlineContainer: (name: string) => boolean;
  blockCalls: string[];
} {
  const tags = description.tags;
  return {
    kindOf: (name) => (tags[name] && tags[name]!.usage !== 'template' ? tags[name]!.kind : 'unknown'),
    isInlineContainer: (name) => tags[name]?.kind === 'inline' || tags[name]?.children.context === 'inline',
    blockCalls: Object.entries(tags)
      .filter(([, d]) => d.usage === 'template' && d.kind === 'block')
      .map(([name]) => name),
  };
}
