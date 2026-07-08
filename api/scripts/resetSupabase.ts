import '../lib/loadEnv.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { CASE_ASSET_BUCKET } from './lib/casePipeline.js';

type StorageEntry = {
  name: string;
  id: string | null;
};

const DELETE_ALL_SINCE = '1970-01-01T00:00:00.000Z';
const RESET_CONFIRMATION = 'RESET_CASE_DATA';

function getFlag(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

async function deleteAllRows(table: string, timestampColumn: string): Promise<number> {
  const { error, count } = await supabaseAdmin
    .from(table)
    .delete({ count: 'exact' })
    .gt(timestampColumn, DELETE_ALL_SINCE);

  if (error) {
    throw new Error(`Unable to delete rows from ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function resetRuntimeRows(): Promise<void> {
  const now = new Date().toISOString();

  const { error: stateError } = await supabaseAdmin.from('game_state').upsert(
    {
      channel_id: 'default',
      enabled: false,
      paused: false,
      active_case_id: null,
      phase: 'idle',
      current_suspect_index: null,
      phase_started_at: null,
      phase_ends_at: null,
      paused_at: null,
      last_event_id: null,
      updated_at: now,
    },
    { onConflict: 'channel_id' },
  );

  if (stateError) {
    throw new Error(`Unable to reset game_state: ${stateError.message}`);
  }

  const { error: settingsError } = await supabaseAdmin.from('game_settings').upsert(
    {
      channel_id: 'default',
      join_window_seconds: 120,
      scene_intro_seconds: 30,
      suspect_intro_gap_seconds: 5,
      suspect_statement_interval_seconds: 150,
      post_case_countdown_seconds: 20,
      case_timeout_minutes: 45,
      cooldown_examine_seconds: 3,
      cooldown_ask_seconds: 10,
      cooldown_accuse_seconds: 20,
      updated_at: now,
    },
    { onConflict: 'channel_id' },
  );

  if (settingsError) {
    throw new Error(`Unable to reset game_settings: ${settingsError.message}`);
  }
}

async function listAllStorageObjects(prefix = ''): Promise<string[]> {
  const paths: string[] = [];
  const folders: string[] = [prefix];

  while (folders.length > 0) {
    const currentPrefix = folders.shift() ?? '';

    const { data, error } = await supabaseAdmin.storage.from(CASE_ASSET_BUCKET).list(currentPrefix, {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error(`Unable to list storage objects under "${currentPrefix}": ${error.message}`);
    }

    for (const entry of (data ?? []) as StorageEntry[]) {
      const fullPath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;

      if (!entry.id) {
        folders.push(fullPath);
        continue;
      }

      paths.push(fullPath);
    }
  }

  return paths;
}

async function clearCaseAssetsBucket(): Promise<number> {
  const { data: buckets, error: bucketError } = await supabaseAdmin.storage.listBuckets();

  if (bucketError) {
    throw new Error(`Unable to list storage buckets: ${bucketError.message}`);
  }

  if (!(buckets ?? []).some((bucket) => bucket.name === CASE_ASSET_BUCKET)) {
    return 0;
  }

  const objects = await listAllStorageObjects();
  if (objects.length === 0) {
    return 0;
  }

  let deleted = 0;

  for (let index = 0; index < objects.length; index += 100) {
    const batch = objects.slice(index, index + 100);
    const { error } = await supabaseAdmin.storage.from(CASE_ASSET_BUCKET).remove(batch);
    if (error) {
      throw new Error(`Unable to delete storage objects: ${error.message}`);
    }
    deleted += batch.length;
  }

  return deleted;
}

async function main(): Promise<void> {
  const confirmation = getFlag('confirm');
  if (confirmation !== RESET_CONFIRMATION) {
    throw new Error(
      `Refusing to reset Supabase without explicit confirmation. Re-run with --confirm=${RESET_CONFIRMATION}`,
    );
  }

  const deletedCooldowns = await deleteAllRows('player_command_cooldowns', 'last_used_at');
  const deletedProgress = await deleteAllRows('case_progress', 'created_at');
  const deletedEvents = await deleteAllRows('game_events', 'created_at');
  const deletedSuspects = await deleteAllRows('suspects', 'created_at');
  const deletedCases = await deleteAllRows('cases', 'created_at');
  const deletedPlayers = await deleteAllRows('players', 'created_at');

  await resetRuntimeRows();

  const deletedAssets = await clearCaseAssetsBucket();

  console.log(
    JSON.stringify(
      {
        deleted: {
          player_command_cooldowns: deletedCooldowns,
          case_progress: deletedProgress,
          game_events: deletedEvents,
          suspects: deletedSuspects,
          cases: deletedCases,
          players: deletedPlayers,
          storage_assets: deletedAssets,
        },
        reset: {
          game_state: 'default',
          game_settings: 'default',
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown reset error.');
  process.exit(1);
});
