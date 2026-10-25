// Every number that decides whether a heal is trusted lives in this one file,
// so a reviewer can see (and challenge) the rules in one place.

// The lowest confidence a heal needs before the test is allowed to carry on.
// Anything below this fails the test with a clear "refusing to guess" error.
export const MIN_CONFIDENCE = 0.7;

// Fixed confidence for each kind of fallback locator. These are judgement calls, ranked by
// how stable and intention-revealing each locator usually is in my experience:
// a test id is put there for testing, roles and labels are what users see, plain text changes most.
export const FALLBACK_CONFIDENCE = {
  testId: 0.95,
  role: 0.9,
  label: 0.85,
  text: 0.8,
} as const;

// Fingerprint matching: if the best and second-best candidates score within this margin
// of each other, the match is ambiguous and we refuse it, however high the score.
export const AMBIGUITY_MARGIN = 0.1;

// An LLM can sound sure of itself. Whatever confidence it reports, we never trust it more than this.
export const LLM_CONFIDENCE_CAP = 0.85;

// How long to wait for the primary locator before we start healing (milliseconds).
export const PRIMARY_WAIT_MS = 1500;

// HEAL_MODE:
//   off    - naive: use the primary locator only, exactly like a normal Playwright test
//   heal   - try to heal, log every heal, fail on low confidence (default)
//   strict - heal so the report can suggest a fix, but fail any test that needed a heal (for CI)
export type HealMode = 'off' | 'heal' | 'strict';

export function getHealMode(): HealMode {
  const mode = process.env.HEAL_MODE ?? 'heal';
  if (mode !== 'off' && mode !== 'heal' && mode !== 'strict') {
    throw new Error(`Unknown HEAL_MODE "${mode}". Use off, heal or strict.`);
  }
  return mode;
}
