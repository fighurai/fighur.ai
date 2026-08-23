#!/usr/bin/env node
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(ROOT, "carousel.html");
const OUT = path.join(ROOT, "exports");
const ARTIFACTS = "/opt/cursor/artifacts/fighurai-carousel";
const CHROME = "/opt/google/chrome/chrome";

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ARTIFACTS, { recursive: true });

const html = fs.readFileSync(HTML, "utf8");
const headEnd = html.indexOf("</head>");
const head = html.slice(0, headEnd + "</head>".length);
const headFixed = head.replace(
  'href="fonts/fonts.local.css"',
  'href="../fonts/fonts.local.css"'
);

for (let i = 1; i <= 11; i++) {
  const id = String(i).padStart(2, "0");
  const re = new RegExp(
    `<section class="slide" id="slide-${id}"[\\s\\S]*?<\\/section>`
  );
  const m = html.match(re);
  if (!m) {
    console.error("missing", id);
    process.exit(1);
  }

  const single = `${headFixed}
<style>html,body{margin:0;padding:0;background:#f3efe6;overflow:hidden;width:1080px;height:1080px;}</style>
<body>
${m[0]}
</body>
</html>
`;
  const tmp = path.join(OUT, `slide-${id}.html`);
  fs.writeFileSync(tmp, single);

  const name = `fighurai-carousel-${id}.png`;
  const outPath = path.join(OUT, name);
  const profile = `/tmp/fighurai-chrome-${id}-${process.pid}`;

  const result = spawnSync(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--font-render-hinting=none",
      "--window-size=1080,1080",
      `--screenshot=${outPath}`,
      `file://${tmp}`,
    ],
    { encoding: "utf8", timeout: 30000 }
  );

  if (result.error || (result.status !== 0 && !fs.existsSync(outPath))) {
    console.error(result.stderr || result.stdout || result.error);
    process.exit(1);
  }

  fs.copyFileSync(outPath, path.join(ARTIFACTS, name));
  console.log("wrote", name, fs.statSync(outPath).size, "bytes");
}

console.log("done →", OUT);
