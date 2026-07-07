import { GAME_CHANNEL_ID } from '../../shared/game.js';
import { getServerEnv } from './env.js';
import { supabaseAdmin } from './supabaseAdmin.js';

export type TwitchTokenValidation = {
  client_id: string;
  login: string;
  user_id: string;
  scopes: string[];
  expires_in: number;
};

type StoredTwitchAuthRow = {
  channel_id: string;
  access_token: string;
  refresh_token: string | null;
  token_user_id: string | null;
  token_login: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  updated_at: string;
};

export type BotTokenState = {
  accessToken: string;
  refreshToken: string | null;
  userId: string | null;
  login: string | null;
  scopes: string[];
  expiresAt: string | null;
  updatedAt: string | null;
};

const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000;

let cachedBotTokenState: BotTokenState | null = null;

function mapStoredRow(row: StoredTwitchAuthRow): BotTokenState {
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    userId: row.token_user_id,
    login: row.token_login,
    scopes: row.scopes ?? [],
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}

function buildTokenState(
  accessToken: string,
  refreshToken: string | null,
  validation: TwitchTokenValidation,
): BotTokenState {
  return {
    accessToken,
    refreshToken,
    userId: validation.user_id,
    login: validation.login,
    scopes: validation.scopes,
    expiresAt: new Date(Date.now() + validation.expires_in * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return true;
  }

  return new Date(expiresAt).getTime() - Date.now() <= TOKEN_REFRESH_BUFFER_MS;
}

async function upsertBotTokenState(state: BotTokenState): Promise<BotTokenState> {
  const { data, error } = await supabaseAdmin
    .from('twitch_auth_tokens')
    .upsert(
      {
        channel_id: GAME_CHANNEL_ID,
        access_token: state.accessToken,
        refresh_token: state.refreshToken,
        token_user_id: state.userId,
        token_login: state.login,
        scopes: state.scopes,
        expires_at: state.expiresAt,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'channel_id',
      },
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Unable to persist Twitch bot token state: ${error?.message ?? 'Unknown error.'}`);
  }

  const nextState = mapStoredRow(data as StoredTwitchAuthRow);
  cachedBotTokenState = nextState;
  return nextState;
}

async function getStoredBotTokenState(): Promise<BotTokenState | null> {
  if (cachedBotTokenState) {
    return cachedBotTokenState;
  }

  const { data, error } = await supabaseAdmin
    .from('twitch_auth_tokens')
    .select('*')
    .eq('channel_id', GAME_CHANNEL_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load Twitch bot token state: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const state = mapStoredRow(data as StoredTwitchAuthRow);
  cachedBotTokenState = state;
  return state;
}

async function requestOAuthToken(body: URLSearchParams): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to obtain Twitch OAuth token: ${response.status} ${errorText}`);
  }

  return (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export async function validateAccessToken(accessToken: string): Promise<TwitchTokenValidation> {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
      Authorization: `OAuth ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to validate Twitch bot token: ${response.status} ${errorText}`);
  }

  return (await response.json()) as TwitchTokenValidation;
}

async function refreshAccessToken(refreshToken: string): Promise<BotTokenState> {
  const env = getServerEnv();

  if (!env.twitchClientSecret) {
    throw new Error('Missing TWITCH_CLIENT_SECRET');
  }

  const payload = await requestOAuthToken(
    new URLSearchParams({
      client_id: env.twitchClientId,
      client_secret: env.twitchClientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  );

  if (!payload.access_token) {
    throw new Error('Twitch did not return a refreshed access token.');
  }

  const validation = await validateAccessToken(payload.access_token);

  return upsertBotTokenState(
    buildTokenState(payload.access_token, payload.refresh_token ?? refreshToken, validation),
  );
}

async function bootstrapFromEnv(): Promise<BotTokenState> {
  const env = getServerEnv();

  if (env.twitchBotAccessToken) {
    try {
      const validation = await validateAccessToken(env.twitchBotAccessToken);
      return upsertBotTokenState(
        buildTokenState(env.twitchBotAccessToken, env.twitchBotRefreshToken ?? null, validation),
      );
    } catch (error) {
      if (!env.twitchBotRefreshToken) {
        const reason = error instanceof Error ? error.message : 'Unknown Twitch token validation error.';
        throw new Error(
          `Configured TWITCH_BOT_ACCESS_TOKEN is invalid and no TWITCH_BOT_REFRESH_TOKEN is available. ${reason}`,
        );
      }
    }
  }

  if (!env.twitchBotRefreshToken) {
    throw new Error('Missing TWITCH_BOT_REFRESH_TOKEN and no stored Twitch bot token state exists.');
  }

  return refreshAccessToken(env.twitchBotRefreshToken);
}

async function getStoredOrBootstrappedTokenState(): Promise<BotTokenState> {
  const storedState = await getStoredBotTokenState();

  if (storedState) {
    return storedState;
  }

  return bootstrapFromEnv();
}

export async function getValidBotTokenState(options?: { forceRefresh?: boolean }): Promise<BotTokenState> {
  const state = await getStoredOrBootstrappedTokenState();

  if (!options?.forceRefresh && !isExpiringSoon(state.expiresAt)) {
    return state;
  }

  const refreshToken = state.refreshToken ?? getServerEnv().twitchBotRefreshToken ?? null;

  if (!refreshToken) {
    throw new Error(
      'Twitch bot token refresh is required but no refresh token is available. Set TWITCH_BOT_REFRESH_TOKEN and rerun verification.',
    );
  }

  return refreshAccessToken(refreshToken);
}

export async function validateStoredBotToken(): Promise<TwitchTokenValidation> {
  const state = await getValidBotTokenState();
  return validateAccessToken(state.accessToken);
}

export async function getBotTokenDebugState(): Promise<{
  stored: {
    exists: boolean;
    login: string | null;
    userId: string | null;
    expiresAt: string | null;
    hasRefreshToken: boolean;
    updatedAt: string | null;
  };
  envBootstrap: {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
  };
}> {
  const env = getServerEnv();
  const storedState = await getStoredBotTokenState();

  return {
    stored: {
      exists: Boolean(storedState),
      login: storedState?.login ?? null,
      userId: storedState?.userId ?? null,
      expiresAt: storedState?.expiresAt ?? null,
      hasRefreshToken: Boolean(storedState?.refreshToken),
      updatedAt: storedState?.updatedAt ?? null,
    },
    envBootstrap: {
      hasAccessToken: Boolean(env.twitchBotAccessToken),
      hasRefreshToken: Boolean(env.twitchBotRefreshToken),
    },
  };
}
