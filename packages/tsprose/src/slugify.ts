/**
 * Default slugifier: Unicode letters and digits are kept (lower-cased), diacritics are stripped,
 * everything else becomes a single `-`. Integrators plug language-aware versions
 * (transliteration etc.) via `compile({ slugify })`.
 */
export function slugify(text: string): string {
  return text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1-$2')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
