/**
 * Highlight Carousel — slide data lives HERE.
 * Swap text / colors for future posts; leave layout + motion alone.
 *
 * Each slide:
 *   bg               — full-bleed background
 *   highlightColors  — one color (flat) OR two+ (alternate per line)
 *   lines            — short fragments (rendered lowercase)
 *   fg / fgs         — optional text color(s); auto-contrasted if omitted
 *   offsets          — optional px left offsets; default stair-step 0/60/0/90…
 */

const LOOP_MS = 2500;
const SETTLE_STAGGER_MS = 80;

// Apply export chrome-hiding ASAP (before fonts.ready) to avoid UI flash
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get("export") === "1") {
    document.documentElement.classList.add("export-mode");
    document.addEventListener("DOMContentLoaded", () => {
      document.body.classList.add("export-mode");
    });
  }
})();

const slides = [
  {
    // Colors sampled from the reference recording
    bg: "#0013FE",
    highlightColors: ["#C0F71F"],
    fg: "#EF7D96",
    lines: ["am I the", "cool friend", "if I can", "build that app", "before your", "coffee's done?"],
  },
  {
    bg: "#EB2FAE",
    highlightColors: ["#255DDC"],
    fg: "#12D6F9",
    lines: ["am I the", "cool friend", "if I fixed", "your site's colors", "without touching", "code?"],
  },
  {
    bg: "#F02908",
    highlightColors: ["#82EDF5"],
    fg: "#0A0A0A",
    lines: ["am I the", "cool friend", "if my agent's", "already done", "before you finish", "explaining it?"],
  },
  {
    bg: "#5FC238",
    highlightColors: ["#FA0082"],
    fg: "#FA6EAA", // lighter pink letters on hot-pink bars (ref)
    lines: ["am I the", "cool friend", "if I built", "that just by", "saying it", "out loud?"],
  },
];

const SLIDES = slides;

const DEFAULT_OFFSETS = [0, 60, 0, 90, 0, 60, 0, 90];

