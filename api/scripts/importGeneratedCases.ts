import '../lib/loadEnv.js';
import { randomUUID } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import {
  CASE_ASSET_BUCKET,
  GENERATED_ASSETS_DIR,
  GENERATED_CASES_DIR,
  ensureGeneratedDirectories,
  fetchAndNormaliseDiceBearSvg,
  loadGeneratedCaseFile,
  slugify,
  type GeneratedCaseEnvelope,
} from './lib/casePipeline.js';

function getFlag(name: string): string | null {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : null;
}

async function main(): Promise<void> {
  const fileArg = getFlag('file');
  const status = getFlag('status') ?? 'draft';

  if (status !== 'draft' && status !== 'ready') {
    throw new Error('status must be either "draft" or "ready".');
  }

  const filePaths = fileArg ? [path.resolve(process.cwd(), fileArg)] : await getGeneratedCaseFiles();

  if (filePaths.length === 0) {
    throw new Error('No generated case files were found to import.');
  }

  await ensureGeneratedDirectories();
  await ensureStorageBucket();

  const imported: Array<{ file: string; caseId: string; status: string }> = [];

  for (const filePath of filePaths) {
    const envelope = await loadGeneratedCaseFile(filePath);
    const importedCase = await importCaseEnvelope(envelope, status);
    imported.push({
      file: filePath,
      caseId: importedCase.caseId,
      status,
    });
  }

  console.log(JSON.stringify({ imported }, null, 2));
}

async function getGeneratedCaseFiles(): Promise<string[]> {
  const entries = await readdir(GENERATED_CASES_DIR, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(GENERATED_CASES_DIR, entry.name))
    .sort();
}

async function ensureStorageBucket(): Promise<void> {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();

  if (error) {
    throw new Error(`Unable to list Supabase storage buckets: ${error.message}`);
  }

  if (buckets.some((bucket) => bucket.name === CASE_ASSET_BUCKET)) {
    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(CASE_ASSET_BUCKET, {
    public: true,
    fileSizeLimit: '1MB',
  });

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw new Error(`Unable to create Supabase storage bucket: ${createError.message}`);
  }
}

async function importCaseEnvelope(
  envelope: GeneratedCaseEnvelope,
  status: 'draft' | 'ready',
): Promise<{ caseId: string }> {
  const caseId = randomUUID();
  const victimAvatarPath = `victims/${caseId}.svg`;
  const victimSeed = `victim-${caseId}`;
  const victimSvg = await fetchAndNormaliseDiceBearSvg(victimSeed);
  const victimAvatarUrl = await uploadAsset(victimAvatarPath, victimSvg);
  const suspectRows: Array<Record<string, unknown>> = [];
  let guiltySuspectId: string | null = null;

  for (const [index, suspect] of envelope.case.suspects.entries()) {
    const suspectId = randomUUID();
    const suspectSvg = await fetchAndNormaliseDiceBearSvg(suspectId);
    const avatarPath = `suspects/${suspectId}.svg`;
    const avatarUrl = await uploadAsset(avatarPath, suspectSvg);

    await writeFile(path.join(GENERATED_ASSETS_DIR, `${slugify(suspect.name)}-${suspectId}.svg`), `${suspectSvg}\n`, 'utf8');

    suspectRows.push({
      id: suspectId,
      case_id: caseId,
      name: suspect.name,
      description: suspect.description,
      avatar_url: avatarUrl,
      statement_v1: suspect.statement_v1,
      statement_v2: suspect.statement_v2,
      sort_order: index,
    });

    if (suspect.name.toLowerCase() === envelope.case.guilty_suspect_name.toLowerCase()) {
      guiltySuspectId = suspectId;
    }
  }

  if (!guiltySuspectId) {
    throw new Error(`Unable to resolve guilty suspect for case file generated at ${envelope.generatedAt}.`);
  }

  await writeFile(path.join(GENERATED_ASSETS_DIR, `victim-${caseId}.svg`), `${victimSvg}\n`, 'utf8');

  const { error: caseError } = await supabaseAdmin.from('cases').insert({
    id: caseId,
    scene_narrative: envelope.case.scene_narrative,
    victim_name: envelope.case.victim_name,
    victim_description: envelope.case.victim_description,
    victim_avatar_url: victimAvatarUrl,
    guilty_suspect_id: null,
    solution_summary: envelope.case.solution_summary,
    evidence_items: envelope.case.evidence,
    suspect_count: envelope.case.suspects.length,
    evidence_count: envelope.case.evidence.length,
    status,
  });

  if (caseError) {
    throw new Error(`Unable to insert generated case: ${caseError.message}`);
  }

  const { error: suspectsError } = await supabaseAdmin.from('suspects').insert(suspectRows);

  if (suspectsError) {
    throw new Error(`Unable to insert generated suspects: ${suspectsError.message}`);
  }

  const { error: updateError } = await supabaseAdmin
    .from('cases')
    .update({ guilty_suspect_id: guiltySuspectId, updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (updateError) {
    throw new Error(`Unable to update generated case culprit: ${updateError.message}`);
  }

  return { caseId };
}

async function uploadAsset(assetPath: string, svg: string): Promise<string> {
  const assetBuffer = Buffer.from(`${svg}\n`, 'utf8');
  const { error } = await supabaseAdmin.storage.from(CASE_ASSET_BUCKET).upload(assetPath, assetBuffer, {
    contentType: 'image/svg+xml',
    upsert: true,
  });

  if (error) {
    throw new Error(`Unable to upload asset "${assetPath}": ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(CASE_ASSET_BUCKET).getPublicUrl(assetPath);
  return data.publicUrl;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown case import error.');
  process.exit(1);
});
