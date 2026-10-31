// A hand-ported slice of Open Math's "quadratic formula" article, written in the 2.0 dialect.
import { defineDocument } from 'tsprose';
import {
  B, BlockMath, Caption, Dep, Details, Diagram, H1, H2, Image, Li, List, M, P, Problems, ProblemAnswer,
  ProblemDescription, ProblemHint, ProblemSolution, Ref, Statement, StatementMain, StatementProof, SubProblem, Term,
  TermMain, Table, Td, Tr, QED, MathValueCheck,
} from '../../../../../src/tags.js';
import { refs } from './refs.js';
import { refs as completing } from '../3-completing-the-square/refs.js';

const math = String.raw;

export default defineDocument(
  () => (
    <>
      <H1>Формула корней</H1>

      <P>
        Каждый раз при решении квадратного уравнения решать мини-головоломку с
        <Dep on={completing.method}>выделением полного квадрата</Dep> неудобно. Гораздо проще один раз проделать это
        <B>не в конкретном</B> уравнении, а в квадратном уравнении в общем виде, с буквенными коэффициентами вместо
        чисел!
      </P>

      <Image $={refs.cover} src="assets/cover.svg" width="600px">
        <Caption>Общий вид квадратного уравнения</Caption>
      </Image>

      <BlockMath>{math`Ax^2 + Bx + C = 0, \quad A \neq 0`}</BlockMath>

      <H2>Дискриминант</H2>

      <Term $={refs.discriminant} title="Дискриминант" snippet={{ seo: 'Дискриминант квадратного уравнения', key: true, search: true }}>
        <TermMain>
          <P>
            Число <M>D</M>, которое высчитывается из коэффициентов квадратного уравнения в общем виде
            <M>Ax^2 + Bx + C = 0</M> по формуле:
          </P>
          <BlockMath>{math`D = B^2 - 4AC`}</BlockMath>
          <P>
            Дискриминант напрямую используется в <Ref to={refs.formula}>формуле корней</Ref> квадратного уравнения.
          </P>
        </TermMain>
      </Term>

      <Diagram $={refs.overview} toc="Обзор">
        {math`flowchart TD
          D["D"] -->|"D > 0"| two["два корня"]
          D -->|"D = 0"| one["один корень"]
          D -->|"D < 0"| none["корней нет"]`}
      </Diagram>

      <H2>Формула</H2>

      <Statement $={refs.formula} title="Формула корней квадратного уравнения" snippet={{ key: true, search: true, title: 'Формула корней' }}>
        <StatementMain>
          <P>
            Корни уравнения <M>Ax^2 + Bx + C = 0</M> при <M>D \geq 0</M> вычисляются по формуле:
          </P>
          <BlockMath>{math`x_{1,2} = \frac{-B \pm \sqrt{D}}{2A}`}</BlockMath>
        </StatementMain>
        <StatementProof>
          <P>
            Выделим полный квадрат, как в разделе <Dep on={completing.method}>о полном квадрате</Dep>, и получим:
          </P>
          <BlockMath>{math`\left(x + \frac{B}{2A}\right)^2 = \frac{D}{4A^2}`}</BlockMath>
          <Details $={refs._squareRootExample} title="Почему можно извлечь корень?">
            <P>Потому что при <M>D \geq 0</M> правая часть неотрицательна.</P>
          </Details>
          <P>
            Извлекаем корень и переносим <M>{math`\frac{B}{2A}`}</M> вправо. <QED />
          </P>
        </StatementProof>
      </Statement>

      <Table toc="Случаи дискриминанта">
        <Tr>
          <Td center>
            <B>D</B>
          </Td>
          <Td>Число корней</Td>
        </Tr>
        <Tr>
          <Td center>
            <M>D &gt; 0</M>
          </Td>
          <Td>Два</Td>
        </Tr>
        <Tr>
          <Td center>
            <M>D = 0</M>
          </Td>
          <Td>Один</Td>
        </Tr>
        <Tr>
          <Td center>
            <M>D &lt; 0</M>
          </Td>
          <Td>Ни одного</Td>
        </Tr>
      </Table>

      <List>
        <Li>
          <P>
            Сначала <B>считаем</B> дискриминант.
          </P>
        </Li>
        <Li>Потом подставляем в формулу.</Li>
      </List>

      <Problems $={refs.deriveProblems} title="Примеры вывода общих формул" level="example">
        <P>Выведите общую формулу решения уравнения.</P>
        <SubProblem label="2 коэффициента">
          <ProblemDescription>
            <P>
              Решите <M>x^2 + x - 6 = 0</M>.
            </P>
          </ProblemDescription>
          <MathValueCheck label="Корни" answers={[-3, 2]} />
          <ProblemHint>Изучите формулу выше.</ProblemHint>
          <ProblemAnswer>
            <M>-3</M> и <M>2</M>
          </ProblemAnswer>
          <ProblemSolution>
            <P>
              <M>D = 1 + 24 = 25</M>, значит корни <M>{math`\frac{-1 \pm 5}{2}`}</M>.
            </P>
          </ProblemSolution>
        </SubProblem>
      </Problems>
    </>
  ),
  { refs },
);
