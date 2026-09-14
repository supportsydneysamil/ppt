// PPTX renderers for the "타이틀 (Custom)" slide type. Catalog designs share
// one text data shape while eight layout families supply their compositions.
// All coordinates are inches on the 13.333 x 7.5 wide layout.

import { fileURLToPath } from "node:url";
import {
  enTitleFontSize,
  koTitleFontSize,
  subtitleFontSize,
} from "./custom-title-text.js";
import { gradientPngDataUri } from "./gradient-raster.js";
import {
  CUSTOM_TITLE_DESIGN_IDS,
  findCustomTitleDesign,
  isSafeCustomTitleAssetPath,
  normalizeCustomTitleDesignId,
} from "./custom-title-design-catalog.js";
import {
  BACKGROUND_RASTER,
  LATIN,
  LAYOUT,
  SANS,
  SERIF,
  addGradientBackground,
  centeredText,
  horizontalRule,
  lineHeight,
  stackCentered,
} from "./slide-layout.js";

export const CUSTOM_TITLE_DESIGNS = CUSTOM_TITLE_DESIGN_IDS;

export function normalizeCustomTitleDesign(value) {
  return normalizeCustomTitleDesignId(value);
}

const TITLE_STACK_OFFSET_WITH_SUBTITLE = -0.45;
const SUBTITLE_PANEL = { x: 1.07, y: 6.1, w: 11.19, h: 0.85 };

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
  const offsetY = content.subtitle ? TITLE_STACK_OFFSET_WITH_SUBTITLE : 0;

  stackCentered([
    content.ko && {
      h: lineHeight(koSize, 1.22),
      gap: design.koGap,
      draw: (y) =>
        design.drawKo(y + offsetY, lineHeight(koSize, 1.22), koSize),
    },
    content.en &&
      design.drawDivider && {
        h: 0.02,
        gap: design.dividerGap,
        draw: (y) => design.drawDivider(y + offsetY),
      },
    content.en && {
      h: lineHeight(enSize, 1.5),
      draw: (y) =>
        design.drawEn(y + offsetY, lineHeight(enSize, 1.5), enSize),
    },
  ]);

  if (content.subtitle) {
    design.drawSubtitleHalo();
  }
}

// Sized to the panel it sits behind rather than the slide, so the glow keeps its
// flattened shape.
const SUBTITLE_HALO_RASTER = { width: 1119, height: 85 };

function buildSubtitleHaloGradient({ haloColor, haloOpacity }) {
  return {
    ...SUBTITLE_HALO_RASTER,
    layers: [
      {
        fill: {
          type: "radial",
          cx: 0.5,
          cy: 0.5,
          r: 0.5,
          stops: [
            { offset: 0, color: haloColor, opacity: haloOpacity },
            { offset: 0.68, color: haloColor, opacity: 0 },
            { offset: 1, color: haloColor, opacity: 0 },
          ],
        },
      },
    ],
  };
}

function addSubtitleHalo(slide, content, theme) {
  slide.addImage({
    ...SUBTITLE_PANEL,
    objectName: "custom-title:subtitle-halo",
    data: gradientPngDataUri(buildSubtitleHaloGradient(theme)),
  });

  slide.addText(content.subtitle, {
    ...SUBTITLE_PANEL,
    objectName: "custom-title:subtitle-text",
    fontFace: SANS,
    fontSize: subtitleFontSize(content.subtitle),
    bold: true,
    color: theme.text,
    align: "center",
    valign: "mid",
    margin: 0,
  });
}

function addNamedGradientBackground(slide, layers, objectName) {
  slide.addImage({
    data: gradientPngDataUri({ ...BACKGROUND_RASTER, layers }),
    x: 0,
    y: 0,
    w: LAYOUT.width,
    h: LAYOUT.height,
    objectName,
  });
}

// --- Design 1: 오로라 그라디언트 --------------------------------------------

const AURORA = {
  bg: "170E33",
  title: "FFFFFF",
  accent: "C4B2FF",
  rule: "8B6BFF",
};

