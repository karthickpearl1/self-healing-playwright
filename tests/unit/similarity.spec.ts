// Unit tests for fingerprint scoring: the maths that decides whether a heal is trusted.
import { expect, test } from '@playwright/test';
import { bestMatch, scoreCandidate, wordSimilarity, words } from '../../src/healing/similarity';
import { element } from './helpers';

test('words() splits camelCase, kebab-case and sentences the same way', () => {
  expect(words('policyNumber')).toEqual(['policy', 'number']);
  expect(words('policy-number')).toEqual(['policy', 'number']);
  expect(words('Policy number?')).toEqual(['policy', 'number']);
});

test('wordSimilarity() is shared words over all words', () => {
  expect(wordSimilarity('phoneNumber', 'phone-number')).toBe(1);
  expect(wordSimilarity('Phone number', 'Mobile number')).toBeCloseTo(1 / 3);
  expect(wordSimilarity('submit', 'cancel')).toBe(0);
});

test('an identical element scores 1', () => {
  const stored = element({ id: 'phoneNumber', name: 'phoneNumber', type: 'tel', label: 'Phone' });
  expect(scoreCandidate(stored, stored)).toBe(1);
});

test('a different kind of element always scores 0, however similar its attributes', () => {
  const stored = element({ tag: 'input', id: 'submit', name: 'submit' });
  const button = element({ tag: 'button', id: 'submit', name: 'submit' });
  expect(scoreCandidate(stored, button)).toBe(0);
});

test('only attributes the stored element had are counted', () => {
  // The stored element had only an id. The candidate's extra attributes neither help nor hurt.
  const stored = element({ id: 'incidentDate' });
  const candidate = element({ id: 'incident-date', name: 'x', label: 'anything' });
  expect(scoreCandidate(stored, candidate)).toBe(1);
});

test('the v2 phone field scores as the weights say (the 0.72 seen in the real run)', () => {
  const stored = element({
    id: 'phoneNumber',
    name: 'phoneNumber',
    type: 'tel',
    label: 'Phone number',
    testId: 'phone-number',
  });
  const v2 = element({
    id: 'phone-number',
    name: 'phoneNumber',
    type: 'tel',
    label: 'Mobile number',
  });
  // id 3 + name 3 + type 2 + label 2 * 1/3 + testId 0 = 8.67 out of 12
  expect(scoreCandidate(stored, v2)).toBeCloseTo(8.667 / 12, 3);
});

test('bestMatch() picks the clear winner', () => {
  const stored = element({ id: 'incidentDate', name: 'incidentDate', type: 'date' });
  const match = bestMatch(stored, [
    element({ id: 'policy-ref', name: 'policyRef' }),
    element({
      id: 'incident-date',
      name: 'incidentDate',
      type: 'date',
      selector: '#incident-date',
    }),
  ]);
  expect(match.candidate?.selector).toBe('#incident-date');
  expect(match.score).toBe(1);
});

test('bestMatch() refuses when two candidates are too close to call', () => {
  const stored = element({ type: 'radio', name: 'contact', value: 'phone' });
  const match = bestMatch(stored, [
    element({ type: 'radio', name: 'contact', value: 'email' }),
    element({ type: 'radio', name: 'contact', value: 'post' }),
  ]);
  expect(match.candidate).toBeNull();
  expect(match.reason).toContain('too close to call');
});

test('bestMatch() returns nothing when no element is of the same kind', () => {
  const stored = element({ tag: 'textarea', name: 'description' });
  const match = bestMatch(stored, [element({ tag: 'input', name: 'description' })]);
  expect(match.candidate).toBeNull();
  expect(match.score).toBe(0);
});
