// PPTX renderers for the "타이틀" slide type (Sunday worship cover slides).
// Three designs share one data shape: church name, service date, optional
// subtitle. All coordinates are inches on the 13.333 x 7.5 wide layout.

import {
  formatServiceDateEn,
  formatServiceDateKo,
} from "./title-slide-date.js";

const LAYOUT = { width: 13.333, height: 7.5 };

const SERIF = "Batang";
const SANS = "Malgun Gothic";
const LATIN = "Arial";

export const TITLE_DESIGNS = ["chapel", "editorial", "glow"];

export function normalizeTitleDesign(value) {
  return TITLE_DESIGNS.includes(value) ? value : "chapel";
}

function buildContent(slide) {
  return {
    church: (slide?.churchName || "").trim(),
    subtitle: (slide?.titleSubtitle || "").trim(),
    koDate: formatServiceDateKo(slide?.serviceDate),
    enDate: formatServiceDateEn(slide?.serviceDate),
  };
}

/**
 * Lays out a vertical run of blocks centered on the slide. Blocks are
 * `{ h, gap, draw(y) }`; falsy entries are dropped, so an absent subtitle
 * closes its own gap instead of leaving a hole.
 */
function stackCentered(blocks) {
  const items = blocks.filter(Boolean);
  const spanOf = (item, index) =>
    item.h + (index < items.length - 1 ? item.gap || 0 : 0);
  const total = items.reduce((sum, item, index) => sum + spanOf(item, index), 0);

  let y = (LAYOUT.height - total) / 2;
  items.forEach((item, index) => {
    item.draw(y);
    y += spanOf(item, index);
  });
}

function centeredText(slide, text, options) {
  slide.addText(text, {
    x: 0,
    w: LAYOUT.width,
    align: "center",
    valign: "mid",
    margin: 0,
    ...options,
  });
}

function horizontalRule(pptx, slide, { y, width, color, lineWidth }) {
  slide.addShape(pptx.ShapeType.line, {
    x: (LAYOUT.width - width) / 2,
    y,
    w: width,
    h: 0,
    line: { color, width: lineWidth },
  });
}

// --- Design 1: 클래식 채플 ---------------------------------------------------

const CHAPEL = {
  bg: "0E1117",
  gold: "D6B36A",
  title: "FFFFFF",
  subtitle: "E8E2D4",
  date: "DCD6C8",
};

function addChapelCorners(pptx, slide) {
  const inset = 0.38;
  const arm = 0.52;
  const right = LAYOUT.width - inset;
  const bottom = LAYOUT.height - inset;
  const line = { color: CHAPEL.gold, width: 1.25 };

  const segments = [
    { x: inset, y: inset, w: arm, h: 0 },
    { x: inset, y: inset, w: 0, h: arm },
    { x: right - arm, y: inset, w: arm, h: 0 },
    { x: right, y: inset, w: 0, h: arm },
    { x: inset, y: bottom, w: arm, h: 0 },
    { x: inset, y: bottom - arm, w: 0, h: arm },
    { x: right - arm, y: bottom, w: arm, h: 0 },
    { x: right, y: bottom - arm, w: 0, h: arm },
  ];

  segments.forEach((segment) => {
    slide.addShape(pptx.ShapeType.line, { ...segment, line });
  });
}

function addChapelSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: CHAPEL.bg };
  addChapelCorners(pptx, slide);

  const rule = (y) =>
    horizontalRule(pptx, slide, {
      y,
      width: 2.9,
      color: CHAPEL.gold,
      lineWidth: 1,
    });

  stackCentered([
    content.church && {
      h: 0.36,
      gap: 0.26,
      draw: (y) =>
        centeredText(slide, content.church, {
          y,
          h: 0.36,
          fontFace: SANS,
          fontSize: 18,
          bold: true,
          color: CHAPEL.gold,
          charSpacing: 4,
        }),
    },
    { h: 0.02, gap: 0.3, draw: rule },
    {
      h: 1.55,
      gap: content.subtitle ? 0.2 : 0.28,
      draw: (y) =>
        centeredText(slide, "주일예배", {
          y,
          h: 1.55,
          fontFace: SERIF,
          fontSize: 96,
          bold: true,
          color: CHAPEL.title,
          charSpacing: 7,
        }),
    },
    content.subtitle && {
      h: 0.45,
      gap: 0.26,
      draw: (y) =>
        centeredText(slide, content.subtitle, {
          y,
          h: 0.45,
          fontFace: SANS,
          fontSize: 22,
          bold: true,
          color: CHAPEL.subtitle,
        }),
    },
    {
      h: 0.34,
      gap: 0.3,
      draw: (y) =>
        centeredText(slide, "SUNDAY WORSHIP", {
          y,
          h: 0.34,
          fontFace: LATIN,
          fontSize: 16,
          bold: true,
          color: CHAPEL.gold,
          charSpacing: 9,
        }),
    },
    { h: 0.02, gap: 0.26, draw: rule },
    content.koDate && {
      h: 0.45,
      draw: (y) =>
        centeredText(slide, content.koDate, {
          y,
          h: 0.45,
          fontFace: SANS,
          fontSize: 24,
          color: CHAPEL.date,
        }),
    },
  ]);
}

// --- Design 2: 모던 에디토리얼 ----------------------------------------------

const EDITORIAL = {
  bg: "F5F0E7",
  ink: "17150F",
  muted: "8A7659",
  hair: "C6BAA4",
};

function addEditorialSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: EDITORIAL.bg };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.16,
    h: LAYOUT.height,
    fill: { color: EDITORIAL.ink },
    line: { color: EDITORIAL.ink, transparency: 100 },
  });

  if (content.church) {
    slide.addText(content.church, {
      x: 1.05,
      y: 0.78,
      w: 6.5,
      h: 0.36,
      fontFace: SANS,
      fontSize: 18,
      bold: true,
      color: EDITORIAL.muted,
      align: "left",
      valign: "mid",
      charSpacing: 3,
      margin: 0,
    });
  }

  if (content.subtitle) {
    slide.addText(content.subtitle, {
      x: 6.55,
      y: 0.78,
      w: 5.73,
      h: 0.36,
      fontFace: SANS,
      fontSize: 15,
      bold: true,
      color: EDITORIAL.ink,
      align: "right",
      valign: "mid",
      margin: 0,
    });
  }

  slide.addText("주일예배", {
    x: 0.95,
    y: 2.3,
    w: 10.5,
    h: 1.75,
    fontFace: SANS,
    fontSize: 112,
    bold: true,
    color: EDITORIAL.ink,
    align: "left",
    valign: "mid",
    margin: 0,
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 1.05,
    y: 4.4,
    w: 4.4,
    h: 0,
    line: { color: EDITORIAL.hair, width: 1 },
  });

  slide.addText("SUNDAY WORSHIP SERVICE", {
    x: 1.02,
    y: 4.55,
    w: 8,
    h: 0.32,
    fontFace: LATIN,
    fontSize: 14,
    bold: true,
    color: EDITORIAL.muted,
    align: "left",
    valign: "mid",
    charSpacing: 7,
    margin: 0,
  });

  if (content.koDate) {
    slide.addText("DATE", {
      x: 6,
      y: 5.72,
      w: 6.38,
      h: 0.26,
      fontFace: LATIN,
      fontSize: 11,
      bold: true,
      color: EDITORIAL.muted,
      align: "right",
      valign: "mid",
      charSpacing: 5,
      margin: 0,
    });

    slide.addText(content.koDate, {
      x: 6,
      y: 5.98,
      w: 6.38,
      h: 0.52,
      fontFace: SANS,
      fontSize: 28,
      bold: true,
      color: EDITORIAL.ink,
      align: "right",
      valign: "mid",
      margin: 0,
    });

    slide.addText(content.enDate, {
      x: 6,
      y: 6.52,
      w: 6.38,
      h: 0.32,
      fontFace: LATIN,
      fontSize: 13,
      color: EDITORIAL.muted,
      align: "right",
      valign: "mid",
      charSpacing: 3,
      margin: 0,
    });
  }
}

