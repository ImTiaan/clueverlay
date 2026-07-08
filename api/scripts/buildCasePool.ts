import '../lib/loadEnv.js';
import { DEFAULT_GROQ_CASE_MODEL, getStructuredOutputMode } from './lib/casePipeline.js';
import { buildCasePool } from './lib/casePoolBuilder.js';

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
  const count = Number(getFlag('count', '10'));
  const minScore = Number(getFlag('min-score', '70'));
  const maxAttempts = Number(getFlag('max-attempts', String(count * 3)));
  const status = getFlag('status', 'draft');
  const dryRun = process.argv.includes('--dry-run');
  const result = await buildCasePool({
    count,
    minScore,
    maxAttempts,
    model,
    fallbackModels,
    structuredOutputMode,
    status: status as 'draft' | 'ready',
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown case pool build error.');
  process.exit(1);
});
