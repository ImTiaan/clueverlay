import { randomUUID } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import {
  CASE_ASSET_BUCKET,
  GENERATED_ASSETS_DIR,
  GENERATED_CASES_DIR,
  fetchAndNormaliseDiceBearSvg,
  loadGeneratedCaseFile,
  slugify,
  type GeneratedCaseEnvelope,
} from './casePipeline.js';
import { buildCaseCorpusEntry, type CaseCorpusEntry } from './caseReview.js';

type ExistingCaseRow = {
  id: string;
  victim_name: string;
  scene_narrative: string;
  victim_description: string;
  solution_summary: string;
  evidence_items: unknown;
};

type ExistingSuspectRow = {
  case_id: string;
  name: string;
};

function extractEvidenceNames(evidenceItems: unknown): string[] {
  if (!Array.isArray(evidenceItems)) {
    return [];
  }

  return evidenceItems.flatMap((item) => {
    if (typeof item === 'string') {
      return [item];
    }

    if (item && typeof item === 'object' && 'name' in item) {
      const value = (item as { name?: unknown }).name;
      return typeof value === 'string' ? [value] : [];
    }

    return [];
  });
}

export async function getGeneratedCaseFiles(directory = GENERATED_CASES_DIR): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

export async function ensureStorageBucket(): Promise<void> {
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

export async function loadExistingCaseCorpus(): Promise<CaseCorpusEntry[]> {
  const { data: caseRows, error: caseError } = await supabaseAdmin
    .from('cases')
    .select('id, victim_name, scene_narrative, victim_description, solution_summary, evidence_items');

  if (caseError) {
    throw new Error(`Unable to load existing cases: ${caseError.message}`);
  }

  const { data: suspectRows, error: suspectError } = await supabaseAdmin.from('suspects').select('case_id, name');

  if (suspectError) {
    throw new Error(`Unable to load existing suspects: ${suspectError.message}`);
  }

  const suspectMap = new Map<string, string[]>();

  for (const suspect of (suspectRows ?? []) as ExistingSuspectRow[]) {
    const current = suspectMap.get(suspect.case_id) ?? [];
    current.push(suspect.name);
    suspectMap.set(suspect.case_id, current);
  }

  return ((caseRows ?? []) as ExistingCaseRow[]).map((row) =>
    buildCaseCorpusEntry({
      caseId: row.id,
      victimName: row.victim_name,
      sceneNarrative: row.scene_narrative,
      victimDescription: row.victim_description,
      solutionSummary: row.solution_summary,
      suspectNames: suspectMap.get(row.id) ?? [],
      evidenceNames: extractEvidenceNames(row.evidence_items),
    }),
  );
}

export async function loadGeneratedCaseEnvelopes(
  directory = GENERATED_CASES_DIR,
): Promise<Array<{ filePath: string; envelope: GeneratedCaseEnvelope }>> {
  const filePaths = await getGeneratedCaseFiles(directory);

  return Promise.all(
    filePaths.map(async (filePath) => ({
      filePath,
      envelope: await loadGeneratedCaseFile(filePath),
    })),
  );
}

export async function importCaseEnvelope(
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
