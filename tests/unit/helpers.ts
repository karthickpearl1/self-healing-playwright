// Small builders so unit tests only spell out the attributes they care about.
import type { ElementInfo, HealEvent } from '../../src/healing/types';

export function element(overrides: Partial<ElementInfo>): ElementInfo {
  return {
    tag: 'input',
    id: '',
    name: '',
    type: '',
    value: '',
    classes: '',
    text: '',
    label: '',
    placeholder: '',
    testId: '',
    role: '',
    selector: '',
    ...overrides,
  };
}

export function healEvent(overrides: Partial<HealEvent>): HealEvent {
  return {
    test: 'a test',
    element: 'claimForm.policyNumber',
    intent: 'Policy number box',
    oldLocator: '#policyNumber',
    newLocator: '#policy-ref',
    suggestedPrimary: '[data-testid="policy-number"]',
    strategy: 'fallback',
    confidence: 0.95,
    accepted: true,
    reason: 'matched',
    ...overrides,
  };
}
