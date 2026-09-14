// Catalog-driven PPTX layouts for Sunday-worship title slides. Legacy designs
// remain in title-slide.js/title-slide-extra.js; this module draws the reusable
// reusable non-legacy families.
//
// Geometry lives in title-slide-layout.js because the browser preview draws
// the same compositions. Here we only turn placed blocks into shapes.

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
  ARCH,
  BANNER,
  COLUMN,
  CORNER,
  EDITORIAL_INDEX,
  FOOTER,
  FRAME,
  GALLERY_RAIL,
  HORIZON_Y,
  PORTAL,
  SIDE_BAND,
  TITLE_SLIDE_FAMILIES,
  VEIL_PANEL,
  titleSlideComposition,
  titleSlideMark,
  titleSlideStack,
  titleSlideTracking,
  titleSlideZoneStack,
} from "./title-slide-layout.js";
import {
  worshipEnFontSize,
  worshipKoFontSize,
} from "./title-slide-text.js";

const FAMILIES = new Set(TITLE_SLIDE_FAMILIES);

const CHURCH_STYLE = { fontFace: SANS, fontSize: 17, bold: true };

const DATE_STYLE = { fontFace: SANS, fontSize: 15 };

const noLine = (color = "FFFFFF") => ({ color, transparency: 100 });

function addText(slide, text, options) {
  if (!text) return;
  slide.addText(text, {
    margin: 0,
    breakLine: false,
    valign: "mid",
    ...options,
  });
}

function rule(slide, pptx, name, { x, y, w, h = 0 }, color, width = 1.1) {
  slide.addShape(pptx.ShapeType.line, {
    x,
    y,
    w,
    h,
    line: { color, width },
    objectName: name,
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

/** Decoration behind the copy; the inline marks are drawn with the stack. */
function addFamilyDecoration(pptx, slide, design) {
  const { layoutFamily: family, theme } = design;
  const name = `title-rule:${family}`;

  if (family === "double-frame") {
    [FRAME.outer, FRAME.inner].forEach((inset, index) => {
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
      w: SIDE_BAND.w,
      h: LAYOUT.height,
      fill: { color: theme.accent },
      line: noLine(theme.accent),
      objectName: name,
    });
  } else if (family === "horizon-split") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: HORIZON_Y,
      w: LAYOUT.width,
      h: LAYOUT.height - HORIZON_Y,
      fill: { color: theme.backgroundAccent, transparency: 18 },
      line: noLine(theme.backgroundAccent),
      objectName: name,
    });
    rule(
      slide,
      pptx,
      "title-rule:horizon-split-edge",
      { x: 0, y: HORIZON_Y, w: LAYOUT.width },
      theme.rule,
      0.75
    );
  } else if (family === "veil-panel") {
    // Edgeless on purpose: a hard rule down each side reads as a box rather
    // than a veil, especially over a photograph.
    slide.addShape(pptx.ShapeType.rect, {
      x: VEIL_PANEL.x,
      y: 0,
      w: VEIL_PANEL.w,
      h: LAYOUT.height,
      fill: { color: theme.background, transparency: 28 },
      line: noLine(theme.background),
      objectName: name,
    });
  } else if (family === "corner-mark") {
    const right = LAYOUT.width - CORNER.inset;
    const bottom = LAYOUT.height - CORNER.inset;
    [
      { id: "tl", x: CORNER.inset, y: CORNER.inset, arm: 1, drop: 1 },
      { id: "tr", x: right, y: CORNER.inset, arm: -1, drop: 1 },
      { id: "bl", x: CORNER.inset, y: bottom, arm: 1, drop: -1 },
      { id: "br", x: right, y: bottom, arm: -1, drop: -1 },
    ].forEach((corner, index) => {
      const armEnd = corner.x + corner.arm * CORNER.arm;
      const dropEnd = corner.y + corner.drop * CORNER.drop;
      rule(
        slide,
        pptx,
        index === 0 ? name : `title-rule:corner-mark-${corner.id}`,
        { x: Math.min(corner.x, armEnd), y: corner.y, w: CORNER.arm },
        theme.rule
      );
      rule(
        slide,
        pptx,
        `title-rule:corner-mark-${corner.id}-drop`,
        {
          x: corner.x,
          y: Math.min(corner.y, dropEnd),
          w: 0,
          h: CORNER.drop,
        },
        theme.rule
      );
    });
  } else if (family === "banner-block") {
    slide.addShape(pptx.ShapeType.rect, {
      x: BANNER.x,
      y: BANNER.y,
      w: BANNER.w,
      h: BANNER.h,
      fill: { color: theme.backgroundAccent, transparency: 20 },
      line: { color: theme.rule, width: 0.75 },
      objectName: name,
    });
  } else if (family === "column-split") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: COLUMN.w,
      h: LAYOUT.height,
      fill: { color: theme.backgroundAccent, transparency: 12 },
      line: noLine(theme.backgroundAccent),
      objectName: name,
    });
    rule(
      slide,
      pptx,
      "title-rule:column-split-edge",
      { x: COLUMN.w, y: 0, w: 0, h: LAYOUT.height },
      theme.rule,
      0.9
    );
  } else if (family === "arch-window") {
    [0, ARCH.inset].forEach((inset, index) => {
      slide.addShape(pptx.ShapeType.round2SameRect, {
        x: ARCH.x + inset,
        y: ARCH.y + inset,
        w: ARCH.w - inset * 2,
        h: ARCH.h - inset * 2,
        fill: { color: theme.background, transparency: 100 },
        line: {
          color: theme.rule,
          width: index === 0 ? 1.5 : 0.75,
          transparency: index === 0 ? 18 : 45,
        },
        objectName: index === 0 ? name : "title-rule:arch-window-inner",
      });
    });
  } else if (family === "gallery-rail") {
    rule(
      slide,
      pptx,
      name,
      { x: GALLERY_RAIL.x, y: GALLERY_RAIL.y, w: GALLERY_RAIL.w },
      theme.rule,
      1
    );
    slide.addShape(pptx.ShapeType.ellipse, {
      x: GALLERY_RAIL.x + GALLERY_RAIL.w - GALLERY_RAIL.dot / 2,
      y: GALLERY_RAIL.y - GALLERY_RAIL.dot / 2,
      w: GALLERY_RAIL.dot,
      h: GALLERY_RAIL.dot,
      fill: { color: theme.accent },
      line: noLine(theme.accent),
      objectName: "title-rule:gallery-rail-end",
    });
  } else if (family === "portal-offset") {
    [PORTAL.left, PORTAL.right].forEach((panel, index) => {
      slide.addShape(pptx.ShapeType.rect, {
        ...panel,
        fill: {
          color: index === 0 ? theme.backgroundAccent : theme.accent,
          transparency: index === 0 ? 34 : 72,
        },
        line: noLine(theme.backgroundAccent),
        objectName: index === 0 ? name : "title-rule:portal-offset-right",
      });
    });
  } else if (family === "editorial-index") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: EDITORIAL_INDEX.w,
      h: LAYOUT.height,
      fill: { color: theme.backgroundAccent, transparency: 6 },
      line: noLine(theme.backgroundAccent),
      objectName: name,
    });
    rule(
      slide,
      pptx,
      "title-rule:editorial-index-divider",
      {
        x: EDITORIAL_INDEX.dividerX,
        y: EDITORIAL_INDEX.dividerY,
        w: 0,
        h: EDITORIAL_INDEX.dividerH,
      },
      theme.rule,
      0.8
    );
  }
}