function buildAuroraBackgroundLayers() {
  return [
    {
      fill: {
        type: "linear",
        x2: 1,
        y2: 1,
        stops: [
          { offset: 0, color: "170e33" },
          { offset: 0.52, color: "2c1a63" },
          { offset: 1, color: "0c3a52" },
        ],
      },
    },
    {
      fill: {
        type: "radial",
        cx: 0.78,
        cy: 0.08,
        r: 0.72,
        stops: [
          { offset: 0, color: "8b5cf6", opacity: 0.46 },
          { offset: 1, color: "8b5cf6", opacity: 0 },
        ],
      },
    },
    {
      fill: {
        type: "radial",
        cx: 0.1,
        cy: 0.96,
        r: 0.78,
        stops: [
          { offset: 0, color: "2dd4bf", opacity: 0.34 },
          { offset: 1, color: "2dd4bf", opacity: 0 },
        ],
      },
    },
  ];
}

function addAuroraSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: AURORA.bg };
  addNamedGradientBackground(
    slide,
    buildAuroraBackgroundLayers(),
    "custom-title:family:centered-rule"
  );

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
    drawSubtitleHalo: () =>
      addSubtitleHalo(slide, content, {
        haloColor: "C4B2FF",
        haloOpacity: 0.15,
        text: "FFFFFF",
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

function buildMonolithBackgroundLayers() {
  return [
    { fill: { color: "0a0b0d" } },
    {
      x: 333,
      w: 667,
      fill: {
        type: "linear",
        x2: 1,
        y2: 0,
        stops: [
          { offset: 0, color: "ffffff", opacity: 0 },
          { offset: 0.5, color: "ffffff", opacity: 0.075 },
          { offset: 1, color: "ffffff", opacity: 0 },
        ],
      },
    },
    {
      fill: {
        type: "radial",
        cx: 0.5,
        cy: 0,
        r: 0.62,
        stops: [
          { offset: 0, color: "ffffff", opacity: 0.12 },
          { offset: 1, color: "ffffff", opacity: 0 },
        ],
      },
    },
  ];
}

function addMonolithSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: MONOLITH.bg };
  addGradientBackground(slide, buildMonolithBackgroundLayers());

  [0.45, LAYOUT.height - 0.45].forEach((y, index) => {
    slide.addShape(pptx.ShapeType.line, {
      x: 0.45,
      y,
      w: LAYOUT.width - 0.9,
      h: 0,
      line: { color: MONOLITH.hair, width: 1 },
      objectName:
        index === 0 ? "custom-title:family:centered-rule" : undefined,
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
    drawSubtitleHalo: () =>
      addSubtitleHalo(slide, content, {
        haloColor: "FFFFFF",
        haloOpacity: 0.1,
        text: "EEE9DC",
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
  ].forEach(({ inset, width }, index) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: inset,
      y: inset,
      w: LAYOUT.width - inset * 2,
      h: LAYOUT.height - inset * 2,
      fill: { color: IVORY.bg },
      line: { color: IVORY.gold, width },
      objectName: index === 0 ? "custom-title:family:double-frame" : undefined,
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
    drawSubtitleHalo: () =>
      addSubtitleHalo(slide, content, {
        haloColor: IVORY.gold,
        haloOpacity: 0.16,
        text: "5F4B2C",
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
    objectName: "custom-title:family:ornament-frame",
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
    drawSubtitleHalo: () =>
      addSubtitleHalo(slide, content, {
        haloColor: MARQUEE.gold,
        haloOpacity: 0.12,
        text: MARQUEE.title,
      }),
  });
}

/**
 * Everything that makes a layout family look like itself: where the text sits,
 * which way its gradient runs, and the motif drawn behind the type. Keeping the
 * three together means a family can never be half-implemented.
 *
 * `gradient` follows the rasterizer's bounding-box convention: `x2`/`y2` aim
 * the linear ramp and `glow` places the accent bloom.
 */
const FAMILY_PLANS = {
  "centered-rule": {
    text: { x: 0, w: LAYOUT.width, align: "center", y: 0 },
    gradient: { x2: 0, y2: 1, glow: { cx: 0.5, cy: 0, r: 0.74 } },
    decorate: drawCenteredRule,
  },
  "double-frame": {
    text: { x: 0, w: LAYOUT.width, align: "center", y: 0 },
    gradient: { x2: 1, y2: 0, glow: { cx: 0.5, cy: 0.5, r: 0.95 } },
    decorate: drawDoubleFrame,
  },
  "ornament-frame": {
    text: { x: 0, w: LAYOUT.width, align: "center", y: 0 },
    gradient: { x2: 1, y2: 1, glow: { cx: 0.5, cy: 1, r: 0.82 } },
    decorate: drawOrnamentFrame,
  },
  "side-band": {
    text: { x: 1.3, w: 7.6, align: "left", y: 0 },
    gradient: { x2: 1, y2: 0.35, glow: { cx: 0.08, cy: 0.5, r: 0.7 } },
    decorate: drawSideBand,
  },
  "horizon-split": {
    text: { x: 0, w: LAYOUT.width, align: "center", y: 0.68 },
    gradient: {
      x2: 0,
      y2: 1,
      glow: { cx: 0.5, cy: 0.63, r: 0.55 },
      horizonBand: true,
    },
    decorate: drawHorizonSplit,
  },
  "emblem-crest": {
    text: { x: 0, w: LAYOUT.width, align: "center", y: 0.48 },
    gradient: { y1: 1, x2: 0, y2: 0, glow: { cx: 0.5, cy: 0.18, r: 0.46 } },
    decorate: drawEmblemCrest,
  },
  "veil-panel": {
    text: { x: 6.35, w: 5.65, align: "left", y: 0 },
    gradient: { x1: 1, x2: 0, y2: 0.25, glow: { cx: 0.72, cy: 0.42, r: 0.68 } },
    decorate: drawVeilPanel,
  },
  "corner-mark": {
    text: { x: 1.25, w: 9.2, align: "left", y: 0 },
    gradient: { y1: 1, x2: 1, y2: 0, glow: { cx: 0.12, cy: 0.1, r: 0.62 } },
    decorate: drawCornerMark,
  },
};

function customTitleFamilyPlan(family) {
  const plan = FAMILY_PLANS[family];
  if (!plan) {
    throw new Error(
      `custom title layout family has no drawing path: ${family}`
    );
  }
  return plan;
}

/**
 * The family's ramp and bloom in the theme's own colours. A light theme runs
 * the ramp the other way and dims the bloom, so the same family reads as two
 * different rooms rather than one washed with a different tint.
 */
function buildFamilyGradientLayers(theme, gradient) {
  const dark = theme.mood === "dark";
  const base = theme.background.toLowerCase();
  const accent = theme.backgroundAccent.toLowerCase();
  const bloom = theme.accent.toLowerCase();
  const [from, to] = dark ? [base, accent] : [accent, base];

  const layers = [
    { fill: { color: base } },
    {
      fill: {
        type: "linear",
        x1: gradient.x1 ?? 0,
        y1: gradient.y1 ?? 0,
        x2: gradient.x2,
        y2: gradient.y2,
        stops: [
          { offset: 0, color: from },
          { offset: 1, color: to },
        ],
      },
    },
  ];

  if (gradient.horizonBand) {
    layers.push({
      y: Math.round(BACKGROUND_RASTER.height * 0.55),
      h: Math.round(BACKGROUND_RASTER.height * 0.16),
      fill: {
        type: "linear",
        x2: 0,
        y2: 1,
        stops: [
          { offset: 0, color: bloom, opacity: 0 },
          { offset: 0.5, color: bloom, opacity: dark ? 0.28 : 0.18 },
          { offset: 1, color: bloom, opacity: 0 },
        ],
      },
    });
  }

  layers.push({
    fill: {
      type: "radial",
      cx: gradient.glow.cx,
      cy: gradient.glow.cy,
      r: gradient.glow.r,
      stops: [
        { offset: 0, color: bloom, opacity: dark ? 0.2 : 0.12 },
        { offset: 1, color: bloom, opacity: 0 },
      ],
    },
  });

  return layers;
}

function addCatalogBackground(pptx, slide, design, plan) {
  const { asset, theme } = design;
  slide.background = { color: theme.background };

  if (asset) {
    slide.addImage({
      path: resolveCustomTitleAssetFile(asset.path),
      x: 0,
      y: 0,
      w: LAYOUT.width,
      h: LAYOUT.height,
      objectName: "custom-title:background-asset",
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: LAYOUT.width,
      h: LAYOUT.height,
      fill: {
        color: theme.background,
        transparency: theme.mood === "dark" ? 38 : 52,
      },
      line: { color: theme.background, transparency: 100 },
      objectName: "custom-title:background-overlay",
    });
    return;
  }

  addNamedGradientBackground(
    slide,
    buildFamilyGradientLayers(theme, plan.gradient),
    "custom-title:background-gradient"
  );
}

function addFamilyDecoration(pptx, slide, design, plan) {
  plan.decorate(
    pptx,
    slide,
    design.theme,
    `custom-title:family:${design.layoutFamily}`
  );
}

/** A rule that ends in two small diamonds, mirrored by a shorter one below. */
function drawCenteredRule(pptx, slide, theme, name) {
  slide.addShape(pptx.ShapeType.line, {
    x: 0.65,
    y: 0.65,
    w: LAYOUT.width - 1.3,
    h: 0,
    line: { color: theme.rule, width: 1 },
    objectName: name,
  });

  [
    ["custom-title:rule-cap-start", 0.65],
    ["custom-title:rule-cap-end", LAYOUT.width - 0.65],
  ].forEach(([objectName, x]) =>
    slide.addShape(pptx.ShapeType.diamond, {
      x: x - 0.06,
      y: 0.59,
      w: 0.12,
      h: 0.12,
      fill: { color: theme.accent },
      line: hiddenLine(theme),
      objectName,
    })
  );

  slide.addShape(pptx.ShapeType.line, {
    x: (LAYOUT.width - 5) / 2,
    y: 6.85,
    w: 5,
    h: 0,
    line: { color: theme.rule, width: 1 },
    objectName: "custom-title:rule-echo",
  });
}

/** Two nested keylines with a short crest centred on each long edge. */
function drawDoubleFrame(pptx, slide, theme, name) {
  [0.42, 0.57].forEach((inset, index) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: inset,
      y: inset,
      w: LAYOUT.width - inset * 2,
      h: LAYOUT.height - inset * 2,
      fill: { color: theme.background, transparency: 100 },
      line: { color: theme.rule, width: index === 0 ? 1.5 : 0.75 },
      objectName: index === 0 ? name : "custom-title:frame-inner",
    });
  });

  [
    ["custom-title:frame-crest-top", 0.42],
    ["custom-title:frame-crest-bottom", LAYOUT.height - 0.42],
  ].forEach(([objectName, y]) =>
    slide.addShape(pptx.ShapeType.line, {
      x: (LAYOUT.width - 2.2) / 2,
      y,
      w: 2.2,
      h: 0,
      line: { color: theme.accent, width: 2.5 },
      objectName,
    })
  );
}

/** A single keyline pinned by a diamond at each corner and edge midpoint. */
function drawOrnamentFrame(pptx, slide, theme, name) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.46,
    y: 0.46,
    w: LAYOUT.width - 0.92,
    h: LAYOUT.height - 0.92,
    fill: { color: theme.background, transparency: 100 },
    line: { color: theme.rule, width: 1.4 },
    objectName: name,
  });

  [
    ["custom-title:ornament-top-left", 0.46, 0.46, 0.14],
    ["custom-title:ornament-top-right", LAYOUT.width - 0.46, 0.46, 0.14],
    ["custom-title:ornament-bottom-left", 0.46, LAYOUT.height - 0.46, 0.14],
    [
      "custom-title:ornament-bottom-right",
      LAYOUT.width - 0.46,
      LAYOUT.height - 0.46,
      0.14,
    ],
    ["custom-title:ornament-crown", LAYOUT.width / 2, 0.46, 0.2],
    ["custom-title:ornament-foot", LAYOUT.width / 2, LAYOUT.height - 0.46, 0.2],
  ].forEach(([objectName, x, y, size]) =>
    slide.addShape(pptx.ShapeType.diamond, {
      x: x - size / 2,
      y: y - size / 2,
      w: size,
      h: size,
      fill: { color: theme.accent },
      line: hiddenLine(theme),
      objectName,
    })
  );
}

