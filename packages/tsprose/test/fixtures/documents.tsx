// A tiny corpus: an article with refs, a summary that includes and links to it, and a broken document.
import { defineDocument, defineRefs, Include, defineInline, refSchema } from 'tsprose';
import { B, Details, H1, Heading, Image, P, Proof, Qed, Sec, Theorem } from './tags.js';

/** Link tag: `to` accepts any ref handle; compile turns it into an outgoing reference. */
export const Link = defineInline({ name: 'link', props: { to: refSchema() }, children: 'inline' });

//
// article
//

export const articleRefs = defineRefs('file:///corpus/article/refs.ts', {
  pythagoras: Theorem,
  intro: P,
  _why: Details,
  diagram: Image,
});

export const article = defineDocument(
  () => (
    <>
      <H1>Right triangles</H1>
      <P $={articleRefs.intro}>
        A <B>right triangle</B> has one right angle.
      </P>
      <Theorem $={articleRefs.pythagoras} title="Pythagorean theorem">
        <P>
          The square of the hypotenuse equals the sum of the squares of the legs.
        </P>
        <Proof>
          <P>
            Rearrange four copies of the triangle (see the <Link to={articleRefs.intro}>introduction</Link>).
          </P>
          <Details $={articleRefs._why} title="Why four?">
            <P>Because the square has four corners.</P>
          </Details>
          <Qed />
        </Proof>
      </Theorem>
      <Image $={articleRefs.diagram} src="triangle.svg" width={300} />
      <Image src="triangle.svg" />
      <Sec>
        <P>Same text twice.</P>
        <P>Same text twice.</P>
      </Sec>
    </>
  ),
  { refs: articleRefs },
);

//
// summary (includes the theorem, links to the intro)
//

export const summaryRefs = defineRefs('file:///corpus/summary/refs.ts', { recap: P });

export const summary = defineDocument(
  () => (
    <>
      <Heading level={1}>Summary</Heading>
      <P $={summaryRefs.recap}>
        See the <Link to={articleRefs.intro}>introduction</Link>.
      </P>
      <Include of={articleRefs.pythagoras} meta={{ toc: 'Theorem' }} />
    </>
  ),
  { refs: summaryRefs },
);

//
// broken: unused ref, foreign ref as $, duplicate string refs, missing title
//

export const brokenRefs = defineRefs('file:///corpus/broken/refs.ts', { unused: P, used: P });

export const broken = defineDocument(
  () => (
    <>
      <P $={brokenRefs.used}>ok</P>
      <P $={articleRefs.intro as never}>foreign</P>
      <P $="twice">one</P>
      <P $="twice">two</P>
      <Theorem $="thm" title={'' as string} level={'x' as never}>
        <Qed />
      </Theorem>
      loose inline text at root
    </>
  ),
  { refs: brokenRefs },
);

//
// include cycle: a includes b, b includes a
//

export const cycleARefs = defineRefs('file:///corpus/cycle-a/refs.ts', { a: P });
export const cycleBRefs = defineRefs('file:///corpus/cycle-b/refs.ts', { b: P });
export const cycleA = defineDocument(
  () => (
    <>
      <P $={cycleARefs.a}>A</P>
      <Include of={cycleBRefs.b} />
    </>
  ),
  { refs: cycleARefs },
);
export const cycleB = defineDocument(
  () => (
    <>
      <P $={cycleBRefs.b}>B</P>
      <Include of={cycleARefs.a} />
    </>
  ),
  { refs: cycleBRefs },
);
