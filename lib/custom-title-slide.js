// PPTX renderers for the "타이틀 (Custom)" slide type: a bare cover slide
// carrying nothing but a Korean headline and its English line. Four designs
// share that one data shape. All coordinates are inches on the 13.333 x 7.5
// wide layout.

import { enTitleFontSize, koTitleFontSize } from "./custom-title-text.js";
import {
  LATIN,
  LAYOUT,
  SANS,
  SERIF,
  addSvgBackground,
  centeredText,
  horizontalRule,
  lineHeight,
  stackCentered,
} from "./slide-layout.js";

export const CUSTOM_TITLE_DESIGNS = [
  "aurora",
  "monolith",
  "ivory",
  "marquee",
];

export function normalizeCustomTitleDesign(value) {
  return CUSTOM_TITLE_DESIGNS.includes(value) ? value : "aurora";
}

function buildContent(slide) {
  return {
    ko: (slide?.customTitleKo || "").trim(),
    en: (slide?.customTitleEn || "").trim(),
    subtitle: (slide?.customTitleSubtitle || "").trim(),
  };
}

/**
 * The shared skeleton every design uses: headline, a divider, then the English
 * line. `design` supplies the type treatment and the divider drawing.
 */
function stackTitleBlocks(content, design) {
  const koSize = koTitleFontSize(content.ko);
  const enSize = enTitleFontSize(content.en);

  stackCentered([
    content.ko && {
      h: lineHeight(koSize, 1.22),
      gap: design.koGap,
      draw: (y) => design.drawKo(y, lineHeight(koSize, 1.22), koSize),
    },
    content.en &&
      design.drawDivider && {
        h: 0.02,
        gap: design.dividerGap,
        draw: design.drawDivider,
      },
    content.en && {
      h: lineHeight(enSize, 1.5),
      gap: content.subtitle ? 0.2 : 0,
      draw: (y) => design.drawEn(y, lineHeight(enSize, 1.5), enSize),
    },
    content.subtitle && {
      h: 0.36,
      draw: (y) => design.drawSubtitle(y, 0.36),
    },
  ]);
}

// --- Design 1: 오로라 그라디언트 --------------------------------------------

const AURORA = {
  bg: "170E33",
  title: "FFFFFF",
  accent: "C4B2FF",
  rule: "8B6BFF",
};

function buildAuroraBackgroundSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333 750">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#170e33"/>
      <stop offset="52%" stop-color="#2c1a63"/>
      <stop offset="100%" stop-color="#0c3a52"/>
    </linearGradient>
    <radialGradient id="violet" cx="0.78" cy="0.08" r="0.72">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.46"/>
      <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="teal" cx="0.1" cy="0.96" r="0.78">
      <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#2dd4bf" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1333" height="750" fill="url(#base)"/>
  <rect width="1333" height="750" fill="url(#violet)"/>
  <rect width="1333" height="750" fill="url(#teal)"/>
</svg>`;
}

function addAuroraSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: AURORA.bg };
  addSvgBackground(slide, buildAuroraBackgroundSvg());

  stackTitleBlocks(content, {
    koGap: 0.34,
    dividerGap: 0.3,
    drawKo: (y, h, size) =>
      centeredText(slide, content.ko, {
        y,
        h,
        fontFace: SANS,
        fontSize: size,
        bold: true,
        color: AURORA.title,
        charSpacing: size * 0.02,
      }),
    drawDivider: (y) =>
      horizontalRule(pptx, slide, {
        y,
        width: 3.4,
        color: AURORA.rule,
        lineWidth: 1.75,
      }),
    drawEn: (y, h, size) =>
      centeredText(slide, content.en.toUpperCase(), {
        y,
        h,
        fontFace: LATIN,
        fontSize: size,
        bold: true,
        color: AURORA.accent,
        charSpacing: size * 0.42,
      }),
    drawSubtitle: (y, h) =>
      centeredText(slide, content.subtitle, {
        y,
        h,
        fontFace: SANS,
        fontSize: 18,
        bold: true,
        color: AURORA.accent,
      }),
  });
}

// --- Design 2: 모노리스 -----------------------------------------------------

const MONOLITH = {
  bg: "0A0B0D",
  title: "F4F1EA",
  muted: "9A9689",
  hair: "2C2E33",
};

function buildMonolithBackgroundSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333 750">
  <defs>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.075"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="crown" cx="0.5" cy="0" r="0.62">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1333" height="750" fill="#0a0b0d"/>
  <rect x="333" width="667" height="750" fill="url(#beam)"/>
  <rect width="1333" height="750" fill="url(#crown)"/>
</svg>`;
}

function addMonolithSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: MONOLITH.bg };
  addSvgBackground(slide, buildMonolithBackgroundSvg());

  [0.45, LAYOUT.height - 0.45].forEach((y) => {
    slide.addShape(pptx.ShapeType.line, {
      x: 0.45,
      y,
      w: LAYOUT.width - 0.9,
      h: 0,
      line: { color: MONOLITH.hair, width: 1 },
    });
  });

  stackTitleBlocks(content, {
    koGap: 0.36,
    dividerGap: 0.28,
    drawKo: (y, h, size) =>
      centeredText(slide, content.ko, {
        y,
        h,
        fontFace: SERIF,
        fontSize: size,
        bold: true,
        color: MONOLITH.title,
        charSpacing: size * 0.06,
      }),
    drawDivider: (y) =>
      horizontalRule(pptx, slide, {
        y,
        width: 1.1,
        color: MONOLITH.muted,
        lineWidth: 1,
      }),
    drawEn: (y, h, size) =>
      centeredText(slide, content.en.toUpperCase(), {
        y,
        h,
        fontFace: LATIN,
        fontSize: size,
        color: MONOLITH.muted,
        charSpacing: size * 0.5,
      }),
    drawSubtitle: (y, h) =>
      centeredText(slide, content.subtitle, {
        y,
        h,
        fontFace: SANS,
        fontSize: 18,
        bold: true,
        color: MONOLITH.muted,
      }),
  });
}

