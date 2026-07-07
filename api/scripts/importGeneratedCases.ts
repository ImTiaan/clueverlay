import '../lib/loadEnv.js';
import path from 'node:path';
import {
  ensureGeneratedDirectories,
  loadGeneratedCaseFile,
} from './lib/casePipeline.js';
import { buildCaseCorpusEntryFromGeneratedCase, reviewGeneratedCase } from './lib/caseReview.js';
import { ensureStorageBucket, getGeneratedCaseFiles, importCaseEnvelope, loadExistingCaseCorpus } from './lib/caseImport.js';

function getFlag(name: string): string | null {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : null;
}

async function main(): Promise<void> {
  const fileArg = getFlag('file');
  const status = getFlag('status') ?? 'draft';
  const minScore = Number(getFlag('min-score') ?? '70');

  if (status !== 'draft' && status !== 'ready') {
    throw new Error('status must be either "draft" or "ready".');
  }

  if (!Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
    throw new Error('min-score must be an integer between 0 and 100.');
  }

  const filePaths = fileArg ? [path.resolve(process.cwd(), fileArg)] : await getGeneratedCaseFiles();

  if (filePaths.length === 0) {
    throw new Error('No generated case files were found to import.');
  }

  await ensureGeneratedDirectories();
  await ensureStorageBucket();
  const corpus = await loadExistingCaseCorpus();

  const imported: Array<{ file: string; caseId: string; status: string }> = [];
  const skipped: Array<{ file: string; score: number; reasons: string[] }> = [];

  for (const filePath of filePaths) {
    const envelope = await loadGeneratedCaseFile(filePath);
    const review = reviewGeneratedCase(envelope.case, corpus, { minScore });

    if (!review.passed) {
      skipped.push({
        file: filePath,
        score: review.score,
        reasons: review.reasons,
      });
      continue;
    }

    const importedCase = await importCaseEnvelope(envelope, status as 'draft' | 'ready');
    imported.push({
      file: filePath,
      caseId: importedCase.caseId,
      status,
    });

    corpus.push(buildCaseCorpusEntryFromGeneratedCase(envelope.case, importedCase.caseId));
  }

  console.log(JSON.stringify({ imported, skipped, minScore }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown case import error.');
  process.exit(1);
});