function addMark(pptx, slide, design, box, block) {
  const { layoutFamily: family, theme } = design;
  const name = `title-rule:${family}`;
  const mark = titleSlideMark(family);
  const center = box.x + box.w / 2;

  if (family === "centered-rule") {
    rule(
      slide,
      pptx,
      name,
      { x: center - mark.w / 2, y: block.y, w: mark.w },
      theme.rule,
      1.25
    );
    return;
  }

  slide.addShape(pptx.ShapeType.diamond, {
    x: center - block.h / 2,
    y: block.y,
    w: block.h,
    h: block.h,
    fill: { color: theme.accent },
    line: noLine(theme.accent),
    objectName: name,
  });
  [-mark.gemGap - mark.w, mark.gemGap].forEach((offset, index) =>
    rule(
      slide,
      pptx,
      `title-rule:emblem-crest-${index}`,
      { x: center + offset, y: block.y + block.h / 2, w: mark.w },
      theme.rule,
      0.9
    )
  );
}

/** Church line and date for the families that park them outside the stack. */
function addZoneCopy(pptx, slide, design, content, box) {
  const { theme, layoutFamily: family } = design;
  const tracking = titleSlideTracking(family);
  const church = (y, options) =>
    addText(slide, content.church, {
      h: 0.34,
      y,
      color: theme.muted,
      charSpacing: tracking.church,
      ...CHURCH_STYLE,
      ...options,
      objectName: "title-text:church",
    });
  const date = (y, options) =>
    addText(slide, content.koDate, {
      h: 0.34,
      y,
      color: theme.muted,
      charSpacing: tracking.date,
      ...DATE_STYLE,
      ...options,
      objectName: "title-text:date",
    });

  if (
    ["band", "banner", "edges", "rail", "portal", "index"].includes(
      box.zone
    )
  ) {
    const centred = { x: box.x, w: box.w, align: "center" };
    titleSlideZoneStack(family, content).forEach((block) => {
      const { kind, y, ...placement } = block;
      const slot = {
        ...centred,
        ...placement,
        ...(block.fontSize ? { fontSize: block.fontSize } : {}),
      };
      if (kind === "church") church(y, slot);
      else date(y, slot);
    });
    return;
  }

  if (box.zone === "footer") {
    if (content.church || content.koDate) {
      rule(
        slide,
        pptx,
        "title-rule:footer",
        { x: box.x, y: FOOTER.ruleY, w: box.w },
        theme.rule,
        0.75
      );
    }
    church(FOOTER.textY, { x: box.x, w: box.w / 2, align: "left" });
    date(FOOTER.textY, {
      x: box.x + box.w / 2,
      w: box.w / 2,
      align: "right",
    });
    return;
  }

  const column = { x: COLUMN.pad, w: COLUMN.w - COLUMN.pad * 2, align: "left" };
  church(1.2, column);
  if (content.church) {
    rule(
      slide,
      pptx,
      "title-rule:column-split-mark",
      { x: column.x, y: 1.72, w: COLUMN.markWidth },
      theme.rule
    );
  }
  date(5.9, column);
}

