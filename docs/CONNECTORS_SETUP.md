# OAuth connectors (Gmail, Microsoft, Slack)

Sign in at https://fighur.ai first, then **Settings → Connect** for each provider.

## Google · Gmail & Calendar

Uses the **same** OAuth client as Google sign-in (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).

Add this redirect URI in [Google Cloud Console](https://console.cloud.google.com/) → Credentials → your Web client:

```
https://fighur.ai/api/connect/google/callback
```

Enable **Gmail API** and **Google Calendar API** on the project if you use those tools in chat.

## Microsoft · Outlook & 365

1. [Azure Portal](https://portal.azure.com/) → **App registrations** → New registration.
2. Redirect URI (Web):

   ```
   https://fighur.ai/api/connect/microsoft/callback
   ```

3. **Certificates & secrets** → New client secret.
4. **API permissions** → Microsoft Graph delegated: `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Mail.Read`, `Calendars.Read`.
5. Set on Vercel / GitHub secrets:

   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`

## Slack

1. [api.slack.com/apps](https://api.slack.com/apps) → Create app → OAuth & Permissions.
2. Redirect URL:

   ```
   https://fighur.ai/api/connect/slack/callback
   ```

3. User token scopes: `openid`, `email`, `profile`.
4. Set on Vercel / GitHub secrets:

   - `SLACK_CLIENT_ID`
   - `SLACK_CLIENT_SECRET`

## Verify

```bash
curl -s https://fighur.ai/api/connect/providers | jq
```

Each provider should show `"connect": true` when env vars are set.

After connecting, `GET /api/connect/status` (while signed in) should show `"connected": true` for that provider.
