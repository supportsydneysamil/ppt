// Shared geometry for the PPTX cover-slide renderers. All coordinates are
// inches on the 13.333 x 7.5 wide layout.

export const LAYOUT = { width: 13.333, height: 7.5 };

export const SERIF = "Batang";
export const SANS = "Malgun Gothic";
export const LATIN = "Arial";

/** Box height a single line of `fontSize` points needs. */
export function lineHeight(fontSize, factor = 1.3) {
  return (fontSize / 72) * factor;
}

/**
 * Lays out a vertical run of blocks centered on the slide. Blocks are
 * `{ h, gap, draw(y) }`; falsy entries are dropped, so an absent subtitle
 * closes its own gap instead of leaving a hole.
 */
export function stackCentered(blocks) {
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

export function centeredText(slide, text, options) {
  slide.addText(text, {
    x: 0,
    w: LAYOUT.width,
    align: "center",
    valign: "mid",
    margin: 0,
    ...options,
  });
}

export function horizontalRule(pptx, slide, { y, width, color, lineWidth }) {
  slide.addShape(pptx.ShapeType.line, {
    x: (LAYOUT.width - width) / 2,
    y,
    w: width,
    h: 0,
    line: { color, width: lineWidth },
  });
}

/** Full-bleed SVG, the only way to get a gradient past pptxgenjs. */
export function addSvgBackground(slide, svg) {
  slide.addImage({
    data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    x: 0,
    y: 0,
    w: LAYOUT.width,
    h: LAYOUT.height,
  });
}
