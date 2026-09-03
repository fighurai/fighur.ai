#!/usr/bin/env python3
"""Convert color-science.srt to styled ASS for ffmpeg/libass."""

from __future__ import annotations

import re
import sys
from pathlib import Path

SRT_PATH = Path(__file__).with_name("color-science.srt")
ASS_PATH = Path(__file__).with_name("color-science.ass")

HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Cormorant Garamond,56,&H00EAF1F5,&H000000FF,&H00000000,&H80000000,-1,1,0,0,100,100,0.6,0,1,0,3,2,240,240,118,1
Style: Watermark,DM Sans,15,&H00E0F1F5,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,9,48,48,44,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

TIME_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})"
)


def to_ass_time(h: str, m: str, s: str, ms: str) -> str:
    cs = int(ms) // 10
    return f"{int(h)}:{int(m):02d}:{int(s):02d}.{cs:02d}"


def parse_srt(raw: str) -> list[tuple[str, str, str]]:
    blocks = re.split(r"\n\s*\n", raw.strip())
    out: list[tuple[str, str, str]] = []
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        idx = 0
        if lines[0].isdigit():
            idx = 1
        if idx >= len(lines):
            continue
        m = TIME_RE.match(lines[idx])
        if not m:
            continue
        start = to_ass_time(*m.groups()[0:4])
        end = to_ass_time(*m.groups()[4:8])
        text = "\\N".join(lines[idx + 1 :])
        text = text.replace("{", "\\{").replace("}", "\\}")
        out.append((start, end, text))
    return out


def main() -> int:
    srt_path = Path(sys.argv[1]) if len(sys.argv) > 1 else SRT_PATH
    ass_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ASS_PATH
    raw = srt_path.read_text(encoding="utf-8")
    events = parse_srt(raw)
    lines = [HEADER.rstrip(), "Dialogue: 0,0:00:00.00,3:08:00.00,Watermark,,0,0,0,,{\\an9\\pos(1872,44)\\fad(400,400)}@fighurai"]
    for start, end, text in events:
        lines.append(f"Dialogue: 0,{start},{end},Caption,,0,0,0,,{{\\fad(180,180)}}{text}")
    ass_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {ass_path} ({len(events)} captions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
