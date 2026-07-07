import '../lib/loadEnv.js';
import { getServerEnv } from '../lib/env.js';
import { validateAccessToken } from '../lib/twitchAuth.js';

function getFlag(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const code = getFlag('code');
  const redirectUri = getFlag('redirect-uri');

  if (!code || !redirectUri) {
    throw new Error(
      'Usage: npm run twitch:exchange-code -- --code=TWITCH_AUTH_CODE --redirect-uri=YOUR_REGISTERED_REDIRECT_URI',
    );
  }

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
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to exchange Twitch auth code: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string[];
    expires_in?: number;
    token_type?: string;
  };

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error('Twitch did not return both an access token and a refresh token.');
  }

  const validation = await validateAccessToken(payload.access_token);

  console.log(
    JSON.stringify(
      {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        tokenType: payload.token_type ?? null,
        expiresIn: payload.expires_in ?? null,
        scopes: payload.scope ?? validation.scopes,
        validatedUser: {
          login: validation.login,
          userId: validation.user_id,
          clientId: validation.client_id,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unknown Twitch auth code exchange error.');
  process.exit(1);
});
