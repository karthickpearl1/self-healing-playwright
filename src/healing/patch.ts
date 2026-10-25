// Turn accepted heals into suggested code changes for a human to review.
// Nothing is ever applied automatically: the report shows a diff and a person decides.

import type { HealEvent } from './types';

export interface SourceFile {
  path: string;
  text: string;
}

export interface Patch {
  element: string;
  file: string;
  diff: string;
}

// One patch per healed element (an element healed in several tests only needs one fix).
export function suggestPatches(events: HealEvent[], files: SourceFile[]): Patch[] {
  const patches: Patch[] = [];
  const done = new Set<string>();

  for (const event of events) {
    if (!event.accepted || !event.suggestedPrimary || done.has(event.element)) continue;
    done.add(event.element);

    // Find the line in the locator map that holds the old primary locator.
    const oldLine = `primary: '${event.oldLocator}',`;
    for (const file of files) {
      const lines = file.text.split('\n');
      const index = lines.findIndex((line) => line.trim() === oldLine);
      if (index === -1) continue;
      const indent = lines[index].slice(0, lines[index].indexOf('primary'));
      const diff = [
        `--- a/${file.path}`,
        `+++ b/${file.path}`,
        `@@ line ${index + 1} @@ ${event.element}`,
        `-${lines[index]}`,
        `+${indent}primary: '${event.suggestedPrimary}',`,
      ].join('\n');
      patches.push({ element: event.element, file: file.path, diff });
      break;
    }
  }
  return patches;
}
