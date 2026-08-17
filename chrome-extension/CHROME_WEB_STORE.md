# Chrome Web Store — Privacy practices & publish checklist

Upload zip: **Desktop/`FIGHURAI-Colors.zip`** (also `public/downloads/fighur-page-theme.zip`).

## Package verification (v1.3.1)

Upload file: `FIGHURAI-Colors.zip` on your Desktop.

This package includes the **Aug 12 theming fix** (formerly v1.3.0), not the old buggy **v1.2.1** zip:
- Does not overwrite enabled Colors when visiting fighur.ai
- Broadcasts theme changes to open tabs
- Re-applies theme if sites strip the injected style
- Stores only `signedIn` + `pro` (no email)
- No localhost host permissions (store-safe)

These items are **form fields** on the Chrome Web Store item page — not bugs in the zip. Paste the answers below.

---

## Privacy practices tab

### Single purpose description

```
Applies customizable background and text colors to websites to improve readability and visual comfort. Included with FIGHURAI Pro.
```

### Permission justification — `activeTab`

```
Used so the toolbar popup can read the active tab and send the current Colors theme (on/off, background color, text color) to that page when the user changes settings. The extension only interacts with the page the user is viewing to apply or update local CSS for Colors.
```

### Permission justification — host permissions

```
Broad host access (http/https) is required so FIGHURAI Colors can inject a content script on websites the user visits and apply their chosen background and text colors on those pages. Limited host access to https://fighur.ai (and www / fighurai.ai) is used only to sync Pro entitlement status while the user is signed in on fighur.ai — the extension receives signedIn and pro flags only, not email, name, or chat data.
```

### Permission justification — remote code

```
This extension does not use remote code. All scripts are packaged in the extension (popup, content, background, site-bridge). It may call https://fighur.ai/api/extension/entitlement for a Pro entitlement check (boolean flags only); that response is data, not executable code, and is never eval’d or injected as a script.
```

### Permission justification — `storage`

```
chrome.storage.sync stores the user’s Colors preferences (enabled state, background color, text color) so settings sync across Chrome profiles. chrome.storage.local stores a Pro entitlement cache (pro flag + timestamp) so the extension can unlock Colors without repeatedly prompting. No personal account details (email, name, user id, payments, chat) are stored.
```

### Permission justification — `tabs`

```
Used to find the active tab from the popup and to broadcast theme updates to open tabs so Colors stay in sync when the user changes settings. Also used once after install to open the FIGHURAI Colors help page (https://fighur.ai/extension?installed=1). The extension does not collect browsing history.
```

### Data usage certification

Check the box that you certify compliance with the [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/).

**Privacy policy URL** (if asked): `https://fighur.ai/privacy`

**Suggested answers for data collection questions:**

| Question | Answer |
|----------|--------|
| Collects user data? | No personally identifiable data via the extension; only local color prefs + Pro flag |
| Sells data? | No |
| Uses data for purposes unrelated to core functionality? | No |
| Transfers data to third parties? | No (entitlement check stays on fighur.ai) |

---

## Settings page (required to publish)

1. Open **Chrome Web Store Developer Dashboard** → **Settings** (account / publisher).
2. **Publisher contact email:** enter `hello@fighurai.com` (or your preferred publisher email).
3. Click **Verify** and complete the email verification link.
4. You cannot publish until verification succeeds.

---

## Upload steps

1. Dashboard → your item → **Package** → Upload new package → choose **`FIGHURAI-Colors.zip`**.
2. Fill **Privacy practices** with the text above.
3. Complete **Store listing** (name, summary, screenshots, category).
4. Certify data usage → **Submit for review**.

---

## What changed in this package (v1.3.1)

- Removed `localhost` / `127.0.0.1` host permissions (not appropriate for store review).
- Version bump to **1.3.1**.
- Same FIGHURAI Colors product; no remote code.
