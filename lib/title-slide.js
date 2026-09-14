// PPTX renderers for the "타이틀" slide type (Sunday worship cover slides).
// Three designs share one data shape: church name, service date, optional
// subtitle. All coordinates are inches on the 13.333 x 7.5 wide layout.

import {
  LATIN,
  LAYOUT,
  SANS,
  SERIF,
  addGradientBackground,
  centeredText,
  horizontalRule,
  stackCentered,
} from "./slide-layout.js";
import {
  formatServiceDateEn,
  formatServiceDateKo,
  todayIsoDate,
} from "./title-slide-date.js";

export const TITLE_DESIGNS = [
  "chapel",
  "editorial",
  "glow",
  "easter-dawn",
  "easter-stained",
  "christmas-burgundy",
  "christmas-evergreen",
  "thanksgiving",
  "advent",
  "midnight-slab",
  "slate-split",
  "deep-fog",
];

export function normalizeTitleDesign(value) {
  return TITLE_DESIGNS.includes(value) ? value : "chapel";
}

export function defaultTitleKo() {
  return "주일예배";
}

export function defaultTitleEn(design) {
  const id = normalizeTitleDesign(design);
  if (id === "editorial") return "SUNDAY WORSHIP SERVICE";
  if (id === "easter-dawn" || id === "easter-stained") return "EASTER SUNDAY";
  if (id === "christmas-burgundy" || id === "christmas-evergreen") {
    return "CHRISTMAS WORSHIP";
  }
  if (id === "thanksgiving") return "THANKSGIVING";
  if (id === "advent") return "ADVENT SUNDAY";
  return "SUNDAY WORSHIP";
}

export function resolveTitleLine(value, fallback) {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export function worshipKoFontSize(text, base) {
  const length = [...(text || "").trim()].length;
  if (length <= 4) return base;
  if (length <= 6) return Math.round(base * 0.82);
  if (length <= 9) return Math.round(base * 0.68);
  if (length <= 13) return Math.round(base * 0.54);
  return Math.round(base * 0.42);
}

export function worshipEnFontSize(text, base) {
  const length = (text || "").trim().length;
  if (length <= 16) return base;
  if (length <= 28) return Math.max(11, base - 2);
  return Math.max(10, base - 4);
}

export function buildTitleContent(slide) {
  const design = normalizeTitleDesign(slide?.titleDesign);
  const iso =
    typeof slide?.serviceDate === "string" && slide.serviceDate.trim()
      ? slide.serviceDate.trim()
      : todayIsoDate();
  const showDate = slide?.showDate !== false;
  const ko = resolveTitleLine(slide?.titleKo, defaultTitleKo());
  const en = resolveTitleLine(slide?.titleEn, defaultTitleEn(design));
  return {
    church: (slide?.churchName || "").trim(),
    subtitle: (slide?.titleSubtitle || "").trim(),
    ko,
    en,
    koDate: showDate ? formatServiceDateKo(iso) : "",
    enDate: showDate ? formatServiceDateEn(iso) : "",
  };
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
    content.ko && {
      h: 1.55,
      gap: content.subtitle ? 0.2 : 0.28,
      draw: (y) =>
        centeredText(slide, content.ko, {
          y,
          h: 1.55,
          fontFace: SERIF,
          fontSize: worshipKoFontSize(content.ko, 96),
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
    content.en && {
      h: 0.34,
      gap: 0.3,
      draw: (y) =>
        centeredText(slide, content.en, {
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

  if (content.ko) {
    slide.addText(content.ko, {
      x: 0.95,
      y: 2.45,
      w: 10.5,
      h: 1.75,
      fontFace: SANS,
      fontSize: worshipKoFontSize(content.ko, 112),
      bold: true,
      color: EDITORIAL.ink,
      align: "left",
      valign: "mid",
      margin: 0,
    });
  }

  slide.addShape(pptx.ShapeType.line, {
    x: 1.05,
    y: 4.52,
    w: 4.4,
    h: 0,
    line: { color: EDITORIAL.hair, width: 1 },
  });

  if (content.en) {
    slide.addText(content.en, {
      x: 1.02,
      y: 4.68,
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
  }

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

function buildGlowBackgroundLayers() {
  return [
    {
      fill: {
        type: "linear",
        x2: 1,
        y2: 1,
        stops: [
          { offset: 0, color: "0b1a33" },
          { offset: 1, color: "1c2f52" },
        ],
      },
    },
    {
      fill: {
        type: "radial",
        cx: 0.8,
        cy: 0.14,
        r: 0.62,
        stops: [
          { offset: 0, color: "f2c15b", opacity: 0.22 },
          { offset: 1, color: "f2c15b", opacity: 0 },
        ],
      },
    },
  ];
}

function addGlowSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: GLOW.bg };

  addGradientBackground(slide, buildGlowBackgroundLayers());

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

  if (content.ko === "주일예배") {
    const letters = ["주", "일", "예", "배"];
    const cell = 1.3;
    const gap = 0.06;
    const startX =
      (LAYOUT.width - (letters.length * cell + (letters.length - 1) * gap)) / 2;

    letters.forEach((letter, index) => {
      slide.addText(letter, {
        x: startX + index * (cell + gap),
        y: index % 2 === 1 ? 2.29 : 1.95,
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
  } else if (content.ko) {
    centeredText(slide, content.ko, {
      y: 1.95,
      h: 1.79,
      fontFace: SERIF,
      fontSize: worshipKoFontSize(content.ko, 88),
      bold: true,
      color: "FFFFFF",
    });
  }

  const ruleWidth = 4.6;
  const ruleY = 4.3;
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

  if (content.en) {
    centeredText(slide, content.en, {
      y: 4.46,
      h: 0.44,
      fontFace: LATIN,
      fontSize: 17,
      bold: true,
      color: GLOW.latin,
      charSpacing: 9,
    });
  }

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
  const content = buildTitleContent(slide);
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
