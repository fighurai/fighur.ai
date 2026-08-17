#!/usr/bin/env python3
"""FIGHURAI Instagram stills + expanded short film.
Same Helvetica Neue across stills. Prompt-box mockups + film color acts.
Smile neon logo in the film. Themes: pink / orange / green / blue / yellow + teal / purple / cream.
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 24

ROOT = Path("/Users/fighur/Desktop/fighur.ai/public/downloads")
STILL_DIR = ROOT / "instagram-chic"
FILM_DIR = ROOT / "reel" / "film"
DESK_STILLS = Path("/Users/fighur/Desktop/FIGHURAI-Instagram-Chic")
DESK_FILM = Path("/Users/fighur/Desktop/FIGHURAI-Short-Film-9x16.mp4")
OUT_FILM = ROOT / "FIGHURAI-Short-Film-9x16.mp4"
WHY_DIR = ROOT / "instagram-why"
DESK_WHY = Path("/Users/fighur/Desktop/FIGHURAI-Why-Dark-Mode")
OUT_WHY_FILM = ROOT / "FIGHURAI-Why-Dark-Mode-9x16.mp4"
DESK_WHY_FILM = Path("/Users/fighur/Desktop/FIGHURAI-Why-Dark-Mode-9x16.mp4")

SMILE = Path(
    "/Users/fighur/.cursor/projects/Users-fighur-Desktop-fighur-ai/assets/"
    "ChatGPT_Image_Jun_21__2026_at_02_55_00_PM-e46d77e3-8dad-4c93-a855-023cceb47a7c.png"
)
INTRO = Path("/Users/fighur/Downloads/fighur-reels-intro-green.mp4")
FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"

# Sampled from live fighur.ai screenshots
THEMES = {
    "pink": {
        "bg": (242, 7, 108),
        "box": (214, 12, 98),
        "text": (255, 236, 245),
        "muted": (255, 200, 224),
        "accent": (64, 224, 208),
        "accent_ink": (8, 40, 36),
        "shadow": (120, 0, 50),
    },
    "orange": {
        "bg": (255, 78, 0),
        "box": (230, 62, 8),
        "text": (18, 28, 70),
        "muted": (40, 40, 90),
        "accent": (64, 224, 208),
        "accent_ink": (8, 30, 30),
        "shadow": (140, 30, 0),
    },
    "green": {
        "bg": (0, 214, 150),
        "box": (5, 160, 118),
        "text": (232, 255, 210),
        "muted": (200, 245, 210),
        "accent": (8, 90, 82),
        "accent_ink": (220, 255, 230),
        "shadow": (0, 90, 60),
    },
    "blue": {
        "bg": (5, 52, 255),
        "box": (18, 48, 210),
        "text": (236, 242, 255),
        "muted": (180, 200, 255),
        "accent": (73, 234, 203),
        "accent_ink": (10, 30, 30),
        "shadow": (0, 20, 120),
    },
    "yellow": {
        "bg": (209, 249, 2),
        "box": (186, 220, 16),
        "text": (20, 50, 245),
        "muted": (30, 60, 180),
        "accent": (32, 210, 199),
        "accent_ink": (10, 30, 30),
        "shadow": (90, 110, 0),
    },
    "teal": {
        "bg": (69, 128, 172),
        "box": (58, 110, 145),
        "text": (190, 230, 150),
        "muted": (168, 210, 140),
        "accent": (40, 216, 200),
        "accent_ink": (8, 40, 36),
        "shadow": (28, 58, 88),
    },
    "purple": {
        "bg": (135, 78, 253),
        "box": (118, 68, 220),
        "text": (255, 196, 150),
        "muted": (232, 170, 130),
        "accent": (40, 216, 200),
        "accent_ink": (8, 30, 30),
        "shadow": (70, 30, 140),
    },
    "cream": {
        "bg": (255, 242, 213),
        "box": (236, 228, 215),
        "text": (120, 110, 180),
        "muted": (152, 148, 196),
        "accent": (40, 216, 200),
        "accent_ink": (8, 40, 36),
        "shadow": (150, 130, 100),
    },
}

THEME_ORDER = ["pink", "orange", "green", "blue", "yellow"]

# Segment 6 — Prompts Worth Stealing. One prompt per still. Mix old + new colors.
SLIDES = [
    ("pink", "Build me an agent that checks [my industry] news every morning and texts me a 3-bullet summary"),
    ("teal", "Turn this messy voice memo into a client-ready email"),
    ("orange", "Recolor this whole screen to something easier on my eyes — walk me through why"),
    ("purple", "Make a tracker that logs my expenses and sends me a Sunday recap"),
    ("green", "Turn this photo into a boxed collectible figure"),
    ("cream", "Draft 3 versions of this text — one blunt, one soft, one funny"),
    ("blue", "Build me a landing page for this idea, no code"),
    ("yellow", "Summarize this 40-page PDF into 5 bullets I can actually use"),
    ("pink", "Set up an agent that watches this competitor's site and pings me when something changes"),
    ("purple", "Turn my rambling notes into a clean outline I can present tomorrow"),
]

# Segment — Why dark mode exists (Irlen / colorimetry / Fighur.ai Colors)
WHY_SLIDES = [
    ("pink", "Why does dark mode exist?", "Most people can't actually answer."),
    ("cream", "Most people think it's just an aesthetic option. It's not.", "There's peer-reviewed research behind the colors on your screen."),
    ("teal", "About a third of people with dyslexia also have Irlen Syndrome — visual stress.", "A real, documented condition."),
    ("orange", "Black text on white can make letters move. Glare. Rivers of white space. Reading gets exhausting.", "Not a metaphor — a measurable visual effect."),
    ("purple", "Colored overlays are a real tool reading specialists use.", "A tinted sheet or screen filter over the text."),
    ("green", "The color that actually helps is different for every single person.", "Precision colorimetry. Not “blue helps everyone.”"),
    ("blue", "If the app can't dial in your exact shade, you're just using someone else's color.", "You're not getting the benefit."),
    ("yellow", "Light-green backgrounds reduced how tired eyes got.", "2025 eye-tracking study."),
    ("pink", "Blue light suppresses melatonin more than other colors.", "Harvard. That's why night mode exists."),
    ("orange", "Color doesn't just change how a screen looks. It affects your body chemically.", "Whether you notice it or not."),
    ("purple", "A generic filter — one preset for every user — works against the research.", "The helpful shade is personal."),
    ("teal", "Fighur.ai: your exact text and background color. Platform + any website.", "The right color is personal, so the tool has to be too."),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    # HelveticaNeue.ttc: try bold index then regular
    idxs = (1, 0) if bold else (0, 1)
    last = None
    for i in idxs:
        try:
            return ImageFont.truetype(FONT_PATH, size=size, index=i)
        except Exception as e:
            last = e
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf", size)
    except Exception:
        return ImageFont.load_default()


F_BRAND = font(28, True)
F_SMALL = font(28, False)
F_BODY = font(42, True)
F_FACT = font(28, False)
F_CTA = font(64, True)
F_TAG = font(36, False)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        bbox = draw.textbbox((0, 0), trial, font=fnt)
        if bbox[2] - bbox[0] <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def load_smile(size: int = 160) -> Image.Image:
    """Knock out the black square so only the neon smile remains."""
    im = Image.open(SMILE).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    rgb = arr[..., :3]
    mx = rgb.max(axis=2)
    # Soft key: black → transparent, keep neon glow.
    alpha = np.clip((mx - 18.0) / 36.0, 0.0, 1.0)
    out = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    ys, xs = np.where(out[..., 3] > 20)
    if len(xs):
        pad = 8
        x0, x1 = max(0, int(xs.min()) - pad), min(im.width, int(xs.max()) + pad)
        y0, y1 = max(0, int(ys.min()) - pad), min(im.height, int(ys.max()) + pad)
        im = im.crop((x0, y0, x1, y1))
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    return im


def _ink_bbox(text: str, fnt) -> tuple[int, int, int, int]:
    """Pixel bbox of painted glyphs — not the font metrics box."""
    pad = 64
    tmp = Image.new("L", (int(fnt.size * len(text) * 1.4) + pad * 2, int(fnt.size * 3) + pad * 2), 0)
    ImageDraw.Draw(tmp).text((pad, pad), text, font=fnt, fill=255)
    box = tmp.getbbox()
    if not box:
        return (pad, pad, pad + 1, pad + 1)
    return box[0] - pad, box[1] - pad, box[2] - pad, box[3] - pad


def pill(
    draw: ImageDraw.ImageDraw,
    text: str,
    fnt,
    *,
    cy: float,
    left: float | None = None,
    right: float | None = None,
    fill=None,
    outline=None,
    ink=(255, 255, 255),
    width: int = 2,
    pad_x: int | None = None,
    pad_y: int | None = None,
    s: int = 1,
) -> tuple[int, int]:
    """Capsule sized from painted glyph bounds so the word sits dead-center."""
    ix0, iy0, ix1, iy1 = _ink_bbox(text, fnt)
    tw, th = ix1 - ix0, iy1 - iy0
    px = int(22 * s) if pad_x is None else pad_x
    py = int(13 * s) if pad_y is None else pad_y
    pw = max(int(math.ceil(tw + px * 2)), int(52 * s))
    ph = max(int(math.ceil(th + py * 2)), int(36 * s))
    if ph % 2:
        ph += 1
    x0 = int(round(left if left is not None else (right or 0) - pw))
    y0 = int(round(cy - ph / 2))
    x1, y1 = x0 + pw, y0 + ph
    draw.rounded_rectangle((x0, y0, x1 - 1, y1 - 1), radius=ph // 2, fill=fill, outline=outline, width=width)
    # place draw-origin so the ink rectangle is centered in the capsule
    pcx = (x0 + x1 - 1) / 2
    pcy = (y0 + y1 - 1) / 2
    draw.text(
        (pcx - (ix0 + ix1) / 2, pcy - (iy0 + iy1) / 2 - 2 * s),
        text,
        font=fnt,
        fill=ink,
    )
    return x0, x1


def _mix(a, b, t: float):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def composer_card(
    theme: dict,
    quote: str,
    fact: str,
    w: int = 920,
    extra: str | None = None,
    fonts: dict | None = None,
    s: int = 1,
) -> Image.Image:
    """Build the fighur.ai composer widget — caption lives inside the prompt box."""
    f_small = fonts["small"] if fonts else F_SMALL
    f_body = fonts["body"] if fonts else F_BODY
    f_fact = fonts["fact"] if fonts else F_FACT
    probe = ImageDraw.Draw(Image.new("RGB", (w, 10)))
    quote_lines = wrap(probe, quote, f_body, w - 80 * s)
    fact_lines = wrap(probe, fact, f_fact, w - 80 * s) if fact else []
    pad = 36 * s
    line_h = 54 * s
    fact_h = 36 * s
    bar = 120 * s
    card_h = pad + 40 * s + len(quote_lines) * line_h + (12 * s + len(fact_lines) * fact_h if fact_lines else 0) + bar
    card_h = max(card_h, 360 * s)
    # RGB first — RGBA text/strokes are grainy and vertically off in Pillow
    rgb = Image.new("RGB", (w, card_h), theme["box"])
    d = ImageDraw.Draw(rgb)
    d.text((36 * s, 28 * s), "Fighur it out with AI", font=f_small, fill=theme["muted"])
    y = 88 * s
    for line in quote_lines:
        d.text((36 * s, y), line, font=f_body, fill=theme["text"])
        y += line_h
    if fact_lines:
        y += 8 * s
        for line in fact_lines:
            d.text((36 * s, y), line, font=f_fact, fill=theme["muted"])
            y += fact_h
    d.line((36 * s, card_h - 92 * s, w - 36 * s, card_h - 92 * s), fill=_mix(theme["box"], theme["muted"], 0.35), width=max(2, 2 * s))
    bar_cy = card_h - 50 * s
    d.text((36 * s, bar_cy), "Speak", font=f_small, fill=theme["muted"], anchor="lm")
    stroke = max(2, 2 * s)
    box_lum = theme["box"][0] * 0.299 + theme["box"][1] * 0.587 + theme["box"][2] * 0.114
    outline_fill = _mix(theme["box"], (0, 0, 0), 0.07) if box_lum > 170 else _mix(theme["box"], (255, 255, 255), 0.1)
    pill(
        d,
        "Attach",
        f_small,
        left=150 * s,
        cy=bar_cy,
        fill=outline_fill,
        outline=theme["muted"],
        ink=theme["text"],
        width=stroke,
        s=s,
    )
    send_left, _ = pill(
        d,
        "Send",
        f_small,
        right=w - 28 * s,
        cy=bar_cy,
        fill=outline_fill,
        outline=theme["muted"],
        ink=theme["text"],
        width=stroke,
        s=s,
    )
    pill(
        d,
        extra or "Auto",
        f_small,
        right=send_left - 16 * s,
        cy=bar_cy,
        fill=theme["accent"],
        ink=theme["accent_ink"],
        pad_x=int(28 * s),
        s=s,
    )
    mask = Image.new("L", (w, card_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, card_h - 1), radius=36 * s, fill=255)
    card = rgb.convert("RGBA")
    card.putalpha(mask)
    return card


def drop_shadow(card: Image.Image, color=(0, 0, 0), blur: int = 28, offset=(0, 14), radius: int = 36) -> Image.Image:
    pad = blur + abs(offset[1]) + 4
    alpha = Image.new("L", (card.width + pad * 2, card.height + pad * 2), 0)
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width - 1, card.height - 1), radius, fill=255)
    alpha.paste(mask, (pad + offset[0], pad + offset[1]))
    alpha = alpha.filter(ImageFilter.GaussianBlur(blur)).filter(ImageFilter.GaussianBlur(max(4, blur // 4)))
    alpha = alpha.point(lambda p: int(p * 0.32))
    shadow = Image.new("RGBA", alpha.size, (*color, 0))
    shadow.putalpha(alpha)
    out = Image.new("RGBA", alpha.size, (0, 0, 0, 0))
    out.alpha_composite(shadow)
    out.alpha_composite(card, (pad, pad))
    return out


def _place_card(base: Image.Image, card: Image.Image, xy: tuple[int, int], blur: int, offset=(0, 14), radius: int = 36, amount: float = 0.34) -> Image.Image:
    """Soft under-card shadow by darkening the bg in float — no banding / pixel steps."""
    x, y = xy
    mask = Image.new("L", base.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (x + offset[0], y + offset[1], x + card.width - 1 + offset[0], y + card.height - 1 + offset[1]),
        radius,
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    arr = np.asarray(base).astype(np.float32)
    a = np.asarray(mask).astype(np.float32) / 255.0 * amount
    arr *= 1.0 - a[..., None]
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    out.paste(card.convert("RGB"), (x, y), card)
    return out


def make_still(theme_name: str, quote: str, fact: str, index: int) -> Image.Image:
    th = THEMES[theme_name]
    s = 4  # render 4× then box-downscale — clean flats, smooth shadow
    Ww, Hh = W * s, H * s
    fonts = {
        "small": font(28 * s, False),
        "body": font(42 * s, True),
        "fact": font(28 * s, False),
        "brand": font(28 * s, True),
    }
    canvas = Image.new("RGB", (Ww, Hh), th["bg"])
    card = composer_card(th, quote, fact, w=920 * s, fonts=fonts, s=s)
    cx = (Ww - card.width) // 2
    cy = (Hh - card.height) // 2 - 40 * s
    cy = max(80 * s, min(cy, Hh - 180 * s - card.height))
    canvas = _place_card(canvas, card, (cx, cy), blur=18 * s, offset=(0, 16 * s), radius=36 * s, amount=0.42)
    d = ImageDraw.Draw(canvas)
    brand = "fighur.ai"
    d.text(((Ww - d.textlength(brand, font=fonts["brand"])) / 2, Hh - 110 * s), brand, font=fonts["brand"], fill=th["text"])
    return canvas.resize((W, H), Image.Resampling.BOX)


def ease_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_in_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 3 * t * t - 2 * t * t * t


def lerp_rgb(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def film_frame(t: float, smile_full: Image.Image) -> Image.Image:
    """~32s short film."""
    # 0-3.8 smile intro on black
    if t < 3.8:
        img = Image.new("RGBA", (W, H), (7, 8, 12, 255))
        a = ease_out((t - 0.2) / 1.1)
        sm = smile_full.copy()
        sm = sm.resize((int(280 * (0.85 + 0.15 * a)), int(280 * (0.85 + 0.15 * a))), Image.Resampling.LANCZOS)
        sm.putalpha(Image.eval(sm.split()[-1], lambda p: int(p * a)))
        img.alpha_composite(sm, ((W - sm.width) // 2, int(H * 0.34 - sm.height / 2)))
        d = ImageDraw.Draw(img)
        ta = ease_out((t - 1.6) / 0.8)
        d.text(((W - d.textlength("FIGHURAI", font=F_CTA)) / 2, int(H * 0.55)), "FIGHURAI", font=F_CTA, fill=(244, 244, 245, int(255 * ta)))
        sa = ease_out((t - 2.2) / 0.7)
        d.text(((W - d.textlength("Fighur it out with AI", font=F_TAG)) / 2, int(H * 0.62)), "Fighur it out with AI", font=F_TAG, fill=(161, 161, 170, int(255 * sa)))
        return img.convert("RGB")

    # 3.8-21 color acts ~3.4s each
    local = t - 3.8
    if local < 17.0:
        idx = min(4, int(local // 3.4))
        within = local - idx * 3.4
        name = THEME_ORDER[idx]
        th = THEMES[name]
        # wipe from previous color
        prev = THEMES[THEME_ORDER[idx - 1]] if idx else {"bg": (7, 8, 12)}
        wipe = ease_in_out(within / 0.55)
        bg = lerp_rgb(prev["bg"], th["bg"], wipe)
        canvas = Image.new("RGB", (W, H), bg)
        layer = canvas.convert("RGBA")
        sm = smile_full.resize((120, 120), Image.Resampling.LANCZOS)
        layer.alpha_composite(sm, ((W - 120) // 2, 90))
        d = ImageDraw.Draw(layer)
        d.text(((W - d.textlength("FIGHURAI", font=F_BRAND)) / 2, 230), "FIGHURAI", font=F_BRAND, fill=th["text"])
        quotes = [
            ("Chat. Build. Create.", "The FIGHURAI platform."),
            ("Same Colors. Any mood.", "Pink. Orange. Green. Blue. Yellow."),
            ("Agents while you sleep.", "Research that keeps going."),
            ("Chrome Colors. Any site.", "Pro unlocks the extension."),
            ("Taste still yours.", "AI does the lifting."),
        ]
        q, f = quotes[idx]
        card = composer_card(th, q, f)
        rise = ease_out(max(0, (within - 0.25) / 0.7))
        shadowed = drop_shadow(card, th["shadow"])
        cy = int(420 + (1 - rise) * 80)
        layer.alpha_composite(shadowed, ((W - shadowed.width) // 2, cy))
        return layer.convert("RGB")

    # 21-27 Colors extension: page tints through all 5 colors + FAB + panel
    if t < 27.0:
        local = t - 21.0
        cycle = (local / 6.0) * 5
        i0 = int(cycle) % 5
        i1 = (i0 + 1) % 5
        frac = cycle - int(cycle)
        bg = lerp_rgb(THEMES[THEME_ORDER[i0]]["bg"], THEMES[THEME_ORDER[i1]]["bg"], frac)
        canvas = Image.new("RGB", (W, H), bg)
        layer = canvas.convert("RGBA")
        d = ImageDraw.Draw(layer)
        # fake page bars
        ink = (20, 20, 30, 80)
        for k in range(6):
            y0 = 220 + k * 140
            d.rounded_rectangle((80, y0, W - 80, y0 + 90), 18, fill=ink)
        fab_a = ease_out((local - 0.4) / 0.5)
        fx = int(W - 80 - 180 * fab_a)
        fy = H - 240
        d.rounded_rectangle((fx, fy, fx + 170, fy + 70), 35, fill=(18, 20, 26, int(255 * fab_a)))
        d.ellipse((fx + 18, fy + 20, fx + 48, fy + 50), fill=(110, 231, 183, int(255 * fab_a)))
        d.text((fx + 58, fy + 22), "Colors", font=F_SMALL, fill=(244, 244, 245, int(255 * fab_a)))
        panel_a = ease_out((local - 1.6) / 0.6)
        if panel_a > 0:
            ph = 640
            py = int(H - 90 - ph * panel_a)
            d.rounded_rectangle((70, py, W - 70, py + ph), 32, fill=(16, 18, 24, int(245 * panel_a)))
            d.text((110, py + 40), "FIGHURAI Colors", font=font(44, True), fill=(244, 244, 245, int(255 * panel_a)))
            d.text((110, py + 110), "Chrome extension · Pro", font=F_TAG, fill=(110, 231, 183, int(255 * panel_a)))
            sw = [(242, 7, 108), (255, 78, 0), (0, 214, 150), (5, 52, 255), (209, 249, 2)]
            for si, col in enumerate(sw):
                x = 110 + si * 170
                d.rounded_rectangle((x, py + 220, x + 140, py + 360), 18, fill=(*col, int(255 * panel_a)))
            d.text((110, py + 400), "Same Colors. Every site.", font=F_TAG, fill=(200, 200, 210, int(255 * panel_a)))
        return layer.convert("RGB")

    # 27-32 CTA
    local = t - 27.0
    img = Image.new("RGBA", (W, H), (7, 8, 12, 255))
    a = ease_out(local / 0.7)
    sm = smile_full.resize((240, 240), Image.Resampling.LANCZOS)
    sm.putalpha(Image.eval(sm.split()[-1], lambda p: int(p * a)))
    img.alpha_composite(sm, ((W - sm.width) // 2, int(H * 0.32 - sm.height / 2)))
    d = ImageDraw.Draw(img)
    d.text(((W - d.textlength("fighur.ai", font=F_CTA)) / 2, int(H * 0.52)), "fighur.ai", font=F_CTA, fill=(244, 244, 245, int(255 * a)))
    b = ease_out((local - 0.8) / 0.6)
    d.text(((W - d.textlength("Platform + Colors extension", font=F_TAG)) / 2, int(H * 0.61)), "Platform + Colors extension", font=F_TAG, fill=(161, 161, 170, int(255 * b)))
    d.text(((W - d.textlength("Fighur it out with AI", font=F_SMALL)) / 2, int(H * 0.67)), "Fighur it out with AI", font=F_SMALL, fill=(110, 231, 183, int(255 * b)))
    return img.convert("RGB")


SWATCHES = [(242, 7, 108), (255, 78, 0), (0, 214, 150), (5, 52, 255), (209, 249, 2)]


def _why_card_frame(
    th: dict,
    quote: str,
    fact: str,
    smile: Image.Image,
    rise: float = 1.0,
    extra: str | None = None,
    swatch_pick: int | None = None,
) -> Image.Image:
    canvas = Image.new("RGB", (W, H), th["bg"])
    layer = canvas.convert("RGBA")
    sm = smile.resize((108, 108), Image.Resampling.LANCZOS)
    layer.alpha_composite(sm, ((W - 108) // 2, 72))
    d = ImageDraw.Draw(layer)
    d.text(((W - d.textlength("FIGHURAI", font=F_BRAND)) / 2, 196), "FIGHURAI", font=F_BRAND, fill=th["text"])
    card = composer_card(th, quote, fact, extra=extra)
    shadowed = drop_shadow(card, th["shadow"])
    cy = int(340 + (1 - rise) * 100)
    layer.alpha_composite(shadowed, ((W - shadowed.width) // 2, cy))
    if swatch_pick is not None:
        n = len(SWATCHES)
        total_w = n * 78 + (n - 1) * 28
        x0 = (W - total_w) // 2
        y = H - 200
        for i, col in enumerate(SWATCHES):
            x = x0 + i * 106
            if i == swatch_pick % n:
                d.ellipse((x - 8, y - 8, x + 78, y + 78), outline=(255, 255, 255, 230), width=5)
            d.ellipse((x, y, x + 70, y + 70), fill=(*col, 255))
    return layer.convert("RGB")


def why_film_frame(t: float, smile: Image.Image) -> Image.Image:
    """~36s explainer: why dark mode / Irlen / your exact color."""
    # 0–3.4 smile + hook
    if t < 3.4:
        img = Image.new("RGBA", (W, H), (7, 8, 12, 255))
        a = ease_out((t - 0.15) / 1.0)
        sm = smile.resize((int(260 * (0.88 + 0.12 * a)), int(260 * (0.88 + 0.12 * a))), Image.Resampling.LANCZOS)
        sm.putalpha(Image.eval(sm.split()[-1], lambda p: int(p * a)))
        img.alpha_composite(sm, ((W - sm.width) // 2, int(H * 0.32 - sm.height / 2)))
        d = ImageDraw.Draw(img)
        ta = ease_out((t - 1.4) / 0.7)
        line = "Why does dark mode exist?"
        d.text(((W - d.textlength(line, font=F_TAG)) / 2, int(H * 0.54)), line, font=F_TAG, fill=(244, 244, 245, int(255 * ta)))
        sa = ease_out((t - 2.1) / 0.6)
        sub = "Most people can't actually answer."
        d.text(((W - d.textlength(sub, font=F_SMALL)) / 2, int(H * 0.60)), sub, font=F_SMALL, fill=(161, 161, 170, int(255 * sa)))
        return img.convert("RGB")

    # 3.4–7.2 not aesthetic — cream → teal wipe
    if t < 7.2:
        local = t - 3.4
        wipe = ease_in_out(local / 0.55)
        bg = lerp_rgb(THEMES["cream"]["bg"], THEMES["teal"]["bg"], wipe)
        th = THEMES["teal"] if wipe > 0.55 else THEMES["cream"]
        rise = ease_out(max(0, (local - 0.2) / 0.65))
        return _why_card_frame(
            th,
            "Most people think it's just an aesthetic option. It's not.",
            "There's peer-reviewed research behind the colors on your screen.",
            smile,
            rise=rise,
        )

    # 7.2–11.4 Irlen
    if t < 11.4:
        local = t - 7.2
        prev = THEMES["teal"]["bg"]
        th = THEMES["orange"]
        wipe = ease_in_out(local / 0.5)
        # paint wipe then card
        bg = lerp_rgb(prev, th["bg"], wipe)
        canvas = _why_card_frame(
            {**th, "bg": bg},
            "About a third of people with dyslexia also have Irlen Syndrome — visual stress.",
            "Black-on-white can make letters move. Glare. Rivers of white space.",
            smile,
            rise=ease_out(max(0, (local - 0.15) / 0.6)),
        )
        return canvas

    # 11.4–15.6 overlays + precision
    if t < 15.6:
        local = t - 11.4
        prev = THEMES["orange"]["bg"]
        th = THEMES["green"]
        bg = lerp_rgb(prev, th["bg"], ease_in_out(local / 0.5))
        pick = int(ease_in_out(local / 4.2) * 5) % 5
        return _why_card_frame(
            {**th, "bg": bg},
            "The color that actually helps is different for every single person.",
            "Precision colorimetry. Not “blue helps everyone.”",
            smile,
            rise=ease_out(max(0, (local - 0.12) / 0.55)),
            swatch_pick=pick,
        )

    # 15.6–20.2 studies
    if t < 20.2:
        local = t - 15.6
        wipe = ease_in_out(local / 0.5)
        th = THEMES["yellow"] if wipe < 0.5 else THEMES["blue"]
        bg = lerp_rgb(THEMES["green"]["bg"], THEMES["yellow"]["bg"], min(1, wipe * 2)) if wipe < 0.5 else lerp_rgb(THEMES["yellow"]["bg"], THEMES["blue"]["bg"], wipe * 2 - 1)
        quote = (
            "Light-green backgrounds reduced how tired eyes got."
            if wipe < 0.5
            else "Blue light suppresses melatonin more than other colors."
        )
        fact = "2025 eye-tracking study." if wipe < 0.5 else "Harvard. That's why night mode exists."
        return _why_card_frame(
            {**th, "bg": bg},
            quote,
            fact,
            smile,
            rise=ease_out(max(0, (local - 0.1) / 0.5)),
        )

    # 20.2–25.4 generic vs personal — cycle brand colors
    if t < 25.4:
        local = t - 20.2
        cycle = (local / 5.2) * 5
        i0 = int(cycle) % 5
        i1 = (i0 + 1) % 5
        frac = cycle - int(cycle)
        bg = lerp_rgb(THEMES[THEME_ORDER[i0]]["bg"], THEMES[THEME_ORDER[i1]]["bg"], frac)
        th = THEMES[THEME_ORDER[i0]]
        return _why_card_frame(
            {**th, "bg": bg},
            "A generic filter — one preset for every user — works against the research.",
            "The helpful shade is personal.",
            smile,
            rise=1.0,
            extra="Colors",
        )

    # 25.4–30.8 product
    if t < 30.8:
        local = t - 25.4
        wipe = ease_in_out(local / 0.55)
        bg = lerp_rgb(THEMES["blue"]["bg"], THEMES["teal"]["bg"], wipe)
        th = THEMES["teal"]
        return _why_card_frame(
            {**th, "bg": bg},
            "Fighur.ai: your exact text and background color. Platform + any website.",
            "Chrome Colors. Not one preset — yours.",
            smile,
            rise=ease_out(max(0, (local - 0.12) / 0.55)),
            extra="Colors",
            swatch_pick=2,
        )

    # 30.8–36 CTA
    local = t - 30.8
    img = Image.new("RGBA", (W, H), (7, 8, 12, 255))
    a = ease_out(local / 0.65)
    sm = smile.resize((220, 220), Image.Resampling.LANCZOS)
    sm.putalpha(Image.eval(sm.split()[-1], lambda p: int(p * a)))
    img.alpha_composite(sm, ((W - sm.width) // 2, int(H * 0.30 - sm.height / 2)))
    d = ImageDraw.Draw(img)
    d.text(((W - d.textlength("fighur.ai", font=F_CTA)) / 2, int(H * 0.50)), "fighur.ai", font=F_CTA, fill=(244, 244, 245, int(255 * a)))
    b = ease_out((local - 0.7) / 0.55)
    d.text(
        ((W - d.textlength("The right color is personal.", font=F_TAG)) / 2, int(H * 0.60)),
        "The right color is personal.",
        font=F_TAG,
        fill=(161, 161, 170, int(255 * b)),
    )
    d.text(
        ((W - d.textlength("So the tool has to be too.", font=F_SMALL)) / 2, int(H * 0.66)),
        "So the tool has to be too.",
        font=F_SMALL,
        fill=(110, 231, 183, int(255 * b)),
    )
    return img.convert("RGB")


def fit_intro_frame(fr: np.ndarray) -> Image.Image:
    im = Image.fromarray(fr)
    if im.width > im.height:
        im = im.rotate(90, expand=True)
    # cover 1080x1920
    scale = max(W / im.width, H / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - W) // 2
    top = (nh - H) // 2
    return im.crop((left, top, left + W, top + H)).convert("RGB")


def main():
    STILL_DIR.mkdir(parents=True, exist_ok=True)
    DESK_STILLS.mkdir(parents=True, exist_ok=True)
    FILM_DIR.mkdir(parents=True, exist_ok=True)

    logo_clear = load_smile(512)
    logo_clear.save(STILL_DIR / "fighur-smile-logo-transparent.png", "PNG")
    logo_clear.save(DESK_STILLS / "fighur-smile-logo-transparent.png", "PNG")
    logo_clear.save(FILM_DIR / "fighur-smile-logo-transparent.png", "PNG")

    print("stills…")
    names = []
    for i, (theme, quote) in enumerate(SLIDES, 1):
        img = make_still(theme, quote, "", i)
        name = f"prompt-{i:02d}-{theme}.png"
        img.save(STILL_DIR / name, "PNG")
        img.save(DESK_STILLS / name, "PNG")
        names.append(name)
        print(" ", name)

    caption_body = (
        "FIGHURAI · Prompts Worth Stealing\nSame font on every slide (Helvetica Neue).\n"
        "Colors: pink, teal, orange, purple, green, cream, blue, yellow.\n\n"
        + "\n\n".join(f"{i}. {n}\n{SLIDES[i-1][1]}" for i, n in enumerate(names, 1))
        + "\n\nCarousel caption:\nprompts worth stealing. drop one in fighur.ai →\nfighur.ai\n"
    )
    (STILL_DIR / "CAPTIONS.txt").write_text(caption_body, encoding="utf-8")
    try:
        (DESK_STILLS / "CAPTIONS.txt").write_text(caption_body, encoding="utf-8")
    except OSError:
        pass

    print("film…")
    smile = load_smile(400)
    duration = 32.0
    n = int(duration * FPS)
    writer = imageio.get_writer(
        str(OUT_FILM),
        fps=FPS,
        codec="libx264",
        quality=7,
        macro_block_size=None,
        ffmpeg_log_level="error",
        output_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    )

    # Optional: prepend a few seconds of the real green intro, scaled
    intro_used = 0
    if INTRO.exists():
        try:
            r = imageio.get_reader(str(INTRO))
            intro_fps = float(r.get_meta_data().get("fps") or 30)
            max_intro = min(int(4.0 * intro_fps), 120)
            for i in range(max_intro):
                try:
                    fr = r.get_data(i)
                except Exception:
                    break
                writer.append_data(np.asarray(fit_intro_frame(fr)))
                intro_used += 1
            r.close()
            print(" intro frames", intro_used)
        except Exception as e:
            print(" intro skip", e)

    for i in range(n):
        t = i / FPS
        writer.append_data(np.asarray(film_frame(t, smile)))
        if i % 48 == 0:
            print(f"  t={t:.1f}s")
    writer.close()
    shutil.copy2(OUT_FILM, DESK_FILM)
    print("wrote stills →", DESK_STILLS)
    print("wrote film →", DESK_FILM, "seconds", round(intro_used / 30 + duration, 1) if intro_used else duration)


def render_stills_only() -> None:
    STILL_DIR.mkdir(parents=True, exist_ok=True)
    DESK_STILLS.mkdir(parents=True, exist_ok=True)
    print("stills…")
    names = []
    for i, (theme, quote) in enumerate(SLIDES, 1):
        img = make_still(theme, quote, "", i)
        name = f"prompt-{i:02d}-{theme}.png"
        img.save(STILL_DIR / name, "PNG")
        names.append(name)
        print(" ", name)
    caption_body = (
        "FIGHURAI · Prompts Worth Stealing\nSame font on every slide (Helvetica Neue).\n"
        "Colors: pink, teal, orange, purple, green, cream, blue, yellow.\n\n"
        + "\n\n".join(f"{i}. {n}\n{SLIDES[i-1][1]}" for i, n in enumerate(names, 1))
        + "\n\nCarousel caption:\nprompts worth stealing. drop one in fighur.ai →\nfighur.ai\n"
    )
    (STILL_DIR / "CAPTIONS.txt").write_text(caption_body, encoding="utf-8")
    for name in names + ["CAPTIONS.txt"]:
        try:
            shutil.copy2(STILL_DIR / name, DESK_STILLS / name)
        except OSError as e:
            print(" desktop copy skip", name, e)
    print("wrote stills →", STILL_DIR)


def render_why() -> None:
    WHY_DIR.mkdir(parents=True, exist_ok=True)
    try:
        DESK_WHY.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    print("why stills…")
    names = []
    for i, (theme, quote, fact) in enumerate(WHY_SLIDES, 1):
        img = make_still(theme, quote, fact, i)
        name = f"why-{i:02d}-{theme}.png"
        img.save(WHY_DIR / name, "PNG")
        names.append(name)
        print(" ", name)
    caption_body = (
        "FIGHURAI · Why does dark mode exist?\n"
        "Same font (Helvetica Neue). Prompt-box carousel.\n\n"
        + "\n\n".join(f"{i}. {n}\n{WHY_SLIDES[i-1][1]}\n({WHY_SLIDES[i-1][2]})" for i, n in enumerate(names, 1))
        + "\n\nCarousel caption:\nwhy does dark mode exist? not an aesthetic. swipe →\nfighur.ai\n"
    )
    (WHY_DIR / "CAPTIONS.txt").write_text(caption_body, encoding="utf-8")
    for name in names + ["CAPTIONS.txt"]:
        try:
            shutil.copy2(WHY_DIR / name, DESK_WHY / name)
        except OSError as e:
            print(" desktop copy skip", name, e)

    print("why film…")
    smile = load_smile(400)
    duration = 36.0
    n = int(duration * FPS)
    writer = imageio.get_writer(
        str(OUT_WHY_FILM),
        fps=FPS,
        codec="libx264",
        quality=7,
        macro_block_size=None,
        ffmpeg_log_level="error",
        output_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    )
    for i in range(n):
        t = i / FPS
        writer.append_data(np.asarray(why_film_frame(t, smile)))
        if i % 48 == 0:
            print(f"  t={t:.1f}s")
    writer.close()
    try:
        shutil.copy2(OUT_WHY_FILM, DESK_WHY_FILM)
    except OSError as e:
        print(" desktop film skip", e)
    print("wrote stills →", WHY_DIR)
    print("wrote film →", OUT_WHY_FILM, "seconds", duration)


if __name__ == "__main__":
    import sys

    if "why" in sys.argv:
        render_why()
    elif "stills" in sys.argv:
        render_stills_only()
    else:
        main()
