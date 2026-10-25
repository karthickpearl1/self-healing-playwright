// Run the e2e suite against one version of the demo app in one healing mode.
//
//   node scripts/scenario.mjs <v1|v2|v2-bug> <off|heal|strict> [--update-fingerprints]
//
// It sets the environment variables and runs Playwright, writing the healing report to
// healing-report/<variant>-<mode>/. Written in Node rather than as npm-script env vars
// so it works the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';

const [variant, mode, flag] = process.argv.slice(2);
if (!['v1', 'v2', 'v2-bug'].includes(variant) || !['off', 'heal', 'strict'].includes(mode)) {
  console.error('Usage: node scripts/scenario.mjs <v1|v2|v2-bug> <off|heal|strict>');
  process.exit(2);
}

const env = {
  ...process.env,
  APP_VARIANT: variant,
  HEAL_MODE: mode,
  HEAL_REPORT_DIR: `healing-report/${variant}-${mode}`,
  UPDATE_FINGERPRINTS: flag === '--update-fingerprints' ? '1' : '0',
};
const result = spawnSync('npx', ['playwright', 'test', '--project=e2e'], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32', // npx is npx.cmd on Windows
});
process.exit(result.status ?? 1);
