#!/usr/bin/env python3
"""Cinematic 9:16 short film for FIGHURAI + Colors — motion graphics, not screenshots."""
from __future__ import annotations

import math
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 24
DURATION = 26.0
N = int(DURATION * FPS)

ROOT = Path("/Users/fighur/Desktop/fighur.ai/public/downloads/reel/film")
LOGO = Path("/Users/fighur/Desktop/fighur.ai/public/images/fighur-logo-mark-512.png")
OUT = Path("/Users/fighur/Desktop/fighur.ai/public/downloads/FIGHURAI-Short-Film-9x16.mp4")
DESK = Path("/Users/fighur/Desktop/FIGHURAI-Short-Film-9x16.mp4")

BG = (7, 8, 12)
LIME = (110, 231, 183)
YELLOW = (238, 255, 0)
BLUE = (20, 50, 245)
WHITE = (244, 244, 245)
MUTED = (161, 161, 170)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


F_XL = font(72, True)
F_L = font(48, True)
F_M = font(32, False)
F_S = font(24, True)


def ease_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_in_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 3 * t * t - 2 * t * t * t


def clamp01(t: float) -> float:
    return max(0.0, min(1.0, t))


def lerp(a, b, t):
    return a + (b - a) * t


def mix_rgb(a, b, t):
    return tuple(int(lerp(a[i], b[i], t)) for i in range(3))


def load_logo(size: int = 220) -> Image.Image:
    im = Image.open(LOGO).convert("RGBA")
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    return im


def glow_blob(draw: ImageDraw.ImageDraw, xy, r, color, alpha=80):
    x, y = xy
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.ellipse((x - r, y - r, x + r, y + r), fill=(*color, alpha))
    return overlay.filter(ImageFilter.GaussianBlur(radius=r * 0.45))


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def scene_bg(t: float, theme: str = "dark") -> Image.Image:
    if theme == "yellow":
        base = Image.new("RGB", (W, H), YELLOW)
    else:
        base = Image.new("RGB", (W, H), BG)
    # drifting glow
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pulse = 0.5 + 0.5 * math.sin(t * 2.2)
    blobs = [
        ((220 + 40 * math.sin(t), 420), 280, (255, 140, 60), int(50 + 30 * pulse)),
        ((860 + 30 * math.cos(t * 0.8), 700), 320, (180, 60, 220), int(45 + 25 * pulse)),
        ((540, 1500 + 20 * math.sin(t * 1.3)), 360, LIME if theme == "dark" else BLUE, int(40 + 20 * pulse)),
    ]
    for xy, r, col, a in blobs:
        layer = Image.alpha_composite(layer, glow_blob(ImageDraw.Draw(layer), xy, r, col, a))
    if theme == "yellow":
        # keep glow subtle on yellow
        layer.putalpha(Image.eval(layer.getchannel("A"), lambda a: int(a * 0.35)))
    out = Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")
    return out


def draw_wordmark(img: Image.Image, y: int = 70, color=WHITE):
    d = ImageDraw.Draw(img)
    d.text((60, y), "FIGHURAI", font=F_S, fill=color)


def typewriter(text: str, t: float, cps: float = 28) -> str:
    n = int(t * cps)
    return text[: max(0, n)]


