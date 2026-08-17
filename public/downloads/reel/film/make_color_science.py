#!/usr/bin/env python3
"""Why screen color isn't just a vibe — Instagram carousel (reference format).

Cover VIDEO: same grid + stacked hook as the reference, but the background
SWITCHES through real Fighur.ai Colors pairs + real product screenshots
(platform Colors + Chrome extension) — not random stock photos.

Slides 2–6: dense essay stills with real Fighur product side imagery.
"""
from __future__ import annotations

import shutil
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

W, H = 1080, 1350
FPS = 24
COVER_SECS = 10.0  # longer so each color pair can land

ROOT = Path("/Users/fighur/Desktop/fighur.ai/public/downloads")
OUT_DIR = ROOT / "instagram-color-science"
DESK = Path("/Users/fighur/Desktop/FIGHURAI-Color-Science")
OUT_COVER = ROOT / "FIGHURAI-Color-Science-Cover-4x5.mp4"
DESK_COVER = Path("/Users/fighur/Desktop/FIGHURAI-Color-Science-Cover-4x5.mp4")
REEL = ROOT / "reel"

FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"
HOOK_BLUE = (138, 196, 200)  # sampled from reference (#8AC4C8)
PAPER = (248, 246, 241)
INK = (32, 34, 38)
MUTED = (110, 112, 118)
RULE = (210, 208, 202)
ACCENT = (90, 160, 168)

# Live fighur.ai Colors — official preset + brand theme cycle from product
COLOR_PAIRS = [
    {"bg": (255, 255, 255), "fg": (28, 28, 32), "label": "default"},
    {"bg": (210, 242, 196), "fg": (24, 56, 40), "label": "light green"},
    {"bg": (238, 255, 0), "fg": (20, 50, 245), "label": "fighur preset"},  # #EEFF00 / #1432F5
    {"bg": (242, 7, 108), "fg": (255, 236, 245), "label": "pink"},
    {"bg": (255, 78, 0), "fg": (18, 28, 70), "label": "orange"},
    {"bg": (0, 214, 150), "fg": (232, 255, 210), "label": "green"},
    {"bg": (5, 52, 255), "fg": (236, 242, 255), "label": "blue"},
    {"bg": (255, 242, 213), "fg": (120, 110, 180), "label": "cream"},
    {"bg": (135, 78, 253), "fg": (255, 196, 150), "label": "purple"},
]

PRODUCT_SHOTS = [
    REEL / "real" / "real-02-colors-on.png",
    REEL / "real" / "05-before-after.png",
    REEL / "real" / "01-toolbar-popup.png",
    REEL / "real" / "02-floating-button.png",
    REEL / "real" / "03-page-panel.png",
    REEL / "real" / "real-03-extension-page.png",
    REEL / "ig-refs" / "portrait-real-02-colors-on.png",
    REEL / "real" / "real-01-home.png",
    REEL / "ig-refs" / "portrait-real-01-home.png",
]


def font(size: int, bold: bool = False, medium: bool = False) -> ImageFont.FreeTypeFont:
    # Helvetica Neue: Medium (10) matches the reference hook weight
    if medium:
        idxs = (10, 0, 1)
    elif bold:
        idxs = (1, 10, 0)
    else:
        idxs = (0, 10, 1)
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


