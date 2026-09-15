import fs from "node:fs/promises";

import { fabricShadowToPptx, normalizeCustomSlide } from "../public/custom-slide-model.js";

const CANVAS = { width: 1280, height: 720 };
const WIDE = { width: 13.333, height: 7.5 };
const CSS_PX_TO_POINTS = 72 / 96;

export function canvasToInches(value, axis) {
  const scale = axis === "y" || axis === "height"
    ? WIDE.height / CANVAS.height
    : WIDE.width / CANVAS.width;
  return Math.round(value * scale * 1e6) / 1e6;
}

export function elementBoxToInches(element) {
  return {
    x: canvasToInches(element.x, "x"),
    y: canvasToInches(element.y, "y"),
    w: canvasToInches(element.width, "width"),
    h: canvasToInches(element.height, "height"),
  };
}

const HEX_6 = /^[0-9a-fA-F]{6}$/;
const HEX_3 = /^[0-9a-fA-F]{3}$/;
const BACKGROUND_COLOR = "FFFFFF";
const TEXT_COLOR = "000000";
const FILL_COLOR = "CCCCCC";
const STROKE_COLOR = "000000";

/**
 * PPTX only understands 6-digit hex. Anything else (a CSS name, `rgb()`, a
 * short hex) is silently flattened to black by pptxgenjs, so each field states
 * its own fallback instead.
 */