// --- Design 3: 아이보리 클래식 ----------------------------------------------

const IVORY = {
  bg: "FAF6EF",
  title: "1F1B16",
  gold: "C2A87A",
  muted: "907A52",
};

function addIvoryFrame(pptx, slide) {
  [
    { inset: 0.42, width: 1.5 },
    { inset: 0.56, width: 0.75 },
  ].forEach(({ inset, width }) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: inset,
      y: inset,
      w: LAYOUT.width - inset * 2,
      h: LAYOUT.height - inset * 2,
      fill: { color: IVORY.bg },
      line: { color: IVORY.gold, width },
    });
  });
}

function addIvorySlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: IVORY.bg };
  addIvoryFrame(pptx, slide);

  stackTitleBlocks(content, {
    koGap: 0.32,
    dividerGap: 0.28,
    drawKo: (y, h, size) =>
      centeredText(slide, content.ko, {
        y,
        h,
        fontFace: SERIF,
        fontSize: size,
        bold: true,
        color: IVORY.title,
        charSpacing: size * 0.04,
      }),
    drawDivider: (y) =>
      horizontalRule(pptx, slide, {
        y,
        width: 2.2,
        color: IVORY.gold,
        lineWidth: 1.25,
      }),
    drawEn: (y, h, size) =>
      centeredText(slide, content.en.toUpperCase(), {
        y,
        h,
        fontFace: LATIN,
        fontSize: size,
        bold: true,
        color: IVORY.muted,
        charSpacing: size * 0.45,
      }),
    drawSubtitle: (y, h) =>
      centeredText(slide, content.subtitle, {
        y,
        h,
        fontFace: SANS,
        fontSize: 18,
        bold: true,
        color: IVORY.muted,
      }),
  });
}

// --- Design 4: 마키 프레임 --------------------------------------------------

const MARQUEE = {
  bg: "2A0F16",
  title: "F7EBDA",
  gold: "D9B376",
};

function addMarqueeFrame(pptx, slide) {
  const inset = 0.44;
  slide.addShape(pptx.ShapeType.rect, {
    x: inset,
    y: inset,
    w: LAYOUT.width - inset * 2,
    h: LAYOUT.height - inset * 2,
    fill: { color: MARQUEE.bg },
    line: { color: MARQUEE.gold, width: 1.75 },
  });

  // Diamonds pinned to the frame corners, echoing the divider ornament.
  const corner = 0.44;
  [
    [corner, corner],
    [LAYOUT.width - corner, corner],
    [corner, LAYOUT.height - corner],
    [LAYOUT.width - corner, LAYOUT.height - corner],
  ].forEach(([x, y]) => {
    slide.addShape(pptx.ShapeType.diamond, {
      x: x - 0.075,
      y: y - 0.075,
      w: 0.15,
      h: 0.15,
      fill: { color: MARQUEE.gold },
      line: { color: MARQUEE.bg, width: 1 },
    });
  });
}

function addMarqueeDivider(pptx, slide, y) {
  const width = 3.6;
  const gap = 0.26;
  const half = (width - gap * 2) / 2;

  [
    (LAYOUT.width - width) / 2,
    (LAYOUT.width + width) / 2 - half,
  ].forEach((x) => {
    slide.addShape(pptx.ShapeType.line, {
      x,
      y,
      w: half,
      h: 0,
      line: { color: MARQUEE.gold, width: 1 },
    });
  });

  slide.addShape(pptx.ShapeType.diamond, {
    x: LAYOUT.width / 2 - 0.085,
    y: y - 0.085,
    w: 0.17,
    h: 0.17,
    fill: { color: MARQUEE.gold },
    line: { color: MARQUEE.gold, transparency: 100 },
  });
}

function addMarqueeSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: MARQUEE.bg };
  addMarqueeFrame(pptx, slide);

  stackTitleBlocks(content, {
    koGap: 0.34,
    dividerGap: 0.3,
    drawKo: (y, h, size) =>
      centeredText(slide, content.ko, {
        y,
        h,
        fontFace: SERIF,
        fontSize: size,
        bold: true,
        color: MARQUEE.title,
        charSpacing: size * 0.05,
      }),
    drawDivider: (y) => addMarqueeDivider(pptx, slide, y),
    drawEn: (y, h, size) =>
      centeredText(slide, content.en.toUpperCase(), {
        y,
        h,
        fontFace: LATIN,
        fontSize: size,
        bold: true,
        color: MARQUEE.gold,
        charSpacing: size * 0.48,
      }),
    drawSubtitle: (y, h) =>
      centeredText(slide, content.subtitle, {
        y,
        h,
        fontFace: SANS,
        fontSize: 18,
        bold: true,
        color: MARQUEE.gold,
      }),
  });
}

/** Appends the custom cover slide described by `slide` to an existing deck. */
export function appendCustomTitleSlide(pptx, slide) {
  const content = buildContent(slide);
  const design = normalizeCustomTitleDesign(slide?.customTitleDesign);

  if (design === "monolith") {
    addMonolithSlide(pptx, content);
    return;
  }
  if (design === "ivory") {
    addIvorySlide(pptx, content);
    return;
  }
  if (design === "marquee") {
    addMarqueeSlide(pptx, content);
    return;
  }
  addAuroraSlide(pptx, content);
}
