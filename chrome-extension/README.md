# FIGHURAI Colors (Chrome)

Pro Chrome extension — click the icon on any website to open the same **Colors** panel as on FIGHURAI (background + text). Works like Simplify’s overlay, but for page colors.

## Install

1. Be on **FIGHURAI Pro** and signed in at fighur.ai in Chrome  
2. Settings → Apps → download `fighur-page-theme.zip` (or load unpacked from this folder)  
3. `chrome://extensions` → Developer mode → Load unpacked  
4. Visit fighur.ai once so Pro syncs  
5. Click the extension icon on any site → Colors panel appears  

## Behavior

- Panel matches the in-app **Colors** control (`ThemeControls`)
- Presets match the site (`#EEFF00` / `#1432F5`)
- Colors sync both ways with `smile-ai-theme` while you’re on fighur.ai  
- Free accounts see Upgrade to Pro instead of the pickers  

Rebuild the download zip:

```bash
bash scripts/pack-page-theme-extension.sh
```
