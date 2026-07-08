import {
  DEFAULT_GROQ_CASE_MODEL,
  GENERATED_REJECTED_CASES_DIR,
  GroqRateLimitError,
  GroqSchemaValidationError,
  GroqTransportError,
  GroqUnsupportedStructuredOutputModelError,
  generateCaseWithGroq,
  saveGeneratedCaseFile,
  supportsStrictStructuredOutputs,
} from './casePipeline.js';
import { buildCaseCorpusEntryFromGeneratedCase, reviewGeneratedCase, type CaseCorpusEntry } from './caseReview.js';
import { ensureStorageBucket, importCaseEnvelope, loadExistingCaseCorpus } from './caseImport.js';

export type BuildCasePoolOptions = {
  count: number;
  minScore?: number;
  maxAttempts?: number;
  model?: string;
  fallbackModels?: string[];
  status?: 'draft' | 'ready';
  dryRun?: boolean;
};

export type BuildCasePoolResult = {
  requested: number;
  approved: number;
  rejected: number;
  attempts: number;
  status: 'draft' | 'ready';
  dryRun: boolean;
  minScore: number;
  pausedDueToQuota: boolean;
  resumeRecommended: boolean;
  quotaWaitSeconds: number | null;
  modelSequence: string[];
  imported: Array<{ file: string; caseId: string | null; victimName: string; score: number }>;
  rejectedSamples: Array<{ victimName: string; score: number; reasons: string[] }>;
  warnings: string[];
};

export function buildAvoidanceConstraints(corpus: CaseCorpusEntry[]): string[] {
  const victimNames = Array.from(new Set(corpus.map((entry) => entry.victimName))).slice(-20);
  const suspectNames = Array.from(new Set(corpus.flatMap((entry) => entry.suspectNames))).slice(-40);
  const evidenceNames = Array.from(new Set(corpus.flatMap((entry) => entry.evidenceNames))).slice(-30);
  const constraints: string[] = [];

  if (victimNames.length > 0) {
    constraints.push(`Do not reuse these victim names: ${victimNames.join(', ')}.`);
  }

  if (suspectNames.length > 0) {
    constraints.push(`Do not reuse these suspect names: ${suspectNames.join(', ')}.`);
  }

  if (evidenceNames.length > 0) {
    constraints.push(`Do not reuse these evidence names: ${evidenceNames.join(', ')}.`);
  }

  constraints.push('Make the setting, motive, and clue mix feel materially different from prior cases.');

  return constraints;
}

export async function buildCasePool(options: BuildCasePoolOptions): Promise<BuildCasePoolResult> {
  const {
    count,
    minScore = 70,
    maxAttempts = count * 3,
    model = process.env.GROQ_CASE_MODEL ?? DEFAULT_GROQ_CASE_MODEL,
    fallbackModels = parseModelList(process.env.GROQ_FALLBACK_MODELS),
    status = 'draft',
    dryRun = false,
  } = options;

  if (!Number.isInteger(count) || count < 1 || count > 200) {
    throw new Error('count must be an integer between 1 and 200.');
  }

  if (!Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
    throw new Error('min-score must be an integer between 0 and 100.');
  }

  if (!Number.isInteger(maxAttempts) || maxAttempts < count || maxAttempts > 1000) {
    throw new Error('max-attempts must be an integer between count and 1000.');
  }

  if (status !== 'draft' && status !== 'ready') {
    throw new Error('status must be either "draft" or "ready".');
  }

  if (!dryRun) {
    await ensureStorageBucket();
  }

  const corpus = await loadExistingCaseCorpus();
  return buildCasePoolAgainstCorpus(corpus, {
    count,
    minScore,
    maxAttempts,
    model,
    fallbackModels,
    status,
    dryRun,
  });
}

export async function buildCasePoolAgainstCorpus(
  corpus: CaseCorpusEntry[],
  options: Required<BuildCasePoolOptions>,
): Promise<BuildCasePoolResult> {
  const imported: Array<{ file: string; caseId: string | null; victimName: string; score: number }> = [];
  const rejected: Array<{ victimName: string; score: number; reasons: string[] }> = [];
  const warnings: string[] = [];
  const modelSequence = dedupeModelList([options.model, ...options.fallbackModels]);
  let attempts = 0;
  let pausedDueToQuota = false;
  let quotaWaitSeconds: number | null = null;

  while (imported.length < options.count && attempts < options.maxAttempts) {
    attempts += 1;

    const generation = await generateWithFallbackModels(modelSequence, buildAvoidanceConstraints(corpus));

    if (generation.pausedDueToQuota) {
      pausedDueToQuota = true;
      quotaWaitSeconds = generation.quotaWaitSeconds;
      warnings.push(generation.warning);
      break;
    }

    if ('recoverableFailure' in generation && generation.recoverableFailure) {
      warnings.push(generation.warning);
      continue;
    }

    const envelope =
      'envelope' in generation
        ? generation.envelope
        : (() => {
            throw new Error('Generation result did not include an envelope.');
          })();
    const review = reviewGeneratedCase(envelope.case, corpus, { minScore: options.minScore });

    if (!review.passed) {
      rejected.push({
        victimName: envelope.case.victim_name,
        score: review.score,
        reasons: review.reasons,
      });
      await saveGeneratedCaseFile(envelope, GENERATED_REJECTED_CASES_DIR);
      continue;
    }

    const filePath = await saveGeneratedCaseFile(envelope);
    let caseId: string | null = null;

    if (!options.dryRun) {
      const importedCase = await importCaseEnvelope(envelope, options.status);
      caseId = importedCase.caseId;
    }

    imported.push({
      file: filePath,
      caseId,
      victimName: envelope.case.victim_name,
      score: review.score,
    });

    corpus.push(buildCaseCorpusEntryFromGeneratedCase(envelope.case, caseId));
  }

  return {
    requested: options.count,
    approved: imported.length,
    rejected: rejected.length,
    attempts,
    status: options.status,
    dryRun: options.dryRun,
    minScore: options.minScore,
    pausedDueToQuota,
    resumeRecommended: pausedDueToQuota || imported.length < options.count,
    quotaWaitSeconds,
    modelSequence,
    imported,
    rejectedSamples: rejected.slice(0, 20),
    warnings,
  };
}

