// Rasterizes the layered gradient backgrounds the title slides use. These were
// SVG data URIs, which PowerPoint could not read once the bundle merge shared
// media parts by checksum (see lib/png.js), so the same gradients are now
// described as data and rendered to a real PNG here.
//
// Gradient coordinates follow SVG's objectBoundingBox convention: they are
// fractions of the layer's own rectangle, which is why a radial gradient
// stretches with the rectangle's aspect ratio instead of staying circular.

import { encodePng } from "./png.js";

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

function parseColour(value) {
  const hex = String(value ?? "").trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`색상 값을 읽을 수 없습니다: ${value}`);
  }
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function normalizeStops(stops) {
  if (!Array.isArray(stops) || stops.length === 0) {
    throw new Error("그라디언트 stop이 없습니다.");
  }
  return stops
    .map((stop) => ({
      offset: clamp01(Number(stop.offset ?? 0)),
      rgb: parseColour(stop.color),
      alpha: clamp01(stop.opacity === undefined ? 1 : Number(stop.opacity)),
    }))
    .sort((a, b) => a.offset - b.offset);
}

/** Colour at `t` along the ramp; outside the stops the edge colour pads. */
function sampleStops(stops, t) {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (t <= first.offset) {
    return first;
  }
  if (t >= last.offset) {
    return last;
  }

  for (let i = 1; i < stops.length; i += 1) {
    const to = stops[i];
    if (t > to.offset) {
      continue;
    }
    const from = stops[i - 1];
    const span = to.offset - from.offset;
    const k = span <= 0 ? 0 : (t - from.offset) / span;
    return {
      rgb: [
        from.rgb[0] + (to.rgb[0] - from.rgb[0]) * k,
        from.rgb[1] + (to.rgb[1] - from.rgb[1]) * k,
        from.rgb[2] + (to.rgb[2] - from.rgb[2]) * k,
      ],
      alpha: from.alpha + (to.alpha - from.alpha) * k,
    };
  }
  return last;
}

function linearPosition(fill, u, v) {
  const x1 = Number(fill.x1 ?? 0);
  const y1 = Number(fill.y1 ?? 0);
  const x2 = Number(fill.x2 ?? 1);
  const y2 = Number(fill.y2 ?? 0);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const denominator = dx * dx + dy * dy;
  return denominator <= 0 ? 0 : ((u - x1) * dx + (v - y1) * dy) / denominator;
}

function radialPosition(fill, u, v) {
  const cx = Number(fill.cx ?? 0.5);
  const cy = Number(fill.cy ?? 0.5);
  const r = Number(fill.r ?? 0.5);
  if (!(r > 0)) {
    return 1;
  }
  const dx = u - cx;
  const dy = v - cy;
  return Math.sqrt(dx * dx + dy * dy) / r;
}

/** Source-over compositing on straight (non-premultiplied) 8-bit RGBA. */
function compositeOver(data, offset, rgb, alpha) {
  if (alpha <= 0) {
    return;
  }
  const destinationAlpha = data[offset + 3] / 255;
  const outAlpha = alpha + destinationAlpha * (1 - alpha);
  if (outAlpha <= 0) {
    return;
  }
  const keep = destinationAlpha * (1 - alpha);
  for (let i = 0; i < 3; i += 1) {
    data[offset + i] = Math.round((rgb[i] * alpha + data[offset + i] * keep) / outAlpha);
  }
  data[offset + 3] = Math.round(outAlpha * 255);
}

function paintLayer(data, width, height, layer) {
  const fill = layer.fill ?? {};
  const left = Math.max(0, Math.round(layer.x ?? 0));
  const top = Math.max(0, Math.round(layer.y ?? 0));
  const rectWidth = Math.min(width - left, Math.round(layer.w ?? width));
  const rectHeight = Math.min(height - top, Math.round(layer.h ?? height));
  if (rectWidth <= 0 || rectHeight <= 0) {
    return;
  }

  const stops = fill.stops ? normalizeStops(fill.stops) : null;
  const solidRgb = stops ? null : parseColour(fill.color);
  const solidAlpha = stops ? 0 : clamp01(fill.opacity === undefined ? 1 : Number(fill.opacity));
  const position = fill.type === "radial" ? radialPosition : linearPosition;

  for (let y = top; y < top + rectHeight; y += 1) {
    // Both edges of the rectangle sample the ramp ends exactly.
    const v = rectHeight > 1 ? (y - top) / (rectHeight - 1) : 0;
    for (let x = left; x < left + rectWidth; x += 1) {
      const offset = (y * width + x) * 4;
      if (!stops) {
        compositeOver(data, offset, solidRgb, solidAlpha);
        continue;
      }
      const u = rectWidth > 1 ? (x - left) / (rectWidth - 1) : 0;
      const sample = sampleStops(stops, position(fill, u, v));
      compositeOver(data, offset, sample.rgb, sample.alpha);
    }
  }
}

/**
 * Paints `layers` bottom-first onto a transparent canvas.
 * A layer covers the whole canvas unless it carries its own `x/y/w/h`, and its
 * `fill` is either `{ color, opacity }` or `{ type, stops, ... }`.
 */
export function renderGradientLayers({ width, height, layers = [] }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`그라디언트 크기가 올바르지 않습니다: ${width}x${height}`);
  }
  const data = Buffer.alloc(width * height * 4);
  for (const layer of layers) {
    paintLayer(data, width, height, layer);
  }
  return { width, height, data };
}

/** The same gradient as a PNG data URI, ready for `slide.addImage({ data })`. */
export function gradientPngDataUri(spec) {
  const png = encodePng(renderGradientLayers(spec));
  return `data:image/png;base64,${png.toString("base64")}`;
}
