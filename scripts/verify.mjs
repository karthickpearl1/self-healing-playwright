// The self-test for the whole idea. Runs every scenario and checks each one ended the way
// it should. If healing ever starts hiding a real bug, this script fails.
//
//   npm run verify
//
// Scenario                     Expected
// v1, healing on               passes, zero heals (nothing to heal on the version the tests were written for)
// v2, healing off (naive)      fails (the redesign breaks the naive locators)
// v2, healing on               passes, every heal logged, none refused
// v2, strict mode              fails, because heals are not allowed in strict mode
// v2-bug, healing on           fails on the two genuine bugs, which healing must not mask
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function runScenario(variant, mode) {
  console.log(`\n=== ${variant}, HEAL_MODE=${mode} ===`);
  const result = spawnSync('node', ['scripts/scenario.mjs', variant, mode], { stdio: 'inherit' });
  const report = JSON.parse(readFileSync(`healing-report/${variant}-${mode}/report.json`, 'utf8'));
  const events = report.tests.flatMap((test) => test.events);
  return {
    exitCode: result.status,
    report,
    accepted: events.filter((event) => event.accepted),
    refused: events.filter((event) => !event.accepted),
    test: (title) => report.tests.find((test) => test.title.startsWith(title)),
  };
}

const checks = [];
function check(description, ok) {
  checks.push({ description, ok });
}

const v1 = runScenario('v1', 'heal');
check('v1: all tests pass', v1.exitCode === 0);
check('v1: zero heals', v1.accepted.length === 0 && v1.refused.length === 0);

const naive = runScenario('v2', 'off');
check('v2 naive: the suite fails', naive.exitCode !== 0);
check(
  'v2 naive: every test fails',
  naive.report.tests.every((test) => test.status !== 'passed'),
);

const healed = runScenario('v2', 'heal');
check('v2 healing: all tests pass', healed.exitCode === 0);
check(`v2 healing: heals were logged (${healed.accepted.length})`, healed.accepted.length > 0);
check('v2 healing: no heal was refused', healed.refused.length === 0);
check(
  'v2 healing: every accepted heal meets the minimum confidence',
  healed.accepted.every((event) => event.confidence >= healed.report.minConfidence),
);
const healedElements = new Set(healed.accepted.map((event) => event.element));
check(
  `v2 healing: one suggested patch per healed element (${healedElements.size})`,
  healed.report.patches.length === healedElements.size,
);

const strict = runScenario('v2', 'strict');
check('v2 strict: the suite fails', strict.exitCode !== 0);
check(
  'v2 strict: every test is flagged for needing heals',
  strict.report.tests.every((test) => test.error.includes('Strict mode')),
);

const bug = runScenario('v2-bug', 'heal');
const submit = bug.test('submits a valid claim');
const phone = bug.test('lets the customer give a phone number');
check('v2-bug: the suite fails', bug.exitCode !== 0);
check(
  'v2-bug: broken submit button fails on the assertion, not hidden by a heal',
  submit.status === 'failed' && submit.error.includes('toBeVisible'),
);
check(
  'v2-bug: deleted phone field is refused, not healed onto another element',
  phone.status === 'failed' && phone.error.includes('Self-healing refused'),
);
check(
  'v2-bug: the unaffected test still passes',
  bug.test('asks for a policy number').status === 'passed',
);

console.log('\n=== Verification ===');
for (const { description, ok } of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${description}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(
  failed === 0 ? `\nAll ${checks.length} checks passed.` : `\n${failed} check(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
