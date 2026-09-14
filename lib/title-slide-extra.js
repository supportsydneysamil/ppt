// Seasonal and dark PPTX renderers for Sunday worship title slides.
// All geometry is in inches on the 13.333 x 7.5 wide layout. Motifs are
// deliberately emitted as independent named shapes so they remain editable.

import {
  LATIN,
  LAYOUT,
  SANS,
  SERIF,
  addGradientBackground,
} from "./slide-layout.js";
import {
  worshipEnFontSize,
  worshipKoFontSize,
} from "./title-slide-text.js";

const noLine = (color = "FFFFFF") => ({ color, transparency: 100 });

function addNamedShape(slide, pptx, type, objectName, options) {
  slide.addShape(type, { ...options, objectName });
}

function addText(slide, text, options) {
  if (!text) return;
  slide.addText(text, {
    margin: 0,
    valign: "mid",
    ...options,
  });
}

function addLinearBackground(slide, start, end, extraLayers = []) {
  slide.background = { color: start };
  addGradientBackground(slide, [
    {
      fill: {
        type: "linear",
        x2: 1,
        y2: 1,
        stops: [
          { offset: 0, color: start },
          { offset: 1, color: end },
        ],
      },
    },
    ...extraLayers,
  ]);
}

function addCenteredText(slide, text, options) {
  addText(slide, text, {
    x: 0,
    w: LAYOUT.width,
    align: "center",
    ...options,
  });
}

function addEasterDawnSlide(pptx, content) {
  const slide = pptx.addSlide();
  addLinearBackground(slide, "FFFBF2", "F3DCBD");

  addNamedShape(slide, pptx, pptx.ShapeType.ellipse, "title-motif:sun", {
    x: 5.55,
    y: -0.35,
    w: 2.2,
    h: 2.2,
    fill: { color: "FFF0CD" },
    line: noLine("FFF0CD"),
  });

  const rays = [
    { x: 4.05, y: 0.9, w: 0.14, h: 0.92, rotate: 235 },
    { x: 4.72, y: 1.28, w: 0.14, h: 0.82, rotate: 220 },
    { x: 5.32, y: 1.62, w: 0.13, h: 0.7, rotate: 200 },
    { x: 6.585, y: 1.82, w: 0.13, h: 0.62, rotate: 180 },
    { x: 7.88, y: 1.62, w: 0.13, h: 0.7, rotate: 160 },
    { x: 8.48, y: 1.28, w: 0.14, h: 0.82, rotate: 140 },
    { x: 9.14, y: 0.9, w: 0.14, h: 0.92, rotate: 125 },
  ];
  rays.forEach((geometry, index) => {
    addNamedShape(
      slide,
      pptx,
      pptx.ShapeType.triangle,
      `title-motif:ray-${index}`,
      {
        ...geometry,
        fill: { color: "D6A44A", transparency: 82 },
        line: noLine("D6A44A"),
      }
    );
  });

  addText(slide, content.church, {
    x: 0.8,
    y: 0.58,
    w: 11.733,
    h: 0.32,
    fontFace: SANS,
    fontSize: 18,
    bold: true,
    color: "9A7B45",
    align: "center",
    charSpacing: 3,
  });
  addCenteredText(slide, content.ko, {
    y: 1.15,
    h: 1.45,
    fontFace: SERIF,
    fontSize: worshipKoFontSize(content.ko, 72),
    bold: true,
    color: "4A3617",
  });
  addNamedShape(slide, pptx, pptx.ShapeType.line, "title-rule:divider", {
    x: (LAYOUT.width - 4) / 2,
    y: 2.75,
    w: 4,
    h: 0,
    line: { color: "B48C4A", width: 1 },
  });
  addCenteredText(slide, content.en, {
    y: 2.9,
    h: 0.34,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 16),
    bold: true,
    color: "9A7B45",
    charSpacing: 6,
  });
  addCenteredText(slide, content.subtitle, {
    y: 3.42,
    h: 0.38,
    fontFace: SANS,
    fontSize: 18,
    color: "6A522B",
  });
  addNamedShape(slide, pptx, pptx.ShapeType.line, "title-rule:horizon", {
    x: 1.1,
    y: 6.05,
    w: 11.1,
    h: 0,
    line: { color: "B48C4A", width: 1 },
  });
  addCenteredText(slide, content.koDate, {
    y: 6.35,
    h: 0.4,
    fontFace: SANS,
    fontSize: 19,
    color: "6A522B",
  });
}

