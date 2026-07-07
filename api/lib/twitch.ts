import crypto from 'crypto';
import { getServerEnv } from './env.js';

export type EventSubChatEvent = {
  broadcaster_user_id: string;
  chatter_user_id: string;
  chatter_user_name: string;
  message: {
    text: string;
  };
  badges?: Array<{
    set_id: string;
    id: string;
  }>;
};

export type EventSubEnvelope = {
  challenge?: string;
  event?: EventSubChatEvent;
};

function getHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export function verifyEventSubSignature(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
): boolean {
  const secret = getServerEnv().twitchEventSubSecret;
  const messageId = getHeaderValue(headers['twitch-eventsub-message-id']);
  const messageTimestamp = getHeaderValue(headers['twitch-eventsub-message-timestamp']);
  const expectedSignature = getHeaderValue(headers['twitch-eventsub-message-signature']);

  if (!secret || !messageId || !messageTimestamp || !expectedSignature) {
    return false;
  }

  const digest = crypto
    .createHmac('sha256', secret)
    .update(messageId + messageTimestamp + rawBody)
    .digest('hex');

  return `sha256=${digest}` === expectedSignature;
}

export function getEventSubMessageType(
  headers: Record<string, string | string[] | undefined>,
): string {
  return getHeaderValue(headers['twitch-eventsub-message-type']);
}

export function getActorRoles(event: EventSubChatEvent): {
  isBroadcaster: boolean;
  isModerator: boolean;
} {
  const badges = event.badges ?? [];

  return {
    isBroadcaster: badges.some((badge) => badge.set_id === 'broadcaster'),
    isModerator: badges.some((badge) => badge.set_id === 'moderator'),
  };
}
