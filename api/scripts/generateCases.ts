import '../lib/loadEnv.js';
import {
  DEFAULT_GROQ_CASE_MODEL,
  generateCaseWithGroq,
  saveGeneratedCaseFile,
} from './lib/casePipeline.js';

function getFlag(name: string, defaultValue: string): string {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : defaultValue;
}

async function main(): Promise<void> {
  const model = getFlag('model', process.env.GROQ_CASE_MODEL ?? DEFAULT_GROQ_CASE_MODEL);
  const count = Number(getFlag('count', '1'));

  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error('count must be an integer between 1 and 20.');
  }

  const results: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const envelope = await generateCaseWithGroq(model);
    const filePath = await saveGeneratedCaseFile(envelope);
    results.push(filePath);
  }

  console.log(
    JSON.stringify(
      {
        generated: results.length,
        model,
        files: results,
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
