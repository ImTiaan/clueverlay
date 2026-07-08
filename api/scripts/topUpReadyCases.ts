import '../lib/loadEnv.js';
import { DEFAULT_GROQ_CASE_MODEL, getStructuredOutputMode } from './lib/casePipeline.js';
import { buildCasePool, getCaseCountsByStatus } from './lib/casePoolBuilder.js';

function getFlag(name: string, defaultValue: string): string {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : defaultValue;
}

async function main(): Promise<void> {
  const model = getFlag('model', process.env.GROQ_CASE_MODEL ?? DEFAULT_GROQ_CASE_MODEL);
  const fallbackModels = getFlag('fallback-models', process.env.GROQ_FALLBACK_MODELS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const structuredOutputMode = getStructuredOutputMode(getFlag('structured-output', process.env.GROQ_STRUCTURED_OUTPUT_MODE ?? 'strict'));
  const targetReady = Number(getFlag('target-ready', '25'));
  const minScore = Number(getFlag('min-score', '72'));
  const maxAttemptsPerCase = Number(getFlag('max-attempts-per-case', '3'));
  const dryRun = process.argv.includes('--dry-run');

  if (!Number.isInteger(targetReady) || targetReady < 1 || targetReady > 500) {
    throw new Error('target-ready must be an integer between 1 and 500.');
  }

  if (!Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
    throw new Error('min-score must be an integer between 0 and 100.');
  }

  if (!Number.isInteger(maxAttemptsPerCase) || maxAttemptsPerCase < 1 || maxAttemptsPerCase > 20) {
    throw new Error('max-attempts-per-case must be an integer between 1 and 20.');
  }

  const countsBefore = await getCaseCountsByStatus();
  const readyBefore = countsBefore.ready ?? 0;
  const needed = Math.max(0, targetReady - readyBefore);

  if (needed === 0) {
    console.log(
      JSON.stringify(
        {
          targetReady,
          readyBefore,
          readyAfter: readyBefore,
          generatedNeeded: 0,
          dryRun,
          message: 'Ready pool already meets or exceeds target.',
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await buildCasePool({
    count: needed,
    minScore,
    maxAttempts: needed * maxAttemptsPerCase,
    model,
    fallbackModels,
    structuredOutputMode,
    status: 'ready',
    dryRun,
  });

  const countsAfter = dryRun ? countsBefore : await getCaseCountsByStatus();
  const readyAfter = dryRun ? readyBefore + result.approved : countsAfter.ready ?? 0;

  console.log(
    JSON.stringify(
      {
        targetReady,
        readyBefore,
        readyAfter,
        generatedNeeded: needed,
        dryRun,
        build: result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown ready pool top-up error.');
  process.exit(1);
});
