type ServerEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminPassword: string;
  twitchClientId: string;
  twitchBroadcasterId: string;
  twitchBotAccessToken?: string;
  twitchBotRefreshToken?: string;
  twitchEventSubSecret: string;
  twitchClientSecret?: string;
  twitchEventSubCallbackUrl?: string;
};

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchBroadcasterId = process.env.TWITCH_BROADCASTER_ID;
  const twitchBotAccessToken = process.env.TWITCH_BOT_ACCESS_TOKEN?.trim() || undefined;
  const twitchBotRefreshToken = process.env.TWITCH_BOT_REFRESH_TOKEN?.trim() || undefined;
  const twitchEventSubSecret = process.env.TWITCH_EVENTSUB_SECRET;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  const twitchEventSubCallbackUrl = process.env.TWITCH_EVENTSUB_CALLBACK_URL;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!adminPassword) {
    throw new Error('Missing ADMIN_PASSWORD');
  }

  if (!twitchClientId) {
    throw new Error('Missing TWITCH_CLIENT_ID');
  }

  if (!twitchBroadcasterId) {
    throw new Error('Missing TWITCH_BROADCASTER_ID');
  }

  if (!twitchBotAccessToken && !twitchBotRefreshToken) {
    throw new Error('Missing Twitch bot credentials: set TWITCH_BOT_ACCESS_TOKEN or TWITCH_BOT_REFRESH_TOKEN');
  }

  if (twitchBotRefreshToken && !twitchClientSecret) {
    throw new Error('Missing TWITCH_CLIENT_SECRET');
  }

  if (!twitchEventSubSecret) {
    throw new Error('Missing TWITCH_EVENTSUB_SECRET');
  }

  cachedEnv = {
    supabaseUrl,
    supabaseServiceRoleKey,
    adminPassword,
    twitchClientId,
    twitchBroadcasterId,
    twitchBotAccessToken,
    twitchBotRefreshToken,
    twitchEventSubSecret,
    twitchClientSecret,
    twitchEventSubCallbackUrl,
  };

  return cachedEnv;
}