function addEasterStainedSlide(pptx, content) {
  const slide = pptx.addSlide();
  addLinearBackground(slide, "0B1A33", "322055", [
    {
      fill: {
        type: "radial",
        cx: 0.5,
        cy: 0.44,
        r: 0.58,
        stops: [
          { offset: 0, color: "8A5CC7", opacity: 0.28 },
          { offset: 1, color: "8A5CC7", opacity: 0 },
        ],
      },
    },
  ]);

  addNamedShape(
    slide,
    pptx,
    pptx.ShapeType.round2SameRect,
    "title-motif:arch-outer",
    {
      x: 3.55,
      y: 0.45,
      w: 6.23,
      h: 6.15,
      fill: { color: "0B1A33", transparency: 100 },
      line: { color: "F2C15B", width: 1.5, transparency: 50 },
    }
  );
  addNamedShape(
    slide,
    pptx,
    pptx.ShapeType.round2SameRect,
    "title-motif:arch-inner",
    {
      x: 3.97,
      y: 0.87,
      w: 5.39,
      h: 5.31,
      fill: { color: "0B1A33", transparency: 100 },
      line: { color: "F2C15B", width: 1.5, transparency: 50 },
    }
  );

  addCenteredText(slide, content.subtitle, {
    y: 1.72,
    h: 0.36,
    fontFace: SANS,
    fontSize: 17,
    bold: true,
    color: "F2C15B",
    charSpacing: 3,
  });
  addText(slide, content.ko, {
    x: 4.2,
    y: 2.35,
    w: 4.93,
    h: 1.25,
    fontFace: SERIF,
    fontSize: worshipKoFontSize(content.ko, 64, 4.93),
    bold: true,
    color: "FFFFFF",
    align: "center",
  });
  addCenteredText(slide, content.en, {
    y: 3.95,
    h: 0.42,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 17),
    bold: true,
    color: "E4D4FF",
    charSpacing: 7,
  });
  addCenteredText(slide, content.koDate, {
    y: 4.55,
    h: 0.4,
    fontFace: SANS,
    fontSize: 18,
    color: "E9DFC8",
  });
  addCenteredText(slide, content.church, {
    y: 6.55,
    h: 0.34,
    fontFace: SANS,
    fontSize: 17,
    bold: true,
    color: "C9B8F0",
    charSpacing: 3,
  });
}

function addChristmasBurgundySlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: "2A0F16" };

  addNamedShape(slide, pptx, pptx.ShapeType.rect, "title-rule:spine", {
    x: 0,
    y: 0,
    w: 0.12,
    h: 7.5,
    fill: { color: "D9B376" },
    line: noLine("D9B376"),
  });
  addNamedShape(
    slide,
    pptx,
    pptx.ShapeType.star5,
    "title-motif:star-large",
    {
      x: 8.7,
      y: 1.85,
      w: 3.4,
      h: 3.4,
      fill: { color: "D9B376", transparency: 78 },
      line: noLine("D9B376"),
    }
  );

  const left = { x: 1.15, w: 6.75, align: "left" };
  addText(slide, content.church, {
    ...left,
    y: 1.18,
    h: 0.34,
    fontFace: SANS,
    fontSize: 18,
    bold: true,
    color: "D9B376",
    charSpacing: 3,
  });
  addText(slide, content.ko, {
    ...left,
    y: 2.0,
    h: 1.25,
    fontFace: SERIF,
    fontSize: worshipKoFontSize(content.ko, 68),
    bold: true,
    color: "F7EBDA",
  });
  addNamedShape(slide, pptx, pptx.ShapeType.line, "title-rule:divider", {
    x: 1.15,
    y: 3.55,
    w: 3.2,
    h: 0,
    line: { color: "D9B376", width: 1.25 },
  });
  addText(slide, content.en, {
    ...left,
    y: 3.74,
    h: 0.38,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 17),
    bold: true,
    color: "D9B376",
    charSpacing: 6,
  });
  addText(slide, content.subtitle, {
    ...left,
    y: 4.3,
    h: 0.38,
    fontFace: SANS,
    fontSize: 18,
    color: "E4D8C8",
  });
  addText(slide, content.koDate, {
    ...left,
    y: 5.55,
    h: 0.4,
    fontFace: SANS,
    fontSize: 19,
    color: "E4D8C8",
  });
}

