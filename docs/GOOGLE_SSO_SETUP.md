# Google SSO for FIGHURAI (fighur.ai)

Production needs **`GOOGLE_CLIENT_ID`** and **`GOOGLE_CLIENT_SECRET`** on Vercel (or in GitHub Actions secrets so the sync workflow pushes them).

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select or create a project.
2. **APIs & Services** → **OAuth consent screen** → External → add app name, support email, and your domain `fighur.ai` if prompted.
3. **Credentials** → **Create credentials** → **OAuth client ID** → type **Web application**.
4. **Authorized redirect URIs** (add both):

   ```
   https://fighur.ai/api/auth/sso/google/callback
   https://fighur.ai/api/connect/google/callback
   ```

   For local dev (optional):

   ```
   http://localhost:3099/api/auth/sso/google/callback
   http://localhost:3099/api/connect/google/callback
   ```

5. Copy the **Client ID** and **Client secret**.

## 2. Vercel (production)

Project **fighur.ai** → **Settings** → **Environment Variables** → **Production**:

| Name | Value |
|------|--------|
| `GOOGLE_CLIENT_ID` | from step 5 |
| `GOOGLE_CLIENT_SECRET` | from step 5 |
| `SMILE_OAUTH_BASE_URL` | `https://fighur.ai` (should already be set) |
| `SMILE_APP_SECRET` | 16+ char random string (required for sessions) |

**Redeploy** production after saving.

## 3. GitHub Actions sync (optional)

So future deploys keep the keys, add repository secrets at  
`https://github.com/fighurai/fighur.ai/settings/secrets/actions`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Then run workflow **Sync API keys to Vercel** or push to `main`.

## 4. Verify

```bash
curl -s https://fighur.ai/api/auth/providers | jq
```

Expect `"google": { "sso": true, ... }`.

Sign-in: **Continue with Google** on `/sign-in` should redirect to Google, not show a JSON error.

For **Gmail & Calendar** in Settings, use the same client and also register `/api/connect/google/callback` — see `docs/CONNECTORS_SETUP.md`.
