#!/usr/bin/env bash
# Rebuild the Page Theme extension zip served from Settings → Apps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/downloads/fighur-page-theme.zip"
mkdir -p "$ROOT/public/downloads"
rm -f "$OUT"
(
  cd "$ROOT/chrome-extension"
  zip -r "$OUT" . -x '*.DS_Store' -x '*README.md' -x '*CHROME_WEB_STORE.md'
)
echo "Wrote $OUT"