function addChristmasEvergreenSlide(pptx, content) {
  const slide = pptx.addSlide();
  addLinearBackground(slide, "07140C", "12301C");

  [
    { x: 1.0, y: 0.65, size: 0.22 },
    { x: 10.75, y: 0.82, size: 0.3 },
    { x: 11.8, y: 1.48, size: 0.18 },
  ].forEach(({ x, y, size }, index) => {
    addNamedShape(
      slide,
      pptx,
      pptx.ShapeType.star4,
      `title-motif:star-small-${index}`,
      {
        x,
        y,
        w: size,
        h: size,
        fill: { color: "D9B376" },
        line: noLine("D9B376"),
      }
    );
  });

  [
    { x: -0.25, y: 5.75, w: 3.15, h: 2.15, color: "07180D" },
    { x: 2.25, y: 6.05, w: 2.55, h: 1.7, color: "0A2012" },
    { x: 4.65, y: 5.65, w: 3.55, h: 2.25, color: "07180D" },
    { x: 7.65, y: 5.95, w: 2.85, h: 1.9, color: "0A2012" },
    { x: 10.15, y: 5.6, w: 3.45, h: 2.3, color: "07180D" },
  ].forEach(({ color, ...geometry }, index) => {
    addNamedShape(
      slide,
      pptx,
      pptx.ShapeType.triangle,
      `title-motif:tree-${index}`,
      {
        ...geometry,
        fill: { color },
        line: noLine(color),
      }
    );
  });

  addCenteredText(slide, content.church, {
    y: 1.4,
    h: 0.34,
    fontFace: SANS,
    fontSize: 18,
    bold: true,
    color: "D9B376",
    charSpacing: 3,
  });
  addCenteredText(slide, content.ko, {
    y: 2.0,
    h: 1.2,
    fontFace: SERIF,
    fontSize: worshipKoFontSize(content.ko, 64),
    bold: true,
    color: "F7EBDA",
  });
  addCenteredText(slide, content.en, {
    y: 3.45,
    h: 0.38,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 17),
    bold: true,
    color: "D9B376",
    charSpacing: 7,
  });
  addCenteredText(slide, content.subtitle, {
    y: 4.02,
    h: 0.38,
    fontFace: SANS,
    fontSize: 18,
    color: "CFD8CD",
  });
  addCenteredText(slide, content.koDate, {
    y: 5.55,
    h: 0.4,
    fontFace: SANS,
    fontSize: 18,
    color: "CFD8CD",
  });
}

function addWheat(slide, pptx, side) {
  const isLeft = side === "left";
  const x = isLeft ? 2.08 : 11.253;
  addNamedShape(
    slide,
    pptx,
    pptx.ShapeType.line,
    `title-motif:wheat-${side}`,
    {
      x,
      y: 1.35,
      w: 0,
      h: 4.8,
      line: { color: "C99B54", width: 1.5 },
    }
  );

  for (let index = 0; index < 4; index += 1) {
    const y = 2.0 + index * 0.78;
    addNamedShape(
      slide,
      pptx,
      pptx.ShapeType.teardrop,
      `title-motif:grain-${side}-${index}`,
      {
        x: x + (isLeft ? -0.4 : 0.06),
        y,
        w: 0.34,
        h: 0.58,
        rotate: isLeft ? 52 : -52,
        fill: { color: "C99B54", transparency: 12 },
        line: noLine("C99B54"),
      }
    );
  }
}

function addThanksgivingSlide(pptx, content) {
  const slide = pptx.addSlide();
  addLinearBackground(slide, "3A2410", "1B1108");
  addWheat(slide, pptx, "left");
  addWheat(slide, pptx, "right");

  addCenteredText(slide, content.church, {
    y: 1.2,
    h: 0.34,
    fontFace: SANS,
    fontSize: 18,
    bold: true,
    color: "C99B54",
    charSpacing: 3,
  });
  addCenteredText(slide, content.ko, {
    y: 2.05,
    h: 1.2,
    fontFace: SERIF,
    fontSize: worshipKoFontSize(content.ko, 64),
    bold: true,
    color: "FFF1D6",
  });
  addCenteredText(slide, content.en, {
    y: 3.52,
    h: 0.4,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 17),
    bold: true,
    color: "E6BD75",
    charSpacing: 7,
  });
  addCenteredText(slide, content.subtitle, {
    y: 4.08,
    h: 0.4,
    fontFace: SANS,
    fontSize: 18,
    color: "E8D8BD",
  });
  addCenteredText(slide, content.koDate, {
    y: 5.42,
    h: 0.4,
    fontFace: SANS,
    fontSize: 18,
    color: "E8D8BD",
  });
}

