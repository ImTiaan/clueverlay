import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type GeneratedSuspect = {
  name: string;
  description: string;
  statement_v1: string;
  statement_v2: string;
};

export type GeneratedEvidence = {
  name: string;
  detail: string;
};

export type GeneratedCase = {
  scene_narrative: string;
  victim_name: string;
  victim_description: string;
  solution_summary: string;
  guilty_suspect_name: string;
  suspects: GeneratedSuspect[];
  evidence: GeneratedEvidence[];
};

export type GeneratedCaseEnvelope = {
  schemaVersion: 1;
  generatedAt: string;
  sourceModel: string;
  promptVersion: string;
  case: GeneratedCase;
};

export type GenerationOptions = {
  extraConstraints?: string[];
  structuredOutputMode?: StructuredOutputMode;
};

export type StructuredOutputMode = 'strict' | 'best_effort';

export class GroqRateLimitError extends Error {
  model: string;
  retryAfterSeconds: number | null;
  isDailyTokenLimit: boolean;

  constructor(params: {
    model: string;
    message: string;
    retryAfterSeconds?: number | null;
    isDailyTokenLimit?: boolean;
  }) {
    super(params.message);
    this.name = 'GroqRateLimitError';
    this.model = params.model;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;
    this.isDailyTokenLimit = params.isDailyTokenLimit ?? false;
  }
}

export class GroqUnsupportedStructuredOutputModelError extends Error {
  model: string;

  constructor(model: string) {
    super(
      `Groq model "${model}" does not support strict json_schema structured outputs. Supported strict models: openai/gpt-oss-20b, openai/gpt-oss-120b.`,
    );
    this.name = 'GroqUnsupportedStructuredOutputModelError';
    this.model = model;
  }
}

export class GroqSchemaValidationError extends Error {
  model: string;

  constructor(model: string, message: string) {
    super(message);
    this.name = 'GroqSchemaValidationError';
    this.model = model;
  }
}

export class GroqTransportError extends Error {
  model: string;

  constructor(model: string, message: string) {
    super(message);
    this.name = 'GroqTransportError';
    this.model = model;
  }
}

export const GENERATED_CASES_DIR = path.resolve(process.cwd(), 'content/generated/cases');
export const GENERATED_ASSETS_DIR = path.resolve(process.cwd(), 'content/generated/assets');
export const GENERATED_REJECTED_CASES_DIR = path.resolve(process.cwd(), 'content/generated/rejected');
export const CASE_ASSET_BUCKET = 'case-assets';
const PROMPT_VERSION = 'v1';
export const DEFAULT_GROQ_CASE_MODEL = 'openai/gpt-oss-20b';
const GROQ_MAX_RETRIES = 4;
export const GROQ_STRICT_STRUCTURED_OUTPUT_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'] as const;

export function getStructuredOutputMode(input?: string | null): StructuredOutputMode {
  const raw = (input ?? process.env.GROQ_STRUCTURED_OUTPUT_MODE ?? 'strict').trim().toLowerCase();
  if (raw === 'best_effort' || raw === 'best-effort' || raw === 'best') {
    return 'best_effort';
  }
  return 'strict';
}