export function pptxColor(value, fallback) {
  const raw = typeof value === "string" ? value.trim().replace(/^#/, "") : "";
  if (HEX_6.test(raw)) {
    return raw;
  }
  if (HEX_3.test(raw)) {
    return `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return fallback;
}

function transparency(opacity) {
  return Math.round((1 - opacity) * 100);
}

function isBold(fontWeight) {
  return String(fontWeight).toLowerCase() === "bold" || Number(fontWeight) >= 600;
}

function objectName(element) {
  return `custom:${element.id}`;
}

function elementShadow(element) {
  const converted = fabricShadowToPptx(element.shadow);
  if (!converted) {
    return undefined;
  }
  return {
    type: "outer",
    color: pptxColor(`#${converted.color}`, STROKE_COLOR),
    blur: converted.blur * CSS_PX_TO_POINTS,
    offset: converted.offset * CSS_PX_TO_POINTS,
    angle: converted.angle,
    opacity: converted.opacity,
  };
}

function addText(slide, element) {
  const shadow = elementShadow(element);
  slide.addText(element.text, {
    ...elementBoxToInches(element),
    objectName: objectName(element),
    fontFace: element.fontFamily,
    fontSize: element.fontSize * CSS_PX_TO_POINTS,
    bold: isBold(element.fontWeight),
    italic: Boolean(element.italic),
    underline: element.underline ? { style: "sng" } : undefined,
    color: pptxColor(element.color, TEXT_COLOR),
    align: element.textAlign,
    valign: element.valign ?? "top",
    charSpacing: element.charSpacing || undefined,
    lineSpacingMultiple: element.lineHeight,
    margin: 0,
    rotate: element.rotation,
    transparency: transparency(element.opacity),
    wrap: true,
    ...(shadow ? { shadow } : {}),
  });
}

function shapeLine(element) {
  return {
    // A shape without a stroke is outlined in its own fill color.
    color: pptxColor(element.stroke, pptxColor(element.fill, FILL_COLOR)),
    width: element.strokeWidth * CSS_PX_TO_POINTS,
    transparency: transparency(element.opacity),
  };
}

function addShape(pptx, slide, element) {
  const shapeTypes = {
    rect: pptx.ShapeType.rect,
    roundRect: pptx.ShapeType.roundRect,
    ellipse: pptx.ShapeType.ellipse,
  };
  slide.addShape(shapeTypes[element.type], {
    ...elementBoxToInches(element),
    objectName: objectName(element),
    fill: {
      color: pptxColor(element.fill, FILL_COLOR),
      transparency: transparency(element.opacity),
    },
    line: shapeLine(element),
    rotate: element.rotation,
    ...(elementShadow(element) ? { shadow: elementShadow(element) } : {}),
    ...(element.type === "roundRect"
      ? {
          rectRadius:
            element.rx *
            Math.min(WIDE.width / CANVAS.width, WIDE.height / CANVAS.height),
        }
      : {}),
  });
}

function addLine(pptx, slide, element) {
  const flipH = element.x2 < element.x;
  const flipV = element.y2 < element.y;
  slide.addShape(pptx.ShapeType.line, {
    x: canvasToInches(Math.min(element.x, element.x2), "x"),
    y: canvasToInches(Math.min(element.y, element.y2), "y"),
    w: canvasToInches(Math.abs(element.x2 - element.x), "width"),
    h: canvasToInches(Math.abs(element.y2 - element.y), "height"),
    flipH,
    flipV,
    objectName: objectName(element),
    line: {
      color: pptxColor(element.stroke, STROKE_COLOR),
      width: element.strokeWidth * CSS_PX_TO_POINTS,
      transparency: transparency(element.opacity),
    },
  });
}

function imageDimensions(value) {
  if (
    !value ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    return null;
  }
  return value;
}

function containGeometry(box, dimensions) {
  const scale = Math.min(box.w / dimensions.width, box.h / dimensions.height);
  const w = dimensions.width * scale;
  const h = dimensions.height * scale;
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

function warn(options, message, element) {
  options.onWarning?.(message, element);
}

async function addImage(slide, element, options) {
  if (!element.src) {
    warn(options, "Skipped image with a missing or unsafe /uploads source.", element);
    return;
  }
  if (typeof options.resolveImagePath !== "function") {
    warn(options, `Skipped image ${element.src}: no image path resolver was provided.`, element);
    return;
  }

  try {
    const imagePath = await options.resolveImagePath(element.src);
    if (typeof imagePath !== "string" || imagePath.length === 0) {
      throw new Error("image path resolver returned no path");
    }
    await fs.access(imagePath);

    const box = elementBoxToInches(element);
    const dimensions = typeof options.getImageDimensions === "function"
      ? imageDimensions(await options.getImageDimensions(imagePath))
      : null;
    const shadow = elementShadow(element);
    const common = {
      path: imagePath,
      objectName: objectName(element),
      rotate: element.rotation,
      transparency: transparency(element.opacity),
      flipH: Boolean(element.flipH),
      flipV: Boolean(element.flipV),
      ...(element.altText ? { altText: element.altText } : {}),
      ...(shadow ? { shadow } : {}),
    };

    if (!dimensions) {
      slide.addImage({ ...common, ...box });
    } else if (element.fit === "contain") {
      slide.addImage({ ...common, ...containGeometry(box, dimensions) });
    } else {
      slide.addImage({
        ...common,
        x: box.x,
        y: box.y,
        w: dimensions.width,
        h: dimensions.height,
        sizing: { type: "cover", w: box.w, h: box.h },
      });
    }
  } catch (error) {
    warn(options, `Skipped image ${element.src}: ${error.message}`, element);
  }
}

export async function appendCustomSlide(pptx, slideData, options = {}) {
  const customSlide = normalizeCustomSlide(slideData?.customSlide);
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.background = {
    color: pptxColor(customSlide.background.color, BACKGROUND_COLOR),
  };

  for (const element of customSlide.elements) {
    if (element.visible === false) {
      continue;
    }
    switch (element.type) {
      case "text":
        addText(slide, element);
        break;
      case "rect":
      case "roundRect":
      case "ellipse":
        addShape(pptx, slide, element);
        break;
      case "line":
        addLine(pptx, slide, element);
        break;
      case "image":
        await addImage(slide, element, options);
        break;
    }
  }

  return slide;
}
