// Catalog-driven PPTX layouts for Sunday-worship title slides. Legacy designs
// remain in title-slide.js/title-slide-extra.js; this module only draws the
// seven reusable non-legacy families.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  LATIN,
  LAYOUT,
  SANS,
  SERIF,
  addGradientBackground,
} from "./slide-layout.js";
import { isSafeTitleAssetPath } from "./title-slide-design-catalog.js";
import {
  worshipEnFontSize,
  worshipKoFontSize,
} from "./title-slide-text.js";

const FAMILIES = new Set([
  "centered-rule",
  "double-frame",
  "side-band",
  "horizon-split",
  "emblem-crest",
  "veil-panel",
  "corner-mark",
]);

const noLine = (color = "FFFFFF") => ({
  color,
  transparency: 100,
});

function addText(slide, text, options) {
  if (!text) return;
  slide.addText(text, {
    margin: 0,
    breakLine: false,
    valign: "mid",
    ...options,
  });
}

function assetFile(assetPath) {
  return fileURLToPath(new URL(`../public/${assetPath}`, import.meta.url));
}

function addBackground(pptx, slide, design) {
  const { asset, theme } = design;
  slide.background = { color: theme.background };
  const path =
    asset && isSafeTitleAssetPath(asset.path) ? assetFile(asset.path) : null;

  if (path && existsSync(path)) {
    slide.addImage({
      path,
      x: 0,
      y: 0,
      w: LAYOUT.width,
      h: LAYOUT.height,
      objectName: "title-asset:background",
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
      line: noLine(theme.background),
      objectName: "title-rule:asset-veil",
    });
    return;
  }

  addGradientBackground(slide, [
    {
      fill: {
        type: "linear",
        x2: 1,
        y2: 1,
        stops: [
          { offset: 0, color: theme.background },
          { offset: 1, color: theme.backgroundAccent },
        ],
      },
    },
  ]);
}

function line(slide, pptx, name, options, color, width = 1.1) {
  slide.addShape(pptx.ShapeType.line, {
    ...options,
    line: { color, width },
    objectName: name,
  });
}

function addFamilyDecoration(pptx, slide, design) {
  const { layoutFamily: family, theme } = design;
  const name = `title-rule:${family}`;

  if (family === "centered-rule") {
    line(slide, pptx, name, { x: 3.4, y: 1.15, w: 6.5, h: 0 }, theme.rule);
  } else if (family === "double-frame") {
    [0.38, 0.52].forEach((inset, index) => {
      slide.addShape(pptx.ShapeType.rect, {
        x: inset,
        y: inset,
        w: LAYOUT.width - inset * 2,
        h: LAYOUT.height - inset * 2,
        fill: { color: theme.background, transparency: 100 },
        line: { color: theme.rule, width: index === 0 ? 1.5 : 0.75 },
        objectName: index === 0 ? name : "title-rule:double-frame-inner",
      });
    });
  } else if (family === "side-band") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.42,
      h: LAYOUT.height,
      fill: { color: theme.accent },
      line: noLine(theme.accent),
      objectName: name,
    });
  } else if (family === "horizon-split") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 5.55,
      w: LAYOUT.width,
      h: LAYOUT.height - 5.55,
      fill: { color: theme.backgroundAccent, transparency: 16 },
      line: noLine(theme.backgroundAccent),
      objectName: name,
    });
  } else if (family === "emblem-crest") {
    line(slide, pptx, name, { x: 5.4, y: 1.05, w: 2.5, h: 0 }, theme.rule);
  } else if (family === "veil-panel") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 2.4,
      y: 0,
      w: 8.5,
      h: LAYOUT.height,
      fill: { color: theme.background, transparency: 30 },
      line: noLine(theme.background),
      objectName: name,
    });
  } else if (family === "corner-mark") {
    line(slide, pptx, name, { x: 0.55, y: 0.55, w: 1.15, h: 0 }, theme.rule);
    line(
      slide,
      pptx,
      "title-rule:corner-mark-top",
      { x: 0.55, y: 0.55, w: 0, h: 0.75 },
      theme.rule
    );
    line(
      slide,
      pptx,
      "title-rule:corner-mark-bottom",
      { x: LAYOUT.width - 1.7, y: 6.95, w: 1.15, h: 0 },
      theme.rule
    );
    line(
      slide,
      pptx,
      "title-rule:corner-mark-right",
      { x: LAYOUT.width - 0.55, y: 6.2, w: 0, h: 0.75 },
      theme.rule
    );
  }
}

