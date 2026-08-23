#!/usr/bin/env bash
# Render the captioned color-science video with ffmpeg (requires video + SRT).
# Usage: ./render-color-science-video.sh input.mov output.mp4
set -euo pipefail

INPUT="${1:?Usage: $0 input.mov output.mp4}"
OUTPUT="${2:?Usage: $0 input.mov output.mp4}"
DIR="$(cd "$(dirname "$0")" && pwd)"
SRT="$DIR/color-science.srt"

if [[ ! -f "$SRT" ]]; then
  echo "Missing $SRT — generate from the HTML captions array first." >&2
  exit 1
fi

ffmpeg -y -i "$INPUT" \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,subtitles=${SRT}:force_style='FontName=Playfair Display,FontSize=42,PrimaryColour=&HFFFFFF,Italic=1,Outline=0,Shadow=2,MarginV=120,Alignment=2'" \
  -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 192k -t 188 \
  "$OUTPUT"

echo "Wrote $OUTPUT"
