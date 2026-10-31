import { defineDocument } from 'tsprose';
import { BlockMath, H1, M, P, Statement, StatementMain } from '../../../../../src/tags.js';
import { refs } from './refs.js';

const math = String.raw;

export default defineDocument(
  () => (
    <>
      <H1>Выделение полного квадрата</H1>
      <Statement $={refs.method} title="Метод выделения полного квадрата">
        <StatementMain>
          <P>
            Любой квадратный трёхчлен <M>x^2 + px + q</M> можно записать как
          </P>
          <BlockMath>{math`\left(x + \frac{p}{2}\right)^2 - \frac{p^2}{4} + q.`}</BlockMath>
        </StatementMain>
      </Statement>
    </>
  ),
  { refs },
);
