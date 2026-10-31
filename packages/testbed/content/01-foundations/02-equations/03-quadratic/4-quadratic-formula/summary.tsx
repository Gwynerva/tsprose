import { defineDocument, Include } from 'tsprose';
import { H1, P, Ref } from '../../../../../src/tags.js';
import { refs as article } from './refs.js';

export default defineDocument(() => (
  <>
    <H1>Сводка</H1>
    <P>
      Главное в теме: <Ref to={article.discriminant}>дискриминант</Ref> и <Ref to={article.formula}>формула корней</Ref>.
    </P>
    <Include of={article.formula} />
    <Include of={article.discriminant} />
  </>
));
