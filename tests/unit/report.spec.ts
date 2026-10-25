// Unit tests for patch suggestions and the healing report.
import { expect, test } from '@playwright/test';
import { suggestPatches } from '../../src/healing/patch';
import { countHeals, toHtml, toMarkdown, type RunSummary } from '../../src/reporter/report';
import { healEvent } from './helpers';

const locatorFile = {
  path: 'tests/locators/claim-form.ts',
  text: "export const claimForm = {\n  policyNumber: {\n    primary: '#policyNumber',\n  },\n};\n",
};

test('an accepted heal becomes a one-line diff against the locator map', () => {
  const [patch] = suggestPatches([healEvent({})], [locatorFile]);
  expect(patch.diff).toBe(
    [
      '--- a/tests/locators/claim-form.ts',
      '+++ b/tests/locators/claim-form.ts',
      '@@ line 3 @@ claimForm.policyNumber',
      "-    primary: '#policyNumber',",
      '+    primary: \'[data-testid="policy-number"]\',',
    ].join('\n'),
  );
});

test('refused heals never become patches, and repeats are suggested once', () => {
  const events = [healEvent({}), healEvent({}), healEvent({ element: 'x', accepted: false })];
  expect(suggestPatches(events, [locatorFile])).toHaveLength(1);
});

function run(overrides: Partial<RunSummary>): RunSummary {
  return { variant: 'v2', mode: 'heal', llm: 'mock', minConfidence: 0.7, tests: [], ...overrides };
}

test('a run that passed only thanks to heals is flagged, not shown as a clean pass', () => {
  const summary = run({
    tests: [{ title: 't1', status: 'passed', error: '', events: [healEvent({})] }],
  });
  const markdown = toMarkdown(summary, []);
  expect(markdown).toContain('passed, but only because 1 locator(s) were healed');
  expect(markdown).not.toContain('✅');
});

test('refused heals are listed for a human with the reason', () => {
  const refused = healEvent({ accepted: false, reason: 'Refusing to heal below confidence 0.7.' });
  const summary = run({
    tests: [{ title: 't1', status: 'failed', error: 'boom', events: [refused] }],
  });
  expect(countHeals(summary)).toEqual({ accepted: 0, refused: 1, elements: 0 });
  expect(toMarkdown(summary, [])).toContain('Refused heals (need a human)');
});

test('the HTML report escapes page text', () => {
  const summary = run({
    tests: [{ title: '<script>x</script>', status: 'passed', error: '', events: [] }],
  });
  expect(toHtml(summary, [])).toContain('&lt;script&gt;x&lt;/script&gt;');
});
