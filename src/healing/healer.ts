// The healing locator layer. Tests call healer.locate(spec) instead of page.locator(...).
//
// Order of attempts, cheapest and most trustworthy first:
//   1. the primary locator (no heal)
//   2. the author's ranked fallbacks: test id, role, label, text
//   3. fingerprint matching against what the element looked like on a passing run
//   4. the optional LLM step, choosing from a trimmed snapshot of the page
// A heal is only used if its confidence is at least MIN_CONFIDENCE. Otherwise the test
// fails with an error that says what was tried. Every attempt is logged for the report.

import type { Locator, Page } from '@playwright/test';
import { readElement, snapshotPage } from './browser';
import {
  FALLBACK_CONFIDENCE,
  LLM_CONFIDENCE_CAP,
  MIN_CONFIDENCE,
  PRIMARY_WAIT_MS,
  type HealMode,
} from './config';
import { loadFingerprints, type FingerprintStore } from './fingerprints';
import { askLlm } from './llm';
import { bestMatch } from './similarity';
import type { ElementInfo, ElementSpec, Fallback, HealEvent } from './types';

// How a fallback reads in code, e.g. getByTestId('policy-number'). Used in logs and the report.
export function describeFallback(fallback: Fallback): string {
  if (fallback.by === 'testId') return `getByTestId('${fallback.value}')`;
  if (fallback.by === 'label') return `getByLabel('${fallback.value}')`;
  if (fallback.by === 'text') return `getByText('${fallback.value}')`;
  return fallback.name
    ? `getByRole('${fallback.role}', { name: '${fallback.name}' })`
    : `getByRole('${fallback.role}')`;
}

export class Healer {
  events: HealEvent[] = []; // every heal attempt in this test, accepted or not
  seen: FingerprintStore = {}; // fingerprints of elements whose primary locator worked
  private stored: FingerprintStore;

  constructor(
    private page: Page,
    private testTitle: string,
    readonly mode: HealMode,
  ) {
    // HEAL_FINGERPRINTS=off skips fingerprint matching (used to exercise the LLM step on its own).
    this.stored = process.env.HEAL_FINGERPRINTS === 'off' ? {} : loadFingerprints();
  }

  async locate(spec: ElementSpec): Promise<Locator> {
    const primary = this.page.locator(spec.primary);
    // Naive mode: behave exactly like a plain Playwright test.
    if (this.mode === 'off') return primary;

    if (await this.foundOnce(primary)) {
      this.seen[spec.key] = await readElement(primary); // keep its fingerprint up to date
      return primary;
    }
    return this.heal(spec);
  }

  // True if the locator matches exactly one element. Waits briefly for the primary to appear.
  private async foundOnce(locator: Locator): Promise<boolean> {
    try {
      await locator.first().waitFor({ state: 'attached', timeout: PRIMARY_WAIT_MS });
    } catch {
      return false;
    }
    return (await locator.count()) === 1;
  }

  private fallbackLocator(fallback: Fallback): Locator {
    if (fallback.by === 'testId') return this.page.getByTestId(fallback.value);
    if (fallback.by === 'label') return this.page.getByLabel(fallback.value, { exact: true });
    if (fallback.by === 'text') return this.page.getByText(fallback.value, { exact: true });
    // includeHidden: find the element even if it is hidden right now (see snapshotPage).
    return this.page.getByRole(fallback.role, {
      name: fallback.name,
      exact: true,
      includeHidden: true,
    });
  }

