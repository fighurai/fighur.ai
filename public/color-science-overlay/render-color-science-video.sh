#!/usr/bin/env bash
# Render captioned color-science video with cinematic framing + premium ASS captions.
# Usage: ./render-color-science-video.sh [input.mov] [output.mp4]
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
FIND="$DIR/find-source-video.sh"
SRT="$DIR/color-science.srt"
ASS="$DIR/color-science.ass"
SCRIM="$DIR/scrim-bottom.png"
FONT_DIR="$DIR/fonts"

INPUT="${1:-}"
OUTPUT="${2:-$DIR/../../public/color-science-overlay/fighur-color-science-captioned.mp4}"

if [[ -z "$INPUT" ]]; then
  INPUT="$("$FIND")"
fi

if [[ ! -f "$INPUT" ]]; then
  echo "Source video not found: $INPUT" >&2
  echo "Place your talking-head clip at: $DIR/input/source.mov" >&2
  exit 1
fi

for req in "$SRT" "$SCRIM" "$FONT_DIR/CormorantGaramond-MediumItalic.ttf" "$FONT_DIR/DMSans-SemiBold.ttf"; do
  [[ -f "$req" ]] || { echo "Missing required asset: $req" >&2; exit 1; }
done

python3 "$DIR/srt-to-ass.py" "$SRT" "$ASS"

mkdir -p "$(dirname "$OUTPUT")"

echo "Rendering from: $INPUT"
echo "Writing to:     $OUTPUT"

# Cinematic: blurred full-bleed background + sharp contain foreground, grade, scrim, ASS captions.
ffmpeg -y -i "$INPUT" -i "$SCRIM" \
  -filter_complex "\
[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,\
boxblur=luma_radius=24:luma_power=2:chroma_radius=12:chroma_power=1,\
eq=brightness=0.38:saturation=1.15:contrast=1.08[bg];\
[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,\
eq=contrast=1.06:saturation=1.1:brightness=1.04[fg];\
[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto[base];\
[base]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill[graded];\
[1:v]scale=1920:540[scrim];\
[graded][scrim]overlay=0:540:format=auto[scrimmed];\
[scrimmed]subtitles=${ASS}:fontsdir=${FONT_DIR}[vout]" \
  -map "[vout]" -map 0:a? \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 \
  -t 188 -movflags +faststart \
  "$OUTPUT"

echo "Wrote $OUTPUT"
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,codec_type -of default=noprint_wrappers=1 "$OUTPUT"
