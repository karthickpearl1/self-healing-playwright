// A custom Playwright reporter. It collects the heal log each test attached, then at the
// end of the run writes healing-report/report.{json,md,html}, adds the Markdown to the
// GitHub Actions job summary, and (only when asked) saves fresh fingerprints.

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { MIN_CONFIDENCE } from '../healing/config';
import { loadFingerprints, saveFingerprints, type FingerprintStore } from '../healing/fingerprints';
import { getLlmName } from '../healing/llm';
import { suggestPatches } from '../healing/patch';
import type { HealEvent } from '../healing/types';
import { toHtml, toMarkdown, type RunSummary, type TestSummary } from './report';

const LOCATOR_DIR = 'tests/locators';

export default class HealingReporter implements Reporter {
  private tests: TestSummary[] = [];
  private fingerprints: FingerprintStore = {};

  onTestEnd(test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find((a) => a.name === 'healing');
    if (!attachment?.body) return; // not a test that used the healer (e.g. unit tests)
    const data = JSON.parse(attachment.body.toString()) as {
      events: HealEvent[];
      fingerprints: FingerprintStore;
    };
    Object.assign(this.fingerprints, data.fingerprints);
    // Playwright errors contain colour codes for the terminal; strip them for the report.
    const error = stripVTControlCharacters(result.error?.message ?? '')
      .split('\n')
      .filter((line) => line.trim())
      .slice(0, 3)
      .join(' ');
    this.tests.push({ title: test.title, status: result.status, error, events: data.events });
  }

  onEnd(): void {
    if (this.tests.length === 0) return;

    const run: RunSummary = {
      variant: process.env.APP_VARIANT ?? 'v1',
      mode: process.env.HEAL_MODE ?? 'heal',
      llm: getLlmName(),
      minConfidence: MIN_CONFIDENCE,
      tests: this.tests,
    };
    const sources = readdirSync(LOCATOR_DIR).map((name) => ({
      path: `${LOCATOR_DIR}/${name}`,
      text: readFileSync(join(LOCATOR_DIR, name), 'utf8'),
    }));
    const patches = suggestPatches(
      this.tests.flatMap((t) => t.events),
      sources,
    );
    const markdown = toMarkdown(run, patches);

    const outDir = process.env.HEAL_REPORT_DIR ?? 'healing-report';
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'report.json'), JSON.stringify({ ...run, patches }, null, 2));
    writeFileSync(join(outDir, 'report.md'), markdown);
    writeFileSync(join(outDir, 'report.html'), toHtml(run, patches));
    console.log(`\nHealing report written to ${outDir}/report.html`);

    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

    if (process.env.UPDATE_FINGERPRINTS === '1') {
      saveFingerprints({ ...loadFingerprints(), ...this.fingerprints });
      console.log(`Saved ${Object.keys(this.fingerprints).length} fingerprints.`);
    }
  }
}
