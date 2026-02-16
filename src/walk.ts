import type { ProseElement, RawElement } from './element.js';

export const WalkStop = { __TSPROSE_walkStop: true };
export const WalkNoDeeper = { __TSPROSE_walkNoDeeper: true };

export function isWalkStop(value: any): value is typeof WalkStop {
  return value === WalkStop;
}

export function isWalkNoDeeper(value: any): value is typeof WalkNoDeeper {
  return value === WalkNoDeeper;
}

export function walkPreSync<ElementKind extends RawElement | ProseElement>(
  element: ElementKind,
  walkStep: (
    element: ElementKind,
  ) => void | typeof WalkStop | typeof WalkNoDeeper,
): typeof WalkStop | void {
  const walkStepResult = walkStep(element);

  if (isWalkStop(walkStepResult)) {
    return WalkStop;
  }

  if (isWalkNoDeeper(walkStepResult)) {
    return;
  }

  const children = element.children;
  if (children) {
    for (const child of children) {
      const childWalkResult = walkPreSync(child as ElementKind, walkStep);
      if (isWalkStop(childWalkResult)) {
        return WalkStop;
      }
    }
  }
}

export async function walkPre<ElementKind extends RawElement | ProseElement>(
  element: ElementKind,
  walkStep: (
    element: ElementKind,
  ) => Promise<void | typeof WalkStop | typeof WalkNoDeeper>,
): Promise<typeof WalkStop | void> {
  const walkStepResult = await walkStep(element);

  if (isWalkStop(walkStepResult)) {
    return WalkStop;
  }

  if (isWalkNoDeeper(walkStepResult)) {
    return;
  }

  const children = element.children;
  if (children) {
    for (const child of children) {
      const childWalkResult = await walkPre(child as ElementKind, walkStep);
      if (isWalkStop(childWalkResult)) {
        return WalkStop;
      }
    }
  }
}

export function walkPostSync<
  ElementKind extends RawElement | ProseElement,
  StepReturn = any,
>(
  element: ElementKind,
  walkStep: (
    element: ElementKind,
    childrenResults: StepReturn[],
  ) => StepReturn | typeof WalkStop,
): StepReturn | typeof WalkStop {
  const childrenResults: StepReturn[] = [];

  const children = element.children;
  if (children) {
    for (const child of children) {
      const childResult = walkPostSync<ElementKind, StepReturn>(
        child as ElementKind,
        walkStep,
      );
      if (isWalkStop(childResult)) {
        return WalkStop;
      }
      childrenResults.push(childResult as StepReturn);
    }
  }

  return walkStep(element, childrenResults);
}

export async function walkPost<
  ElementKind extends RawElement | ProseElement,
  StepReturn = any,
>(
  element: ElementKind,
  walkStep: (
    element: ElementKind,
    childrenResults: StepReturn[],
  ) => Promise<StepReturn | typeof WalkStop>,
): Promise<StepReturn | typeof WalkStop> {
  const childrenResults: StepReturn[] = [];

  const children = element.children;
  if (children) {
    for (const child of children) {
      const childResult = await walkPost<ElementKind, StepReturn>(
        child as ElementKind,
        walkStep,
      );
      if (isWalkStop(childResult)) {
        return WalkStop;
      }
      childrenResults.push(childResult as StepReturn);
    }
  }

  return walkStep(element, childrenResults);
}
