// Builds the healing report (Markdown and HTML) from the results of one run.
// Pure functions: data in, text out. The reporter decides where to write it.

import type { Patch } from '../healing/patch';
import type { HealEvent } from '../healing/types';

export interface TestSummary {
  title: string;
  status: string; // passed | failed | timedOut | skipped | interrupted
  error: string; // first lines of the error, empty if the test passed
  events: HealEvent[];
}

export interface RunSummary {
  variant: string;
  mode: string;
  llm: string;
  minConfidence: number;
  tests: TestSummary[];
}

export function countHeals(run: RunSummary) {
  const events = run.tests.flatMap((test) => test.events);
  const accepted = events.filter((event) => event.accepted);
  return {
    accepted: accepted.length,
    refused: events.length - accepted.length,
    elements: new Set(accepted.map((event) => event.element)).size,
  };
}

function verdictLine(run: RunSummary): string {
  const failed = run.tests.filter((test) => test.status !== 'passed').length;
  const heals = countHeals(run);
  if (failed > 0) return `❌ ${failed} of ${run.tests.length} tests failed.`;
  if (heals.accepted > 0) {
    return `⚠️ All ${run.tests.length} tests passed, but only because ${heals.accepted} locator(s) were healed. Review the suggested patches.`;
  }
  return `✅ All ${run.tests.length} tests passed with no heals.`;
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(run: RunSummary, patches: Patch[]): string {
  const heals = countHeals(run);
  const out: string[] = [
    `## Self-healing report: ${run.variant} (HEAL_MODE=${run.mode})`,
    '',
    verdictLine(run),
    '',
    `Heals accepted: **${heals.accepted}** (${heals.elements} distinct elements). Heals refused: **${heals.refused}**. ` +
      `Minimum confidence: ${run.minConfidence}. LLM step: ${run.llm}.`,
    '',
    '### Tests',
    '',
    '| Test | Result | Heals | Error |',
    '| --- | --- | --- | --- |',
    ...run.tests.map(
      (test) =>
        `| ${cell(test.title)} | ${test.status} | ${test.events.filter((e) => e.accepted).length} | ${cell(test.error)} |`,
    ),
  ];

  const events = run.tests.flatMap((test) => test.events);
  if (events.length > 0) {
    out.push(
      '',
      '### Heal log',
      '',
      '| Test | Element | Old locator | New locator | Strategy | Confidence | Decision |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...events.map(
        (e) =>
          `| ${cell(e.test)} | ${e.element} | \`${e.oldLocator}\` | ${e.newLocator ? `\`${cell(e.newLocator)}\`` : '-'} | ${e.strategy} | ${e.confidence} | ${e.accepted ? 'accepted' : '**refused**'} |`,
      ),
    );
    const refused = events.filter((e) => !e.accepted);
    if (refused.length > 0) {
      out.push('', '### Refused heals (need a human)', '');
      for (const e of refused) out.push(`- **${e.element}** in "${e.test}": ${e.reason}`);
    }
  }

  if (patches.length > 0) {
    out.push('', '### Suggested patches (review before applying)', '');
    for (const patch of patches) out.push('```diff', patch.diff, '```', '');
  }
  return out.join('\n') + '\n';
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHtml(run: RunSummary, patches: Patch[]): string {
  const heals = countHeals(run);
  const events = run.tests.flatMap((test) => test.events);
  const testRows = run.tests
    .map(
      (t) =>
        `<tr class="${t.status === 'passed' ? 'ok' : 'bad'}"><td>${escape(t.title)}</td><td>${t.status}</td>` +
        `<td>${t.events.filter((e) => e.accepted).length}</td><td>${escape(t.error)}</td></tr>`,
    )
    .join('\n');
  const eventRows = events
    .map(
      (e) =>
        `<tr class="${e.accepted ? 'ok' : 'bad'}"><td>${escape(e.test)}</td><td>${escape(e.element)}</td>` +
        `<td><code>${escape(e.oldLocator)}</code></td><td><code>${escape(e.newLocator ?? '-')}</code></td>` +
        `<td>${e.strategy}</td><td>${e.confidence.toFixed(2)}</td><td>${e.accepted ? 'accepted' : 'REFUSED'}</td>` +
        `<td>${escape(e.reason)}</td></tr>`,
    )
    .join('\n');
  const patchBlocks = patches
    .map((p) => {
      const lines = p.diff.split('\n').map((line) => {
        const kind =
          line.startsWith('+') && !line.startsWith('+++')
            ? 'add'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'del'
              : '';
        return `<span class="${kind}">${escape(line)}</span>`;
      });
      return `<h3>${escape(p.element)}</h3><pre>${lines.join('\n')}</pre>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Self-healing report: ${escape(run.variant)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1f2933; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; font-size: 14px; }
  th, td { border: 1px solid #cbd2d9; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f0f4f8; }
  tr.ok td:first-child { border-left: 4px solid #3ebd93; }
  tr.bad td:first-child { border-left: 4px solid #e12d39; }
  .stats span { display: inline-block; margin-right: 1.5rem; padding: 0.5rem 1rem; background: #f0f4f8; border-radius: 6px; }
  pre { background: #1f2933; color: #e4e7eb; padding: 1rem; border-radius: 6px; }
  .add { color: #8eedc7; } .del { color: #ff9b9b; }
</style>
</head>
<body>
<h1>Self-healing report: ${escape(run.variant)} <small>(HEAL_MODE=${escape(run.mode)})</small></h1>
<p><strong>${escape(verdictLine(run))}</strong></p>
<p class="stats"><span>Heals accepted: <b>${heals.accepted}</b></span><span>Distinct elements: <b>${heals.elements}</b></span>
<span>Heals refused: <b>${heals.refused}</b></span><span>Min confidence: <b>${run.minConfidence}</b></span><span>LLM step: <b>${escape(run.llm)}</b></span></p>
<h2>Tests</h2>
<table><tr><th>Test</th><th>Result</th><th>Heals</th><th>Error</th></tr>
${testRows}
</table>
<h2>Heal log</h2>
${events.length ? `<table><tr><th>Test</th><th>Element</th><th>Old locator</th><th>New locator</th><th>Strategy</th><th>Confidence</th><th>Decision</th><th>Reason</th></tr>\n${eventRows}\n</table>` : '<p>No heals.</p>'}
<h2>Suggested patches (review before applying)</h2>
${patchBlocks || '<p>None.</p>'}
</body>
</html>
`;
}