function addAdventSlide(pptx, content) {
  const slide = pptx.addSlide();
  addLinearBackground(slide, "1A2140", "0A0E1A", [
    {
      fill: {
        type: "radial",
        cx: 0.5,
        cy: 0.18,
        r: 0.48,
        stops: [
          { offset: 0, color: "E4BC73", opacity: 0.32 },
          { offset: 1, color: "E4BC73", opacity: 0 },
        ],
      },
    },
  ]);

  addNamedShape(slide, pptx, pptx.ShapeType.ellipse, "title-motif:halo", {
    x: 5.45,
    y: -0.45,
    w: 2.43,
    h: 2.43,
    fill: { color: "E4BC73", transparency: 86 },
    line: noLine("E4BC73"),
  });
  addNamedShape(slide, pptx, pptx.ShapeType.teardrop, "title-motif:flame", {
    x: 6.24,
    y: 0.34,
    w: 0.85,
    h: 1.12,
    rotate: 180,
    fill: { color: "F2C15B" },
    line: noLine("F2C15B"),
  });
  addNamedShape(slide, pptx, pptx.ShapeType.roundRect, "title-motif:candle", {
    x: 6.37,
    y: 1.34,
    w: 0.59,
    h: 1.52,
    rectRadius: 0.04,
    fill: { color: "E9E4D8" },
    line: noLine("E9E4D8"),
  });

  addCenteredText(slide, content.ko, {
    y: 3.2,
    h: 1.18,
    fontFace: SERIF,
    fontSize: worshipKoFontSize(content.ko, 64),
    bold: true,
    color: "F5F0E7",
  });
  addCenteredText(slide, content.en, {
    y: 4.48,
    h: 0.38,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 17),
    bold: true,
    color: "A7B8E8",
    charSpacing: 7,
  });
  addCenteredText(slide, content.subtitle, {
    y: 4.98,
    h: 0.36,
    fontFace: SANS,
    fontSize: 17,
    color: "D7DCEE",
  });
  addCenteredText(slide, content.koDate, {
    y: 5.48,
    h: 0.38,
    fontFace: SANS,
    fontSize: 18,
    color: "D7DCEE",
  });
  addCenteredText(slide, content.church, {
    y: 6.35,
    h: 0.34,
    fontFace: SANS,
    fontSize: 17,
    bold: true,
    color: "D7DCEE",
    charSpacing: 3,
  });

  for (let index = 0; index < 4; index += 1) {
    addNamedShape(
      slide,
      pptx,
      pptx.ShapeType.ellipse,
      `title-motif:week-${index + 1}`,
      {
        x: 5.7 + 0.45 * index,
        y: 6.85,
        w: 0.16,
        h: 0.16,
        fill: {
          color: "A7B8E8",
          transparency: index === 0 ? 0 : 60,
        },
        line: noLine("A7B8E8"),
      }
    );
  }
}

function addMidnightSlabSlide(pptx, content) {
  const slide = pptx.addSlide();
  addLinearBackground(slide, "08090B", "181C23");

  addNamedShape(slide, pptx, pptx.ShapeType.line, "title-rule:spine", {
    x: 1.45,
    y: 1.2,
    w: 0,
    h: 5.1,
    line: { color: "9AA3AE", width: 1.25 },
  });

  const right = { x: 4.6, w: 7.8, align: "right" };
  addText(slide, content.church, {
    ...right,
    y: 1.2,
    h: 0.34,
    fontFace: SANS,
    fontSize: 17,
    bold: true,
    color: "9AA3AE",
    charSpacing: 3,
  });
  addText(slide, content.ko, {
    ...right,
    y: 2.16,
    h: 1.12,
    fontFace: SANS,
    fontSize: worshipKoFontSize(content.ko, 52),
    bold: true,
    color: "F2F4F7",
  });
  addText(slide, content.en, {
    ...right,
    y: 3.52,
    h: 0.38,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 17),
    bold: true,
    color: "C5CBD3",
    charSpacing: 6,
  });
  addText(slide, content.subtitle, {
    ...right,
    y: 4.12,
    h: 0.38,
    fontFace: SANS,
    fontSize: 18,
    color: "9AA3AE",
  });
  addText(slide, content.koDate, {
    ...right,
    y: 5.78,
    h: 0.4,
    fontFace: SANS,
    fontSize: 18,
    color: "9AA3AE",
  });
}

