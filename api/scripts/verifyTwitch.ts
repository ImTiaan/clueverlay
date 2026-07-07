import '../lib/loadEnv.js';
import {
  ensureChatMessageWebhookSubscription,
  getBotUser,
  listEventSubSubscriptions,
  validateBotToken,
} from '../lib/twitchApi.js';
import { getBotTokenDebugState, getValidBotTokenState } from '../lib/twitchAuth.js';

async function main(): Promise<void> {
  const forceRefresh = process.argv.includes('--force-refresh');

  if (forceRefresh) {
    await getValidBotTokenState({ forceRefresh: true });
  }

  const token = await validateBotToken();
  const botUser = await getBotUser();
  const subscriptions = await listEventSubSubscriptions();
  const chatSubscriptions = subscriptions.filter((subscription) => subscription.type === 'channel.chat.message');
  const authState = await getBotTokenDebugState();

  console.log(
    JSON.stringify(
      {
        authState,
        token: {
          login: token.login,
          userId: token.user_id,
          scopes: token.scopes,
          expiresIn: token.expires_in,
        },
        botUser: {
          id: botUser.id,
          login: botUser.login,
          displayName: botUser.display_name,
        },
        eventSub: {
          totalSubscriptions: subscriptions.length,
          chatSubscriptions: chatSubscriptions.map((subscription) => ({
            id: subscription.id,
            status: subscription.status,
            callback: subscription.transport.callback ?? null,
            condition: subscription.condition,
          })),
        },
      },
      null,
      2,
    ),
  );

  if (process.argv.includes('--ensure-chat-webhook')) {
    const result = await ensureChatMessageWebhookSubscription();
    console.log(
      JSON.stringify(
        {
          ensuredChatWebhook: {
            created: result.created,
            id: result.subscription.id,
            status: result.subscription.status,
            callback: result.subscription.transport.callback ?? null,
          },
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown Twitch verification error.');
  process.exit(1);
});