def lerp_rgb(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ease_in_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 3 * t * t - 2 * t * t * t


def cover_crop(im: Image.Image, tw: int, th: int, ox: float = 0.5, oy: float = 0.5) -> Image.Image:
    scale = max(tw / im.width, th / im.height)
    nw, nh = int(im.width * scale + 1), int(im.height * scale + 1)
    r = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = min(max(0, int((nw - tw) * ox)), max(0, nw - tw))
    top = min(max(0, int((nh - th) * oy)), max(0, nh - th))
    return r.crop((left, top, left + tw, top + th))


def pair_at(t: float, duration: float):
    n = len(COLOR_PAIRS)
    seg = duration / n
    idx = min(n - 1, int(t / seg))
    local = (t - idx * seg) / seg
    if local < 0.5 or idx >= n - 1:
        p = COLOR_PAIRS[idx]
        return p["bg"], p["fg"], p["label"], idx
    blend = ease_in_out((local - 0.5) / 0.5)
    a, b = COLOR_PAIRS[idx], COLOR_PAIRS[idx + 1]
    return lerp_rgb(a["bg"], b["bg"], blend), lerp_rgb(a["fg"], b["fg"], blend), a["label"], idx


def load_product_tiles() -> list[Image.Image]:
    return [Image.open(p).convert("RGB") for p in PRODUCT_SHOTS if p.exists()]


def reading_surface(bg, fg, w: int, h: int) -> Image.Image:
    im = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(im)
    f = font(max(22, w // 38), False)
    fb = font(max(30, w // 26), True)
    muted = lerp_rgb(fg, bg, 0.4)
    d.text((w // 12, h // 11), "FIGHURAI Colors", font=fb, fill=fg)
    y = h // 11 + fb.size + 28
    sample = (
        "Black text on white can make letters move. Glare. Rivers of white space. "
        "Reading gets exhausting before you've processed the words. "
        "The color that actually helps is different for every person — "
        "precision colorimetry, not one preset for everyone. "
        "Fighur.ai lets you dial text and background to your exact shade, "
        "on the platform and on any website with Colors."
    )
    for line in wrap(d, sample, f, w - w // 6):
        d.text((w // 12, y), line, font=f, fill=fg)
        y += int(f.size * 1.45)
        if y > h - 100:
            break
    for i in range(5):
        yy = y + 24 + i * 34
        if yy > h - 50:
            break
        d.rounded_rectangle((w // 12, yy, w - w // 12, yy + 12), 4, fill=muted)
    return im


def draw_grid(img: Image.Image, cols: int = 3, rows: int = 4, color=(255, 255, 255, 220), width: int = 2) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cw, ch = img.width / cols, img.height / rows
    for i in range(1, cols):
        x = int(round(i * cw))
        d.line((x, 0, x, img.height), fill=color, width=width)
    for j in range(1, rows):
        y = int(round(j * ch))
        d.line((0, y, img.width, y), fill=color, width=width)
    out = img.convert("RGBA")
    out.alpha_composite(layer)
    img.paste(out.convert("RGB"))


def draw_hook_text(img: Image.Image, lines: list[str], color=HOOK_BLUE, scale: int = 1) -> None:
    """Reference: Helvetica Neue Medium, soft cyan (#8AC4C8), stacked mid-left."""
    d = ImageDraw.Draw(img)
    f = font(int(94 * scale), medium=True)
    ww, hh = img.size
    while True:
        widths = [d.textlength(line, font=f) for line in lines]
        if max(widths) <= ww * 0.70 and len(lines) * (f.size + 6 * scale) < hh * 0.52:
            break
        f = font(max(int(48 * scale), f.size - 2 * scale), medium=True)
    line_h = int(f.size * 1.14)
    block_h = line_h * len(lines)
    max_w = max(d.textlength(line, font=f) for line in lines)
    x0 = (ww - max_w) / 2 - 40 * scale
    y0 = (hh - block_h) // 2 - 16 * scale
    for i, line in enumerate(lines):
        d.text((x0, y0 + i * line_h), line, font=f, fill=color)


def cover_frame(t: float, duration: float, products: list[Image.Image] | None = None, scale: int = 1) -> Image.Image:
    """Reference clarity: solid Colors field + grid + Medium hook.
    No background body text. No muddy UI. Supersample then downscale.
    """
    ww, hh = W * scale, H * scale
    bg, fg, _label, active = pair_at(t, duration)
    frame = Image.new("RGB", (ww, hh), bg)
    d = ImageDraw.Draw(frame)

    # soft geometric cue only — no type underneath the hook
    shape = lerp_rgb(bg, fg, 0.07)
    r = int(min(ww, hh) * 0.42)
    cx, cy = int(ww * 0.62), int(hh * 0.55)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=shape)
    r2 = int(r * 0.55)
    d.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=bg)

    draw_grid(frame, cols=3, rows=4, color=(255, 255, 255, 220), width=max(2, 2 * scale))

    lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
    if lum > 190 and bg[1] > 200 and bg[2] < 90:
        hook = (20, 50, 245)
    else:
        hook = HOOK_BLUE

    draw_hook_text(frame, ["Why", "screen color", "isn't just", "a vibe"], color=hook, scale=scale)

    sw = int(38 * scale)
    gap = int(10 * scale)
    total = len(COLOR_PAIRS) * (sw + gap) - gap
    x0 = (ww - total) // 2
    y0 = hh - int(78 * scale)
    for i, p in enumerate(COLOR_PAIRS):
        x = x0 + i * (sw + gap)
        d.ellipse((x - 3 * scale, y0 - 3 * scale, x + sw + 3 * scale, y0 + sw + 3 * scale), fill=(255, 255, 255))
        d.ellipse((x, y0, x + sw, y0 + sw), fill=p["bg"])
        if i == active:
            d.ellipse(
                (x - 5 * scale, y0 - 5 * scale, x + sw + 5 * scale, y0 + sw + 5 * scale),
                outline=p["fg"],
                width=max(2, 3 * scale),
            )

    if scale != 1:
        frame = frame.resize((W, H), Image.Resampling.LANCZOS)
    return frame



# Essay slide themes — decisive Fighur brand color per beat
ESSAY_THEMES = {
    "study": {  # light-green research
        "bg": (210, 242, 196),
        "box": (186, 228, 168),
        "text": (18, 48, 36),
        "muted": (48, 90, 68),
        "accent": (8, 90, 72),
        "rule": (140, 190, 150),
    },
    "irlen": {  # cream — visual stress / reading
        "bg": (255, 242, 213),
        "box": (245, 228, 190),
        "text": (72, 58, 140),
        "muted": (120, 108, 168),
        "accent": (135, 78, 253),
        "rule": (220, 200, 170),
    },
    "precision": {  # official Colors preset
        "bg": (238, 255, 0),
        "box": (220, 240, 0),
        "text": (20, 50, 245),
        "muted": (40, 70, 200),
        "accent": (20, 50, 245),
        "rule": (180, 210, 40),
    },
    "body": {  # deep blue — melatonin / chemistry
        "bg": (5, 52, 255),
        "box": (18, 48, 210),
        "text": (236, 242, 255),
        "muted": (170, 190, 255),
        "accent": (73, 234, 203),
        "rule": (60, 100, 255),
    },
    "close": {  # pink — CTA energy
        "bg": (242, 7, 108),
        "box": (214, 12, 98),
        "text": (255, 236, 245),
        "muted": (255, 190, 220),
        "accent": (64, 224, 208),
        "rule": (255, 120, 170),
    },
}


def essay_slide(
    paragraphs: list[str],
    *,
    theme_key: str,
    pull_quote: str | None = None,
    footer: str | None = None,
    page: str = "",
    kicker: str | None = None,
    show_swatches: bool = False,
    scale: int = 2,
) -> Image.Image:
    """Viral editorial essay — same clarity system as the cover."""
    th = ESSAY_THEMES[theme_key]
    s = scale
    ww, hh = W * s, H * s
    canvas = Image.new("RGB", (ww, hh), th["bg"])
    d = ImageDraw.Draw(canvas)

    # soft concentric geometry (cover language)
    shape = lerp_rgb(th["bg"], th["text"], 0.06)
    r = int(min(ww, hh) * 0.48)
    cx, cy = int(ww * 0.78), int(hh * 0.62)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=shape)
    r2 = int(r * 0.58)
    d.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=th["bg"])
    r3 = int(r * 0.28)
    d.ellipse((cx - r3, cy - r3, cx + r3, cy + r3), fill=shape)

    # faint white grid
    draw_grid(canvas, cols=3, rows=4, color=(255, 255, 255, 95), width=max(1, s))

    # giant faded page number
    if page:
        huge = font(int(280 * s), medium=True)
        d.text((ww - int(340 * s), int(40 * s)), page, font=huge, fill=lerp_rgb(th["bg"], th["text"], 0.08))

    pad = int(64 * s)
    d.line((pad, int(52 * s), ww - pad, int(52 * s)), fill=th["rule"], width=max(2, 2 * s))
    brand = font(int(22 * s), medium=True)
    d.text((pad, int(64 * s)), "FIGHURAI", font=brand, fill=th["muted"])
    if page:
        pw = d.textlength(page, font=brand)
        d.text((ww - pad - pw, int(64 * s)), page, font=brand, fill=th["muted"])

    y = int(128 * s)
    max_w = ww - pad * 2

    if kicker:
        fk = font(int(22 * s), medium=True)
        d.text((pad, y), kicker.upper(), font=fk, fill=th["accent"])
        y += int(48 * s)

    f_body = font(int(30 * s), False)
    f_quote = font(int(48 * s), medium=True)
    quote_ink = th["text"] if theme_key == "precision" else th["accent"]

    body_ceiling = int(hh * (0.42 if pull_quote else 0.72))
    for para in paragraphs:
        for line in wrap(d, para, f_body, max_w):
            if y > body_ceiling:
                break
            d.text((pad, y), line, font=f_body, fill=th["text"])
            y += int(f_body.size * 1.4)
        y += int(28 * s)

    if pull_quote:
        y = max(y + int(36 * s), int(hh * 0.48))
        d.rounded_rectangle((pad, y, pad + int(72 * s), y + int(8 * s)), radius=int(4 * s), fill=th["accent"])
        y += int(36 * s)
        for line in wrap(d, pull_quote, f_quote, max_w):
            if y > hh - int(180 * s):
                break
            d.text((pad, y), line, font=f_quote, fill=quote_ink)
            y += int(f_quote.size * 1.18)

    if show_swatches:
        sw, gap = int(56 * s), int(16 * s)
        colors = [
            (255, 255, 255),
            (210, 242, 196),
            (238, 255, 0),
            (242, 7, 108),
            (255, 78, 0),
            (0, 214, 150),
            (5, 52, 255),
            (135, 78, 253),
        ]
        total = len(colors) * (sw + gap) - gap
        x0 = (ww - total) // 2
        yy = hh - int(150 * s)
        for i, col in enumerate(colors):
            x = x0 + i * (sw + gap)
            d.ellipse((x - 4 * s, yy - 4 * s, x + sw + 4 * s, yy + sw + 4 * s), fill=(255, 255, 255))
            d.ellipse((x, yy, x + sw, yy + sw), fill=col)

    if footer:
        ff = font(int(28 * s), medium=True)
        fy = hh - int(110 * s)
        for line in wrap(d, footer, ff, max_w):
            d.text((pad, fy), line, font=ff, fill=th["text"])
            fy += int(ff.size * 1.3)

    d.line((pad, hh - int(44 * s), ww - pad, hh - int(44 * s)), fill=th["rule"], width=max(2, 2 * s))

    if s != 1:
        canvas = canvas.resize((W, H), Image.Resampling.LANCZOS)
    return canvas


def _essay_specs():
    return [
        (
            "02-not-a-vibe.png",
            "study",
            "THE RESEARCH",
            [
                "You've scrolled past a colored overlay app and thought it was just an aesthetic thing. It's not.",
                "A 2025 study tracked eye movement on white vs. light-green. Green cut visual fatigue. Controlled data — not folk wisdom.",
            ],
            "not a vibe — it's colorimetry",
            None,
            "02",
            False,
        ),
        (
            "03-irlen.png",
            "irlen",
            "VISUAL STRESS",
            [
                "About a third of people with dyslexia also have Irlen Syndrome. Black-on-white can make letters move, throw glare, carve rivers of white through the page.",
                "Colored overlays are a real specialist tool. The catch: the shade that helps is different for every single person.",
            ],
            "1 in 3 people with dyslexia have this",
            None,
            "03",
            False,
        ),
        (
            "04-precision.png",
            "precision",
            "PRECISION COLORIMETRY",
            [
                "It's not \"blue helps everyone.\" It's one specific point in the spectrum — unique to you. Drift from it and the benefit disappears.",
                "A one-size filter helps some people and does nothing for others. Fine-tuning your own colors is what the research says works.",
            ],
            "the right color is different for everyone",
            None,
            "04",
            True,
        ),
        (
            "05-product.png",
            "body",
            "YOUR BODY, NOT JUST YOUR EYES",
            [
                "Harvard found blue light suppresses melatonin more than other wavelengths — that's why night mode exists. Color hits you chemically.",
                "Fighur.ai isn't one preset. Exact text and background on the platform — Colors brings the same control to any website in Chrome.",
            ],
            "screen color isn't neutral",
            None,
            "05",
            False,
        ),
        (
            "06-close.png",
            "close",
            "PLATFORM + ANY SITE",
            [
                "Light sensitivity. Visual stress. Six-hour reading days. Fix the color everywhere you browse — not just inside one app.",
                "The research agrees: the right color is personal. So the tool has to be too.",
            ],
            "now works on any website",
            "Try Colors at fighur.ai",
            "06",
            True,
        ),
    ]


def render_essay_stills() -> list[str]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        DESK.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    names = []
    for name, theme, kicker, paras, quote, foot, page, swatches in _essay_specs():
        img = essay_slide(
            paras,
            theme_key=theme,
            pull_quote=quote,
            footer=foot,
            page=page,
            kicker=kicker,
            show_swatches=swatches,
            scale=2,
        )
        img.save(OUT_DIR / name, "PNG")
        names.append(name)
        print(" ", name)
        try:
            shutil.copy2(OUT_DIR / name, DESK / name)
        except OSError as e:
            print(" desktop skip", name, e)
    return names


def render_all() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        DESK.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    products = load_product_tiles()
    print(f"product shots: {len(products)}")

    print("cover video…")
    n = int(COVER_SECS * FPS)
    writer = imageio.get_writer(
        str(OUT_COVER),
        fps=FPS,
        codec="libx264",
        quality=10,
        macro_block_size=None,
        ffmpeg_log_level="error",
        output_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "14", "-preset", "slow"],
    )
    for i in range(n):
        t = i / FPS
        writer.append_data(np.asarray(cover_frame(t, COVER_SECS, products, scale=3)))
        if i % 24 == 0:
            print(f"  t={t:.1f}s")
    writer.close()

    names: list[str] = []
    cover_still = cover_frame(COVER_SECS * 0.28, COVER_SECS, products, scale=3)
    cover_still.save(OUT_DIR / "01-cover.png", "PNG")
    names.append("01-cover.png")
    print(" ", names[-1])

    names.extend(render_essay_stills())

    caption = (
        "FIGHURAI · Why screen color isn't just a vibe\n"
        "Slide 1 = cover VIDEO (mp4) — Colors cycle through real Fighur pairs + product UI.\n"
        "Slides 2–6 = full-bleed brand color essays. Feed 4:5 (1080×1350).\n\n"
        + "\n\n".join(f"{i}. {n}" for i, n in enumerate(names, 1))
        + "\n\nCaption:\n"
        "Most color-customization apps treat screen color like a preference — pick your favorite, move on. The research says otherwise. Studies on visual stress and Irlen Syndrome, a condition affecting roughly a third of people with dyslexia, show that black text on a white background can cause real physical distortion — letters that appear to move, glare, and reading fatigue that builds throughout the day. Colored overlays are a documented intervention for this, but precision colorimetry research is clear on one point: the color that actually helps is different for every person, down to a specific point in the color spectrum. A generic filter helps some people and does nothing for others.\n\n"
        "That's the gap Fighur.ai is built to close — full text and background color customization across the platform, tuned to what actually works for your eyes, not a preset. We just extended that to a Chrome extension that applies the same customization to any website you browse, not just ours. If screen fatigue, light sensitivity, or visual stress is something you deal with, this isn't a cosmetic feature — it's built on the same principle the research points to: the right color is personal, so the tool should be too.\n"
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
    import sys

    if "stills" in sys.argv:
        render_essay_stills()
    else:
        render_all()
