// Geometry for the catalog-driven Sunday-worship title families, shared by the
// PPTX renderer and the browser preview so a picker card matches the export.
//
// Nothing here imports anything: the module has to stay reachable from the
// browser bundle, which rules out the node-only rasterizer slide-layout.js
// pulls in.

export const SLIDE = { width: 13.333, height: 7.5 };

/** Decoration metrics a family shares with its content box. */
export const HORIZON_Y = 5.4;
export const VEIL_PANEL = { x: (SLIDE.width - 8.13) / 2, w: 8.13 };
export const BANNER = { x: 0.95, y: 2.1, w: SLIDE.width - 1.9, h: 3.3 };
export const COLUMN = { w: 4.45, pad: 0.95, markWidth: 1.1 };
export const ARCH = { x: 3.55, y: 0.62, w: 6.23, h: 6.26, inset: 0.34 };
export const FRAME = { outer: 0.42, inner: 0.58 };
export const SIDE_BAND = { w: 0.5 };
export const CORNER = { inset: 0.52, arm: 1.05, drop: 0.72 };
export const FOOTER = { ruleY: 6.22, textY: 6.45 };
export const EDGES = { churchY: 0.9, dateY: 6.26 };
export const GALLERY_RAIL = { x: 4.83, y: 6.12, w: 3.67, dot: 0.1 };
export const PORTAL = {
  left: { x: 0, y: 0.42, w: 1.72, h: 6.66 },
  right: { x: 11.18, y: 0, w: 2.153, h: 7.5 },
};
export const EDITORIAL_INDEX = {
  w: 3.18,
  dividerX: 3.18,
  dividerY: 0.72,
  dividerH: 6.06,
  pad: 0.62,
};

/** Point values for `charSpacing`; a family may widen them for effect. */
export const DEFAULT_TRACKING = { church: 2, ko: 4, en: 7, date: 0 };

// `x`/`w` bound the copy column, `top`/`bottom` the band the stack is centred
// in. `zone` moves the church line and the date out of the stack into a slot
// the family owns, which is what keeps the asymmetric families balanced.
export const TITLE_SLIDE_COMPOSITIONS = {
  "centered-rule": { x: 1.15, w: 11.03, align: "center", top: 0.9, bottom: 6.6 },
  "double-frame": { x: 1.7, w: 9.93, align: "center", top: 1.15, bottom: 6.35 },
  "emblem-crest": { x: 1.15, w: 11.03, align: "center", top: 0.95, bottom: 6.55 },
  "veil-panel": {
    x: VEIL_PANEL.x + 0.5,
    w: VEIL_PANEL.w - 1,
    align: "center",
    top: 1.05,
    bottom: 6.45,
  },
  "arch-window": { x: 4.05, w: 5.23, align: "center", top: 1.6, bottom: 6.2 },
  "duo-rule": { x: 1.35, w: 10.63, align: "center", top: 1, bottom: 6.5 },
  "corner-mark": { x: 1.6, w: 10.13, align: "center", top: 1.3, bottom: 6.2 },
  // Nothing but type: the church line and date sit on the slide's edges and
  // the title holds the optical centre, so the margins do the framing.
  "open-margin": {
    x: 1.5,
    w: 10.33,
    align: "center",
    top: 1.9,
    bottom: 5.6,
    zone: "edges",
    tracking: { church: 6, ko: 9, en: 9, date: 4 },
  },
  "gallery-rail": {
    x: 1.5,
    w: 10.33,
    align: "center",
    top: 1.35,
    bottom: 5.72,
    zone: "rail",
    tracking: { church: 5, ko: 7, en: 8, date: 3 },
  },
  "portal-offset": {
    x: 2.15,
    w: 9.03,
    align: "center",
    top: 1.25,
    bottom: 6.18,
    zone: "portal",
    tracking: { church: 3, ko: 5, en: 8, date: 1 },
  },
  "editorial-index": {
    x: 3.85,
    w: 8.48,
    align: "left",
    top: 1.2,
    bottom: 6.3,
    zone: "index",
    tracking: { church: 2, ko: 3, en: 6, date: 0 },
  },
  "banner-block": {
    x: 1.5,
    w: 10.33,
    align: "center",
    top: BANNER.y,
    bottom: BANNER.y + BANNER.h,
    zone: "banner",
  },
  "horizon-split": {
    x: 1.5,
    w: 10.33,
    align: "center",
    top: 0.8,
    bottom: HORIZON_Y,
    zone: "band",
  },
  "side-band": {
    x: 1.45,
    w: 10.45,
    align: "left",
    top: 1.2,
    bottom: 5.95,
    zone: "footer",
  },
  "column-split": {
    x: COLUMN.w + 1.05,
    w: SLIDE.width - COLUMN.w - 2.15,
    align: "left",
    top: 1.2,
    bottom: 6.3,
    zone: "column",
  },
};

export const TITLE_SLIDE_FAMILIES = Object.keys(TITLE_SLIDE_COMPOSITIONS);

