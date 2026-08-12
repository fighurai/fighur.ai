# FIGHURAI Colors (Chrome extension)

Manifest V3 Chrome extension for FIGHURAI Pro.

| Step | FIGHURAI Colors |
|------|-----------------|
| Install | Install page → download → Load unpacked (Chrome Web Store soon) |
| Pin | Pin **FIGHURAI Colors** in the toolbar |
| Sync Pro | Visit fighur.ai while signed in on Pro |
| Use | Floating **Colors** button on every site |
| Controls | Toolbar popup + on-page Colors panel |

## Install (developer / pre–Web Store)

See https://fighur.ai/extension

```bash
bash scripts/pack-page-theme-extension.sh
```

## Files

- `manifest.json` — `action.default_popup` (real toolbar popup)
- `popup.html` / `popup.js` — Colors UI
- `content.js` + `panel.css` — apply theme + floating FAB + overlay panel
- `background.js` — storage hub, broadcast theme to tabs, post-install open `/extension?installed=1`
- `site-bridge.js` — Pro entitlement sync; extension theme → fighur.ai CSS vars (site edits still push back)
