import '../lib/loadEnv.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

function getFlag(name: string): string | null {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : null;
}

async function main(): Promise<void> {
  const caseId = getFlag('id');
  const victimName = getFlag('victim');
  const status = getFlag('status') ?? 'ready';

  if (!caseId && !victimName) {
    throw new Error('Provide either --id=<case-id> or --victim=<victim-name>.');
  }

  if (!['draft', 'ready', 'culled'].includes(status)) {
    throw new Error('status must be one of: draft, ready, culled.');
  }

  let query = supabaseAdmin.from('cases').update({
    status,
    updated_at: new Date().toISOString(),
  });

  if (caseId) {
    query = query.eq('id', caseId);
  } else {
    query = query.eq('victim_name', victimName as string);
  }

  const { data, error } = await query.select('id, victim_name, status');

  if (error) {
    throw new Error(`Unable to update case status: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No matching case was found for the requested update.');
  }

  console.log(
    JSON.stringify(
      {
        updated: data,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown case status error.');
  process.exit(1);
});