/** A solid spine down the left edge, echoed by a hairline and three nodes. */
function drawSideBand(pptx, slide, theme, name) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.34,
    h: LAYOUT.height,
    fill: { color: theme.accent },
    line: hiddenLine(theme),
    objectName: name,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.56,
    y: 0,
    w: 0.06,
    h: LAYOUT.height,
    fill: { color: theme.rule, transparency: 28 },
    line: hiddenLine(theme),
    objectName: "custom-title:side-band-secondary",
  });

  [6.24, 6.6, 6.96].forEach((y, index) =>
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.78,
      y,
      w: 0.14,
      h: 0.14,
      fill: { color: theme.accent, transparency: index * 22 },
      line: hiddenLine(theme),
      objectName: `custom-title:band-node-${index + 1}`,
    })
  );
}

/** A grounded lower field, its horizon line, and marks receding into it. */
function drawHorizonSplit(pptx, slide, theme, name) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 4.72,
    w: LAYOUT.width,
    h: LAYOUT.height - 4.72,
    fill: { color: theme.backgroundAccent, transparency: 48 },
    line: hiddenLine(theme),
    objectName: name,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0,
    y: 4.72,
    w: LAYOUT.width,
    h: 0,
    line: { color: theme.rule, width: 1.5 },
    objectName: "custom-title:horizon",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0,
    y: 4.94,
    w: LAYOUT.width,
    h: 0,
    line: { color: theme.rule, width: 0.5, transparency: 45 },
    objectName: "custom-title:horizon-echo",
  });

  [0.6, 0.9, 1.2].forEach((x, index) =>
    slide.addShape(pptx.ShapeType.line, {
      x,
      y: 4.42,
      w: 0,
      h: 0.3,
      line: { color: theme.accent, width: 1.5 - index * 0.4 },
      objectName: `custom-title:field-mark-${index + 1}`,
    })
  );
}