// --- Design 3: 스테인드 글로우 ----------------------------------------------

const GLOW = {
  bg: "0B1A33",
  gold: "F2C15B",
  band: "040A16",
  latin: "F3E6C8",
  date: "E9DFC8",
};

function buildGlowBackgroundSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333 750">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1a33"/>
      <stop offset="100%" stop-color="#1c2f52"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.8" cy="0.14" r="0.62">
      <stop offset="0%" stop-color="#f2c15b" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#f2c15b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1333" height="750" fill="url(#base)"/>
  <rect width="1333" height="750" fill="url(#glow)"/>
</svg>`;
}

function addGlowSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: GLOW.bg };

  slide.addImage({
    data: `data:image/svg+xml;base64,${Buffer.from(
      buildGlowBackgroundSvg()
    ).toString("base64")}`,
    x: 0,
    y: 0,
    w: LAYOUT.width,
    h: LAYOUT.height,
  });

  if (content.subtitle) {
    centeredText(slide, content.subtitle, {
      y: 1.15,
      h: 0.42,
      fontFace: SANS,
      fontSize: 18,
      bold: true,
      color: GLOW.gold,
      charSpacing: 5,
    });
  }

  // "주일예배" set as four staggered glyphs, matching the hymn/scripture covers.
  const letters = ["주", "일", "예", "배"];
  const cell = 1.3;
  const gap = 0.06;
  const startX = (LAYOUT.width - (letters.length * cell + (letters.length - 1) * gap)) / 2;

  letters.forEach((letter, index) => {
    slide.addText(letter, {
      x: startX + index * (cell + gap),
      y: index % 2 === 1 ? 2.14 : 1.8,
      w: cell,
      h: 1.45,
      fontFace: SERIF,
      fontSize: 88,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "mid",
      margin: 0,
    });
  });

  const ruleWidth = 4.6;
  const ruleY = 4.08;
  const ruleX = (LAYOUT.width - ruleWidth) / 2;

  slide.addShape(pptx.ShapeType.line, {
    x: ruleX,
    y: ruleY,
    w: ruleWidth,
    h: 0,
    line: { color: GLOW.gold, width: 1.5 },
  });

  [ruleX, ruleX + ruleWidth].forEach((dotX) => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: dotX - 0.035,
      y: ruleY - 0.035,
      w: 0.07,
      h: 0.07,
      fill: { color: GLOW.gold },
      line: { color: GLOW.gold, transparency: 100 },
    });
  });

  centeredText(slide, "SUNDAY WORSHIP", {
    y: 4.24,
    h: 0.44,
    fontFace: LATIN,
    fontSize: 17,
    bold: true,
    color: GLOW.latin,
    charSpacing: 9,
  });

  const bandY = 5.76;
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: bandY,
    w: LAYOUT.width,
    h: LAYOUT.height - bandY,
    fill: { color: GLOW.band, transparency: 45 },
    line: { color: GLOW.band, transparency: 100 },
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0,
    y: bandY,
    w: LAYOUT.width,
    h: 0,
    line: { color: GLOW.gold, width: 1 },
  });

  if (content.church) {
    centeredText(slide, content.church, {
      y: 6.12,
      h: 0.52,
      fontFace: SANS,
      fontSize: 26,
      bold: true,
      color: "FFFFFF",
    });
  }

  if (content.koDate) {
    centeredText(slide, content.koDate, {
      y: 6.72,
      h: 0.42,
      fontFace: SANS,
      fontSize: 17,
      color: GLOW.date,
    });
  }
}

/** Appends the cover slide described by `slide` to an existing deck. */
export function appendTitleSlide(pptx, slide) {
  const content = buildContent(slide);
  const design = normalizeTitleDesign(slide?.titleDesign);

  if (design === "editorial") {
    addEditorialSlide(pptx, content);
    return;
  }
  if (design === "glow") {
    addGlowSlide(pptx, content);
    return;
  }
  addChapelSlide(pptx, content);
}