const MUTE_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
</svg>
`.trim();

function highlightColorsOf(slide) {
  return slide.highlightColors || slide.highlights || ["#ffffff"];
}

function highlightFor(slide, index) {
  const colors = highlightColorsOf(slide);
  if (colors.length === 1) return colors[0];
  return colors[index % colors.length];
}

function fgFor(slide, index) {
  if (slide.fgs && slide.fgs.length) {
    return slide.fgs[index % slide.fgs.length];
  }
  if (slide.fg) return slide.fg;
  // Flat highlight → black ink. Never swap letter color with the bar color.
  return "#0a0a0a";
}

function buildSlide(slide, index, total) {
  const el = document.createElement("article");
  el.className = "slide";
  el.dataset.index = String(index);
  el.style.setProperty("--bg", slide.bg);

  const artboard = document.createElement("div");
  artboard.className = "slide-artboard";

  const bg = document.createElement("div");
  bg.className = "slide-bg";

  const pill = document.createElement("div");
  pill.className = "page-pill";
  pill.textContent = `${index + 1}/${total}`;

  const content = document.createElement("div");
  content.className = "slide-content";

  const offsets = slide.offsets || DEFAULT_OFFSETS;

  slide.lines.forEach((text, i) => {
    const line = document.createElement("div");
    line.className = "line";
    line.style.marginLeft = `${offsets[i % offsets.length]}px`;

    const hl = document.createElement("div");
    hl.className = "highlight-line";
    hl.style.setProperty("--hl", highlightFor(slide, i));
    hl.style.setProperty("--line-index", String(i));

    const span = document.createElement("span");
    span.className = "text";
    span.style.setProperty("--fg", fgFor(slide, i));
    span.textContent = text.toLowerCase();

    hl.appendChild(span);
    line.appendChild(hl);
    content.appendChild(line);
  });

  const mute = document.createElement("div");
  mute.className = "mute-btn";
  mute.innerHTML = MUTE_SVG;

  const brand = document.createElement("div");
  brand.className = "brand-footer";
  brand.textContent = "fighur.ai";

  artboard.appendChild(bg);
  artboard.appendChild(pill);
  artboard.appendChild(content);
  artboard.appendChild(brand);
  artboard.appendChild(mute);
  el.appendChild(artboard);
  return el;
}

function getParams() {
  const q = new URLSearchParams(location.search);
  return {
    exportMode: q.get("export") === "1",
    slide: Math.max(0, parseInt(q.get("slide") || "0", 10) || 0),
  };
}

function setFont(name) {
  document.documentElement.dataset.font = name;
  document.querySelectorAll(".font-toggle button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.font === name);
  });
  try {
    localStorage.setItem("highlight-carousel-font", name);
  } catch {
    /* ignore */
  }
}

function fitArtboards(carousel) {
  carousel.querySelectorAll(".slide").forEach((slide) => {
    const scale = slide.clientWidth / 1080;
    slide.style.setProperty("--preview-scale", String(scale || 0.42));
  });
}

/** Expand highlight bars to hug the visually-stretched glyphs */
function fitHighlightWidths(root = document) {
  // No-op: glyph width now comes from font wdth axis (no CSS scale)
  root.querySelectorAll(".highlight-line").forEach((hl) => {
    hl.style.width = "";
  });
}

function restartSlideAnimations(slideEl) {
  // Avoid restart loops while settle is mid-flight
  if (slideEl.dataset.animLock === "1") return;
  slideEl.dataset.animLock = "1";
  slideEl.querySelectorAll(".highlight-line, .slide-bg, .page-pill").forEach((node) => {
    node.style.animation = "none";
    void node.offsetWidth;
    node.style.animation = "";
  });
  window.setTimeout(() => {
    slideEl.dataset.animLock = "0";
  }, 1200);
}

function init() {
  const { exportMode, slide: slideIndex } = getParams();
  const carousel = document.getElementById("carousel");
  const chromePos = document.getElementById("chrome-pos");

  // Roboto Flex (light + wide) matches the reference stroke/proportion best
  let preferred = "roboto-flex";
  try {
    preferred = localStorage.getItem("highlight-carousel-font") || "roboto-flex";
  } catch {
    /* ignore */
  }
  setFont(preferred);

  SLIDES.forEach((s, i) => {
    carousel.appendChild(buildSlide(s, i, SLIDES.length));
  });

  if (exportMode) {
    setFont("roboto-flex");
    document.body.classList.add("export-mode");
    document.documentElement.style.setProperty("--preview-scale", "1");
    const all = [...carousel.querySelectorAll(".slide")];
    const target = all[Math.min(slideIndex, all.length - 1)];
    target.classList.add("export-active");
    target.style.setProperty("--preview-scale", "1");
    return;
  }

  fitArtboards(carousel);
  fitHighlightWidths(carousel);
  window.addEventListener("resize", () => {
    fitArtboards(carousel);
    fitHighlightWidths(carousel);
  });
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      fitArtboards(carousel);
      fitHighlightWidths(carousel);
    }).observe(carousel);
  }

  document.querySelectorAll(".font-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFont(btn.dataset.font);
      requestAnimationFrame(() => fitHighlightWidths(carousel));
    });
  });

  const updatePos = () => {
    const w = carousel.clientWidth || 1;
    const i = Math.round(carousel.scrollLeft / w);
    chromePos.textContent = `${i + 1} / ${SLIDES.length}`;
  };

  carousel.addEventListener("scroll", () => requestAnimationFrame(updatePos), {
    passive: true,
  });

  document.getElementById("btn-prev").addEventListener("click", () => {
    carousel.scrollBy({ left: -carousel.clientWidth, behavior: "smooth" });
  });
  document.getElementById("btn-next").addEventListener("click", () => {
    carousel.scrollBy({ left: carousel.clientWidth, behavior: "smooth" });
  });

  // Replay settle cascade when a slide snaps into view (debounced)
  const slideEls = [...carousel.querySelectorAll(".slide")];
  let lastIdx = -1;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.65) return;
        const idx = Number(entry.target.dataset.index);
        if (idx === lastIdx) return;
        lastIdx = idx;
        restartSlideAnimations(entry.target);
      });
    },
    { root: carousel, threshold: 0.65 }
  );
  slideEls.forEach((s) => io.observe(s));

  updatePos();
}

document.fonts.ready.then(init);

// Expose for export / debugging
window.__HIGHLIGHT_CAROUSEL__ = { slides, SLIDES, LOOP_MS, SETTLE_STAGGER_MS };
