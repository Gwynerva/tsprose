import { resolveChildrenRule, type BaseDef, type Kind, type RefMode } from './def.js';
import { propKeys } from './standard.js';
import { isTag, isTextTemplate, type AnyTag } from './tag.js';

/**
 * A JSON description of the tags available in prose files, for tools that should not import
 * TypeScript (formatters, editor extensions, linters in other processes). Built from the tags
 * with {@link describeTags}; consumed by `@tsprose/fmt` and `@tsprose/analyzer`.
 */
export interface TagsDescription {
  readonly version: 1;
  /** JSX name as written in prose files (`P`, `Problem.Hint`, `m`) → description. */
  readonly tags: Readonly<Record<string, TagDescription>>;
}

export interface ChildrenDescription {
  readonly mode: 'none' | 'kind' | 'tags' | 'any';
  readonly kind?: Kind | undefined;
  /** Allowed child node types (`mode: 'tags'`). */
  readonly types?: readonly string[] | undefined;
  readonly min: number;
  /** `null` = unlimited. */
  readonly max: number | null;
  readonly pattern?: string | undefined;
  readonly counts?: Readonly<Record<string, readonly [number, number | null]>> | undefined;
  /** `inline` when only inline content is accepted: a blank line inside is a space, not a paragraph break. */
  readonly context: 'none' | 'inline' | 'block' | 'mixed';
}

export interface TagDescription {
  /** Node type (`def.name`). */
  readonly type: string;
  readonly kind: Kind;
  readonly ref: RefMode;
  /** Own prop names. */
  readonly props: readonly string[];
  /** Kit common props accepted by this tag. */
  readonly common: readonly string[];
  /** Props fixed by `.with()` presets (cannot be passed again). */
  readonly preset: readonly string[];
  readonly children: ChildrenDescription;
  /** Loose inline content in this block container is wrapped into paragraphs by the kit. */
  readonly wrapsLooseInline: boolean;
  /** The definition rewrites its children (`normalize`): the written children are not what the rule checks. */
  readonly normalizes: boolean;
  /** How it is used: a tag, a tagged template (`m\`…\``) or another function carrying a tag definition. */
  readonly usage: 'tag' | 'template' | 'component';
}

interface DefCarrierLike {
  readonly def: BaseDef;
  readonly tag?: AnyTag;
}

function carriesDef(value: unknown): value is DefCarrierLike {
  if (typeof value !== 'function') return false;
  const def = (value as { def?: BaseDef }).def;
  return !!def && typeof def.name === 'string' && (def.kind === 'block' || def.kind === 'inline');
}

/**
 * Flatten a map of JSX names to tags, including member tags attached to them
 * (`Object.assign(Problem, { Hint })` → `Problem.Hint`). Only values carrying a tag definition are kept:
 * tags, `Tag.template()` functions and components with a `def`.
 */
export function collectTags(entries: Readonly<Record<string, unknown>>): Record<string, DefCarrierLike> {
  const out: Record<string, DefCarrierLike> = {};
  const visit = (name: string, value: unknown, depth: number) => {
    if (!carriesDef(value)) return;
    out[name] = value;
    if (depth > 2) return;
    for (const [member, inner] of Object.entries(value)) {
      if (member === 'def' || member === 'tag' || !/^[A-Z]/.test(member)) continue;
      visit(`${name}.${member}`, inner, depth + 1);
    }
  };
  for (const [name, value] of Object.entries(entries)) visit(name, value, 0);
  return out;
}

/** Describe tags (see {@link TagsDescription}). Accepts the same maps as {@link collectTags}. */
export function describeTags(entries: Readonly<Record<string, unknown>>): TagsDescription {
  const tags: Record<string, TagDescription> = {};
  for (const [name, carrier] of Object.entries(collectTags(entries))) {
    const def = carrier.def;
    const tag: AnyTag | undefined = isTag(carrier) ? carrier : carrier.tag;
    const rule = resolveChildrenRule(def);
    const wraps = !!tag?.kit?.wrapLooseInline && rule.context === 'block';
    tags[name] = {
      type: def.name,
      kind: def.kind,
      ref: def.ref,
      props: [...propKeys(def.props)],
      common: tag?.kit ? Object.keys(tag.kit.commonSpecFor(def)) : [],
      preset: tag?.preset ? Object.keys(tag.preset) : [],
      children: {
        mode: rule.mode,
        ...(rule.kind ? { kind: rule.kind } : {}),
        ...(rule.tags ? { types: [...rule.tags.keys()] } : {}),
        min: rule.min,
        max: Number.isFinite(rule.max) ? rule.max : null,
        ...(rule.pattern ? { pattern: rule.pattern.source } : {}),
        ...(rule.counts
          ? { counts: Object.fromEntries([...rule.counts].map(([t, [min, max]]) => [t, [min, Number.isFinite(max) ? max : null] as const])) }
          : {}),
        context: rule.context,
      },
      wrapsLooseInline: wraps,
      normalizes: typeof def.normalize === 'function',
      usage: isTag(carrier) ? 'tag' : isTextTemplate(carrier) ? 'template' : 'component',
    };
  }
  return { version: 1, tags };
}

export function isTagsDescription(value: unknown): value is TagsDescription {
  return typeof value === 'object' && value !== null && (value as TagsDescription).version === 1 && typeof (value as TagsDescription).tags === 'object';
}
