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
  normalizeCustomTitleDesignId,
} from "./custom-title-design-catalog.js";
import {
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
    data: gradientPngDataUri({
      width: 1333,
      height: 750,
      layers,
    }),
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

const FAMILY_TEXT_LAYOUT = {
  "centered-rule": { x: 0, w: LAYOUT.width, align: "center", y: 0 },
  "double-frame": { x: 0, w: LAYOUT.width, align: "center", y: 0 },
  "ornament-frame": { x: 0, w: LAYOUT.width, align: "center", y: 0 },
  "side-band": { x: 1.3, w: 7.6, align: "left", y: 0 },
  "horizon-split": { x: 0, w: LAYOUT.width, align: "center", y: 0.68 },
  "emblem-crest": { x: 0, w: LAYOUT.width, align: "center", y: 0.48 },
  "veil-panel": { x: 6.35, w: 5.65, align: "left", y: 0 },
  "corner-mark": { x: 1.25, w: 9.2, align: "left", y: 0 },
};

function addCatalogBackground(pptx, slide, design) {
  const { asset, theme } = design;
  slide.background = { color: theme.background };

  if (asset) {
    slide.addImage({
      path: fileURLToPath(new URL(`../public/${asset.path}`, import.meta.url)),
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
    [
      { fill: { color: theme.background.toLowerCase() } },
      {
        fill: {
          type: "linear",
          x2: 1,
          y2: 1,
          stops: [
            { offset: 0, color: theme.background.toLowerCase() },
            { offset: 1, color: theme.backgroundAccent.toLowerCase() },
          ],
        },
      },
      {
        fill: {
          type: "radial",
          cx: 0.82,
          cy: 0.12,
          r: 0.72,
          stops: [
            {
              offset: 0,
              color: theme.accent.toLowerCase(),
              opacity: theme.mood === "dark" ? 0.16 : 0.1,
            },
            { offset: 1, color: theme.accent.toLowerCase(), opacity: 0 },
          ],
        },
      },
    ],
    "custom-title:background-gradient"
  );
}

function addFamilyDecoration(pptx, slide, design) {
  const { layoutFamily: family, theme } = design;
  const name = `custom-title:family:${family}`;
  const noLine = { color: theme.accent, transparency: 100 };

  if (family === "centered-rule") {
    slide.addShape(pptx.ShapeType.line, {
      x: 0.65,
      y: 0.65,
      w: LAYOUT.width - 1.3,
      h: 0,
      line: { color: theme.rule, width: 1 },
      objectName: name,
    });
    return;
  }

  if (family === "double-frame") {
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
    return;
  }

  if (family === "ornament-frame") {
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
      [0.46, 0.46],
      [LAYOUT.width - 0.46, 0.46],
      [0.46, LAYOUT.height - 0.46],
      [LAYOUT.width - 0.46, LAYOUT.height - 0.46],
    ].forEach(([x, y]) =>
      slide.addShape(pptx.ShapeType.diamond, {
        x: x - 0.07,
        y: y - 0.07,
        w: 0.14,
        h: 0.14,
        fill: { color: theme.accent },
        line: noLine,
        objectName: "custom-title:ornament",
      })
    );
    return;
  }

  if (family === "side-band") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.34,
      h: LAYOUT.height,
      fill: { color: theme.accent },
      line: noLine,
      objectName: name,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.56,
      y: 0,
      w: 0.06,
      h: LAYOUT.height,
      fill: { color: theme.rule, transparency: 28 },
      line: noLine,
      objectName: "custom-title:side-band-secondary",
    });
    return;
  }

  if (family === "horizon-split") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 4.72,
      w: LAYOUT.width,
      h: LAYOUT.height - 4.72,
      fill: { color: theme.backgroundAccent, transparency: 48 },
      line: noLine,
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
    return;
  }

  if (family === "emblem-crest") {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: LAYOUT.width / 2 - 0.34,
      y: 1.05,
      w: 0.68,
      h: 0.68,
      fill: { color: theme.backgroundAccent, transparency: 22 },
      line: { color: theme.accent, width: 1.3 },
      objectName: name,
    });
    slide.addShape(pptx.ShapeType.diamond, {
      x: LAYOUT.width / 2 - 0.09,
      y: 1.3,
      w: 0.18,
      h: 0.18,
      fill: { color: theme.accent },
      line: noLine,
      objectName: "custom-title:crest-mark",
    });
    return;
  }

  if (family === "veil-panel") {
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
    return;
  }

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
  const slide = pptx.addSlide();
  const { theme } = design;
  const layout = FAMILY_TEXT_LAYOUT[design.layoutFamily];
  const titleFont = theme.titleFont === "serif" ? SERIF : SANS;
  addCatalogBackground(pptx, slide, design);
  addFamilyDecoration(pptx, slide, design);

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
