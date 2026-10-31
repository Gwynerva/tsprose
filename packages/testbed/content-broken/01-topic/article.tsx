// Every mistake an author can make, in one document: compile must report all of them at once.
import { defineDocument } from 'tsprose';
import { B, H1, Image, M, P, Statement, StatementMain, StatementProof } from '../../src/tags.js';
import { refs } from './refs.js';

export default defineDocument(
  () => (
    <>
      <H1>Сломанный документ</H1>
      <P>
        Блок внутри инлайна: <B><Image src="x.svg" /></B>
      </P>
      <Statement $={refs.main} title="Без главной части">
        <StatementProof>
          <P>Доказательство без StatementMain нарушает модель содержимого.</P>
        </StatementProof>
      </Statement>
      {/* @ts-expect-error — the type system catches the missing $ too; the runtime must report it as well */}
      <Statement title="Нет ссылки">
        <StatementMain>
          <P>Statement требует $.</P>
        </StatementMain>
      </Statement>
      {/* @ts-expect-error — unknown prop is a type error as well */}
      <Image src={42 as never} widht="10px" />
      <P>
        Формула <M>x</M> в порядке.
      </P>
    </>
  ),
  { refs },
);
