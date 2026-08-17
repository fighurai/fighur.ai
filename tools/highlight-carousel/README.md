# Highlight Carousel

Local tool that previews and exports a 4-slide Instagram carousel in the **bold color-block + highlighter text** style. Each slide is a **2.5s seamless looping** animation (1080×1920).

## Preview

```bash
cd tools/highlight-carousel
npm install
npm run preview
```

Open the URL (default `http://localhost:5179`). Swipe / use ← → to flip slides.

## Edit content

All copy + colors live in the `SLIDES` array at the top of `script.js`. Layout and motion stay in CSS.

## Export MP4s

Requires Node. Uses Puppeteer + bundled `ffmpeg-static`.

```bash
npm run export
```

Writes:

- `output/slide-1.mp4` … `output/slide-4.mp4`

Each file is exactly one 2.5s loop @ 30fps. Upload to Instagram as a carousel of looping clips (or stitch/reuse as needed).

If first/last frames diverge, the exporter logs a **loop seam warning**.

## Motion

- Background brightness breathes ±~3.5% over 2.5s (ease-in-out, seamless)
- Highlights settle in (97%→100%, staggered 80ms), then idle-pulse 100%→100.5%
- Text glyphs stay still
- Page pill opacity breathes 90%→100%
- Export mode skips settle so the captured loop is pure idle state