def render_frame(i: int) -> Image.Image:
    t = i / FPS
    logo = load_logo(200)

    # -------- ACT 1: logo / title (0-4s)
    if t < 4.0:
        img = scene_bg(t, "dark")
        layer = img.convert("RGBA")
        appear = ease_out(clamp01((t - 0.3) / 1.2))
        scale = 0.7 + 0.3 * appear
        lz = int(200 * scale)
        L = load_logo(lz)
        # glow under logo
        g = glow_blob(ImageDraw.Draw(Image.new("RGBA", (W, H))), (W // 2, int(H * 0.38)), int(180 * appear), (200, 80, 255), int(90 * appear))
        layer = Image.alpha_composite(layer, g)
        lx = (W - lz) // 2
        ly = int(H * 0.38 - lz / 2)
        L2 = L.copy()
        L2.putalpha(Image.eval(L.split()[-1], lambda a: int(a * appear)))
        layer.paste(L2, (lx, ly), L2)
        d = ImageDraw.Draw(layer)
        title_a = ease_out(clamp01((t - 1.6) / 0.8))
        d.text((W // 2 - 160, int(H * 0.55)), "FIGHURAI", font=F_L, fill=(*WHITE, int(255 * title_a)))
        sub_a = ease_out(clamp01((t - 2.3) / 0.8))
        d.text((W // 2 - 210, int(H * 0.61)), "Chat. Build. Anywhere.", font=F_M, fill=(*MUTED, int(255 * sub_a)))
        return layer.convert("RGB")

    # -------- ACT 2: animated chat UI (4-10s)
    if t < 10.0:
        local = t - 4.0
        img = scene_bg(t, "dark")
        layer = img.convert("RGBA")
        d = ImageDraw.Draw(layer)
        draw_wordmark(layer)
        # floating nav pills
        nav_y = 140
        nav_a = ease_out(clamp01(local / 0.6))
        for j, label in enumerate(["Agents", "Layout", "Colors", "Settings"]):
            x0 = 90 + j * 230
            rounded_rect(d, (x0, nav_y, x0 + 200, nav_y + 64), 32, (*((20, 22, 28)), int(220 * nav_a)), (*MUTED, int(180 * nav_a)), 2)
            d.text((x0 + 36, nav_y + 16), label, font=F_S, fill=(*MUTED, int(255 * nav_a)))

        # composer dock rising
        rise = ease_out(clamp01((local - 0.4) / 0.9))
        cy = int(lerp(H + 40, H - 420, rise))
        rounded_rect(d, (70, cy, W - 70, cy + 280), 36, (18, 20, 26, int(240 * rise)), (255, 255, 255, int(40 * rise)), 2)
        prompt = typewriter("Fighur it out with AI", max(0, local - 1.2), 22)
        d.text((110, cy + 50), prompt + ("|" if int(local * 2) % 2 == 0 and local > 1.2 else ""), font=F_M, fill=(*WHITE, int(255 * rise)))
        # pills
        rounded_rect(d, (110, cy + 180, 230, cy + 240), 24, (30, 34, 40, int(255 * rise)))
        d.text((130, cy + 194), "Speak", font=F_S, fill=(*MUTED, int(255 * rise)))
        rounded_rect(d, (W - 320, cy + 180, W - 110, cy + 240), 24, (*LIME, int(230 * rise)))
        d.text((W - 270, cy + 194), "Send", font=F_S, fill=(5, 30, 20, int(255 * rise)))

        # fake reply bubble
        msg_a = ease_out(clamp01((local - 3.2) / 0.7))
        if msg_a > 0:
            rounded_rect(d, (70, 420, W - 70, 720), 28, (22, 26, 32, int(230 * msg_a)))
            d.text((110, 470), "Building your next idea…", font=F_M, fill=(*WHITE, int(255 * msg_a)))
            d.text((110, 540), "Canvas · Agents · Colors", font=F_S, fill=(*LIME, int(255 * msg_a)))
        return layer.convert("RGB")

    # -------- ACT 3: color wipe to platform Colors (10-15s)
    if t < 15.0:
        local = t - 10.0
        wipe = ease_in_out(clamp01(local / 1.1))
        dark = scene_bg(t, "dark").convert("RGBA")
        yellow = scene_bg(t, "yellow").convert("RGBA")
        # wipe from left
        mask = Image.new("L", (W, H), 0)
        md = ImageDraw.Draw(mask)
        md.rectangle((0, 0, int(W * wipe), H), fill=255)
        yellow.putalpha(mask)
        layer = Image.alpha_composite(dark, yellow)
        d = ImageDraw.Draw(layer)
        # colors panel card
        card_a = ease_out(clamp01((local - 0.8) / 0.6))
        rounded_rect(d, (120, 520, W - 120, 1180), 28, (255, 255, 255, int(230 * card_a)))
        ink = BLUE if wipe > 0.5 else WHITE
        d.text((170, 580), "Page colors", font=F_L, fill=(*BLUE, int(255 * card_a)))
        d.text((170, 680), "Same look on FIGHURAI", font=F_M, fill=(*BLUE, int(200 * card_a)))
        # swatches
        rounded_rect(d, (170, 820, 320, 970), 18, (*YELLOW, int(255 * card_a)), (*BLUE, int(255 * card_a)), 3)
        rounded_rect(d, (370, 820, 520, 970), 18, (*BLUE, int(255 * card_a)))
        d.text((170, 1020), "Background   Text", font=F_S, fill=(*BLUE, int(255 * card_a)))
        tag_a = ease_out(clamp01((local - 2.0) / 0.5))
        d.text((120, 1400), "PLATFORM COLORS", font=F_S, fill=(*BLUE, int(255 * tag_a)))
        d.text((120, 1460), "One tap. Instant vibe.", font=F_L, fill=(*BLUE, int(255 * tag_a)))
        return layer.convert("RGB")

    # -------- ACT 4: extension short film (15-22s)
    if t < 22.0:
        local = t - 15.0
        img = scene_bg(t, "dark")
        layer = img.convert("RGBA")
        d = ImageDraw.Draw(layer)
        draw_wordmark(layer)
        # fake webpage blocks
        page_a = ease_out(clamp01(local / 0.7))
        for k in range(5):
            y0 = 260 + k * 180
            rounded_rect(d, (80, y0, W - 80, y0 + 120), 18, (24, 26, 32, int(200 * page_a)))
        # color themed flash over page
        theme_a = ease_in_out(clamp01((local - 1.2) / 0.9))
        if theme_a > 0:
            tint = Image.new("RGBA", (W, H), (*YELLOW, int(90 * theme_a)))
            layer = Image.alpha_composite(layer, tint)
            d = ImageDraw.Draw(layer)

        # FAB flies in
        fab_a = ease_out(clamp01((local - 1.8) / 0.6))
        fab_x = int(lerp(W + 80, W - 220, fab_a))
        fab_y = H - 280
        rounded_rect(d, (fab_x, fab_y, fab_x + 170, fab_y + 70), 35, (18, 20, 26, int(255 * fab_a)), (*LIME, int(255 * fab_a)), 2)
        d.ellipse((fab_x + 18, fab_y + 20, fab_x + 48, fab_y + 50), fill=(*LIME, int(255 * fab_a)))
        d.text((fab_x + 58, fab_y + 22), "Colors", font=F_S, fill=(*WHITE, int(255 * fab_a)))

        # panel opens
        panel_a = ease_out(clamp01((local - 3.2) / 0.7))
        if panel_a > 0:
            panel_h = 700
            py = int(lerp(H + 40, H - 80 - panel_h, panel_a))
            py2 = py + panel_h
            rounded_rect(
                d,
                (70, py, W - 70, py2),
                32,
                (16, 18, 24, int(245 * panel_a)),
                (255, 255, 255, int(50 * panel_a)),
                2,
            )
            d.text((110, py + 50), "FIGHURAI Colors", font=F_L, fill=(*WHITE, int(255 * panel_a)))
            d.text((110, py + 130), "Chrome extension · Pro", font=F_M, fill=(*LIME, int(255 * panel_a)))
            rounded_rect(d, (110, py + 240, 260, py + 390), 16, (*YELLOW, int(255 * panel_a)))
            rounded_rect(d, (300, py + 240, 450, py + 390), 16, (*BLUE, int(255 * panel_a)))
            d.text((110, py + 430), "Any website. Same Colors.", font=F_M, fill=(*MUTED, int(255 * panel_a)))

        return layer.convert("RGB")

    # -------- ACT 5: CTA (22-26s)
    local = t - 22.0
    img = scene_bg(t, "dark")
    layer = img.convert("RGBA")
    appear = ease_out(clamp01(local / 0.8))
    L = load_logo(240)
    L2 = L.copy()
    L2.putalpha(Image.eval(L.split()[-1], lambda a: int(a * appear)))
    g = glow_blob(ImageDraw.Draw(Image.new("RGBA", (W, H))), (W // 2, int(H * 0.36)), 220, (160, 70, 255), int(100 * appear))
    layer = Image.alpha_composite(layer, g)
    layer.paste(L2, ((W - 240) // 2, int(H * 0.36 - 120)), L2)
    d = ImageDraw.Draw(layer)
    d.text((W // 2 - 200, int(H * 0.55)), "fighur.ai", font=F_XL, fill=(*WHITE, int(255 * appear)))
    line_a = ease_out(clamp01((local - 0.9) / 0.6))
    d.text((W // 2 - 320, int(H * 0.64)), "Platform + Colors extension", font=F_M, fill=(*MUTED, int(255 * line_a)))
    d.text((W // 2 - 180, int(H * 0.70)), "Pro unlocks Colors", font=F_S, fill=(*LIME, int(255 * line_a)))
    return layer.convert("RGB")


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    writer = imageio.get_writer(
        str(OUT),
        fps=FPS,
        codec="libx264",
        quality=7,
        macro_block_size=None,
        ffmpeg_log_level="error",
        output_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    )
    for i in range(N):
        frame = render_frame(i)
        writer.append_data(np.asarray(frame))
        if i % 24 == 0:
            print(f"frame {i}/{N} t={i/FPS:.1f}s")
    writer.close()
    import shutil

    shutil.copy2(OUT, DESK)
    print("wrote", OUT)
    print("desktop", DESK, "seconds", N / FPS)


if __name__ == "__main__":
    main()
