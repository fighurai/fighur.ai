# FIGHURAI Colors (Chrome extension)

Built like a normal Chrome extension (Manifest V3), inspired by [Simplify Copilot](https://simplify.jobs):

| Simplify | FIGHURAI Colors |
|----------|-----------------|
| Chrome Web Store → Add to Chrome | Install page → download → Load unpacked (Store soon) |
| Pin toolbar icon | Pin **FIGHURAI Colors** |
| Sign in to Simplify profile | Visit fighur.ai while Pro to sync |
| Corner control on job forms | Floating **Colors** button on every site |
| Popup / panel for autofill | Toolbar popup + on-page Colors panel |

## Install (developer / pre–Web Store)

See https://fighur.ai/extension

```bash
bash scripts/pack-page-theme-extension.sh
```

## Architecture (MV3)

- `manifest.json` — `action.default_popup` (real toolbar popup)
- `popup.html` / `popup.js` — Colors UI
- `content.js` + `panel.css` — apply theme + floating FAB + overlay panel
- `background.js` — storage hub + post-install open `/extension?installed=1`
- `site-bridge.js` — sync Pro entitlement + `smile-ai-theme` on fighur.ai
