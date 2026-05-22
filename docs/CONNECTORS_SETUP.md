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

Your app is probably **“My organization only”** today — that blocks personal accounts.

If the Authentication page fails with:

`Property api.requestedAccessTokenVersion is invalid`

use the **Manifest** editor instead (Azure requires token version **2** before personal accounts work).

#### Fix via Manifest (recommended)

1. [Azure Portal](https://portal.azure.com/) → **App registrations** → **fighur ai** → **Manifest** (left menu).
2. Find `"signInAudience"` and `"api"` in the JSON.
3. Set these values (numbers must be `2`, not `"2"`):

   ```json
   "signInAudience": "AzureADandPersonalMicrosoftAccount",
   "api": {
     "requestedAccessTokenVersion": 2,
     ...
   }
   ```

   If your manifest uses a top-level `"accessTokenAcceptedVersion": 2` instead of `api.requestedAccessTokenVersion`, set that to `2` and keep `signInAudience` as above.

4. Click **Save** on the Manifest page.
5. Go to **Authentication** and confirm supported accounts now show multitenant + personal.

**Order tip:** If Save fails, try setting only `"api": { "requestedAccessTokenVersion": 2 }` first, Save, then change `signInAudience`, Save again.

**Other blockers:**

- **Application ID URI** under **Expose an API**: for multitenant apps it must use a verified domain (e.g. `api://4c5436c0-3e68-4c79-af81-8d3a745f6d2c` is fine). Remove a custom URI on an unverified domain if Save still fails.
- **Certificates & secrets**: with personal accounts, keep at most **two** client secrets and **two** certificates before changing `signInAudience`.

#### Authentication UI (after manifest saves)

1. **Authentication** → **Supported account types** should already reflect personal + work.
2. If not, select **Accounts in any organizational directory and personal Microsoft accounts**.
3. Click **Save**.

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
