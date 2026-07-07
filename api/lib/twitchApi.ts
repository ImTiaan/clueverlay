import { getServerEnv } from './env.js';
import { getValidBotTokenState, validateStoredBotToken, type TwitchTokenValidation } from './twitchAuth.js';

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
};

type ValidateTokenResponse = TwitchTokenValidation;

type SendChatMessageResponse = {
  data?: Array<{
    message_id: string;
    is_sent: boolean;
    drop_reason: {
      code: string;
      message: string;
    } | null;
  }>;
};

type EventSubSubscription = {
  id: string;
  status: string;
  type: string;
  version: string;
  condition: Record<string, string>;
  transport: {
    method: string;
    callback?: string;
  };
  created_at: string;
};

type EventSubSubscriptionsResponse = {
  total: number;
  data: EventSubSubscription[];
};

let cachedBotUser: TwitchUser | null = null;
let cachedAppAccessToken: string | null = null;

class TwitchApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function twitchFetchWithToken<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const env = getServerEnv();
  const response = await fetch(`https://api.twitch.tv${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': env.twitchClientId,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TwitchApiError(response.status, `Twitch API request failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as T;
}

async function twitchFetch<T>(path: string, init?: RequestInit, retryOnUnauthorized = true): Promise<T> {
  const tokenState = await getValidBotTokenState();

  try {
    return await twitchFetchWithToken(tokenState.accessToken, path, init);
  } catch (error) {
    if (!(error instanceof TwitchApiError) || error.status !== 401 || !retryOnUnauthorized) {
      throw error;
    }

    cachedBotUser = null;

    const refreshedTokenState = await getValidBotTokenState({ forceRefresh: true });
    return twitchFetchWithToken(refreshedTokenState.accessToken, path, init);
  }
}

export async function getBotUser(): Promise<TwitchUser> {
  if (cachedBotUser) {
    return cachedBotUser;
  }

  const payload = await twitchFetch<{ data: TwitchUser[] }>('/helix/users');
  const botUser = payload.data[0];

  if (!botUser) {
    throw new Error('Unable to identify the authenticated Twitch bot user.');
  }

  cachedBotUser = botUser;
  return botUser;
}

export async function validateBotToken(): Promise<ValidateTokenResponse> {
  return validateStoredBotToken();
}

export async function getAppAccessToken(): Promise<string> {
  if (cachedAppAccessToken) {
    return cachedAppAccessToken;
  }

  const env = getServerEnv();

  if (!env.twitchClientSecret) {
    throw new Error('Missing TWITCH_CLIENT_SECRET');
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.twitchClientId,
      client_secret: env.twitchClientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to obtain Twitch app access token: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  const accessToken = payload.access_token;

  if (!accessToken) {
    throw new Error('Twitch did not return an app access token.');
  }

  cachedAppAccessToken = accessToken;
  return accessToken;
}

export async function sendChatMessage(message: string): Promise<{
  messageId: string;
  isSent: boolean;
  dropReason: { code: string; message: string } | null;
}> {
  const env = getServerEnv();
  const botUser = await getBotUser();

  const payload = await twitchFetch<SendChatMessageResponse>('/helix/chat/messages', {
    method: 'POST',
    body: JSON.stringify({
      broadcaster_id: env.twitchBroadcasterId,
      sender_id: botUser.id,
      message,
    }),
  });

  const result = payload.data?.[0];

  if (!result) {
    throw new Error('Twitch did not return a chat message result.');
  }

  return {
    messageId: result.message_id,
    isSent: result.is_sent,
    dropReason: result.drop_reason,
  };
}

export async function listEventSubSubscriptions(): Promise<EventSubSubscription[]> {
  const appAccessToken = await getAppAccessToken();
  const payload = await twitchFetchWithToken<EventSubSubscriptionsResponse>(appAccessToken, '/helix/eventsub/subscriptions');

  return payload.data ?? [];
}

export async function ensureChatMessageWebhookSubscription(
  callbackUrl = getServerEnv().twitchEventSubCallbackUrl,
): Promise<{
  created: boolean;
  subscription: EventSubSubscription;
}> {
  const env = getServerEnv();

  if (!callbackUrl) {
    throw new Error('Missing TWITCH_EVENTSUB_CALLBACK_URL');
  }

  const botUser = await getBotUser();
  const appAccessToken = await getAppAccessToken();
  const subscriptions = await listEventSubSubscriptions();
  const existing = subscriptions.find(
    (subscription) =>
      subscription.type === 'channel.chat.message' &&
      subscription.condition.broadcaster_user_id === env.twitchBroadcasterId &&
      subscription.condition.user_id === botUser.id &&
      subscription.transport.callback === callbackUrl,
  );

  if (existing) {
    return {
      created: false,
      subscription: existing,
    };
  }

  const payload = await twitchFetchWithToken<{ data?: EventSubSubscription[] }>(appAccessToken, '/helix/eventsub/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: env.twitchBroadcasterId,
        user_id: botUser.id,
      },
      transport: {
        method: 'webhook',
        callback: callbackUrl,
        secret: env.twitchEventSubSecret,
      },
    }),
  });

  const subscription = payload.data?.[0];

  if (!subscription) {
    throw new Error('Twitch did not return the created EventSub subscription.');
  }

  return {
    created: true,
    subscription,
  };
}
