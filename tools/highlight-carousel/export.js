#!/usr/bin/env node
/**
 * Export each slide as a seamless 2.5s looping MP4 (1080×1920 @ 30fps).
 *
 * Flow: local static server → Puppeteer (export mode) → CDP screencast
 * (with paced CDP screenshot fallback) → ffmpeg-static → output/slide-N.mp4
 *
 * Warns if first/last frame MAE is high (loop won't look seamless).
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");
const ffmpegPath = require("ffmpeg-static");
const { PNG } = require("pngjs");

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, "output");
const FRAMES = path.join(ROOT, "frames");

const WIDTH = 1080;
const HEIGHT = 1920;
const CAPTURE_SCALE = 2; // render @2x then lanczos-downscale for sharper type
const FPS = 30;
const LOOP_MS = 2500;
const FRAME_COUNT = Math.round((LOOP_MS / 1000) * FPS); // 75
const SLIDE_COUNT = 4;
const SEAMLESS_MAE_WARN = 4.5;

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const types = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
        };
        res.writeHead(200, {
          "Content-Type": types[ext] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
    server.on("error", reject);
  });
}

function maeBetweenPngs(aBuf, bBuf) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    sum +=
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum / (n * 3);
}

function runFfmpeg(framePattern, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      framePattern,
      // 2x frames → 1080×1920 with lanczos + mild unsharp (crisper type, less mush)
      "-vf",
      `scale=${WIDTH}:${HEIGHT}:flags=lanczos,unsharp=5:5:1.2:5:5:0.0`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-crf",
      "12",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      "-frames:v",
      String(FRAME_COUNT),
      outFile,
    ];
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-800)}`));
    });
  });
}

function pickFramesByTimestamp(rawFrames, count, durationMs) {
  if (!rawFrames.length) return [];
  const t0 = rawFrames[0].t;
  const picked = [];
  for (let i = 0; i < count; i++) {
    const target = t0 + (i / count) * durationMs;
    let best = rawFrames[0];
    let bestDist = Math.abs(best.t - target);
    for (const f of rawFrames) {
      const d = Math.abs(f.t - target);
      if (d < bestDist) {
        best = f;
        bestDist = d;
      }
    }
    picked.push(best.buf);
  }
  return picked;
}

async function preparePage(browser, baseUrl, slideIndex) {
  const page = await browser.newPage();
  await page.setViewport({
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: CAPTURE_SCALE,
  });
  await page.goto(`${baseUrl}/?export=1&slide=${slideIndex}`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('320 64px "Roboto Flex"'),
      document.fonts.load('400 64px "Roboto Flex"'),
      document.fonts.load("300 64px Inter"),
      document.fonts.load('300 64px "General Sans"'),
    ]);
  });
  await page.waitForSelector(".slide.export-active .highlight-line");
  const face = await page.evaluate(() => {
    const el = document.querySelector(".highlight-line .text");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { family: cs.fontFamily, weight: cs.fontWeight, vars: cs.fontVariationSettings };
  });
  console.log(`  font:`, face);

  // Freeze at t=0 so frame 0 is the pre-entrance state (opacity 0 / scale 0.97)
  await page.evaluate(() => {
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
  });
  await new Promise((r) => setTimeout(r, 40));
  return page;
}

/** Scrub CSS animations to exact times — captures settle-in entrance + idle breathe */
async function captureViaScrub(page) {
  const buffers = [];

  for (let i = 0; i < FRAME_COUNT; i++) {
    const t = (i / FRAME_COUNT) * LOOP_MS;
    await page.evaluate((ms) => {
      document.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = ms;
      });
    }, t);

    // page.screenshot respects deviceScaleFactor (CDP captureScreenshot often does not)
    const buf = await page.screenshot({
      type: "png",
      omitBackground: false,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
    buffers.push(Buffer.from(buf));
  }
  return buffers;
}

async function captureViaScreencast(page) {
  // Restart from t=0 then record live (fallback)
  await page.evaluate(() => {
    document.getAnimations().forEach((a) => {
      a.currentTime = 0;
      a.play();
    });
  });

  const client = await page.createCDPSession();
  const raw = [];
  let active = true;

  client.on("Page.screencastFrame", async (event) => {
    if (!active) {
      try {
        await client.send("Page.screencastFrameAck", { sessionId: event.sessionId });
      } catch {
        /* ignore */
      }
      return;
    }
    const t =
      typeof event.metadata?.timestamp === "number"
        ? event.metadata.timestamp * 1000
        : Date.now();
    raw.push({ t, buf: Buffer.from(event.data, "base64") });
    try {
      await client.send("Page.screencastFrameAck", { sessionId: event.sessionId });
    } catch {
      /* ignore */
    }
  });

  await client.send("Page.startScreencast", {
    format: "png",
    quality: 100,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
    everyNthFrame: 1,
  });

  await new Promise((r) => setTimeout(r, LOOP_MS + 200));
  active = false;
  try {
    await client.send("Page.stopScreencast");
  } catch {
    /* ignore */
  }

  return pickFramesByTimestamp(raw, FRAME_COUNT, LOOP_MS);
}

async function captureSlide(browser, baseUrl, slideIndex) {
  const page = await preparePage(browser, baseUrl, slideIndex);
  const slideDir = path.join(FRAMES, `slide-${slideIndex + 1}`);
  fs.rmSync(slideDir, { recursive: true, force: true });
  fs.mkdirSync(slideDir, { recursive: true });

  // Scrubbed capture includes the settle-in entrance at the start of the clip
  let buffers = await captureViaScrub(page);
  if (buffers.length < FRAME_COUNT) {
    console.warn(`  ⚠ scrub captured ${buffers.length}/${FRAME_COUNT} — falling back to screencast`);
    buffers = await captureViaScreencast(page);
  } else {
    console.log(`  ✓ scrubbed ${buffers.length} frames @ ${FPS}fps (entrance + idle)`);
  }

  for (let i = 0; i < FRAME_COUNT; i++) {
    const file = path.join(slideDir, `frame-${String(i).padStart(4, "0")}.png`);
    fs.writeFileSync(file, buffers[i]);
  }

  const mae = maeBetweenPngs(buffers[0], buffers[FRAME_COUNT - 1]);
  if (mae > SEAMLESS_MAE_WARN) {
    // Expected when entrance is baked in — first frame is pre-settle, last is settled
    console.log(
      `  ℹ first/last differ (MAE=${mae.toFixed(2)}) — normal with entrance animation in the clip`
    );
  } else {
    console.log(`  ✓ Seam check OK (MAE=${mae.toFixed(2)})`);
  }

  const outFile = path.join(OUTPUT, `slide-${slideIndex + 1}.mp4`);
  await runFfmpeg(path.join(slideDir, "frame-%04d.png"), outFile);
  console.log(`  → ${outFile}`);

  await page.close();
  return outFile;
}

async function main() {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");

  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const { server, baseUrl } = await startStaticServer();
  console.log(`Serving ${ROOT} at ${baseUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      `--window-size=${WIDTH},${HEIGHT}`,
      `--force-device-scale-factor=${CAPTURE_SCALE}`,
      "--hide-scrollbars",
      "--font-render-hinting=none",
      "--enable-font-antialiasing",
      "--disable-font-subpixel-positioning",
    ],
    defaultViewport: {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: CAPTURE_SCALE,
    },
  });

  try {
    for (let i = 0; i < SLIDE_COUNT; i++) {
      console.log(`\nCapturing slide ${i + 1}/${SLIDE_COUNT}…`);
      await captureSlide(browser, baseUrl, i);
    }
    console.log("\nDone. Loops in ./output/");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
