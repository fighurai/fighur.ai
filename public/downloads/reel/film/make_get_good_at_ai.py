#!/usr/bin/env python3
"""How to Actually Get Good at AI — Instagram carousel (reference format).

Slide 1: cover VIDEO — bold sky-blue hook over scrolling tech-image grid + 3×4 lines.
Slides 2–6: dense essay stills (academic tone), 4:5 feed format matching the reference.
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

# Instagram feed carousel (matches reference aspect ~3:4 / 4:5)
W, H = 1080, 1350
FPS = 24
COVER_SECS = 8.0

ROOT = Path("/Users/fighur/Desktop/fighur.ai/public/downloads")
OUT_DIR = ROOT / "instagram-get-good"
DESK = Path("/Users/fighur/Desktop/FIGHURAI-Get-Good-At-AI")
OUT_COVER = ROOT / "FIGHURAI-Get-Good-At-AI-Cover-4x5.mp4"
DESK_COVER = Path("/Users/fighur/Desktop/FIGHURAI-Get-Good-At-AI-Cover-4x5.mp4")

REEL = ROOT / "reel"
ASSET_CANDIDATES = [
    REEL / "real" / "real-01-home.png",
    REEL / "real" / "real-02-colors-on.png",
    REEL / "real" / "real-03-extension-page.png",
    REEL / "real" / "01-toolbar-popup.png",
    REEL / "real" / "02-floating-button.png",
    REEL / "real" / "03-page-panel.png",
    REEL / "real" / "04-install-pro.png",
    REEL / "real" / "05-before-after.png",
    REEL / "ig-refs" / "portrait-real-01-home.png",
    REEL / "ig-refs" / "portrait-real-02-colors-on.png",
    REEL / "ig-refs" / "portrait-real-03-extension-page.png",
    REEL / "reel-01-hook.png",
    REEL / "reel-02-duo.png",
    REEL / "reel-03-extension.png",
]

FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"
# Sampled from reference hook type
HOOK_BLUE = (138, 196, 200)
PAPER = (248, 246, 241)
INK = (32, 34, 38)
MUTED = (110, 112, 118)
RULE = (210, 208, 202)
ACCENT = (90, 160, 168)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    idxs = (1, 0) if bold else (0, 1)
    for i in idxs:
        try:
            return ImageFont.truetype(FONT_PATH, size=size, index=i)
        except Exception:
            continue
    try:
        return ImageFont.truetype(
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
            size,
        )
    except Exception:
        return ImageFont.load_default()


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def load_tiles() -> list[Image.Image]:
    tiles: list[Image.Image] = []
    for p in ASSET_CANDIDATES:
        if not p.exists():
            continue
        im = Image.open(p).convert("RGB")
        # soft, slightly desaturated — academic / reference feel
        im = ImageEnhance.Color(im).enhance(0.72)
        im = ImageEnhance.Brightness(im).enhance(1.05)
        im = ImageEnhance.Contrast(im).enhance(0.92)
        tiles.append(im)
    if len(tiles) < 6:
        # synthetic fallbacks
        for col in [(40, 44, 52), (20, 80, 90), (60, 40, 80), (30, 30, 36), (90, 70, 50), (50, 90, 70)]:
            t = Image.new("RGB", (800, 1000), col)
            d = ImageDraw.Draw(t)
            for i in range(12):
                d.rectangle((40, 40 + i * 70, 760, 90 + i * 70), outline=(200, 200, 210), width=2)
            tiles.append(t)
    return tiles


def cover_crop(im: Image.Image, tw: int, th: int, ox: float = 0.5, oy: float = 0.5) -> Image.Image:
    scale = max(tw / im.width, th / im.height)
    nw, nh = int(im.width * scale + 1), int(im.height * scale + 1)
    r = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = int(max(0, (nw - tw) * ox))
    top = int(max(0, (nh - th) * oy))
    left = min(left, max(0, nw - tw))
    top = min(top, max(0, nh - th))
    return r.crop((left, top, left + tw, top + th))


def build_scroll_strip(tiles: list[Image.Image], cols: int = 3, cell_w: int | None = None, cell_h: int | None = None) -> Image.Image:
    """Tall strip of tiled screenshots for vertical scroll under a 3-col grid."""
    cell_w = cell_w or (W // cols)
    cell_h = cell_h or int(cell_w * 1.15)
    rows = max(10, math.ceil(28 / cols))  # enough height to scroll
    strip_h = rows * cell_h
    strip = Image.new("RGB", (cols * cell_w, strip_h), (230, 228, 222))
    n = len(tiles)
    for r in range(rows):
        for c in range(cols):
            tile = tiles[(r * cols + c) % n]
            # vary crop focus so adjacent cells feel different
            ox = 0.2 + 0.6 * (((r * 3 + c * 5) % 7) / 6)
            oy = 0.15 + 0.7 * (((r * 5 + c * 2) % 9) / 8)
            cell = cover_crop(tile, cell_w, cell_h, ox, oy)
            strip.paste(cell, (c * cell_w, r * cell_h))
    return strip


def draw_grid(img: Image.Image, cols: int = 3, rows: int = 4, color=(255, 255, 255, 170), width: int = 2) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cw, ch = W / cols, H / rows
    for i in range(1, cols):
        x = int(round(i * cw))
        d.line((x, 0, x, H), fill=color, width=width)
    for j in range(1, rows):
        y = int(round(j * ch))
        d.line((0, y, W, y), fill=color, width=width)
    out = img.convert("RGBA")
    out.alpha_composite(layer)
    img.paste(out.convert("RGB"))


def draw_hook_text(img: Image.Image, lines: list[str], color=HOOK_BLUE) -> None:
    """Large centered sans, stacked like the reference."""
    d = ImageDraw.Draw(img)
    f = font(92, True)
    while True:
        widths = [d.textlength(line, font=f) for line in lines]
        if max(widths) <= W * 0.78 and len(lines) * (f.size + 10) < H * 0.55:
            break
        f = font(max(48, f.size - 4), True)
    line_h = int(f.size * 1.15)
    block_h = line_h * len(lines)
    y0 = (H - block_h) // 2 - 16
    for i, line in enumerate(lines):
        x = (W - d.textlength(line, font=f)) / 2
        d.text((x, y0 + i * line_h), line, font=f, fill=color)


def cover_frame(strip: Image.Image, t: float, duration: float) -> Image.Image:
    """Vertical scroll of tile strip + static grid + hook text."""
    # scroll so we travel most of the strip over the clip
    max_y = max(1, strip.height - H)
    # slow continuous crawl (reference feel)
    progress = (t / duration) % 1.0
    y = int(progress * max_y)
    # also allow slight reverse feel on second half for loop friendliness
    frame = strip.crop((0, y, W, y + H)).convert("RGB")
    # wash toward paper white so it reads like the pale reference, not a dark reel
    wash = Image.new("RGB", (W, H), (236, 234, 228))
    frame = Image.blend(frame, wash, 0.28)
    frame = ImageEnhance.Brightness(frame).enhance(1.08)
    frame = ImageEnhance.Color(frame).enhance(0.85)
    draw_grid(frame, cols=3, rows=4, color=(255, 255, 255, 185), width=2)
    draw_hook_text(
        frame,
        ["How to", "actually", "get good", "at AI?"],
        color=HOOK_BLUE,
    )
    return frame


def essay_slide(
    title: str | None,
    paragraphs: list[str],
    *,
    pull_quote: str | None = None,
    footer: str | None = None,
    side_image: Image.Image | None = None,
    page: str = "",
) -> Image.Image:
    """Dense academic essay slide — cream paper, dark ink, optional side image + pull quote."""
    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)

    # top thin rule + brand
    d.line((72, 56, W - 72, 56), fill=RULE, width=2)
    brand = font(22, False)
    d.text((72, 68), "FIGHURAI", font=brand, fill=MUTED)
    if page:
        pw = d.textlength(page, font=brand)
        d.text((W - 72 - pw, 68), page, font=brand, fill=MUTED)

    f_title = font(44, True)
    f_body = font(28, False)
    f_quote = font(34, True)
    f_foot = font(26, True)

    y = 120
    max_w = W - 144

    if title:
        for line in wrap(d, title, f_title, max_w):
            d.text((72, y), line, font=f_title, fill=INK)
            y += int(f_title.size * 1.2)
        y += 18

    # optional side image strip on the right for mid slides
    text_w = max_w
    if side_image is not None:
        iw, ih = 320, 420
        thumb = cover_crop(side_image, iw, ih, 0.5, 0.4)
        thumb = ImageEnhance.Color(thumb).enhance(0.75)
        # soft edge
        mask = Image.new("L", (iw, ih), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, iw - 1, ih - 1), 18, fill=255)
        canvas.paste(thumb, (W - 72 - iw, 160), mask)
        text_w = W - 144 - iw - 36

    for para in paragraphs:
        for line in wrap(d, para, f_body, text_w):
            if y > H - 160:
                break
            d.text((72, y), line, font=f_body, fill=INK)
            y += int(f_body.size * 1.38)
        y += 22

    if pull_quote:
        y += 8
        d.line((72, y, 200, y), fill=ACCENT, width=3)
        y += 18
        for line in wrap(d, pull_quote, f_quote, max_w):
            if y > H - 140:
                break
            d.text((72, y), line, font=f_quote, fill=ACCENT)
            y += int(f_quote.size * 1.28)

    if footer:
        y = max(y + 24, H - 120)
        for line in wrap(d, footer, f_foot, max_w):
            d.text((72, y), line, font=f_foot, fill=INK)
            y += int(f_foot.size * 1.3)

    d.line((72, H - 48, W - 72, H - 48), fill=RULE, width=2)
    return canvas


def make_cover_still(strip: Image.Image) -> Image.Image:
    return cover_frame(strip, 0.0, COVER_SECS)


def render_all() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        DESK.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    tiles = load_tiles()
    strip = build_scroll_strip(tiles, cols=3)
    # ensure strip width == W
    if strip.width != W:
        strip = strip.resize((W, int(strip.height * (W / strip.width))), Image.Resampling.LANCZOS)

    print("cover video…")
    n = int(COVER_SECS * FPS)
    writer = imageio.get_writer(
        str(OUT_COVER),
        fps=FPS,
        codec="libx264",
        quality=8,
        macro_block_size=None,
        ffmpeg_log_level="error",
        output_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    )
    for i in range(n):
        t = i / FPS
        writer.append_data(np.asarray(cover_frame(strip, t, COVER_SECS)))
        if i % 24 == 0:
            print(f"  t={t:.1f}s")
    writer.close()

    # stills
    names: list[str] = []
    cover_still = make_cover_still(strip)
    cover_name = "01-cover.png"
    cover_still.save(OUT_DIR / cover_name, "PNG")
    names.append(cover_name)
    print(" ", cover_name)

    slide2 = essay_slide(
        None,
        [
            'Today, "getting good at AI" has become almost synonymous with learning prompt tricks. We collect prompt templates, save threads of "10 prompts that will change your life," and believe that more tricks naturally lead to better results. But perhaps skill with AI doesn\'t begin with collecting more prompts. Perhaps it begins with changing how precisely you think before you type anything at all.',
            "The human brain holds a limited amount of information in working memory at once — psychologists call this cognitive load. When a task asks you to hold too many pieces at the same time, performance drops, not because you're not smart enough, but because the system has a ceiling. Every one of us hits it.",
            'This is why a vague prompt like "help me with my business" produces a vague answer, while a specific one produces something usable. The AI isn\'t reading your mind less accurately in the first case. Your own request simply hasn\'t organized the information yet. You\'re asking a system to do the compression your brain hasn\'t done.',
        ],
        page="02",
        side_image=tiles[0] if tiles else None,
    )
    n2 = "02-cognitive-load.png"
    slide2.save(OUT_DIR / n2, "PNG")
    names.append(n2)
    print(" ", n2)

    slide3 = essay_slide(
        None,
        [
            "There's a well-documented gap between how well people think they understand something and how well they can actually explain it — researchers call this the illusion of explanatory depth. Ask someone if they understand how a zipper works, and most say yes confidently. Ask them to explain it step by step, and the confidence collapses.",
            "The same gap shows up with AI. People feel like they know what they want built, until they're asked to describe it in enough detail for something else to actually build it. That moment of friction isn't a failure. It's the illusion of explanatory depth surfacing, and it's actually useful — it's showing you exactly where your own thinking was still vague.",
        ],
        pull_quote="a clear prompt isn't a writing skill. it's a thinking skill wearing a writing costume.",
        page="03",
        side_image=tiles[2] if len(tiles) > 2 else None,
    )
    n3 = "03-illusion-of-depth.png"
    slide3.save(OUT_DIR / n3, "PNG")
    names.append(n3)
    print(" ", n3)

    slide4 = essay_slide(
        None,
        [
            "What if getting good at AI worked the same way experts get good at anything else? Cognitive scientists studying expertise found something consistent across chess players, radiologists, and musicians: experts don't have better raw memory than beginners. They've learned to group information into larger, meaningful chunks. A beginner sees sixteen chess pieces. A grandmaster sees three or four recognizable patterns.",
            "The same thing happens with people who get genuinely fast at working with AI. They're not typing faster or memorizing more prompt formulas. They've learned to chunk a request — context, constraint, and outcome, bundled into one clear instruction — instead of trickling out five separate vague ones and hoping the tool connects the dots.",
            'eg: instead of "build me an app" then "make it track expenses" then "add notifications" — one chunked prompt: "build an app that logs my expenses, categorizes them automatically, and texts me a summary every Sunday."',
        ],
        page="04",
    )
    n4 = "04-chunking.png"
    slide4.save(OUT_DIR / n4, "PNG")
    names.append(n4)
    print(" ", n4)

    slide5 = essay_slide(
        None,
        [
            "There's a well-known effect in problem-solving called the Einstellung effect, or mental set — once you've learned a hard way to solve a problem, your brain defaults back to that hard way even when an easier path is sitting right in front of you. It's why experienced chess players sometimes miss a simple winning move, because their mind is locked onto the familiar, complicated pattern.",
            "This might be the biggest thing standing between most people and actually using AI well. An entire generation learned that building software requires years of study, so the mental set says: this must still be hard. And that assumption alone is often the only thing stopping someone from just describing what they want and letting a tool like Fighur.ai build it in plain English.",
            "Maybe the goal was never to learn more prompt tricks. Maybe it's to unlearn the assumption that it has to be difficult in the first place.",
        ],
        page="05",
        side_image=tiles[4] if len(tiles) > 4 else None,
    )
    n5 = "05-einstellung.png"
    slide5.save(OUT_DIR / n5, "PNG")
    names.append(n5)
    print(" ", n5)

    slide6 = essay_slide(
        None,
        [
            "This is why the AI advantage doesn't belong to the person who's read the most about AI. It belongs to the person who has trained their thinking to be specific — who can hold one clear picture of what they want, chunk it into a single instruction, and let a tool like Fighur.ai handle the rest.",
        ],
        pull_quote="Not more tricks. Just clearer thinking.",
        footer='Try it at fighur.ai, or comment "FIGHUR" and we\'ll send you the newsletter.',
        page="06",
    )
    n6 = "06-close.png"
    slide6.save(OUT_DIR / n6, "PNG")
    names.append(n6)
    print(" ", n6)

    caption = (
        "FIGHURAI · How to Actually Get Good at AI\n"
        "Slide 1 = cover VIDEO (upload the mp4 as first carousel item).\n"
        "Slides 2–6 = essay stills. Feed 4:5 (1080×1350).\n\n"
        + "\n\n".join(f"{i}. {n}" for i, n in enumerate(names, 1))
        + "\n\nCaption:\nHow to actually get good at AI?\n"
        "Not more prompt tricks — clearer thinking.\n"
        "Swipe →\n\n"
        'Try it at fighur.ai, or comment "FIGHUR" and we\'ll send you the newsletter.\n'
    )
    (OUT_DIR / "CAPTIONS.txt").write_text(caption, encoding="utf-8")

    for name in names + ["CAPTIONS.txt"]:
        try:
            shutil.copy2(OUT_DIR / name, DESK / name)
        except OSError as e:
            print(" desktop skip", name, e)
    try:
        shutil.copy2(OUT_COVER, DESK_COVER)
    except OSError as e:
        print(" desktop cover skip", e)

    print("wrote →", OUT_DIR)
    print("cover →", OUT_COVER)


if __name__ == "__main__":
    render_all()