function addMotif(pptx, slide, design) {
  const { id, theme } = design;
  if (id === "lent-veil") {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 0.9,
      w: 0.22,
      h: 5.4,
      rectRadius: 0.08,
      fill: { color: theme.accent },
      line: noLine(theme.accent),
      objectName: "title-motif:lent-veil",
    });
  } else if (id === "palm-procession") {
    slide.addShape(pptx.ShapeType.chevron, {
      x: 11.55,
      y: 0.55,
      w: 1.1,
      h: 1.1,
      rotate: 28,
      fill: { color: theme.accent, transparency: 18 },
      line: noLine(theme.accent),
      objectName: "title-motif:palm",
    });
  } else if (id === "new-year-blessing") {
    slide.addShape(pptx.ShapeType.diamond, {
      x: 6.45,
      y: 0.42,
      w: 0.42,
      h: 0.42,
      fill: { color: theme.accent },
      line: noLine(theme.accent),
      objectName: "title-motif:year-crest",
    });
  }
}

function textLayout(family) {
  if (family === "side-band") {
    return { x: 0.95, w: 11.2, align: "left", koY: 2.25 };
  }
  if (family === "veil-panel") {
    return { x: 2.7, w: 7.9, align: "center", koY: 2.2 };
  }
  if (family === "horizon-split") {
    return { x: 1, w: 11.33, align: "center", koY: 1.85 };
  }
  return { x: 1, w: 11.33, align: "center", koY: 2.25 };
}

function addContent(pptx, slide, design, content) {
  const { theme, layoutFamily } = design;
  const layout = textLayout(layoutFamily);
  const titleFont = theme.titleFont === "serif" ? SERIF : SANS;
  const churchY = layoutFamily === "horizon-split" ? 5.82 : 0.72;
  const dateY = layoutFamily === "horizon-split" ? 6.55 : 6.62;

  addText(slide, content.church, {
    x: layout.x,
    y: churchY,
    w: layout.w,
    h: 0.34,
    align: layout.align,
    fontFace: SANS,
    fontSize: 17,
    bold: true,
    color: theme.muted,
    charSpacing: 2,
    objectName: "title-text:church",
  });
  addText(slide, content.ko, {
    x: layout.x,
    y: layout.koY,
    w: layout.w,
    h: 1.4,
    align: layout.align,
    fontFace: titleFont,
    fontSize: worshipKoFontSize(content.ko, 72, layout.w),
    bold: true,
    color: theme.title,
    charSpacing: 4,
    objectName: "title-text:ko",
  });
  addText(slide, content.subtitle, {
    x: layout.x,
    y: layout.koY + 1.32,
    w: layout.w,
    h: 0.42,
    align: layout.align,
    fontFace: SANS,
    fontSize: 20,
    bold: true,
    color: theme.muted,
    objectName: "title-text:subtitle",
  });

  if (content.en) {
    const dividerWidth = layout.align === "left" ? 1.6 : 2.7;
    const dividerX =
      layout.align === "left"
        ? layout.x
        : layout.x + (layout.w - dividerWidth) / 2;
    line(
      slide,
      pptx,
      "title-rule:en-divider",
      {
        x: dividerX,
        y: layout.koY + 1.9,
        w: dividerWidth,
        h: 0,
      },
      theme.rule
    );
    addText(slide, content.en, {
      x: layout.x,
      y: layout.koY + 2.03,
      w: layout.w,
      h: 0.38,
      align: layout.align,
      fontFace: LATIN,
      fontSize: worshipEnFontSize(content.en, 16, layout.w),
      bold: true,
      color: theme.accent,
      charSpacing: 7,
      objectName: "title-text:en",
    });
  }

  addText(slide, content.koDate, {
    x: layout.x,
    y: dateY,
    w: layout.w,
    h: 0.34,
    align: layout.align,
    fontFace: SANS,
    fontSize: 15,
    color: theme.muted,
    objectName: "title-text:date",
  });
}

export function appendCatalogTitleSlide(pptx, design, content = {}) {
  if (
    !design ||
    design.layoutFamily === "legacy" ||
    !FAMILIES.has(design.layoutFamily)
  ) {
    return false;
  }

  const slide = pptx.addSlide();
  addBackground(pptx, slide, design);
  addFamilyDecoration(pptx, slide, design);
  addMotif(pptx, slide, design);
  addContent(pptx, slide, design, content);
  return true;
}
