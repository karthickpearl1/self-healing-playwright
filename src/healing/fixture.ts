// A Playwright fixture that gives every test a `healer`, and after the test:
//  - attaches the heal log and fingerprints to the test result (the reporter reads them)
//  - in strict mode, fails any test that only passed because something was healed.
//
// Tests import { test, expect } from here instead of from '@playwright/test'.

import { test as base } from '@playwright/test';
import { getHealMode } from './config';
import { Healer } from './healer';

export const test = base.extend<{ healer: Healer }>({
  healer: async ({ page }, use, testInfo) => {
    const healer = new Healer(page, testInfo.title, getHealMode());

    await use(healer); // the test runs here

    for (const event of healer.events) {
      testInfo.annotations.push({
        type: event.accepted ? 'healed' : 'heal refused',
        description: `${event.element}: ${event.oldLocator} -> ${event.newLocator ?? 'nothing'} (${event.strategy}, ${event.confidence})`,
      });
    }
    await testInfo.attach('healing', {
      body: JSON.stringify({ events: healer.events, fingerprints: healer.seen }),
      contentType: 'application/json',
    });

    const healed = healer.events.filter((event) => event.accepted).map((event) => event.element);
    if (healer.mode === 'strict' && healed.length > 0) {
      throw new Error(
        `Strict mode: this test needed ${healed.length} healed locator(s) (${healed.join(', ')}). ` +
          'Heals are not allowed in strict mode. Review the healing report and update the locators.',
      );
    }
  },
});

export { expect } from '@playwright/test';
