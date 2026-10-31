// Small internal helpers shared by the core modules.

/** Message of a thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A plain object (`{}` literal or `Object.create(null)`), not a class instance, array, proxy-of-class, … */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Locale-independent string order (stable output for generated files and listings). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Run `fn` over `items` with at most `limit` in flight. Stops taking new items once `signal` is aborted.
 * `fn` must not throw (callers turn failures into diagnostics).
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number | undefined,
  fn: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      await fn(items[next++]!);
    }
  };
  const width = Math.max(1, Math.min(limit ?? 8, items.length));
  await Promise.all(Array.from({ length: width }, worker));
}
