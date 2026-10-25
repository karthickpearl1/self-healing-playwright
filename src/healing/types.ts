// The shapes of data passed around the healing layer. Types only, no logic.

import type { Page } from '@playwright/test';

// The ARIA roles Playwright's getByRole() accepts, e.g. 'button', 'textbox', 'alert'.
export type AriaRole = Parameters<Page['getByRole']>[0];

// One fallback locator, written by the test author in the locator map.
export type Fallback =
  | { by: 'testId'; value: string } // page.getByTestId(value)
  | { by: 'role'; role: AriaRole; name?: string } // page.getByRole(role, { name })
  | { by: 'label'; value: string } // page.getByLabel(value)
  | { by: 'text'; value: string }; // page.getByText(value)

// Everything we know about one element the tests use.
export interface ElementSpec {
  key: string; // unique name, e.g. "claimForm.policyNumber"
  intent: string; // plain-English description, shown to the LLM and in the report
  primary: string; // the CSS selector the test normally uses
  fallbacks: Fallback[]; // tried in order if the primary fails
}

// What we read from an element in the browser. Used both as the stored "fingerprint"
// from a passing run and as the description of each candidate element on the page today.
export interface ElementInfo {
  tag: string;
  id: string;
  name: string;
  type: string;
  value: string; // only filled in for radio buttons and checkboxes
  classes: string;
  text: string;
  label: string;
  placeholder: string;
  testId: string;
  role: string;
  selector: string; // a selector we can use to find this exact element again
}

// One healing attempt, logged whether it was accepted or not.
export interface HealEvent {
  test: string;
  element: string;
  intent: string;
  oldLocator: string;
  newLocator: string | null; // null when nothing could be found
  suggestedPrimary: string | null; // what we suggest the primary should become
  strategy: 'fallback' | 'fingerprint' | 'llm' | 'none';
  confidence: number;
  accepted: boolean;
  reason: string;
}
