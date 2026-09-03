#!/usr/bin/env bash
# Locate the talking-head source clip for the color-science render.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT_DIR="$DIR/input"

candidates=()

if [[ -d "$INPUT_DIR" ]]; then
  while IFS= read -r -d '' f; do
    candidates+=("$f")
  done < <(find "$INPUT_DIR" -maxdepth 1 -type f \( -iname '*.mov' -o -iname '*.mp4' -o -iname '*.webm' -o -iname '*.m4v' \) -print0 2>/dev/null | sort -z)
fi

# Common drop-in names (environment uploads, Messages exports, etc.)
for name in \
  source.mov source.mp4 source.webm \
  Aug-20-2026-1-1787275557_9094849.MOV \
  Aug-20-2026-1-1787275557_9094849.mov \
  talking-head.mov talking-head.mp4; do
  for base in "$INPUT_DIR" "$DIR" "/workspace" "/cursor/stores/self"; do
    [[ -f "$base/$name" ]] && candidates+=("$base/$name")
  done
done

# Any long-form clip in the workspace (>= ~90s) that isn't a known reel export.
while IFS= read -r f; do
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" 2>/dev/null || true)"
  if [[ -n "$dur" ]] && awk "BEGIN { exit !($dur >= 90) }"; then
    case "$f" in
      *FIGHURAI-*|*fighur-color-science-captioned*|*consistency-grid*) ;;
      *) candidates+=("$f") ;;
    esac
  fi
done < <(find /workspace /cursor/stores/self -type f \( -iname '*.mov' -o -iname '*.mp4' -o -iname '*.webm' \) 2>/dev/null)

declare -A seen=()
for f in "${candidates[@]}"; do
  [[ -f "$f" ]] || continue
  [[ -n "${seen[$f]:-}" ]] && continue
  seen[$f]=1
  echo "$f"
  exit 0
done

echo "No source video found. Drop your .MOV at: $INPUT_DIR/source.mov" >&2
exit 1
