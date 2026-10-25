// Fingerprint similarity scoring. Pure functions with no browser, so they are easy to unit test.
//
// Idea: on a passing run we saved what each element looked like (its "fingerprint").
// When the primary locator breaks, we score every element on the page against that
// fingerprint and pick the best one, but only if it is clearly the best.

import { AMBIGUITY_MARGIN } from './config';
import type { ElementInfo } from './types';

// How much each attribute counts. Attributes that tend to survive a redesign
// (name, id, label, test id) count more than ones that change all the time (classes).
export const WEIGHTS = {
  id: 3,
  name: 3,
  testId: 2,
  label: 2,
  text: 2,
  type: 2,
  value: 2,
  placeholder: 1,
  classes: 1,
} as const;

type Attribute = keyof typeof WEIGHTS;

// Split any identifier or text into lowercase words:
// "policyNumber", "policy-number", "Policy number" all become ["policy", "number"].
export function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

// Jaccard similarity: shared words divided by all distinct words. 1 = same words, 0 = none shared.
export function wordSimilarity(a: string, b: string): number {
  const setA = new Set(words(a));
  const setB = new Set(words(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  const shared = [...setA].filter((word) => setB.has(word)).length;
  const all = new Set([...setA, ...setB]).size;
  return shared / all;
}

// Score one candidate against the stored fingerprint, from 0 to 1.
export function scoreCandidate(stored: ElementInfo, candidate: ElementInfo): number {
  // Hard rule: never heal to a different kind of element (an input into a button, say).
  if (stored.tag !== candidate.tag) return 0;

  let earned = 0;
  let possible = 0;
  for (const attribute of Object.keys(WEIGHTS) as Attribute[]) {
    // Only attributes the old element actually had can count for or against a candidate.
    if (!stored[attribute]) continue;
    possible += WEIGHTS[attribute];
    earned += WEIGHTS[attribute] * wordSimilarity(stored[attribute], candidate[attribute]);
  }
  // An element with no attributes at all gives us nothing to go on.
  return possible === 0 ? 0 : earned / possible;
}

export interface FingerprintMatch {
  candidate: ElementInfo | null;
  score: number;
  runnerUpScore: number;
  reason: string;
}

// Rank all candidates and decide whether the best one is clearly the best.
export function bestMatch(stored: ElementInfo, candidates: ElementInfo[]): FingerprintMatch {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(stored, candidate) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUpScore = ranked[1]?.score ?? 0;
  if (!best || best.score === 0) {
    return { candidate: null, score: 0, runnerUpScore, reason: 'No element of the same kind.' };
  }
  const scores = `Best fingerprint match ${best.score.toFixed(2)} (runner-up ${runnerUpScore.toFixed(2)})`;
  if (best.score - runnerUpScore < AMBIGUITY_MARGIN) {
    return {
      candidate: null,
      score: best.score,
      runnerUpScore,
      reason: `${scores}: too close to call.`,
    };
  }
  return { candidate: best.candidate, score: best.score, runnerUpScore, reason: `${scores}.` };
}
