# OAuth connectors (Gmail & Microsoft)

Sign in at https://fighur.ai first, then **Settings → Connect** for each provider.

## Google · Gmail & Calendar

Uses the **same** OAuth client as Google sign-in (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).

Redirect URI in [Google Cloud Console](https://console.cloud.google.com/):

```
https://fighur.ai/api/connect/google/callback
```

Enable **Gmail API** and **Google Calendar API** on the project if you use those tools in chat.

## Microsoft · Outlook & 365 (fighur ai app)

Azure app **fighur ai**:

| Field | Value |
|--------|--------|
| Application (client) ID | `4c5436c0-3e68-4c79-af81-8d3a745f6d2c` |
| Directory (tenant) ID | `875fd39e-02f3-4ab6-9495-eaebe5039527` |

### Azure setup

1. [Azure Portal](https://portal.azure.com/) → **App registrations** → **fighur ai** → **Authentication**.
2. Add **Web** redirect URIs:

   ```
   https://fighur.ai/api/connect/microsoft/callback
   https://fighur.ai/api/auth/sso/microsoft/callback
   ```

3. **Certificates & secrets** → **New client secret** → copy the **Value** once (not the Secret ID).
4. **API permissions** → Microsoft Graph **delegated**: `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Mail.Read`, `Calendars.Read` → **Grant admin consent** if required.
5. On Vercel (or GitHub Actions secrets):

   - `MICROSOFT_CLIENT_ID` = `4c5436c0-3e68-4c79-af81-8d3a745f6d2c`
   - `MICROSOFT_CLIENT_SECRET` = (secret from step 3)

**Note:** If the app is **“My organization only”**, only accounts in your Azure tenant can connect. For personal Microsoft accounts, change supported account types to multi-tenant or personal.

## Verify

```bash
curl -s https://fighur.ai/api/connect/providers | jq
```

Expect `"microsoft": { "connect": true }` after the client secret is set and you redeploy.
