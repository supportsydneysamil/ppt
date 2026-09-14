import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { imageSize } from "image-size";

import { encodePng } from "../lib/png.js";
import { gradientPngDataUri, renderGradientLayers } from "../lib/gradient-raster.js";

function pixel({ width, data }, x, y) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

describe("encodePng", () => {
  it("writes a PNG the standard sniffers accept", () => {
    const width = 3;
    const height = 2;
    const png = encodePng({ width, height, data: Buffer.alloc(width * height * 4, 0x7f) });

    assert.deepEqual(
      png.subarray(0, 8),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    assert.deepEqual(imageSize(png), { width, height, type: "png" });
  });
});

describe("renderGradientLayers", () => {
  it("starts fully transparent so uncovered areas stay empty", () => {
    const raster = renderGradientLayers({ width: 4, height: 4, layers: [] });
    assert.deepEqual(pixel(raster, 0, 0), [0, 0, 0, 0]);
  });

  it("fills a solid layer across the whole canvas by default", () => {
    const raster = renderGradientLayers({
      width: 4,
      height: 4,
      layers: [{ fill: { color: "0a0b0d" } }],
    });

    assert.deepEqual(pixel(raster, 0, 0), [0x0a, 0x0b, 0x0d, 255]);
    assert.deepEqual(pixel(raster, 3, 3), [0x0a, 0x0b, 0x0d, 255]);
  });

  it("restricts a layer to its own rectangle", () => {
    const raster = renderGradientLayers({
      width: 4,
      height: 4,
      layers: [{ x: 2, w: 2, fill: { color: "ffffff" } }],
    });

    assert.deepEqual(pixel(raster, 1, 0), [0, 0, 0, 0]);
    assert.deepEqual(pixel(raster, 2, 0), [255, 255, 255, 255]);
  });

  it("interpolates a horizontal linear gradient between its stops", () => {
    const raster = renderGradientLayers({
      width: 101,
      height: 1,
      layers: [
        {
          fill: {
            type: "linear",
            x2: 1,
            y2: 0,
            stops: [
              { offset: 0, color: "000000" },
              { offset: 1, color: "ffffff" },
            ],
          },
        },
      ],
    });

    assert.deepEqual(pixel(raster, 0, 0), [0, 0, 0, 255]);
    assert.deepEqual(pixel(raster, 100, 0), [255, 255, 255, 255]);
    const [mid] = pixel(raster, 50, 0);
    assert.ok(Math.abs(mid - 128) <= 2, `midpoint ${mid} should be about 128`);
  });

  it("measures a linear gradient against its own layer rectangle", () => {
    const raster = renderGradientLayers({
      width: 100,
      height: 1,
      layers: [
        {
          x: 50,
          w: 50,
          fill: {
            type: "linear",
            x2: 1,
            y2: 0,
            stops: [
              { offset: 0, color: "000000" },
              { offset: 1, color: "ffffff" },
            ],
          },
        },
      ],
    });

    // The gradient restarts at the rectangle's left edge, not the canvas edge.
    assert.deepEqual(pixel(raster, 50, 0), [0, 0, 0, 255]);
    assert.deepEqual(pixel(raster, 99, 0), [255, 255, 255, 255]);
  });

  it("fades a radial gradient out to its last stop and pads beyond the radius", () => {
    const raster = renderGradientLayers({
      width: 101,
      height: 101,
      layers: [
        {
          fill: {
            type: "radial",
            cx: 0.5,
            cy: 0.5,
            r: 0.5,
            stops: [
              { offset: 0, color: "ff0000", opacity: 1 },
              { offset: 1, color: "ff0000", opacity: 0 },
            ],
          },
        },
      ],
    });

    assert.deepEqual(pixel(raster, 50, 50), [255, 0, 0, 255]);
    // Dead centre of an edge sits exactly on the radius, and the corners are
    // past it, so both land on the fully transparent last stop.
    assert.equal(pixel(raster, 100, 50)[3], 0);
    assert.equal(pixel(raster, 0, 0)[3], 0);
  });

  it("stretches a radial gradient with the layer's aspect ratio, as SVG does", () => {
    const raster = renderGradientLayers({
      width: 101,
      height: 21,
      layers: [
        {
          fill: {
            type: "radial",
            cx: 0.5,
            cy: 0.5,
            r: 0.5,
            stops: [
              { offset: 0, color: "ffffff", opacity: 1 },
              { offset: 1, color: "ffffff", opacity: 0 },
            ],
          },
        },
      ],
    });

    // Half way to the left edge and half way to the top edge are both half a
    // radius out, so a bounding-box gradient must fade them equally.
    assert.equal(pixel(raster, 25, 10)[3], pixel(raster, 50, 5)[3]);
  });

  it("composites a translucent layer over the one beneath it", () => {
    const raster = renderGradientLayers({
      width: 2,
      height: 2,
      layers: [
        { fill: { color: "000000" } },
        { fill: { color: "ffffff", opacity: 0.5 } },
      ],
    });

    const [r, g, b, a] = pixel(raster, 0, 0);
    assert.equal(a, 255);
    assert.ok(Math.abs(r - 128) <= 2, `red ${r} should be about 128`);
    assert.deepEqual([g, b], [r, r]);
  });

  it("accepts hex colours written with a leading hash", () => {
    const raster = renderGradientLayers({
      width: 1,
      height: 1,
      layers: [{ fill: { color: "#2dd4bf" } }],
    });

    assert.deepEqual(pixel(raster, 0, 0), [0x2d, 0xd4, 0xbf, 255]);
  });
});

describe("gradientPngDataUri", () => {
  it("returns a PNG data URI pptxgenjs can embed directly", () => {
    const uri = gradientPngDataUri({
      width: 8,
      height: 4,
      layers: [{ fill: { color: "170e33" } }],
    });

    assert.match(uri, /^data:image\/png;base64,/);
    const png = Buffer.from(uri.slice("data:image/png;base64,".length), "base64");
    assert.deepEqual(imageSize(png), { width: 8, height: 4, type: "png" });
  });
});
