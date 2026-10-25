// Code that reads elements inside the browser page.
//
// Playwright sends readElements() to the browser as source text, so it must not use
// anything from outside its own body (no imports, no helper functions defined elsewhere).

import type { Locator, Page } from '@playwright/test';
import type { ElementInfo } from './types';

// Elements a test is likely to interact with or assert on.
const INTERESTING = 'input, select, textarea, button, a, [role], [data-testid]';

export function readElements(elements: Element[]): ElementInfo[] {
  const implicitRoles: Record<string, string> = {
    button: 'button',
    a: 'link',
    select: 'combobox',
    textarea: 'textbox',
  };
  const results: ElementInfo[] = [];

  for (const element of elements) {
    const el = element as HTMLInputElement; // lets us read .name, .type etc. on any form control
    const tag = el.tagName.toLowerCase();
    const type =
      tag === 'input' ? (el.getAttribute('type') ?? 'text') : (el.getAttribute('type') ?? '');
    const isChoice = type === 'radio' || type === 'checkbox';
    const testId = el.getAttribute('data-testid') ?? '';
    const name = el.getAttribute('name') ?? '';
    const value = isChoice ? (el.getAttribute('value') ?? '') : '';

    let role = el.getAttribute('role') ?? implicitRoles[tag] ?? '';
    if (tag === 'input') role = isChoice ? type : 'textbox';

    // The label a user would read: <label for=...>, a wrapping <label>, or aria-label.
    const label = (el.labels?.[0]?.textContent ?? el.getAttribute('aria-label') ?? '').trim();
    // Visible text, only for elements whose text means something (buttons, links, messages).
    const hasText = tag !== 'input' && tag !== 'select' && tag !== 'textarea';
    const text = hasText ? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';

    // A selector that finds this exact element again, from most to least stable.
    let selector: string;
    if (testId) {
      selector = `[data-testid="${testId}"]`;
    } else if (el.id && document.querySelectorAll(`[id="${el.id}"]`).length === 1) {
      selector = `#${el.id}`;
    } else if (name) {
      selector = `${tag}[name="${name}"]` + (value ? `[value="${value}"]` : '');
    } else {
      selector = `${tag} >> nth=${[...document.querySelectorAll(tag)].indexOf(el)}`;
    }

    results.push({
      tag,
      id: el.id,
      name,
      type,
      value,
      classes: el.getAttribute('class') ?? '',
      text,
      label,
      placeholder: el.getAttribute('placeholder') ?? '',
      testId,
      role,
      selector,
    });
  }
  return results;
}

// Read the one element a locator points at (used to save its fingerprint).
export async function readElement(locator: Locator): Promise<ElementInfo> {
  const [info] = await locator.evaluateAll(readElements);
  return info;
}

// Read every interesting element on the page: our "trimmed DOM snapshot".
// Hidden elements are included on purpose. An element can be hidden at the moment we look
// for it (a confirmation message that has not appeared yet, say). Whether it SHOULD be
// visible is for the test's assertions to decide, not the healer.
export async function snapshotPage(page: Page): Promise<ElementInfo[]> {
  return page.locator(INTERESTING).evaluateAll(readElements);
}
