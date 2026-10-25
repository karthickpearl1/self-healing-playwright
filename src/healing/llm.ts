// The optional LLM step: when fallbacks and fingerprints fail, ask a model which element
// on the page is the one the test meant.
//
// Guardrails built in here:
//  - The model only CHOOSES from a numbered list of elements that really exist on the page.
//    It never writes a selector, so it cannot invent one.
//  - Its answer is parsed strictly. Anything malformed is treated as "no answer".
//  - The healer caps its confidence (see LLM_CONFIDENCE_CAP) and checks the element kind.
//
// HEAL_LLM picks the provider: mock (default, offline and deterministic), openai, azure,
// bedrock, or off.

import { words } from './similarity';
import type { ElementInfo } from './types';

export interface LlmRequest {
  intent: string;
  oldLocator: string;
  candidates: ElementInfo[];
}

export interface LlmAnswer {
  index: number | null; // which candidate, or null for "none of them"
  confidence: number;
  reason: string;
}

// One compact line per candidate. This trimmed snapshot is all the model sees of the page:
// no scripts, no styles, no layout, just the attributes that identify an element.
export function describeCandidate(candidate: ElementInfo, index: number): string {
  const parts = [`[${index}] <${candidate.tag}`];
  for (const key of [
    'id',
    'name',
    'type',
    'value',
    'role',
    'label',
    'text',
    'placeholder',
  ] as const) {
    if (candidate[key]) parts.push(`${key}="${candidate[key]}"`);
  }
  return parts.join(' ') + '>';
}

export function buildPrompt(request: LlmRequest): string {
  return [
    'A UI test could not find an element because the page changed.',
    `The test wanted: ${request.intent}`,
    `Its old locator was: ${request.oldLocator}`,
    '',
    'These are the elements on the page now:',
    ...request.candidates.map(describeCandidate),
    '',
    'Which one element is the one the test wanted? If none clearly matches, say so.',
    'Do not pick an element just because it is similar. A wrong pick hides real bugs.',
    'Reply with JSON only: {"index": <number or null>, "confidence": <0 to 1>, "reason": "<short>"}',
  ].join('\n');
}

// Read the model's reply. Be strict: anything we do not understand means "no answer".
export function parseAnswer(reply: string, candidateCount: number): LlmAnswer {
  const none = (reason: string): LlmAnswer => ({ index: null, confidence: 0, reason });
  const json = reply.match(/\{[\s\S]*\}/); // models sometimes wrap JSON in ``` fences
  if (!json) return none('The model reply was not JSON.');
  let data: { index?: unknown; confidence?: unknown; reason?: unknown };
  try {
    data = JSON.parse(json[0]);
  } catch {
    return none('The model reply was not valid JSON.');
  }
  const reason = typeof data.reason === 'string' ? data.reason : '';
  if (data.index === null) return none(reason || 'The model found no match.');
  const index = data.index;
  const confidence = data.confidence;
  if (
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= candidateCount
  ) {
    return none(`The model picked an element that does not exist (${String(index)}).`);
  }
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return none('The model gave no usable confidence.');
  }
  return { index, confidence, reason };
}

// The offline mock. It is NOT intelligent: it counts how many words of the human-written
// intent appear in each candidate's attributes, and its confidence is that fraction.
// It exists so the whole LLM path (prompt, answer, parsing, confidence gate, report) runs
// in CI with no keys and gives the same answer every time.
export function mockLlm(request: LlmRequest): string {
  const intentWords = new Set(words(request.intent));
  let bestIndex: number | null = null;
  let bestScore = 0;
  request.candidates.forEach((candidate, index) => {
    const { id, name, type, value, role, label, text, placeholder } = candidate;
    const candidateWords = new Set(
      words([id, name, type, value, role, label, text, placeholder].join(' ')),
    );
    const shared = [...intentWords].filter((word) => candidateWords.has(word)).length;
    const score = shared / intentWords.size;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return JSON.stringify({
    index: bestIndex,
    confidence: Number(bestScore.toFixed(2)),
    reason: `Mock: ${Math.round(bestScore * 100)}% of the intent words match this element.`,
  });
}

// --- Real providers. Plain fetch calls, so there are no SDK dependencies to install. ---

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`LLM call failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function chatBody(prompt: string) {
  return {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0, // as repeatable as the model allows
    response_format: { type: 'json_object' },
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to use this LLM provider.`);
  return value;
}

async function callOpenAI(prompt: string): Promise<string> {
  const data = await postJson(
    'https://api.openai.com/v1/chat/completions',
    { authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}` },
    { model: process.env.HEAL_LLM_MODEL ?? 'gpt-4.1-mini', ...chatBody(prompt) },
  );
  return data.choices[0].message.content;
}

async function callAzure(prompt: string): Promise<string> {
  const endpoint = requireEnv('AZURE_OPENAI_ENDPOINT').replace(/\/$/, '');
  const deployment = requireEnv('AZURE_OPENAI_DEPLOYMENT');
  const version = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21';
  const data = await postJson(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${version}`,
    { 'api-key': requireEnv('AZURE_OPENAI_API_KEY') },
    chatBody(prompt),
  );
  return data.choices[0].message.content;
}

async function callBedrock(prompt: string): Promise<string> {
  // Bedrock needs AWS request signing, so this one uses the AWS SDK. It is optional:
  // npm install @aws-sdk/client-bedrock-runtime. Credentials come from the usual AWS env vars.
  const sdkName = '@aws-sdk/client-bedrock-runtime'; // a variable, so TypeScript does not need it installed
  const sdk = await import(sdkName);
  const client = new sdk.BedrockRuntimeClient({});
  const result = await client.send(
    new sdk.ConverseCommand({
      modelId: requireEnv('BEDROCK_MODEL_ID'),
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { temperature: 0 },
    }),
  );
  return result.output.message.content[0].text;
}

export function getLlmName(): string {
  return process.env.HEAL_LLM ?? 'mock';
}

// Ask the configured provider. Returns null when the LLM step is switched off.
export async function askLlm(request: LlmRequest): Promise<LlmAnswer | null> {
  const name = getLlmName();
  if (name === 'off') return null;
  const prompt = buildPrompt(request);
  let reply: string;
  if (name === 'mock') reply = mockLlm(request);
  else if (name === 'openai') reply = await callOpenAI(prompt);
  else if (name === 'azure') reply = await callAzure(prompt);
  else if (name === 'bedrock') reply = await callBedrock(prompt);
  else throw new Error(`Unknown HEAL_LLM "${name}". Use mock, openai, azure, bedrock or off.`);
  return parseAnswer(reply, request.candidates.length);
}