export function getGenerationPrompt(options?: GenerationOptions): string {
  const extraConstraints = options?.extraConstraints?.filter((constraint) => constraint.trim().length > 0) ?? [];
  const extraConstraintBlock =
    extraConstraints.length > 0
      ? `\nAdditional anti-duplication constraints:\n${extraConstraints.map((constraint) => `- ${constraint}`).join('\n')}`
      : '';

  return `Generate one mystery case for a Twitch chat detective game. Return ONLY valid JSON, with no markdown and no preamble.

Schema:
{
  "scene_narrative": string,
  "victim_name": string,
  "victim_description": string,
  "solution_summary": string,
  "guilty_suspect_name": string,
  "suspects": [{ "name": string, "description": string, "statement_v1": string, "statement_v2": string }],
  "evidence": [{ "name": string, "detail": string }]
}

Constraints:
- scene_narrative must be 3 to 5 sentences with concrete, sensory details (sound, light, smell, weather, etc.).
- victim_description must be 1 to 2 sentences and feel like a real person with a clear identity.
- Use 3 to 5 suspects.
- Use 3 to 5 evidence items.
- All names must be fictional.
- guilty_suspect_name must exactly match one suspect name character-for-character.
- Include a short private solution_summary for the final reveal.
- Make at least one innocent suspect sound scattered or vague in a believable way.
- Give the guilty suspect at least one detail that feels slightly too neat or implausible on close reading.
- Evidence should subtly support the correct answer without making it trivial.
- Every evidence item must make contextual sense for the scene and cause of death.
- If there is a murder weapon or decisive object, reference it consistently in the scene, the evidence, and the solution summary.
- Do not include random props or clues that have no logical bearing on how the crime happened.
- Each evidence.detail should be 1 to 2 sentences describing what it is and why it matters.
- Each statement_v1 must be 2 to 4 sentences: where they were, what they did, what they noticed, and one concrete detail tied to the scene or evidence.
- Each statement_v2 must be 2 to 4 sentences: a follow-up that adds NEW information, clarifies timeline, or reveals a subtle contradiction (especially for the guilty suspect).
- Tone can be darker, but must remain Twitch-safe.
- Do not include real-world hate content or sexual violence themes.
- Avoid generic placeholder names.
- Make every suspect description visually specific enough to support an avatar and overlay card.
- Keep statements short enough to work as Twitch chat messages.${extraConstraintBlock}`;
}

export async function generateCaseWithGroq(model: string, options?: GenerationOptions): Promise<GeneratedCaseEnvelope> {
  const apiKey = process.env.GROQ_API_KEY;
  const structuredOutputMode = getStructuredOutputMode(options?.structuredOutputMode);

  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY');
  }

  if (structuredOutputMode === 'strict' && !supportsStrictStructuredOutputs(model)) {
    throw new GroqUnsupportedStructuredOutputModelError(model);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < GROQ_MAX_RETRIES; attempt += 1) {
    try {
      const responseFormat =
        structuredOutputMode === 'strict'
          ? {
              type: 'json_schema',
              json_schema: {
                name: 'the_case_generation',
                strict: true,
                schema: getCaseJsonSchema(),
              },
            }
          : undefined;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content:
                'You generate fictional Twitch-safe detective cases. Return only schema-compliant JSON.',
            },
            {
              role: 'user',
              content: getGenerationPrompt(options),
            },
          ],
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              refusal?: string | null;
            };
          }>;
        };
        const choice = payload.choices?.[0];
        const refusal = choice?.message?.refusal;
        const content = choice?.message?.content;

        if (refusal) {
          throw new Error(`Groq generation refused the request: ${refusal}`);
        }

        if (!content) {
          throw new Error('Groq did not return generated case content.');
        }

        const parsed = parseBestEffortJson(content);
        const generatedCase = validateGeneratedCase(parsed);

        return {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          sourceModel: model,
          promptVersion: PROMPT_VERSION,
          case: generatedCase,
        };
      }

      const errorText = await response.text();
      const retryAfterHeader = response.headers.get('retry-after');
      const tokenResetHeader = response.headers.get('x-ratelimit-reset-tokens');
      const retrySeconds = parseRetryAfterSeconds(retryAfterHeader, tokenResetHeader, errorText);
      const isDailyTokenLimit = /tokens per day|TPD/i.test(errorText);
      const isSchemaValidationFailure = /json_validate_failed/i.test(errorText);
      const isResponseFormatUnsupported = /does not support response format/i.test(errorText);

      if (response.status === 429) {
        lastError = new GroqRateLimitError({
          model,
          message: `Groq generation failed: ${response.status} ${errorText}`,
          retryAfterSeconds: retrySeconds,
          isDailyTokenLimit,
        });
      } else if (
        response.status === 400 &&
        structuredOutputMode === 'strict' &&
        isResponseFormatUnsupported
      ) {
        lastError = new GroqUnsupportedStructuredOutputModelError(model);
      } else if (isSchemaValidationFailure) {
        lastError = new GroqSchemaValidationError(model, `Groq generation failed: ${response.status} ${errorText}`);
      } else {
        lastError = new Error(`Groq generation failed: ${response.status} ${errorText}`);
      }

      if (response.status === 429 && isDailyTokenLimit) {
        throw lastError;
      }

      if ((response.status === 429 || isSchemaValidationFailure) && attempt < GROQ_MAX_RETRIES - 1) {
        const waitMs = Math.ceil((retrySeconds ?? 15) * 1000 + 500);
        await sleep(waitMs);
        continue;
      }

      throw lastError;
    } catch (error) {
      if (error instanceof Error && /fetch failed/i.test(error.message)) {
        lastError = new GroqTransportError(model, `Groq transport failed: ${error.message}`);
      } else {
        lastError = error instanceof Error ? error : new Error('Unknown Groq generation error.');
      }

      if (attempt < GROQ_MAX_RETRIES - 1) {
        await sleep(1000);
        continue;
      }

      throw lastError;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Groq generation failed for an unknown reason.');
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function parseBestEffortJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const extracted = extractFirstJsonObject(trimmed);
    if (!extracted) {
      throw new Error('Groq returned non-JSON output.');
    }
    return JSON.parse(extracted) as unknown;
  }
}

