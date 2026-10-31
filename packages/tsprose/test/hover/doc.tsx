import { Callout, Check, H1, P } from './tags.js';

export const doc = (
  <>
    <H1>Title</H1>
    <P center serif>
      text
    </P>
    <Callout icon="info" toc="Note">
      <P>inner</P>
    </Callout>
    <Check answer={42} />
    <P center={'yes'}>wrong value</P>
  </>
);