/** A crest disc inside a ring, flanked by two short wings. */
function drawEmblemCrest(pptx, slide, theme, name) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x: LAYOUT.width / 2 - 0.34,
    y: 1.05,
    w: 0.68,
    h: 0.68,
    fill: { color: theme.backgroundAccent, transparency: 22 },
    line: { color: theme.accent, width: 1.3 },
    objectName: name,
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: LAYOUT.width / 2 - 0.54,
    y: 0.85,
    w: 1.08,
    h: 1.08,
    fill: { color: theme.accent, transparency: 100 },
    line: { color: theme.rule, width: 0.75, transparency: 30 },
    objectName: "custom-title:crest-ring",
  });
  slide.addShape(pptx.ShapeType.diamond, {
    x: LAYOUT.width / 2 - 0.09,
    y: 1.3,
    w: 0.18,
    h: 0.18,
    fill: { color: theme.accent },
    line: hiddenLine(theme),
    objectName: "custom-title:crest-mark",
  });

  [
    ["custom-title:crest-wing-left", LAYOUT.width / 2 - 1.85],
    ["custom-title:crest-wing-right", LAYOUT.width / 2 + 0.85],
  ].forEach(([objectName, x]) =>
    slide.addShape(pptx.ShapeType.line, {
      x,
      y: 1.39,
      w: 1,
      h: 0,
      line: { color: theme.rule, width: 1 },
      objectName,
    })
  );
}

