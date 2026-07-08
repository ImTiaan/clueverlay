import '../lib/loadEnv.js';
import {
  DEFAULT_GROQ_CASE_MODEL,
  generateCaseWithGroq,
  getStructuredOutputMode,
  saveGeneratedCaseFile,
} from './lib/casePipeline.js';

function getFlag(name: string, defaultValue: string): string {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : defaultValue;
}

async function main(): Promise<void> {
  const model = getFlag('model', process.env.GROQ_CASE_MODEL ?? DEFAULT_GROQ_CASE_MODEL);
  const structuredOutputMode = getStructuredOutputMode(getFlag('structured-output', process.env.GROQ_STRUCTURED_OUTPUT_MODE ?? 'strict'));
  const count = Number(getFlag('count', '1'));
  const maxFailures = Number(getFlag('max-failures', '10'));

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('count must be an integer between 1 and 100.');
  }

  if (!Number.isInteger(maxFailures) || maxFailures < 0 || maxFailures > 100) {
    throw new Error('max-failures must be an integer between 0 and 100.');
  }

  const results: string[] = [];
  const failures: Array<{ targetIndex: number; message: string }> = [];

  for (let index = 0; index < count; index += 1) {
    try {
      const envelope = await generateCaseWithGroq(model, { structuredOutputMode });
      const filePath = await saveGeneratedCaseFile(envelope);
      results.push(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown case generation error.';
      failures.push({
        targetIndex: index + 1,
        message,
      });

      if (failures.length > maxFailures) {
        throw new Error(
          `Case generation stopped after ${failures.length} failures. Last error: ${message}`,
        );
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        generated: results.length,
        requested: count,
        failed: failures.length,
        model,
        files: results,
        failures,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown case generation error.');
  process.exit(1);
});