function addSlateSplitSlide(pptx, content) {
  const slide = pptx.addSlide();
  slide.background = { color: "0D1117" };

  addNamedShape(slide, pptx, pptx.ShapeType.rect, "title-rule:panel", {
    x: 0,
    y: 0,
    w: 4.93,
    h: 7.5,
    fill: { color: "1C2431" },
    line: noLine("1C2431"),
  });
  addNamedShape(slide, pptx, pptx.ShapeType.line, "title-rule:split", {
    x: 4.93,
    y: 0,
    w: 0,
    h: 7.5,
    line: { color: "748094", width: 1 },
  });

  const left = { x: 0.68, w: 3.56, align: "left" };
  addText(slide, content.church, {
    ...left,
    y: 1.0,
    h: 0.58,
    fontFace: SANS,
    fontSize: 18,
    bold: true,
    color: "DCE2EA",
  });
  addText(slide, content.en, {
    ...left,
    y: 2.62,
    h: 0.72,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 18),
    bold: true,
    color: "AEB8C6",
    charSpacing: 4,
  });
  addText(slide, content.subtitle, {
    ...left,
    y: 3.58,
    h: 0.72,
    fontFace: SANS,
    fontSize: 17,
    color: "AEB8C6",
  });
  addText(slide, content.koDate, {
    ...left,
    y: 5.95,
    h: 0.42,
    fontFace: SANS,
    fontSize: 17,
    color: "8F9AAA",
  });
  addText(slide, content.ko, {
    x: 5.55,
    y: 2.7,
    w: 7.2,
    h: 1.45,
    fontFace: SANS,
    fontSize: worshipKoFontSize(content.ko, 50),
    bold: true,
    color: "F2F4F7",
    align: "left",
  });
}

function addDeepFogSlide(pptx, content) {
  const slide = pptx.addSlide();
  addLinearBackground(slide, "0D1117", "0D1117", [
    {
      fill: {
        type: "radial",
        cx: 0.66,
        cy: 0.34,
        r: 0.72,
        stops: [
          { offset: 0, color: "A7AFBA", opacity: 0.28 },
          { offset: 0.56, color: "69727E", opacity: 0.12 },
          { offset: 1, color: "0D1117", opacity: 0 },
        ],
      },
    },
  ]);

  addText(slide, content.subtitle, {
    x: 1.15,
    y: 3.72,
    w: 11.03,
    h: 0.36,
    fontFace: SANS,
    fontSize: 17,
    color: "AAB2BD",
    align: "left",
  });
  addText(slide, content.en, {
    x: 1.15,
    y: 4.18,
    w: 11.03,
    h: 0.38,
    fontFace: LATIN,
    fontSize: worshipEnFontSize(content.en, 17),
    bold: true,
    color: "B8C0CA",
    align: "left",
    charSpacing: 6,
  });
  addText(slide, content.ko, {
    x: 1.15,
    y: 4.72,
    w: 11.03,
    h: 0.98,
    fontFace: SANS,
    fontSize: worshipKoFontSize(content.ko, 46),
    bold: true,
    color: "F2F4F7",
    align: "left",
  });
  addNamedShape(slide, pptx, pptx.ShapeType.line, "title-rule:underline", {
    x: 1.15,
    y: 5.88,
    w: 3.4,
    h: 0,
    line: { color: "98A2AE", width: 1.25 },
  });
  addText(slide, content.church, {
    x: 1.15,
    y: 6.22,
    w: 5.5,
    h: 0.38,
    fontFace: SANS,
    fontSize: 17,
    bold: true,
    color: "AAB2BD",
    align: "left",
  });
  addText(slide, content.koDate, {
    x: 6.68,
    y: 6.22,
    w: 5.5,
    h: 0.38,
    fontFace: SANS,
    fontSize: 17,
    color: "AAB2BD",
    align: "right",
  });
}

/** Adds a seasonal or dark design, returning false for the original designs. */
export function appendExtraTitleSlide(pptx, design, content) {
  const renderers = {
    "easter-dawn": addEasterDawnSlide,
    "easter-stained": addEasterStainedSlide,
    "christmas-burgundy": addChristmasBurgundySlide,
    "christmas-evergreen": addChristmasEvergreenSlide,
    thanksgiving: addThanksgivingSlide,
    advent: addAdventSlide,
    "midnight-slab": addMidnightSlabSlide,
    "slate-split": addSlateSplitSlide,
    "deep-fog": addDeepFogSlide,
  };
  const renderer = renderers[design];
  if (!renderer) return false;
  renderer(pptx, content);
  return true;
}