function addContent(pptx, slide, design, content) {
  const { theme, layoutFamily: family } = design;
  const box = titleSlideComposition(family);
  const titleFont = theme.titleFont === "serif" ? SERIF : SANS;
  const tracking = titleSlideTracking(family);
  const koSize = worshipKoFontSize(content.ko, 72, box.w);
  const column = { x: box.x, w: box.w, align: box.align };
  const dividerWidth = box.align === "left" ? 1.6 : 2.7;
  const dividerX =
    box.align === "left" ? box.x : box.x + (box.w - dividerWidth) / 2;

  const draw = {
    "bracket-top": (block) =>
      rule(
        slide,
        pptx,
        "title-rule:duo-rule",
        { x: box.x, y: block.y, w: box.w },
        theme.rule,
        0.9
      ),
    "bracket-bottom": (block) =>
      rule(
        slide,
        pptx,
        "title-rule:duo-rule-lower",
        { x: box.x, y: block.y, w: box.w },
        theme.rule,
        0.9
      ),
    church: (block) =>
      addText(slide, content.church, {
        ...column,
        y: block.y,
        h: block.h,
        color: theme.muted,
        charSpacing: tracking.church,
        ...CHURCH_STYLE,
        objectName: "title-text:church",
      }),
    mark: (block) => addMark(pptx, slide, design, box, block),
    ko: (block) =>
      addText(slide, content.ko, {
        ...column,
        y: block.y,
        h: block.h,
        fontFace: titleFont,
        fontSize: koSize,
        bold: true,
        color: theme.title,
        charSpacing: tracking.ko,
        objectName: "title-text:ko",
      }),
    subtitle: (block) =>
      addText(slide, content.subtitle, {
        ...column,
        y: block.y,
        h: block.h,
        fontFace: SANS,
        fontSize: 20,
        bold: true,
        color: theme.muted,
        objectName: "title-text:subtitle",
      }),
    "en-divider": (block) =>
      rule(
        slide,
        pptx,
        "title-rule:en-divider",
        { x: dividerX, y: block.y, w: dividerWidth },
        theme.rule
      ),
    en: (block) =>
      addText(slide, content.en, {
        ...column,
        y: block.y,
        h: block.h,
        fontFace: LATIN,
        fontSize: worshipEnFontSize(content.en, 16, box.w),
        bold: true,
        color: theme.accent,
        charSpacing: tracking.en,
        objectName: "title-text:en",
      }),
    date: (block) =>
      addText(slide, content.koDate, {
        ...column,
        y: block.y,
        h: block.h,
        color: theme.muted,
        charSpacing: tracking.date,
        ...DATE_STYLE,
        objectName: "title-text:date",
      }),
  };

  titleSlideStack(family, content, koSize).forEach((block) =>
    draw[block.kind](block)
  );
  if (box.zone) addZoneCopy(pptx, slide, design, content, box);
}

/** Per-design ornaments; kept separate so a family stays reusable. */
function addMotif(pptx, slide, design) {
  const { id, theme } = design;
  if (id === "lent-veil") {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 1.18,
      y: 1.6,
      w: 0.22,
      h: 4.3,
      rectRadius: 0.08,
      fill: { color: theme.accent },
      line: noLine(theme.accent),
      objectName: "title-motif:lent-veil",
    });
  } else if (id === "palm-procession") {
    slide.addShape(pptx.ShapeType.chevron, {
      x: 11.45,
      y: 0.62,
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
