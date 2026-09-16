import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  appendCustomSlide,
  canvasToInches,
  elementBoxToInches,
} from "../lib/custom-slide-pptx.js";

function element(overrides) {
  return {
    id: overrides.id,
    type: overrides.type,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    ...overrides,
  };
}

async function render(customSlide, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "custom-slide-pptx-"));
  const imagePath = path.join(directory, "image.svg");
  await fs.writeFile(
    imagePath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>'
  );

  try {
    const pptx = new PptxGenJS();
    const resolveImagePath = options.resolveImagePath
      ? (src) => options.resolveImagePath(src, imagePath)
      : () => imagePath;
    await appendCustomSlide(
      pptx,
      { customSlide },
      {
        getImageDimensions: async () => ({ width: 200, height: 100 }),
        ...options,
        resolveImagePath,
      }
    );
    const buffer = await pptx.write({ outputType: "nodebuffer" });
    const zip = new AdmZip(buffer);
    return {
      presentationXml: zip.readAsText("ppt/presentation.xml"),
      slideXml: zip.readAsText("ppt/slides/slide1.xml"),
      slideRelsXml: zip.readAsText("ppt/slides/_rels/slide1.xml.rels"),
      mediaEntries: zip
        .getEntries()
        .filter((entry) => entry.entryName.startsWith("ppt/media/"))
        .map((entry) => entry.entryName),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function parse(xml) {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function directObjects(slideXml) {
  const tree = parse(slideXml).getElementsByTagName("p:spTree")[0];
  const objects = [];
  for (let index = 0; index < tree.childNodes.length; index += 1) {
    const node = tree.childNodes[index];
    if (node.nodeType === 1 && ["p:sp", "p:pic", "p:cxnSp"].includes(node.nodeName)) {
      objects.push(node);
    }
  }
  return objects;
}

function objectName(node) {
  return node.getElementsByTagName("p:cNvPr")[0].getAttribute("name");
}

function objectByName(slideXml, name) {
  return directObjects(slideXml).find((node) => objectName(node) === name);
}

function transform(node) {
  const xfrm = node.getElementsByTagName("a:xfrm")[0];
  const off = xfrm.getElementsByTagName("a:off")[0];
  const ext = xfrm.getElementsByTagName("a:ext")[0];
  return {
    x: Number(off.getAttribute("x")),
    y: Number(off.getAttribute("y")),
    w: Number(ext.getAttribute("cx")),
    h: Number(ext.getAttribute("cy")),
    rotate: Number(xfrm.getAttribute("rot") || 0),
    flipH: xfrm.getAttribute("flipH") === "1",
    flipV: xfrm.getAttribute("flipV") === "1",
  };
}

function pictureGeometry(slideXml) {
  const pictures = Array.from(parse(slideXml).getElementsByTagName("p:pic"));
  return pictures.map((picture) => {
    const transform = picture.getElementsByTagName("a:xfrm")[0];
    const offset = transform.getElementsByTagName("a:off")[0];
    const extent = transform.getElementsByTagName("a:ext")[0];
    const crop = picture.getElementsByTagName("a:srcRect")[0];
    return {
      x: Number(offset.getAttribute("x")) / 914400,
      y: Number(offset.getAttribute("y")) / 914400,
      w: Number(extent.getAttribute("cx")) / 914400,
      h: Number(extent.getAttribute("cy")) / 914400,
      crop: crop
        ? {
            left: Number(crop.getAttribute("l") || 0),
            top: Number(crop.getAttribute("t") || 0),
            right: Number(crop.getAttribute("r") || 0),
            bottom: Number(crop.getAttribute("b") || 0),
          }
        : null,
    };
  });
}

function roundedGeometry(geometry) {
  return {
    ...geometry,
    x: Number(geometry.x.toFixed(4)),
    y: Number(geometry.y.toFixed(4)),
    w: Number(geometry.w.toFixed(4)),
    h: Number(geometry.h.toFixed(4)),
  };
}

describe("custom slide coordinate conversion", () => {
  it("maps the canonical 1280x720 canvas to LAYOUT_WIDE inches", () => {
    assert.equal(canvasToInches(1280, "x"), 13.333);
    assert.equal(canvasToInches(720, "y"), 7.5);
    assert.deepEqual(elementBoxToInches({ x: 128, y: 72, width: 640, height: 360 }), {
      x: 1.3333,
      y: 0.75,
      w: 6.6665,
      h: 3.75,
    });
  });
});

describe("appendCustomSlide", () => {
  it("writes editable text, shapes, a line, and a picture in canonical z order", async () => {
    const { presentationXml, slideXml, slideRelsXml, mediaEntries } = await render({
      background: { color: "#102030" },
      elements: [
        element({
          id: "picture",
          type: "image",
          zIndex: 50,
          x: 900,
          y: 500,
          width: 200,
          height: 100,
          src: "/uploads/pixel.png",
          fit: "contain",
          rotation: 20,
          opacity: 0.7,
        }),
        element({
          id: "line",
          type: "line",
          zIndex: 40,
          x: 100,
          y: 600,
          x2: 500,
          y2: 650,
          stroke: "#334455",
          strokeWidth: 4,
          opacity: 0.6,
        }),
        element({
          id: "ellipse",
          type: "ellipse",
          zIndex: 30,
          x: 600,
          y: 100,
          fill: "#778899",
          stroke: "#010203",
          strokeWidth: 2,
        }),
        element({
          id: "round",
          type: "roundRect",
          zIndex: 20,
          x: 450,
          y: 100,
          fill: "#445566",
          stroke: "#111111",
          strokeWidth: 1,
          rx: 12,
        }),
        element({
          id: "rectangle",
          type: "rect",
          zIndex: 10,
          x: 300,
          y: 100,
          fill: "#AABBCC",
          stroke: "#123456",
          strokeWidth: 3,
          rotation: 30,
          opacity: 0.75,
        }),
        element({
          id: "text",
          type: "text",
          zIndex: 0,
          x: 128,
          y: 72,
          width: 320,
          height: 72,
          text: "Editable title",
          fontFamily: "Georgia",
          fontSize: 32,
          fontWeight: "700",
          italic: true,
          underline: true,
          valign: "middle",
          color: "#FEDCBA",
          textAlign: "center",
          rotation: 15,
          opacity: 0.8,
        }),
      ],
    });

    assert.match(presentationXml, /<p:sldSz cx="12192000" cy="6858000"/);
    assert.match(slideXml, /<p:bg>[\s\S]*?<a:srgbClr val="102030"/);
    const objects = directObjects(slideXml);
    assert.deepEqual(objects.map(objectName), [
      "custom:text",
      "custom:rectangle",
      "custom:round",
      "custom:ellipse",
      "custom:line",
      "custom:picture",
    ]);

    const text = objectByName(slideXml, "custom:text");
    assert.equal(text.nodeName, "p:sp");
    assert.equal(text.getElementsByTagName("a:t")[0].textContent, "Editable title");
    assert.deepEqual(transform(text), {
      x: 1219170,
      y: 685800,
      w: 3047924,
      h: 685800,
      rotate: 900000,
      flipH: false,
      flipV: false,
    });
    const textRun = text.getElementsByTagName("a:rPr")[0];
    assert.equal(textRun.getAttribute("sz"), "2400");
    assert.equal(textRun.getAttribute("b"), "1");
    assert.equal(textRun.getAttribute("i"), "1");
    assert.equal(textRun.getElementsByTagName("a:latin")[0].getAttribute("typeface"), "Georgia");
    assert.equal(text.getElementsByTagName("a:pPr")[0].getAttribute("algn"), "ctr");
    assert.match(text.toString(), /<a:srgbClr val="FEDCBA"><a:alpha val="80000"\/>/);

    const rectangle = objectByName(slideXml, "custom:rectangle");
    assert.equal(
      rectangle.getElementsByTagName("a:prstGeom")[0].getAttribute("prst"),
      "rect"
    );
    assert.equal(transform(rectangle).rotate, 1800000);
    const rectangleLine = rectangle.getElementsByTagName("a:ln")[0];
    assert.equal(rectangleLine.getAttribute("w"), "28575");
    assert.match(rectangleLine.toString(), /val="123456"/);
    assert.match(rectangle.toString(), /val="AABBCC"><a:alpha val="75000"\/>/);

    const round = objectByName(slideXml, "custom:round");
    assert.equal(round.getElementsByTagName("a:prstGeom")[0].getAttribute("prst"), "roundRect");
    assert.equal(
      round.getElementsByTagName("a:gd")[0].getAttribute("fmla"),
      "val 12000"
    );
    assert.equal(round.getElementsByTagName("a:ln")[0].getAttribute("w"), "9525");

    const ellipse = objectByName(slideXml, "custom:ellipse");
    assert.equal(ellipse.getElementsByTagName("a:prstGeom")[0].getAttribute("prst"), "ellipse");
    assert.equal(ellipse.getElementsByTagName("a:ln")[0].getAttribute("w"), "19050");

    const line = objectByName(slideXml, "custom:line");
    assert.equal(line.getElementsByTagName("a:prstGeom")[0].getAttribute("prst"), "line");
    assert.equal(line.getElementsByTagName("a:ln")[0].getAttribute("w"), "38100");
    assert.match(line.toString(), /val="334455"><a:alpha val="60000"\/>/);
    assert.equal(transform(line).rotate, 0);

    const picture = objectByName(slideXml, "custom:picture");
    assert.equal(picture.nodeName, "p:pic");
    assert.equal(transform(picture).rotate, 1200000);
    assert.match(picture.toString(), /<a:alphaModFix amt="70000"\/>/);
    const relationshipId = picture.getElementsByTagName("a:blip")[0].getAttribute("r:embed");
    assert.ok(relationshipId);
    assert.match(slideRelsXml, new RegExp(`Id="${relationshipId}"[^>]+Target="\\.\\./media/`));
    assert.ok(mediaEntries.some((entry) => entry.endsWith(".svg")));
  });

  it("normalizes every line direction to nonnegative extents with flips", async () => {
    const { slideXml } = await render({
      elements: [
        element({
          id: "down-right",
          type: "line",
          x: 100,
          y: 100,
          x2: 300,
          y2: 200,
          stroke: "#000000",
          strokeWidth: 2,
          zIndex: 0,
        }),
        element({
          id: "down-left",
          type: "line",
          x: 300,
          y: 100,
          x2: 100,
          y2: 200,
          stroke: "#000000",
          strokeWidth: 2,
          zIndex: 1,
        }),
        element({
          id: "up-right",
          type: "line",
          x: 100,
          y: 200,
          x2: 300,
          y2: 100,
          stroke: "#000000",
          strokeWidth: 2,
          zIndex: 2,
        }),
        element({
          id: "up-left",
          type: "line",
          x: 300,
          y: 200,
          x2: 100,
          y2: 100,
          stroke: "#000000",
          strokeWidth: 2,
          zIndex: 3,
        }),
      ],
    });

    const expected = {
      "down-right": { flipH: false, flipV: false },
      "down-left": { flipH: true, flipV: false },
      "up-right": { flipH: false, flipV: true },
      "up-left": { flipH: true, flipV: true },
    };
    for (const [id, flips] of Object.entries(expected)) {
      const lineTransform = transform(objectByName(slideXml, `custom:${id}`));
      assert.deepEqual(lineTransform, {
        x: 952477,
        y: 952500,
        w: 1904952,
        h: 952500,
        rotate: 0,
        ...flips,
      });
      assert.ok(lineTransform.w >= 0);
      assert.ok(lineTransform.h >= 0);
    }
  });

  it("calculates contain letterboxing and cover cropping from injected dimensions", async () => {
    const { slideXml } = await render({
      elements: [
        element({
          id: "contain",
          type: "image",
          x: 120,
          y: 72,
          width: 384,
          height: 288,
          src: "/uploads/contain.png",
          fit: "contain",
          zIndex: 0,
        }),
        element({
          id: "cover",
          type: "image",
          x: 600,
          y: 72,
          width: 384,
          height: 288,
          src: "/uploads/cover.png",
          fit: "cover",
          zIndex: 1,
        }),
      ],
    });

    const [rawContain, rawCover] = pictureGeometry(slideXml);
    const contain = roundedGeometry(rawContain);
    const cover = roundedGeometry(rawCover);
    assert.deepEqual(contain, {
      x: 1.25,
      y: 1.25,
      w: 3.9999,
      h: 1.9999,
      crop: null,
    });
    assert.equal(cover.x, 6.2498);
    assert.equal(cover.y, 0.75);
    assert.equal(cover.w, 3.9999);
    assert.equal(cover.h, 3);
    assert.deepEqual(cover.crop, {
      left: 16667,
      top: 0,
      right: 16667,
      bottom: 0,
    });
  });

  it("exports native image flips and alternative text", async () => {
    const { slideXml } = await render({
      elements: [
        element({
          id: "native-image",
          type: "image",
          src: "/uploads/native.png",
          fit: "cover",
          flipH: true,
          flipV: true,
          altText: "강단 위의 성경",
        }),
      ],
    });

    const picture = objectByName(slideXml, "custom:native-image");
    assert.equal(transform(picture).flipH, true);
    assert.equal(transform(picture).flipV, true);
    assert.equal(
      picture.getElementsByTagName("p:cNvPr")[0].getAttribute("descr"),
      "강단 위의 성경"
    );
  });

  it("falls back to the element box when image dimensions are unavailable", async () => {
    const { slideXml } = await render(
      {
        elements: [
          element({
            id: "fallback",
            type: "image",
            x: 128,
            y: 72,
            width: 256,
            height: 144,
            src: "/uploads/fallback.png",
            fit: "contain",
          }),
        ],
      },
      { getImageDimensions: async () => null }
    );

    assert.deepEqual(pictureGeometry(slideXml).map(roundedGeometry), [
      { x: 1.3333, y: 0.75, w: 2.6666, h: 1.5, crop: null },
    ]);
  });

  it("warns and skips only missing, unsafe, or failed images", async () => {
    const warnings = [];
    const { slideXml } = await render(
      {
        elements: [
          element({
            id: "missing",
            type: "image",
            src: "",
            zIndex: 0,
          }),
          element({
            id: "unsafe",
            type: "image",
            src: "https://example.com/evil.png",
            zIndex: 1,
          }),
          element({
            id: "broken",
            type: "image",
            src: "/uploads/broken.png",
            zIndex: 2,
          }),
          element({
            id: "good",
            type: "image",
            src: "/uploads/good.png",
            zIndex: 3,
          }),
          element({
            id: "after",
            type: "text",
            text: "Still rendered",
            zIndex: 4,
          }),
        ],
      },
      {
        resolveImagePath: (src, imagePath) => {
          if (src.endsWith("broken.png")) {
            return `${imagePath}.missing`;
          }
          return imagePath;
        },
        getImageDimensions: async () => ({ width: 100, height: 100 }),
        onWarning: (message, image) => warnings.push({ message, id: image.id }),
      }
    );

    assert.equal(parse(slideXml).getElementsByTagName("p:pic").length, 1);
    assert.match(slideXml, /<a:t>Still rendered<\/a:t>/);
    assert.deepEqual(
      warnings.map((warning) => warning.id),
      ["missing", "unsafe", "broken"]
    );
    assert.ok(warnings.every((warning) => warning.message.length > 0));
  });
});

function colorValues(slideXml) {
  return Array.from(parse(slideXml).getElementsByTagName("a:srgbClr")).map((node) =>
    node.getAttribute("val")
  );
}

describe("custom slide colors", () => {
  it("falls back per field when a color is not a 6-digit hex", async () => {
    const { slideXml } = await render({
      background: { color: "rgb(1, 2, 3)" },
      elements: [
        element({
          id: "text",
          type: "text",
          zIndex: 0,
          text: "Colored",
          color: "red",
        }),
        element({
          id: "rectangle",
          type: "rect",
          zIndex: 1,
          x: 200,
          fill: "#12",
          stroke: "not-a-color",
          strokeWidth: 3,
        }),
        element({
          id: "line",
          type: "line",
          zIndex: 2,
          x: 100,
          y: 600,
          x2: 500,
          y2: 600,
          stroke: "rgba(0, 0, 0, 0.5)",
          strokeWidth: 4,
        }),
      ],
    });

    const values = colorValues(slideXml);
    assert.ok(values.length >= 4, `expected color entries, got ${values.length}`);
    for (const value of values) {
      assert.match(value, /^[0-9A-Fa-f]{6}$/, `invalid srgbClr value ${value}`);
    }

    assert.match(slideXml, /<p:bg>[\s\S]*?<a:srgbClr val="FFFFFF"/);
    assert.match(
      objectByName(slideXml, "custom:text").toString(),
      /<a:srgbClr val="000000"/
    );

    const rectangle = objectByName(slideXml, "custom:rectangle").toString();
    assert.match(rectangle, /val="CCCCCC"/);
    assert.doesNotMatch(rectangle, /not-a-color/);
    assert.doesNotMatch(slideXml, /rgba?\(/);
  });

  it("expands 3-digit hex colors to the 6-digit form PPTX requires", async () => {
    const { slideXml } = await render({
      background: { color: "#abc" },
      elements: [
        element({
          id: "rectangle",
          type: "rect",
          zIndex: 0,
          fill: "#0f8",
          stroke: "#f00",
          strokeWidth: 2,
        }),
      ],
    });

    for (const value of colorValues(slideXml)) {
      assert.match(value, /^[0-9A-Fa-f]{6}$/, `invalid srgbClr value ${value}`);
    }
    assert.match(slideXml, /<p:bg>[\s\S]*?<a:srgbClr val="AABBCC"/);
    const rectangle = objectByName(slideXml, "custom:rectangle").toString();
    assert.match(rectangle, /val="00FF88"/);
    assert.match(rectangle, /val="FF0000"/);
  });

  it("keeps the stroke color when a shape has none but a valid fill", async () => {
    const { slideXml } = await render({
      elements: [
        element({
          id: "rectangle",
          type: "rect",
          zIndex: 0,
          fill: "#ABCDEF",
          stroke: "",
          strokeWidth: 0,
        }),
      ],
    });

    const rectangle = objectByName(slideXml, "custom:rectangle");
    const line = rectangle.getElementsByTagName("a:ln")[0];
    assert.match(line.toString(), /val="ABCDEF"/);
  });

  it("writes the baked canvas font size as PPTX points", async () => {
    const { slideXml } = await render({
      elements: [
        element({
          id: "text",
          type: "text",
          zIndex: 0,
          x: 100,
          y: 80,
          width: 800,
          height: 92.8,
          text: "Resized",
          fontSize: 80,
        }),
      ],
    });

    const text = objectByName(slideXml, "custom:text");
    assert.equal(text.getElementsByTagName("a:rPr")[0].getAttribute("sz"), "6000");
    assert.deepEqual(transform(text), {
      x: 952477,
      y: 762000,
      w: 7619810,
      h: 883920,
      rotate: 0,
      flipH: false,
      flipV: false,
    });
  });
});

it("skips hidden custom slide elements", async () => {
  const { slideXml } = await render({
    background: { color: "#000000" },
    elements: [
      element({
        id: "shown",
        type: "rect",
        zIndex: 0,
        fill: "#ff0000",
        stroke: "",
        strokeWidth: 0,
        visible: true,
      }),
      element({
        id: "hidden",
        type: "rect",
        zIndex: 1,
        fill: "#00ff00",
        stroke: "",
        strokeWidth: 0,
        visible: false,
      }),
    ],
  });
  assert.ok(objectByName(slideXml, "custom:shown"));
  assert.equal(objectByName(slideXml, "custom:hidden"), undefined);
});
