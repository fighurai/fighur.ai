# Privacy and security

FIGHURAI is designed so each signed-in user only accesses their own data.

## Authentication required for connections

- Before **Google**, **Microsoft**, or **device folder** connect, users must accept the in-app **privacy waiver** (stored per account in the browser).
- **Google / Microsoft connect** (`/api/connect/google`, `/api/connect/microsoft`) return **401** if you are not signed in.
- OAuth tokens are stored under your **user id** on the server (`users/<uuid>/connections/`) and in **httpOnly** cookies bound to that user id.
- **Disconnect** requires a valid session and only removes **your** stored tokens.

## Sign out

- Clears the session cookie and OAuth connection cookies from the browser.
- Does **not** delete your server-side connections or chat history—you get them back when you sign in again.
- Clears the active device-folder handle from this browser session (per-user folder picks remain in IndexedDB for your account only).

## Chat history

- **Signed in:** chats sync to `users/<uuid>/conversations/conversations.json` on the server and to **per-user** `localStorage` keys (`fighurai-conversations-v1:<userId>`).
- **Signed out:** chats stay in a local **anonymous** bucket only on this device; they are **not** sent to the server until you sign in (anonymous chats can migrate into your account on first login).
- Another user signing in on the same browser sees **their** chats, not yours.

## API access to Gmail / Calendar / Outlook

- Read-only tools run only when **verified session** + **your** stored refresh token match.
- The client cannot fake “Gmail connected” in the request body; the server sets mail/calendar flags from **your** account only.
- Device file manifests are accepted only when signed in and **device files** is enabled in Settings.
- **CoWork file organization:** the model proposes moves in a `device-ops` block; the user confirms in a popup before files are renamed/moved locally (Chrome/Edge with write permission). Safari folder snapshots are read-only plans.

## Operator responsibilities

- Set a strong `SMILE_APP_SECRET` (or `SMILE_OAUTH_COOKIE_SECRET`, 16+ characters) in production.
- Use HTTPS (Vercel default).
- **Cross-browser account data:** chats and OAuth tokens are stored per user on the server. On Vercel, enable **Vercel Blob** on the project (creates `BLOB_READ_WRITE_TOKEN`) so data survives deploys and works when you sign in from another browser. Without Blob or `SMILE_USER_DATA_DIR`, `/tmp` storage is ephemeral and history may not follow you across devices.
- Alternatively, set `SMILE_USER_DATA_DIR` to a persistent disk mount path if you self-host.
- Comply with Google/Microsoft API policies and your privacy policy (data minimization, user deletion on request).

## User rights (recommended policy)

- Users can disconnect integrations in Settings.
- Account deletion (if you offer it) should remove `users/<uuid>/` on disk and revoke OAuth tokens at the provider.