  private async heal(spec: ElementSpec): Promise<Locator> {
    // Step 2: the author's fallbacks, in the order they were written.
    for (const fallback of spec.fallbacks) {
      const locator = this.fallbackLocator(fallback);
      if ((await locator.count()) === 1) {
        const info = await readElement(locator);
        const how = describeFallback(fallback);
        this.log(
          spec,
          'fallback',
          how,
          info,
          FALLBACK_CONFIDENCE[fallback.by],
          true,
          `${how} matched one element.`,
        );
        return locator;
      }
    }

    const candidates = await snapshotPage(this.page);
    const stored = this.stored[spec.key];
    let bestGuess: {
      info: ElementInfo;
      confidence: number;
      strategy: 'fingerprint' | 'llm';
    } | null = null;
    const notes: string[] = [
      `Primary ${spec.primary} and ${spec.fallbacks.length} fallback(s) found nothing.`,
    ];

    // Step 3: compare every candidate with the stored fingerprint.
    if (stored) {
      const match = bestMatch(stored, candidates);
      notes.push(match.reason);
      if (match.candidate) {
        bestGuess = { info: match.candidate, confidence: match.score, strategy: 'fingerprint' };
        if (match.score >= MIN_CONFIDENCE) {
          return this.accept(spec, 'fingerprint', match.candidate, match.score, match.reason);
        }
      }
    } else {
      notes.push('No stored fingerprint for this element.');
    }

    // Step 4: the optional LLM step.
    const answer = await askLlm({ intent: spec.intent, oldLocator: spec.primary, candidates });
    if (!answer) {
      notes.push('LLM step is off.');
    } else if (answer.index === null) {
      notes.push(`LLM: ${answer.reason}`);
    } else {
      const candidate = candidates[answer.index];
      const confidence = Math.min(answer.confidence, LLM_CONFIDENCE_CAP);
      const reason = `LLM chose ${candidate.selector} (${confidence.toFixed(2)}): ${answer.reason}`;
      notes.push(reason);
      if (stored && candidate.tag !== stored.tag) {
        notes.push(`Rejected: it is a <${candidate.tag}> but the element was a <${stored.tag}>.`);
      } else {
        if (!bestGuess || confidence > bestGuess.confidence) {
          bestGuess = { info: candidate, confidence, strategy: 'llm' };
        }
        if (confidence >= MIN_CONFIDENCE)
          return this.accept(spec, 'llm', candidate, confidence, reason);
      }
    }

    // Nothing was good enough. Log it, then fail loudly rather than guess.
    notes.push(`Refusing to heal below confidence ${MIN_CONFIDENCE}.`);
    const reason = notes.join(' ');
    this.log(
      spec,
      bestGuess?.strategy ?? 'none',
      bestGuess?.info.selector ?? null,
      bestGuess?.info ?? null,
      bestGuess?.confidence ?? 0,
      false,
      reason,
    );
    throw new Error(`Self-healing refused for ${spec.key} ("${spec.intent}"). ${reason}`);
  }

  // Use a fingerprint or LLM candidate, after one last check that its selector is unique.
  private async accept(
    spec: ElementSpec,
    strategy: 'fingerprint' | 'llm',
    candidate: ElementInfo,
    confidence: number,
    reason: string,
  ): Promise<Locator> {
    const locator = this.page.locator(candidate.selector);
    if ((await locator.count()) !== 1) {
      const why = `${reason} But ${candidate.selector} does not match exactly one element.`;
      this.log(spec, strategy, candidate.selector, candidate, confidence, false, why);
      throw new Error(`Self-healing refused for ${spec.key}. ${why}`);
    }
    this.log(spec, strategy, candidate.selector, candidate, confidence, true, reason);
    return locator;
  }

  private log(
    spec: ElementSpec,
    strategy: HealEvent['strategy'],
    newLocator: string | null,
    info: ElementInfo | null,
    confidence: number,
    accepted: boolean,
    reason: string,
  ): void {
    const event: HealEvent = {
      test: this.testTitle,
      element: spec.key,
      intent: spec.intent,
      oldLocator: spec.primary,
      newLocator,
      suggestedPrimary: info?.selector ?? null,
      strategy,
      confidence: Number(confidence.toFixed(2)),
      accepted,
      reason,
    };
    this.events.push(event);
    // Also print it, so heals are visible in the console log, not only in the report.
    const verdict = accepted ? 'HEALED' : 'REFUSED';
    console.log(
      `[${verdict}] ${spec.key}: ${spec.primary} -> ${newLocator ?? 'nothing'} (${strategy}, ${event.confidence})`,
    );
  }
}