export async function getCaseCountsByStatus(): Promise<Record<string, number>> {
  const { data, error } = await loadExistingCaseCorpusWithStatuses();

  if (error) {
    throw new Error(`Unable to load case counts: ${error}`);
  }

  return data;
}

async function loadExistingCaseCorpusWithStatuses(): Promise<{
  data: Record<string, number>;
  error: string | null;
}> {
  const { supabaseAdmin } = await import('../../lib/supabaseAdmin.js');
  const { data, error } = await supabaseAdmin.from('cases').select('status');

  if (error) {
    return {
      data: {},
      error: error.message,
    };
  }

  const counts = (data ?? []).reduce<Record<string, number>>((accumulator, row) => {
    const status = typeof row.status === 'string' ? row.status : 'unknown';
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    data: counts,
    error: null,
  };
}

async function generateWithFallbackModels(
  models: string[],
  extraConstraints: string[],
): Promise<
  | {
      pausedDueToQuota: false;
      envelope: Awaited<ReturnType<typeof generateCaseWithGroq>>;
    }
  | {
      pausedDueToQuota: true;
      quotaWaitSeconds: number | null;
      warning: string;
    }
  | {
      pausedDueToQuota: false;
      recoverableFailure: true;
      warning: string;
    }
> {
  let highestRetryAfter: number | null = null;
  const exhaustedModels: string[] = [];
  const skippedModels: string[] = [];
  const schemaFailedModels: string[] = [];
  const transportFailedModels: string[] = [];

  for (const model of models) {
    if (!supportsStrictStructuredOutputs(model)) {
      skippedModels.push(model);
      continue;
    }

    try {
      const envelope = await generateCaseWithGroq(model, {
        extraConstraints,
      });

      return {
        pausedDueToQuota: false,
        envelope,
      };
    } catch (error) {
      if (error instanceof GroqUnsupportedStructuredOutputModelError) {
        skippedModels.push(model);
        continue;
      }

      if (error instanceof GroqSchemaValidationError) {
        schemaFailedModels.push(model);
        continue;
      }

      if (error instanceof GroqTransportError) {
        transportFailedModels.push(model);
        continue;
      }

      if (!(error instanceof GroqRateLimitError) || !error.isDailyTokenLimit) {
        throw error;
      }

      exhaustedModels.push(model);
      if (error.retryAfterSeconds !== null) {
        highestRetryAfter = Math.max(highestRetryAfter ?? 0, error.retryAfterSeconds);
      }
    }
  }

  if (exhaustedModels.length === 0) {
    if (schemaFailedModels.length > 0 || transportFailedModels.length > 0) {
      return {
        pausedDueToQuota: false,
        recoverableFailure: true,
        warning: [
          skippedModels.length > 0
            ? `Skipped incompatible structured-output models: ${skippedModels.join(', ')}.`
            : null,
          schemaFailedModels.length > 0
            ? `Schema validation failed for: ${schemaFailedModels.join(', ')}. The run will skip this attempt and continue.`
            : null,
          transportFailedModels.length > 0
            ? `Transient Groq transport failures occurred for: ${transportFailedModels.join(', ')}. The run will retry on the next attempt.`
            : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' '),
      };
    }

    throw new Error(
      skippedModels.length > 0
        ? `No configured Groq models support strict json_schema structured outputs. Supported strict models: openai/gpt-oss-20b, openai/gpt-oss-120b. Skipped: ${skippedModels.join(', ')}.`
        : 'No Groq models were configured for generation.',
    );
  }

  return {
    pausedDueToQuota: true,
    quotaWaitSeconds: highestRetryAfter,
    warning: [
      skippedModels.length > 0
        ? `Skipped incompatible structured-output models: ${skippedModels.join(', ')}.`
        : null,
      exhaustedModels.length === 1
        ? `Generation paused because model "${exhaustedModels[0]}" exhausted its daily Groq token quota.`
        : `Generation paused because all configured Groq models exhausted their daily token quotas: ${exhaustedModels.join(', ')}.`,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' '),
  };
}

function parseModelList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function dedupeModelList(models: string[]): string[] {
  return Array.from(new Set(models.map((model) => model.trim()).filter((model) => model.length > 0)));
}