/** A tinted reading panel, edged on its type side and tacked at the corners. */
function drawVeilPanel(pptx, slide, theme, name) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 5.82,
    y: 0.68,
    w: 6.72,
    h: 6.14,
    fill: {
      color: theme.background,
      transparency: theme.mood === "dark" ? 20 : 12,
    },
    line: { color: theme.rule, width: 0.8, transparency: 35 },
    objectName: name,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 5.82,
    y: 0.68,
    w: 0,
    h: 6.14,
    line: { color: theme.accent, width: 2.25 },
    objectName: "custom-title:veil-edge",
  });

  [
    ["custom-title:veil-tack-top", 0.68],
    ["custom-title:veil-tack-bottom", 6.6],
  ].forEach(([objectName, y]) =>
    slide.addShape(pptx.ShapeType.rect, {
      x: 5.71,
      y: y - 0.11,
      w: 0.22,
      h: 0.22,
      fill: { color: theme.accent },
      line: hiddenLine(theme),
      objectName,
    })
  );
}

/** An open bracket at the top-left corner, answered at the bottom-right. */
function drawCornerMark(pptx, slide, theme, name) {
  slide.addShape(pptx.ShapeType.line, {
    x: 0.78,
    y: 0.78,
    w: 1.05,
    h: 0,
    line: { color: theme.accent, width: 2 },
    objectName: name,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.78,
    y: 0.78,
    w: 0,
    h: 1.05,
    line: { color: theme.accent, width: 2 },
    objectName: "custom-title:corner-vertical",
  });

  slide.addShape(pptx.ShapeType.line, {
    x: LAYOUT.width - 1.83,
    y: LAYOUT.height - 0.78,
    w: 1.05,
    h: 0,
    line: { color: theme.accent, width: 2 },
    objectName: "custom-title:corner-horizontal-far",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: LAYOUT.width - 0.78,
    y: LAYOUT.height - 1.83,
    w: 0,
    h: 1.05,
    line: { color: theme.accent, width: 2 },
    objectName: "custom-title:corner-vertical-far",
  });
}

