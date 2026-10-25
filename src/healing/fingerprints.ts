// Stored fingerprints: what each element looked like on the last run where the primary
// locator worked. They are recorded from v1 with `npm run fingerprints` and committed,
// so a reviewer can see exactly what the healer compares against.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElementInfo } from './types';

export const FINGERPRINT_FILE = join(__dirname, '..', '..', 'fingerprints', 'fingerprints.json');

export type FingerprintStore = Record<string, ElementInfo>;

export function loadFingerprints(file = FINGERPRINT_FILE): FingerprintStore {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {}; // no file yet: fingerprint matching is simply skipped
  }
}

export function saveFingerprints(store: FingerprintStore, file = FINGERPRINT_FILE): void {
  // Sorted keys keep the file stable, so a re-record only shows real changes in a diff.
  const sorted = Object.fromEntries(Object.entries(store).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
}
