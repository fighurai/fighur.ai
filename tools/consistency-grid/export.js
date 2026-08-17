#!/usr/bin/env node
/**
 * Export consistency-grid as a 1080×1920 MP4 (teal bg, one-color flip waves).
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");
const ffmpegPath = require("ffmpeg-static");

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, "output");
const FRAMES = path.join(ROOT, "frames");
const DESKTOP = path.join(
  require("os").homedir(),
  "Desktop",
  "FIGHURAI-Consistency-Grid"
);

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const CAPTURE_SCALE = 1; // 1x is plenty for this type grid; 2x was hanging mid-export

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

function runFfmpeg(framePattern, frameCount, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      framePattern,
      "-vf",
      `scale=${WIDTH}:${HEIGHT}:flags=lanczos,unsharp=5:5:0.8:5:5:0.0`,
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
      String(frameCount),
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

async function main() {
  if (!ffmpegPath) throw new Error("ffmpeg-static missing — run npm install in highlight-carousel or here");

  // Reuse puppeteer/ffmpeg from sibling tool if local node_modules missing
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const { server, baseUrl } = await startStaticServer();
  console.log(`Serving at ${baseUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      `--window-size=${WIDTH},${HEIGHT}`,
      `--force-device-scale-factor=${CAPTURE_SCALE}`,
      "--hide-scrollbars",
      "--font-render-hinting=none",
      "--enable-font-antialiasing",
    ],
    defaultViewport: {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: CAPTURE_SCALE,
    },
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: CAPTURE_SCALE,
    });

    await page.goto(`${baseUrl}/?export=1`, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => window.__CONSISTENCY_GRID__);

    const meta = await page.evaluate(() => {
      const g = window.__CONSISTENCY_GRID__;
      return {
        durationMs: g.durationMs(),
        wordCount: g.wordCount,
        staggerMs: g.staggerMs,
        flipMs: g.flipMs,
        holdMs: g.holdMs,
        colorCount: g.colorCount,
      };
    });

    const durationMs = Math.ceil(meta.durationMs) + 400;
    const frameCount = Math.round((durationMs / 1000) * FPS);
    console.log(
      `Recording ~${(durationMs / 1000).toFixed(1)}s (${frameCount} frames) · ${meta.colorCount} color waves · ${meta.wordCount} words`
    );

    // Wait until animation loop marks done OR duration elapsed
    const start = Date.now();
    let frameIndex = 0;
    const interval = 1000 / FPS;

    while (frameIndex < frameCount) {
      const target = start + frameIndex * interval;
      const wait = target - Date.now();
      if (wait > 1) await new Promise((r) => setTimeout(r, wait));

      const file = path.join(
        FRAMES,
        `frame-${String(frameIndex).padStart(5, "0")}.png`
      );
      await page.screenshot({
        path: file,
        type: "png",
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      });
      frameIndex += 1;

      if (frameIndex % 60 === 0) {
        console.log(`  … ${frameIndex}/${frameCount} frames`);
      }
    }

    const outFile = path.join(OUTPUT, "consistency-grid.mp4");
    await runFfmpeg(path.join(FRAMES, "frame-%05d.png"), frameCount, outFile);
    console.log(`→ ${outFile}`);

    fs.mkdirSync(DESKTOP, { recursive: true });
    const deskFile = path.join(DESKTOP, "FIGHURAI-Consistency-Grid.mp4");
    fs.copyFileSync(outFile, deskFile);
    console.log(`→ ${deskFile}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
