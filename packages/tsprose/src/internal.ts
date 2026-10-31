/**
 * Low-level building blocks of tsprose for integrations and sibling packages (formatters, analyzers, adapters):
 * children building, node internals, schema metadata, hashing helpers. Less stable than the main entry.
 */
export { refMetaOf, refPropsOf, refPropsOfProps, runSync, validateProps, withRefMeta } from './standard.js';
export type { PropIssue } from './standard.js';
export { compilePattern } from './pattern.js';
export type { CompiledPattern } from './pattern.js';
export { FRAGMENT_TYPE, TEXT_TYPE, makeTextNode } from './node.js';
export { REF, isRefs } from './ref.js';
export { buildChildren, describeNode, normalizeWhitespace, segmentLooseInline } from './children.js';
export type { BuildChildrenArgs, LooseSegment } from './children.js';
export { DEF, KIT, REF_HANDLE, attachDef, createElement, getDef, getKit, getRefHandle, instantiate } from './element.js';
export { TAG, TEMPLATE, makeDefiners, normalizeDef } from './tag.js';
export { wrapperOf } from './kit.js';
export { DOCUMENT, ROOT_TYPE, evaluateDocument } from './document.js';
export { copyData, forEachReference, labelOf } from './walk.js';
export { contentHash, isJsonNodeSlot } from './json.js';
export { POSITION_PROP } from './jsx-runtime.js';
