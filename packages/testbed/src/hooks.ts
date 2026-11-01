// Compile hooks mirroring Erudit's rawToProse hooks: toc, snippets, link graph, schema counts.
import { defineHook, isTextNode, type BaseNode } from 'tsprose';

export interface TocItem {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly level: number;
  readonly children: TocItem[];
}

/** Headings nest by level; other `toc`-marked elements attach to the nearest heading. */
export const tocHook = defineHook<TocItem[]>({
  name: 'toc',
  enter(node, _walk, ctx) {
    if (isTextNode(node)) return;
    const state = ctx as unknown as {
      tocState?: { root: TocItem[]; stack: TocItem[] };
    };
    state.tocState ??= { root: [], stack: [] };
    const { root, stack } = state.tocState;
    const title = node.meta.title as string | undefined;
    if (node.type === 'heading') {
      const level = node.props.level as number;
      const item: TocItem = {
        id: node.id!,
        title: (node.data as { text: string }).text,
        type: 'heading',
        level,
        children: [],
      };
      while (stack.length && stack[stack.length - 1]!.level >= level)
        stack.pop();
      (stack.length ? stack[stack.length - 1]!.children : root).push(item);
      stack.push(item);
      return;
    }
    if (node.meta.toc && title && node.id) {
      const item: TocItem = {
        id: node.id,
        title,
        type: node.type,
        level: 99,
        children: [],
      };
      (stack.length ? stack[stack.length - 1]!.children : root).push(item);
    }
  },
  finish(ctx) {
    const state = ctx as unknown as { tocState?: { root: TocItem[] } };
    return state.tocState?.root ?? [];
  },
});

export interface Snippet {
  readonly id: string;
  readonly type: string;
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly search: boolean;
}

export const snippetHook = defineHook<Snippet[]>({
  name: 'snippets',
  enter(node, _walk, ctx) {
    if (isTextNode(node) || !node.meta.snippet || !node.id) return;
    const list = ((ctx as unknown as { snippets?: Snippet[] }).snippets ??= []);
    const sn = node.meta.snippet as {
      title?: string;
      description?: string;
      search?: boolean;
    };
    list.push({
      id: node.id,
      type: node.type,
      title: (node.meta.title as string | undefined) ?? sn.title,
      description: sn.description,
      search: !!sn.search,
    });
  },
  finish(ctx) {
    return (ctx as unknown as { snippets?: Snippet[] }).snippets ?? [];
  },
});

export const countHook = defineHook<Record<string, number>>({
  name: 'counts',
  enter(node, _walk, ctx) {
    if (isTextNode(node)) return;
    const counts = ((
      ctx as unknown as { counts?: Record<string, number> }
    ).counts ??= {});
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  },
  finish(ctx) {
    return (ctx as unknown as { counts?: Record<string, number> }).counts ?? {};
  },
});

/** Report element titles that collide inside one document (Erudit's uniqueTitles hook). */
export const uniqueTitlesHook = defineHook<Record<string, string>>({
  name: 'uniqueTitles',
  enter(node, _walk, ctx) {
    if (isTextNode(node) || !node.id) return;
    const title = node.meta.title as string | undefined;
    if (!title || node.type === 'heading') return;
    const seen = ((
      ctx as unknown as { titles?: Map<string, BaseNode> }
    ).titles ??= new Map());
    const other = seen.get(title);
    if (other)
      ctx.report(
        'title/duplicate',
        `Title "${title}" is used by <${other.type}> and <${node.type}>`,
        node,
        'warning',
      );
    else seen.set(title, node);
  },
  finish(ctx) {
    const seen =
      (ctx as unknown as { titles?: Map<string, BaseNode> }).titles ??
      new Map<string, BaseNode>();
    return Object.fromEntries(
      [...seen].map(([title, node]) => [node.id!, title]),
    );
  },
});

export const hooks = [tocHook, snippetHook, countHook, uniqueTitlesHook];
