// Unit tests for the healing settings.
import { expect, test } from '@playwright/test';
import {
  FALLBACK_CONFIDENCE,
  getHealMode,
  LLM_CONFIDENCE_CAP,
  MIN_CONFIDENCE,
} from '../../src/healing/config';

test('HEAL_MODE defaults to heal and rejects typos', () => {
  delete process.env.HEAL_MODE;
  expect(getHealMode()).toBe('heal');
  process.env.HEAL_MODE = 'strcit';
  expect(() => getHealMode()).toThrow('Unknown HEAL_MODE');
  delete process.env.HEAL_MODE;
});

test('the confidence rules stay consistent with each other', () => {
  // Every author-written fallback must be trusted enough to be used...
  for (const confidence of Object.values(FALLBACK_CONFIDENCE)) {
    expect(confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
  }
  // ...and an LLM can never be trusted more than an author-written test id or role.
  expect(LLM_CONFIDENCE_CAP).toBeLessThan(FALLBACK_CONFIDENCE.role);
  expect(LLM_CONFIDENCE_CAP).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
});
