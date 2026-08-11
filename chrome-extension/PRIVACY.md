# FIGHURAI Colors — Privacy

Last updated: August 11, 2026

## What this extension does

FIGHURAI Colors lets Pro users apply background and text colors on websites they visit. Settings stay in the browser (`chrome.storage`).

## What we do **not** collect in the extension

The extension does **not** store or display:

- Email address
- Name
- User ID
- Chat history
- Payment details
- Browsing history beyond applying local color CSS on the current page

## What it checks

When you visit fighur.ai while signed in, a same-origin bridge asks whether your account has **Pro** access (`signedIn` + `pro` only). No personal profile fields are returned to or saved by the extension.

## Local data

- Color preferences (`enabled`, background, text) in `chrome.storage.sync`
- Pro entitlement flag + timestamp in `chrome.storage.local`

You can clear this anytime: Chrome → Extensions → FIGHURAI Colors → Remove, or clear site/extension storage.

## Full product privacy

See https://fighur.ai/privacy for the FIGHURAI platform privacy policy.