/** Outline-free shapes still need a line colour pptxgenjs will not draw. */
function hiddenLine(theme) {
  return { color: theme.accent, transparency: 100 };
}

/**
 * Catalog entries are the only source of asset paths, but the renderer checks
 * them anyway: a path is turned into a real file only after the catalog's own
 * guard confirms it stays inside `assets/custom-title/`.
 */
function resolveCustomTitleAssetFile(assetPath) {
  if (!isSafeCustomTitleAssetPath(assetPath)) {
    throw new Error(`custom title asset path is not allowed: ${assetPath}`);
  }
  return fileURLToPath(new URL(`../public/${assetPath}`, import.meta.url));
}

function addFamilyDivider(pptx, slide, design, layout, y) {
  const width = layout.align === "center" ? 2.6 : 1.65;
  const x =
    layout.align === "center"
      ? (LAYOUT.width - width) / 2
      : layout.x;
  slide.addShape(pptx.ShapeType.line, {
    x,
    y: y + layout.y,
    w: width,
    h: 0,
    line: { color: design.theme.rule, width: 1.2 },
    objectName: "custom-title:divider",
  });
}

function addCatalogDesignSlide(pptx, content, design) {
  const plan = customTitleFamilyPlan(design.layoutFamily);
  const slide = pptx.addSlide();
  const { theme } = design;
  const layout = plan.text;
  const titleFont = theme.titleFont === "serif" ? SERIF : SANS;
  addCatalogBackground(pptx, slide, design, plan);
  addFamilyDecoration(pptx, slide, design, plan);

  stackTitleBlocks(content, {
    koGap: 0.34,
    dividerGap: 0.3,
    drawKo: (y, h, size) =>
      centeredText(slide, content.ko, {
        x: layout.x,
        w: layout.w,
        y: y + layout.y,
        h,
        align: layout.align,
        fontFace: titleFont,
        fontSize: size,
        bold: true,
        color: theme.title,
        charSpacing: size * 0.04,
        objectName: "custom-title:title-ko",
      }),
    drawDivider: (y) => addFamilyDivider(pptx, slide, design, layout, y),
    drawEn: (y, h, size) =>
      centeredText(slide, content.en.toUpperCase(), {
        x: layout.x,
        w: layout.w,
        y: y + layout.y,
        h,
        align: layout.align,
        fontFace: LATIN,
        fontSize: size,
        bold: true,
        color: theme.accent,
        charSpacing: size * 0.42,
        objectName: "custom-title:title-en",
      }),
    drawSubtitleHalo: () =>
      addSubtitleHalo(slide, content, {
        haloColor: theme.haloColor,
        haloOpacity: theme.haloOpacity,
        text: theme.subtitleText,
      }),
  });
}

/**
 * Appends the slide a catalog design describes. Exported so the design objects
 * themselves can be rendered — the layout family and asset path are validated
 * here, so a malformed entry fails loudly instead of quietly falling back to
 * another family's composition or reaching outside the asset folder.
 */
export function appendCustomTitleCatalogSlide(pptx, design, content) {
  addCatalogDesignSlide(pptx, {
    ko: (content?.ko || "").trim(),
    en: (content?.en || "").trim(),
    subtitle: (content?.subtitle || "").trim(),
  }, design);
}

/** Appends a custom cover slide from normalized design and content. */
export function appendCustomTitleContentSlide(pptx, design, content) {
  const normalized = normalizeCustomTitleDesign(design);

  if (normalized === "monolith") {
    addMonolithSlide(pptx, content);
    return;
  }
  if (normalized === "ivory") {
    addIvorySlide(pptx, content);
    return;
  }
  if (normalized === "marquee") {
    addMarqueeSlide(pptx, content);
    return;
  }
  if (normalized === "aurora") {
    addAuroraSlide(pptx, content);
    return;
  }
  addCatalogDesignSlide(pptx, content, findCustomTitleDesign(normalized));
}

/** Appends the custom cover slide described by `slide` to an existing deck. */
export function appendCustomTitleSlide(pptx, slide) {
  return appendCustomTitleContentSlide(
    pptx,
    slide?.customTitleDesign,
    buildContent(slide)
  );
}