function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf('{');
  const end = input.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return input.slice(start, end + 1);
}

function parseRetryAfterSeconds(
  retryAfterHeader: string | null,
  tokenResetHeader: string | null,
  errorText: string,
): number | null {
  if (retryAfterHeader) {
    const parsed = parseDurationToSeconds(retryAfterHeader);
    if (parsed !== null) {
      return parsed;
    }
  }

  if (tokenResetHeader) {
    const parsed = parseDurationToSeconds(tokenResetHeader);
    if (parsed !== null) {
      return parsed;
    }
  }

  const retryMatch = errorText.match(/Please try again in\s+([0-9.]+(?:ms|s)|[0-9]+m[0-9.]+s)/i);
  if (retryMatch) {
    return parseDurationToSeconds(retryMatch[1]);
  }

  return null;
}

function parseDurationToSeconds(value: string): number | null {
  const trimmed = value.trim();

  if (/^[0-9.]+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const millisecondsMatch = trimmed.match(/^([0-9.]+)ms$/i);
  if (millisecondsMatch) {
    return Number(millisecondsMatch[1]) / 1000;
  }

  const minuteSecondMatch = trimmed.match(/^([0-9]+)m([0-9.]+)s$/i);
  if (minuteSecondMatch) {
    return Number(minuteSecondMatch[1]) * 60 + Number(minuteSecondMatch[2]);
  }

  const secondsMatch = trimmed.match(/^([0-9.]+)s$/i);
  if (secondsMatch) {
    return Number(secondsMatch[1]);
  }

  return null;
}

export function supportsStrictStructuredOutputs(model: string): boolean {
  return GROQ_STRICT_STRUCTURED_OUTPUT_MODELS.includes(
    model as (typeof GROQ_STRICT_STRUCTURED_OUTPUT_MODELS)[number],
  );
}

function getCaseJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      scene_narrative: {
        type: 'string',
      },
      victim_name: {
        type: 'string',
      },
      victim_description: {
        type: 'string',
      },
      solution_summary: {
        type: 'string',
      },
      guilty_suspect_name: {
        type: 'string',
      },
      suspects: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            statement_v1: { type: 'string' },
            statement_v2: { type: 'string' },
          },
          required: ['name', 'description', 'statement_v1', 'statement_v2'],
        },
      },
      evidence: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            detail: { type: 'string' },
          },
          required: ['name', 'detail'],
        },
      },
    },
    required: [
      'scene_narrative',
      'victim_name',
      'victim_description',
      'solution_summary',
      'guilty_suspect_name',
      'suspects',
      'evidence',
    ],
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}: expected non-empty string.`);
  }

  return value.trim();
}

export function validateGeneratedCase(input: unknown): GeneratedCase {
  if (!input || typeof input !== 'object') {
    throw new Error('Generated case must be an object.');
  }

  const candidate = input as Record<string, unknown>;
  const suspectsInput = candidate.suspects;
  const evidenceInput = candidate.evidence;

  if (!Array.isArray(suspectsInput) || suspectsInput.length < 3 || suspectsInput.length > 5) {
    throw new Error('Generated case must include 3 to 5 suspects.');
  }

  if (!Array.isArray(evidenceInput) || evidenceInput.length < 3 || evidenceInput.length > 5) {
    throw new Error('Generated case must include 3 to 5 evidence items.');
  }

  const suspects = suspectsInput.map((suspect, index) => validateSuspect(suspect, index));
  const evidence = evidenceInput.map((item, index) => validateEvidence(item, index));
  const guiltySuspectName = ensureString(candidate.guilty_suspect_name, 'guilty_suspect_name');

  if (!suspects.some((suspect) => suspect.name.toLowerCase() === guiltySuspectName.toLowerCase())) {
    throw new Error('guilty_suspect_name must match one of the generated suspects.');
  }

  assertUniqueValues(
    suspects.map((suspect) => suspect.name.toLowerCase()),
    'suspect names must be unique',
  );
  assertUniqueValues(
    evidence.map((item) => item.name.toLowerCase()),
    'evidence names must be unique',
  );

  return {
    scene_narrative: ensureString(candidate.scene_narrative, 'scene_narrative'),
    victim_name: ensureString(candidate.victim_name, 'victim_name'),
    victim_description: ensureString(candidate.victim_description, 'victim_description'),
    solution_summary: ensureString(candidate.solution_summary, 'solution_summary'),
    guilty_suspect_name: guiltySuspectName,
    suspects,
    evidence,
  };
}

function validateSuspect(input: unknown, index: number): GeneratedSuspect {
  if (!input || typeof input !== 'object') {
    throw new Error(`Invalid suspect at index ${index}.`);
  }

  const candidate = input as Record<string, unknown>;

  return {
    name: ensureString(candidate.name, `suspects[${index}].name`),
    description: ensureString(candidate.description, `suspects[${index}].description`),
    statement_v1: ensureString(candidate.statement_v1, `suspects[${index}].statement_v1`),
    statement_v2: ensureString(candidate.statement_v2, `suspects[${index}].statement_v2`),
  };
}

function validateEvidence(input: unknown, index: number): GeneratedEvidence {
  if (!input || typeof input !== 'object') {
    throw new Error(`Invalid evidence item at index ${index}.`);
  }

  const candidate = input as Record<string, unknown>;

  return {
    name: ensureString(candidate.name, `evidence[${index}].name`),
    detail: ensureString(candidate.detail, `evidence[${index}].detail`),
  };
}

function assertUniqueValues(values: string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(message);
  }
}

export async function ensureGeneratedDirectories(): Promise<void> {
  await mkdir(GENERATED_CASES_DIR, { recursive: true });
  await mkdir(GENERATED_ASSETS_DIR, { recursive: true });
  await mkdir(GENERATED_REJECTED_CASES_DIR, { recursive: true });
}

export async function saveGeneratedCaseFile(
  envelope: GeneratedCaseEnvelope,
  outputDirectory = GENERATED_CASES_DIR,
): Promise<string> {
  await ensureGeneratedDirectories();

  const filename = `${new Date(envelope.generatedAt).toISOString().replace(/[:.]/g, '-')}-${slugify(envelope.case.victim_name)}.json`;
  const filePath = path.join(outputDirectory, filename);

  await writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');

  return filePath;
}

export async function loadGeneratedCaseFile(filePath: string): Promise<GeneratedCaseEnvelope> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (parsed && typeof parsed === 'object' && 'case' in (parsed as Record<string, unknown>)) {
    const envelope = parsed as Record<string, unknown>;

    return {
      schemaVersion: 1,
      generatedAt:
        typeof envelope.generatedAt === 'string' ? envelope.generatedAt : new Date().toISOString(),
      sourceModel: typeof envelope.sourceModel === 'string' ? envelope.sourceModel : 'unknown',
      promptVersion: typeof envelope.promptVersion === 'string' ? envelope.promptVersion : PROMPT_VERSION,
      case: validateGeneratedCase((envelope as { case: unknown }).case),
    };
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceModel: 'unknown',
    promptVersion: PROMPT_VERSION,
    case: validateGeneratedCase(parsed),
  };
}

export async function fetchAndNormaliseDiceBearSvg(seed: string): Promise<string> {
  const response = await fetch(`https://api.dicebear.com/10.x/adventurer/svg?seed=${encodeURIComponent(seed)}`);

  if (!response.ok) {
    throw new Error(`Unable to generate DiceBear avatar for seed "${seed}".`);
  }

  const svg = await response.text();

  return svg
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}
