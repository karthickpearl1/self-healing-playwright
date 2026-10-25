// End-to-end tests for the claim form. They read like normal Playwright tests; the only
// difference is that elements come from healer.locate(...) instead of page.locator(...).
//
// Note what healing is NOT allowed to touch: the expect(...) assertions. Healing only helps
// find an element. Whether the app behaves correctly is still decided by the assertions.

import { expect, test } from '../../src/healing/fixture';
import { claimForm } from '../locators/claim-form';

test.beforeEach(async ({ page }) => {
  await page.goto('./'); // baseURL points at /v1/, /v2/ or /v2-bug/
});

test('submits a valid claim and shows a reference', async ({ healer }) => {
  await (await healer.locate(claimForm.policyNumber)).fill('AM-123456');
  await (await healer.locate(claimForm.claimType)).selectOption('escape-of-water');
  await (await healer.locate(claimForm.incidentDate)).fill('2026-10-01');
  await (await healer.locate(claimForm.description)).fill('A pipe burst under the kitchen sink.');
  await (await healer.locate(claimForm.submit)).click();

  const confirmation = await healer.locate(claimForm.confirmation);
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('CLM-3456');
});

test('asks for a policy number when it is missing', async ({ healer }) => {
  await (await healer.locate(claimForm.submit)).click();

  await expect(await healer.locate(claimForm.errorMessage)).toHaveText(
    'Please enter your policy number.',
  );
});

test('lets the customer give a phone number for contact', async ({ healer }) => {
  const phone = await healer.locate(claimForm.phoneNumber);
  await expect(phone).toBeHidden(); // only shown once "Phone" is chosen

  await (await healer.locate(claimForm.contactByPhone)).check();
  await expect(phone).toBeVisible();
  await phone.fill('07700 900123');
  await expect(phone).toHaveValue('07700 900123');
});