/** The ornament a centred family wears between its church line and title. */
const MARKS = {
  "centered-rule": { h: 0.02, gap: 0.36, w: 2.6 },
  "emblem-crest": { h: 0.26, gap: 0.34, w: 1.18, gemGap: 0.32 },
};

export function titleSlideComposition(family) {
  return TITLE_SLIDE_COMPOSITIONS[family] || null;
}

export function titleSlideMark(family) {
  return MARKS[family] || null;
}

export function titleSlideTracking(family) {
  return {
    ...DEFAULT_TRACKING,
    ...(TITLE_SLIDE_COMPOSITIONS[family]?.tracking || {}),
  };
}

/**
 * Positions one measured stack centred between `top` and `bottom`. The gap of
 * the last block is dropped, so an omitted subtitle or date closes its own
 * space instead of leaving a hole.
 */
export function centerStack(blocks, top, bottom) {
  const span = (block, index) =>
    block.h + (index < blocks.length - 1 ? block.gap || 0 : 0);
  const total = blocks.reduce((sum, block, index) => sum + span(block, index), 0);

  let y = top + (bottom - top - total) / 2;
  return blocks.map((block, index) => {
    const placed = { ...block, y };
    y += span(block, index);
    return placed;
  });
}

/**
 * The placed copy blocks for one design. `content` only has to say which lines
 * are present; `koSize` is the resolved Korean title size in points.
 */
export function titleSlideStack(family, content, koSize) {
  const box = TITLE_SLIDE_COMPOSITIONS[family];
  if (!box) return [];

  const blocks = [];
  const add = (kind, h, gap) => blocks.push({ kind, h, gap });

  if (family === "duo-rule") add("bracket-top", 0.02, 0.38);
  if (!box.zone && content.church) add("church", 0.34, 0.3);

  const mark = MARKS[family];
  if (mark) add("mark", mark.h, mark.gap);

  if (content.ko) {
    add("ko", (koSize / 72) * 1.42, content.subtitle ? 0.14 : 0.3);
  }
  if (content.subtitle) add("subtitle", 0.42, 0.32);
  if (content.en) {
    add("en-divider", 0.02, 0.24);
    add("en", 0.36, 0.46);
  }
  if (!box.zone && content.koDate) add("date", 0.34, 0.38);
  if (family === "duo-rule") add("bracket-bottom", 0.02, 0);

  return centerStack(blocks, box.top, box.bottom);
}

/** Church line and date for the zones that centre them in a slot of their own. */
export function titleSlideZoneStack(family, content) {
  const box = TITLE_SLIDE_COMPOSITIONS[family];
  if (box?.zone === "rail") {
    return [
      content.church && {
        kind: "church",
        x: 1.5,
        y: 0.72,
        w: 10.33,
        h: 0.34,
        align: "center",
      },
      content.koDate && {
        kind: "date",
        x: GALLERY_RAIL.x,
        y: 6.48,
        w: GALLERY_RAIL.w,
        h: 0.34,
        align: "center",
      },
    ].filter(Boolean);
  }
  if (box?.zone === "portal") {
    return [
      content.church && {
        kind: "church",
        x: 0.62,
        y: 0.68,
        w: 3.25,
        h: 0.34,
        align: "left",
      },
      content.koDate && {
        kind: "date",
        x: 9.36,
        y: 6.48,
        w: 3.35,
        h: 0.34,
        align: "right",
      },
    ].filter(Boolean);
  }
  if (box?.zone === "index") {
    return [
      content.church && {
        kind: "church",
        x: EDITORIAL_INDEX.pad,
        y: 1.15,
        w: EDITORIAL_INDEX.w - EDITORIAL_INDEX.pad * 2,
        h: 0.5,
        align: "left",
        fontSize: 14,
      },
      content.koDate && {
        kind: "date",
        x: EDITORIAL_INDEX.pad,
        y: 5.92,
        w: EDITORIAL_INDEX.w - EDITORIAL_INDEX.pad * 2,
        h: 0.5,
        align: "left",
        fontSize: 11,
      },
    ].filter(Boolean);
  }
  if (box?.zone === "edges") {
    return [
      content.church && { kind: "church", h: 0.34, y: EDGES.churchY },
      content.koDate && { kind: "date", h: 0.34, y: EDGES.dateY },
    ].filter(Boolean);
  }
  if (box?.zone === "band") {
    return centerStack(
      [
        content.church && { kind: "church", h: 0.34, gap: 0.26 },
        content.koDate && { kind: "date", h: 0.34, gap: 0 },
      ].filter(Boolean),
      HORIZON_Y,
      SLIDE.height
    );
  }
  if (box?.zone === "banner") {
    return [
      ...centerStack(
        content.church ? [{ kind: "church", h: 0.34, gap: 0 }] : [],
        0.6,
        BANNER.y
      ),
      ...centerStack(
        content.koDate ? [{ kind: "date", h: 0.34, gap: 0 }] : [],
        BANNER.y + BANNER.h,
        SLIDE.height - 0.6
      ),
    ];
  }
  return [];
}
