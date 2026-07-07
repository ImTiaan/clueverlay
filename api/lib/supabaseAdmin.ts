import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from './env.js';

const { supabaseUrl, supabaseServiceRoleKey } = getServerEnv();

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
