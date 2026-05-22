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

### Allow personal Microsoft accounts (@outlook.com, @hotmail.com, etc.)

Your app is probably **“My organization only”** today — that blocks personal accounts. Change it once:

1. [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** → **App registrations** → **fighur ai**.
2. Open **Authentication** (left menu).
3. Under **Supported account types**, click **Edit** (or **Add a platform** if you have not set Web yet).
4. Select:

   **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**

   (Wording may be slightly different; choose the option that explicitly includes **personal Microsoft accounts**, not “My organization only”.)

5. Click **Save** at the top of the Authentication page.

6. Under **Platform configurations** → **Web**, confirm redirect URIs (add if missing):

   ```
   https://fighur.ai/api/connect/microsoft/callback
   https://fighur.ai/api/auth/sso/microsoft/callback
   ```

7. **Implicit grant** — leave **ID tokens** and **Access tokens** unchecked (the app uses the authorization code flow with PKCE).

8. **API permissions** → **Microsoft Graph** → **Delegated**:

   | Permission | Why |
   |------------|-----|
   | `openid` | Sign-in |
   | `email` | Email on profile |
   | `profile` | Name |
   | `offline_access` | Refresh token for Connect |
   | `User.Read` | Basic profile |
   | `Mail.Read` | Outlook mail (Connect) |
   | `Calendars.Read` | Calendar (Connect) |

   For **personal accounts only you testing**, you can click **Grant admin consent** if you are admin; personal users will otherwise consent on first Connect.

9. **Certificates & secrets** → create a **client secret** if you have not → set `MICROSOFT_CLIENT_SECRET` on Vercel → **Redeploy**.

fighur.ai already calls `https://login.microsoftonline.com/common/...`, which is correct for work + personal once step 4 is saved.

### Test with a personal account

1. Use a browser profile where you are signed into **outlook.com** / **live.com** (not only your work tenant).
2. https://fighur.ai/sign-in → **Continue with Microsoft**, or **Settings** → **Microsoft · Connect**.
3. Pick your personal account when Microsoft shows the account picker.
4. Accept the consent screen (mail/calendar read scopes for Connect).

If you see **“Need admin approval”** or **“unauthorized_client”**, the app is still single-tenant — recheck step 4 and Save.

## Verify

```bash
curl -s https://fighur.ai/api/connect/providers | jq
```

Expect `"microsoft": { "connect": true }` after the client secret is set and you redeploy.
