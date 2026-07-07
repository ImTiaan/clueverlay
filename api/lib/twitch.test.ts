import { describe, expect, it } from 'vitest';
import { getActorRoles, getEventSubMessageType } from './twitch';

describe('getEventSubMessageType', () => {
  it('reads the Twitch EventSub message type header', () => {
    expect(
      getEventSubMessageType({
        'twitch-eventsub-message-type': 'notification',
      }),
    ).toBe('notification');
  });
});

describe('getActorRoles', () => {
  it('detects broadcaster and moderator badges from chat events', () => {
    expect(
      getActorRoles({
        broadcaster_user_id: '1',
        chatter_user_id: '2',
        chatter_user_name: 'teewee',
        message: {
          text: '!case pause',
        },
        badges: [
          { set_id: 'moderator', id: '1' },
          { set_id: 'subscriber', id: '12' },
        ],
      }),
    ).toEqual({
      isBroadcaster: false,
      isModerator: true,
    });
  });
});
