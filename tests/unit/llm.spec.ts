// Unit tests for the LLM step: prompt, strict answer parsing, the mock and the HTTP providers.
import { expect, test } from '@playwright/test';
import {
  askLlm,
  buildPrompt,
  describeCandidate,
  mockLlm,
  parseAnswer,
} from '../../src/healing/llm';
import { element } from './helpers';

const candidates = [
  element({
    tag: 'button',
    id: 'save-for-later',
    type: 'button',
    role: 'button',
    text: 'Save for later',
  }),
  element({ tag: 'button', id: 'send-claim', type: 'submit', role: 'button', text: 'Send claim' }),
];
const request = { intent: 'Submit claim button', oldLocator: '#submitClaim', candidates };

test('the prompt is a trimmed, numbered list of real elements', () => {
  const prompt = buildPrompt(request);
  expect(prompt).toContain(
    '[1] <button id="send-claim" type="submit" role="button" text="Send claim">',
  );
  expect(prompt).toContain('Reply with JSON only');
  expect(describeCandidate(element({ tag: 'div' }), 0)).toBe('[0] <div>'); // empty attributes left out
});

test('parseAnswer() accepts a well-formed answer, even inside a code fence', () => {
  const reply = '```json\n{"index": 1, "confidence": 0.9, "reason": "Same role and intent"}\n```';
  expect(parseAnswer(reply, 2)).toEqual({
    index: 1,
    confidence: 0.9,
    reason: 'Same role and intent',
  });
});

test('parseAnswer() turns anything dubious into "no answer"', () => {
  expect(parseAnswer('I think it is the second one', 2).index).toBeNull(); // not JSON
  expect(parseAnswer('{"index": 7, "confidence": 0.9}', 2).index).toBeNull(); // invented element
  expect(parseAnswer('{"index": 1, "confidence": 1.5}', 2).index).toBeNull(); // bad confidence
  expect(parseAnswer('{"index": 1}', 2).index).toBeNull(); // no confidence
  expect(parseAnswer('{"index": null, "reason": "none match"}', 2)).toEqual({
    index: null,
    confidence: 0,
    reason: 'none match',
  });
});

test('the mock is deterministic word overlap between intent and element', () => {
  const answer = JSON.parse(mockLlm(request));
  expect(answer.index).toBe(1); // "submit" (type), "claim" (text), "button" (role) all match
  expect(answer.confidence).toBe(1);
  expect(mockLlm(request)).toBe(mockLlm(request));
});

test('the OpenAI provider sends the prompt and parses the reply', async () => {
  const realFetch = globalThis.fetch;
  process.env.HEAL_LLM = 'openai';
  process.env.OPENAI_API_KEY = 'test-key-not-real';
  let sentBody = '';
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = String(init.body);
    const content = '{"index": 1, "confidence": 0.8, "reason": "submit button"}';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  }) as typeof fetch;
  try {
    const answer = await askLlm(request);
    expect(answer).toEqual({ index: 1, confidence: 0.8, reason: 'submit button' });
    expect(JSON.parse(sentBody).temperature).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.HEAL_LLM;
    delete process.env.OPENAI_API_KEY;
  }
});

test('a real provider without its settings fails with a clear message', async () => {
  process.env.HEAL_LLM = 'azure';
  try {
    await expect(askLlm(request)).rejects.toThrow('AZURE_OPENAI_ENDPOINT must be set');
  } finally {
    delete process.env.HEAL_LLM;
  }
});

test('HEAL_LLM=off skips the LLM step', async () => {
  process.env.HEAL_LLM = 'off';
  try {
    expect(await askLlm(request)).toBeNull();
  } finally {
    delete process.env.HEAL_LLM;
  }
});
