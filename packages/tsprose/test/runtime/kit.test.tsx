import { describe, expect, it } from 'vitest';
import { type BaseNode, isTag, isTextNode, createElement } from 'tsprose';
import { KB, KCallout, KDetails, KHr, kit } from '../fixtures/kit.js';
import { B, Qed, P } from '../fixtures/tags.js';

const codes = (node: BaseNode) => (node.diagnostics ?? []).map((d) => d.code);

describe('createTagKit', () => {
  it('adds common props to referable tags and validates them into meta', () => {
    const node = KCallout({ icon: 'info', toc: 'Note', snippet: { search: true }, children: <Qed /> });
    expect(node.props).toEqual({ icon: 'info' });
    expect(node.meta).toEqual({ toc: 'Note', snippet: { search: true }, title: 'Note' });
    expect(node.diagnostics).toBeUndefined();
  });

  it('always-props apply to every tag, refable-props only to referable ones', () => {
    expect(KHr({ debugLabel: 'x' }).meta).toEqual({ debugLabel: 'x' });
    const bad = KHr({ toc: true } as never);
    expect(codes(bad)).toEqual(['props/unknown']);
    expect(kit.kit.commonSpecFor(KHr.def)).toHaveProperty('debugLabel');
    expect(kit.kit.commonSpecFor(KHr.def)).not.toHaveProperty('toc');
  });

  it('per-tag opt-out removes a common prop', () => {
    const spec = kit.kit.commonSpecFor(KDetails.def);
    expect(Object.keys(spec).sort()).toEqual(['debugLabel', 'toc']);
    const node = KDetails({ $: 'd', title: 'T', snippet: { search: true }, children: <Qed /> } as never);
    expect(codes(node)).toEqual(['props/unknown']);
  });

  it('onElement can derive meta and report', () => {
    const titled = KDetails({ $: 'd', title: 'From prop', toc: true, children: <Qed /> });
    expect(titled.meta.title).toBe('From prop');
    const warned = KCallout({ icon: 'i', toc: true, children: <Qed /> });
    expect(warned.diagnostics).toEqual([
      expect.objectContaining({ code: 'kit/toc-title', severity: 'warning' }),
    ]);
  });

  it('wraps loose inline content in block containers', () => {
    const invalid = createElement('b-stub', {});
    const node = KCallout({ icon: 'i', children: ['Hello ', invalid, ' world', <Qed />, 'tail'] });
    // 'b-stub' is an invalid tag (string) → fragment with diagnostics, lifted to parent
    expect(node.children!.map((c) => c.type)).toEqual(['paragraph', 'qed', 'paragraph']);
    const first = node.children![0] as BaseNode;
    expect(first.children!.map((c) => (isTextNode(c) ? c.text : c.type))).toEqual(['Hello world']);
    expect(codes(node)).toEqual(['tag/invalid']);
  });

  it('splits loose inline content into paragraphs at U+2029 (blank line = new paragraph)', () => {
    const node = KCallout({
      icon: 'i',
      children: ['First para with ', <B>bold</B>, ' end.\u2029', <B>Bold</B>, ' starts the second para.\u2029\u2029', 'Third.', <Qed />, 'Fourth.\u2029'],
    });
    expect(node.children!.map((c) => c.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'qed', 'paragraph']);
    const texts = (i: number) => (node.children![i] as BaseNode).children!.map((c) => (isTextNode(c) ? c.text : `<${c.type}>`));
    expect(texts(0)).toEqual(['First para with ', '<bold>', ' end.']);
    expect(texts(1)).toEqual(['<bold>', ' starts the second para.']);
    expect(texts(2)).toEqual(['Third.']);
    expect(texts(4)).toEqual(['Fourth.']);
    expect(codes(node)).toEqual([]);
  });

  it('a separator-only text between two inline tags still splits paragraphs', () => {
    const node = KCallout({ icon: 'i', children: [<B>a</B>, '\u2029', <B>b</B>, ' tail'] });
    expect(node.children!.map((c) => c.type)).toEqual(['paragraph', 'paragraph']);
    expect(codes(node)).toEqual([]);
  });

  it('compile splits loose root text into paragraphs too', async () => {
    const { compile } = await import('tsprose');
    const result = await compile(<>{['One ', <B>b</B>, '.\u2029', <B>Two</B>, ' starts.']}</>, { kit: kit.kit });
    expect(result.diagnostics).toEqual([]);
    expect(result.root.children!.map((c) => c.type)).toEqual(['paragraph', 'paragraph']);
    expect((result.root.children![1] as BaseNode).children![0]!.type).toBe('bold');
  });

  it('U+2029 inside an inline container is plain whitespace', () => {
    const node = P({ children: ['a\u2029b', <B>{'c\u2029d'}</B>] });
    expect(node.children!.map((c) => (isTextNode(c) ? c.text : c.type))).toEqual(['a b', 'bold']);
    expect(((node.children![1] as BaseNode).children![0] as { text: string }).text).toBe('c d');
  });

  it('wrapper carries the position of the first wrapped child when available', () => {
    const node = KCallout({ icon: 'i', children: ['Hello ', <P>already</P>] });
    expect(node.children!.map((c) => c.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('adopt re-creates a foreign tag inside the kit', () => {
    expect(isTag(KB)).toBe(true);
    expect(KB.def).toBe(P.def);
    const node = KB({ toc: 'Adopted', children: 'x' });
    expect(node.meta.title).toBe('Adopted');
    // the original is untouched
    expect(codes(P({ toc: 'x', children: 'x' } as never))).toEqual(['props/unknown']);
  });
});
