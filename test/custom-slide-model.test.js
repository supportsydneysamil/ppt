import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cloneCustomSlide,
  createDefaultCustomSlide,
  customSlideToFabricObjects,
  fabricObjectsToCustomSlide,
  normalizeCustomSlide,
} from "../public/custom-slide-model.js";

function idFactory() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("createDefaultCustomSlide", () => {
  it("returns the canonical empty slide schema", () => {
    assert.deepEqual(createDefaultCustomSlide(), {
      version: 1,
      width: 1280,
      height: 720,
      background: { color: "#ffffff" },
      elements: [],
    });
  });
});

describe("theme fields", () => {
  it("keeps themeId, templateId, and element roles", () => {
    const normalized = normalizeCustomSlide({
      themeId: "plain",
      templateId: "title-hero",
      extra: "drop",
      elements: [
        {
          type: "text",
          text: "Hi",
          themeRole: "title",
          themeStrokeRole: "nope",
        },
        {
          type: "roundRect",
          themeRole: "surface",
          themeStrokeRole: "stroke",
          fill: "#ffffff",
          stroke: "#cbd5e1",
          strokeWidth: 3,
        },
      ],
    });
    assert.equal(normalized.themeId, "plain");
    assert.equal(normalized.templateId, "title-hero");
    assert.equal("extra" in normalized, false);
    assert.equal(normalized.elements[0].themeRole, "title");
    assert.equal("themeStrokeRole" in normalized.elements[0], false);
    assert.equal(normalized.elements[1].themeRole, "surface");
    assert.equal(normalized.elements[1].themeStrokeRole, "stroke");
  });

  it("round-trips theme roles through fabric objects", () => {
    const model = normalizeCustomSlide({
      themeId: "deep-black",
      templateId: "quote-card",
      elements: [
        {
          type: "roundRect",
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          themeRole: "surface",
          themeStrokeRole: "stroke",
          fill: "#ffffff",
          stroke: "#cbd5e1",
          strokeWidth: 3,
        },
      ],
    });
    const roundTripped = fabricObjectsToCustomSlide(customSlideToFabricObjects(model));
    assert.equal(roundTripped.themeId, "deep-black");
    assert.equal(roundTripped.templateId, "quote-card");
    assert.equal(roundTripped.elements[0].themeRole, "surface");
    assert.equal(roundTripped.elements[0].themeStrokeRole, "stroke");
  });
});

describe("normalizeCustomSlide", () => {
  it("fills defaults and strips unknown top-level fields", () => {
    const normalized = normalizeCustomSlide({
      version: 99,
      width: 1280,
      height: 720,
      background: { color: "#112233" },
      elements: [],
      extra: "drop-me",
    });

    assert.deepEqual(normalized, {
      version: 1,
      width: 1280,
      height: 720,
      background: { color: "#112233" },
      elements: [],
    });
  });

  it("normalizes supported element types and strips unknown element fields", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          id: "t1",
          type: "text",
          x: 10,
          y: 20,
          width: 200,
          height: 40,
          rotation: 15,
          opacity: 0.8,
          zIndex: 2,
          text: "Hello",
          fontFamily: "Arial",
          fontSize: 24,
          fontWeight: "bold",
          color: "#ff0000",
          textAlign: "center",
          unknown: true,
        },
        {
          id: "i1",
          type: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          src: "/uploads/logo.png",
          fit: "cover",
        },
        {
          id: "r1",
          type: "rect",
          x: 50,
          y: 50,
          width: 80,
          height: 60,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
          fill: "#cccccc",
          stroke: "#000000",
          strokeWidth: 2,
        },
        {
          id: "rr1",
          type: "roundRect",
          x: 10,
          y: 10,
          width: 40,
          height: 30,
          rotation: 0,
          opacity: 1,
          zIndex: 3,
          fill: "#eeeeee",
          stroke: "",
          strokeWidth: 0,
          rx: 8,
        },
        {
          id: "e1",
          type: "ellipse",
          x: 100,
          y: 100,
          width: 60,
          height: 40,
          rotation: 0,
          opacity: 1,
          zIndex: 4,
          fill: "#abcdef",
          stroke: "#111111",
          strokeWidth: 1,
        },
        {
          id: "l1",
          type: "line",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity: 1,
          zIndex: 5,
          x2: 200,
          y2: 100,
          stroke: "#333333",
          strokeWidth: 3,
        },
      ],
    });

    assert.equal(normalized.elements.length, 6);
    assert.deepEqual(
      normalized.elements.map((element) => element.zIndex),
      [0, 1, 2, 3, 4, 5]
    );
    assert.equal(normalized.elements[2].type, "text");
    assert.equal(normalized.elements[2].text, "Hello");
    assert.equal(normalized.elements[2].italic, false);
    assert.equal(normalized.elements[2].underline, false);
    assert.equal(normalized.elements[2].valign, "top");
    assert.equal(normalized.elements[2].visible, true);
    assert.equal(normalized.elements[2].locked, false);
    assert.equal(normalized.elements[1].fit, "cover");
    assert.equal(normalized.elements[0].fill, "#cccccc");
    assert.equal(normalized.elements[3].rx, 8);
    assert.equal(normalized.elements[5].x2, 200);
    assert.equal(normalized.elements[5].y2, 100);
  });

  it("normalizes native image properties with backward-compatible defaults", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          type: "image",
          src: "/uploads/default.png",
        },
        {
          type: "image",
          src: "/uploads/native.png",
          flipH: 1,
          flipV: "yes",
          altText: `  ${"설".repeat(510)}  `,
        },
      ],
    });

    assert.deepEqual(
      {
        flipH: normalized.elements[0].flipH,
        flipV: normalized.elements[0].flipV,
        altText: normalized.elements[0].altText,
      },
      { flipH: false, flipV: false, altText: "" }
    );
    assert.equal(normalized.elements[1].flipH, true);
    assert.equal(normalized.elements[1].flipV, true);
    assert.equal(normalized.elements[1].altText, "설".repeat(500));
  });

  it("drops unsupported element types", () => {
    const normalized = normalizeCustomSlide({
      elements: [{ id: "bad", type: "video", x: 0, y: 0, width: 10, height: 10 }],
    });
    assert.deepEqual(normalized.elements, []);
  });

  it("repairs non-finite numbers and clamps coordinates to canvas bounds", () => {
    const normalized = normalizeCustomSlide({
      width: 1280,
      height: 720,
      elements: [
        {
          id: "t1",
          type: "text",
          x: Number.NaN,
          y: -50,
          width: Number.POSITIVE_INFINITY,
          height: -10,
          rotation: Number.NaN,
          opacity: 2,
          zIndex: Number.NaN,
          text: "Clamp me",
        },
        {
          id: "l1",
          type: "line",
          x: 1200,
          y: 700,
          width: 0,
          height: 0,
          x2: 2000,
          y2: -100,
          stroke: "#000",
          strokeWidth: 1,
        },
      ],
    });

    const text = normalized.elements[0];
    assert.equal(text.x, 0);
    assert.equal(text.y, 0);
    assert.equal(text.width, 1280);
    assert.equal(text.height, 0);
    assert.equal(text.rotation, 0);
    assert.equal(text.opacity, 1);
    assert.equal(text.zIndex, 0);

    const line = normalized.elements[1];
    assert.equal(line.x, 1200);
    assert.equal(line.y, 700);
    assert.equal(line.x2, 1280);
    assert.equal(line.y2, 0);
  });

  it("rejects image sources that do not begin with /uploads/", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          id: "img1",
          type: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          src: "https://evil.example/logo.png",
        },
        {
          id: "img2",
          type: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          src: "/uploads/safe.png",
        },
      ],
    });

    assert.equal(normalized.elements.length, 2);
    assert.equal(normalized.elements[0].src, "");
    assert.equal(normalized.elements[1].src, "/uploads/safe.png");
  });

  it("defaults invalid image fit values to contain", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          id: "img1",
          type: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          src: "/uploads/a.png",
          fit: "stretch",
        },
      ],
    });

    assert.equal(normalized.elements[0].fit, "contain");
  });

  it("forces canonical v1 dimensions to exactly 1280x720", () => {
    const normalized = normalizeCustomSlide({
      version: 2,
      width: 640,
      height: 480,
      elements: [
        {
          id: "t1",
          type: "text",
          x: 600,
          y: 400,
          width: 700,
          height: 400,
          text: "Resize me",
        },
      ],
    });

    assert.equal(normalized.version, 1);
    assert.equal(normalized.width, 1280);
    assert.equal(normalized.height, 720);
    assert.equal(normalized.elements[0].x, 600);
    assert.equal(normalized.elements[0].width, 680);
    assert.equal(normalized.elements[0].height, 320);
  });

  it("rejects unsafe /uploads path tricks", () => {
    const rejected = [
      "/uploads/../secret.png",
      "/uploads/%2e%2e/secret.png",
      "/uploads/logo.png?cache=1",
      "/uploads/logo.png#frag",
      "/uploads\\logo.png",
      "//uploads/logo.png",
      "/uploads/",
      "/uploads",
    ];
    const accepted = ["/uploads/logo.png", "/uploads/nested/logo.png"];

    for (const src of rejected) {
      const normalized = normalizeCustomSlide({
        elements: [
          {
            id: `img-${src}`,
            type: "image",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            src,
          },
        ],
      });
      assert.equal(normalized.elements[0].src, "", `expected rejection for ${src}`);
    }

    for (const src of accepted) {
      const normalized = normalizeCustomSlide({
        elements: [
          {
            id: `img-${src}`,
            type: "image",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            src,
          },
        ],
      });
      assert.equal(normalized.elements[0].src, src);
    }
  });

  it("normalizes rotation to [0, 360) and clamps zIndex to a sane range", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          id: "t1",
          type: "text",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          rotation: 405,
          zIndex: 999999,
          text: "Spin",
        },
        {
          id: "t2",
          type: "text",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          rotation: -90,
          zIndex: -25,
          text: "Back",
        },
      ],
    });

    const rotated = Object.fromEntries(
      normalized.elements.map((element) => [element.id, element])
    );
    assert.equal(rotated.t1.rotation, 45);
    assert.equal(rotated.t1.zIndex, 1);
    assert.equal(rotated.t2.rotation, 270);
    assert.equal(rotated.t2.zIndex, 0);
  });

  it("canonicalizes zIndex to sequential order while preserving stable sort", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          id: "c",
          type: "text",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          zIndex: 50,
          text: "c",
        },
        {
          id: "a",
          type: "text",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          zIndex: 10,
          text: "a",
        },
        {
          id: "b",
          type: "text",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          zIndex: 30,
          text: "b",
        },
      ],
    });

    assert.deepEqual(
      normalized.elements.map((element) => [element.id, element.zIndex]),
      [
        ["a", 0],
        ["b", 1],
        ["c", 2],
      ]
    );
  });

  it("translates rotated visual bounds to fit inside the canvas", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          id: "rotated",
          type: "rect",
          x: -20,
          y: 700,
          width: 100,
          height: 100,
          rotation: 45,
          fill: "#ff0000",
        },
      ],
    });

    const rect = normalized.elements[0];
    const corners = rotatedCorners(rect.x, rect.y, rect.width, rect.height, rect.rotation);
    assert.ok(corners.every((point) => point.x >= 0 && point.x <= 1280));
    assert.ok(corners.every((point) => point.y >= 0 && point.y <= 720));
  });

  it("proportionally shrinks rotated elements that cannot fit the canvas", () => {
    const normalized = normalizeCustomSlide({
      elements: [
        {
          id: "huge",
          type: "rect",
          x: 640,
          y: 360,
          width: 2000,
          height: 2000,
          rotation: 45,
          fill: "#00ff00",
        },
      ],
    });

    const rect = normalized.elements[0];
    assert.ok(rect.width < 2000);
    assert.ok(rect.height < 2000);
    const corners = rotatedCorners(rect.x, rect.y, rect.width, rect.height, rect.rotation);
    assert.ok(corners.every((point) => point.x >= 0 && point.x <= 1280));
    assert.ok(corners.every((point) => point.y >= 0 && point.y <= 720));
  });

  it("rejects encoded upload path tricks but allows safe unicode filenames", () => {
    const rejected = [
      "/uploads/%2fetc/passwd",
      "/uploads/%5cwindows/system32",
      "/uploads/%252e%252e/secret.png",
      "/uploads/%2e%2e%2fsecret.png",
      "/uploads/safe/%2e%2e/secret.png",
      "/uploads/logo.png%00.png",
      "/uploads/a%2fb.png",
      "/uploads/..%255csecret.png",
      "/uploads/file.png%2500.jpg",
      "/uploads/%250ahidden.png",
      "/uploads/%09tab.png",
    ];
    const accepted = [
      "/uploads/한글.png",
      "/uploads/nested/photos/logo.png",
      "/uploads/my%20file.png",
    ];

    for (const src of rejected) {
      const normalized = normalizeCustomSlide({
        elements: [
          {
            id: "img",
            type: "image",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            src,
          },
        ],
      });
      assert.equal(normalized.elements[0].src, "", `expected rejection for ${src}`);
    }

    for (const src of accepted) {
      const normalized = normalizeCustomSlide({
        elements: [
          {
            id: "img",
            type: "image",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            src,
          },
        ],
      });
      assert.equal(normalized.elements[0].src, src);
    }
  });
});

function expectedFabricTopLeft(object) {
  const scaleX = object.scaleX ?? 1;
  const scaleY = object.scaleY ?? 1;
  const width = object.width * Math.abs(scaleX);
  const height = object.height * Math.abs(scaleY);
  const originX = object.originX ?? "left";
  const originY = object.originY ?? "top";
  const angle = ((object.angle ?? 0) % 360 + 360) % 360;

  let offsetX = 0;
  let offsetY = 0;
  if (originX === "center") {
    offsetX = 0;
  } else if (originX === "right") {
    offsetX = -width / 2;
  } else if (scaleX < 0) {
    offsetX = -width / 2;
  } else {
    offsetX = width / 2;
  }

  if (originY === "center") {
    offsetY = 0;
  } else if (originY === "bottom") {
    offsetY = -height / 2;
  } else if (scaleY < 0) {
    offsetY = -height / 2;
  } else {
    offsetY = height / 2;
  }

  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotatedOffsetX = offsetX * cos - offsetY * sin;
  const rotatedOffsetY = offsetX * sin + offsetY * cos;
  const centerX = object.left + rotatedOffsetX;
  const centerY = object.top + rotatedOffsetY;

  return {
    x: Math.round((centerX - width / 2) * 1e6) / 1e6,
    y: Math.round((centerY - height / 2) * 1e6) / 1e6,
    width,
    height,
    rotation: angle,
  };
}

function rotatedCorners(x, y, width, height, rotation) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const points = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  });
}

describe("cloneCustomSlide", () => {
  it("guarantees generated ids are nonempty, unique, and not reused from source", () => {
    const source = normalizeCustomSlide({
      elements: [
        { id: "dup", type: "text", x: 0, y: 0, width: 10, height: 10, text: "a" },
        { id: "dup", type: "text", x: 1, y: 1, width: 10, height: 10, text: "b" },
        {
          id: "img",
          type: "image",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          src: "/uploads/a.png",
        },
      ],
    });

    let calls = 0;
    const cloned = cloneCustomSlide(source, () => {
      calls += 1;
      return calls <= 2 ? "dup" : `fresh-${calls}`;
    });

    const ids = cloned.elements.map((element) => element.id);
    assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => !source.elements.some((element) => element.id === id)));
  });

  it("issues fresh element ids while retaining safe asset references", () => {
    const source = normalizeCustomSlide({
      elements: [
        {
          id: "old-text",
          type: "text",
          x: 10,
          y: 10,
          width: 100,
          height: 30,
          text: "Copy",
        },
        {
          id: "old-image",
          type: "image",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          src: "/uploads/picture.png",
        },
      ],
    });

    const cloned = cloneCustomSlide(source, idFactory());

    assert.notEqual(cloned, source);
    assert.notDeepEqual(
      cloned.elements.map((element) => element.id),
      source.elements.map((element) => element.id)
    );
    assert.equal(cloned.elements[0].text, "Copy");
    assert.equal(cloned.elements[1].src, "/uploads/picture.png");
  });
});

describe("custom slide fabric conversion", () => {
  it("round-trips supported elements through fabric descriptors", () => {
    const model = normalizeCustomSlide({
      background: { color: "#000000" },
      elements: [
        {
          id: "t1",
          type: "text",
          x: 100,
          y: 50,
          width: 300,
          height: 60,
          rotation: 10,
          opacity: 0.9,
          zIndex: 1,
          text: "Title",
          fontFamily: "Georgia",
          fontSize: 36,
          fontWeight: "700",
          color: "#ffffff",
          textAlign: "center",
        },
        {
          id: "i1",
          type: "image",
          x: 20,
          y: 20,
          width: 120,
          height: 80,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
          src: "/uploads/bg.png",
          fit: "cover",
        },
        {
          id: "r1",
          type: "rect",
          x: 400,
          y: 200,
          width: 150,
          height: 90,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          fill: "#ffcc00",
          stroke: "#000000",
          strokeWidth: 2,
        },
        {
          id: "rr1",
          type: "roundRect",
          x: 500,
          y: 300,
          width: 100,
          height: 60,
          rotation: 0,
          opacity: 1,
          zIndex: 3,
          fill: "#00aa88",
          stroke: "",
          strokeWidth: 0,
          rx: 12,
        },
        {
          id: "e1",
          type: "ellipse",
          x: 600,
          y: 400,
          width: 80,
          height: 50,
          rotation: 0,
          opacity: 1,
          zIndex: 4,
          fill: "#aa00ff",
          stroke: "#ffffff",
          strokeWidth: 1,
        },
        {
          id: "l1",
          type: "line",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity: 1,
          zIndex: 5,
          x2: 640,
          y2: 360,
          stroke: "#123456",
          strokeWidth: 4,
        },
      ],
    });

    const fabricObjects = customSlideToFabricObjects(model);
    assert.equal(fabricObjects.length, 7);
    assert.equal(fabricObjects[0].role, "background");
    assert.ok(
      fabricObjects.slice(1).every((object) => typeof object.type === "string")
    );
    assert.ok(
      fabricObjects.slice(1).every((object) => object.customElementId)
    );

    const roundTripped = fabricObjectsToCustomSlide(fabricObjects);
    assert.deepEqual(roundTripped, model);
  });

  it("always includes a nonselectable background descriptor for populated slides", () => {
    const model = normalizeCustomSlide({
      background: { color: "#abcdef" },
      elements: [
        {
          id: "t1",
          type: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          text: "Hi",
        },
      ],
    });

    const fabricObjects = customSlideToFabricObjects(model);
    assert.deepEqual(fabricObjects[0], {
      type: "rect",
      role: "background",
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
      fill: "#abcdef",
      selectable: false,
      evented: false,
    });
  });

  it("derives imported zIndex from fabric object array order", () => {
    const fabricObjects = [
      {
        type: "rect",
        role: "background",
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        fill: "#ffffff",
        selectable: false,
        evented: false,
      },
      {
        type: "textbox",
        elementType: "text",
        customElementId: "back",
        left: 0,
        top: 0,
        width: 100,
        height: 40,
        zIndex: 99,
        text: "back",
      },
      {
        type: "textbox",
        elementType: "text",
        customElementId: "front",
        left: 10,
        top: 10,
        width: 100,
        height: 40,
        zIndex: 0,
        text: "front",
      },
    ];

    const slide = fabricObjectsToCustomSlide(fabricObjects);
    assert.deepEqual(
      slide.elements.map((element) => [element.id, element.zIndex]),
      [
        ["back", 0],
        ["front", 1],
      ]
    );
  });

  it("normalizes scaled and center-origin fabric boxes to canonical top-left geometry", () => {
    const fabricObjects = [
      {
        type: "rect",
        role: "background",
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        fill: "#ffffff",
        selectable: false,
        evented: false,
      },
      {
        type: "rect",
        elementType: "rect",
        customElementId: "scaled",
        originX: "center",
        originY: "center",
        left: 200,
        top: 150,
        width: 100,
        height: 80,
        scaleX: 2,
        scaleY: 1.5,
        angle: 0,
        fill: "#ff0000",
        stroke: "",
        strokeWidth: 0,
      },
    ];

    const slide = fabricObjectsToCustomSlide(fabricObjects);
    const rect = slide.elements[0];
    assert.equal(rect.x, 100);
    assert.equal(rect.y, 90);
    assert.equal(rect.width, 200);
    assert.equal(rect.height, 120);
  });

  it("imports fabric lines with baked endpoints and zero canonical rotation", () => {
    const fabricObjects = [
      {
        type: "rect",
        role: "background",
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        fill: "#ffffff",
        selectable: false,
        evented: false,
      },
      {
        type: "line",
        elementType: "line",
        customElementId: "line-2",
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        left: 50,
        top: 60,
        scaleX: 2,
        scaleY: 1,
        angle: 90,
        stroke: "#123456",
        strokeWidth: 3,
        opacity: 0.8,
      },
    ];

    const slide = fabricObjectsToCustomSlide(fabricObjects);
    const line = slide.elements[0];
    assert.equal(line.x, 50);
    assert.equal(line.y, 60);
    assert.equal(line.x2, 50);
    assert.equal(line.y2, 260);
    assert.equal(line.rotation, 0);
    assert.equal(line.stroke, "#123456");
    assert.equal(line.strokeWidth, 3);
    assert.equal(line.opacity, 0.8);
  });

  it("keeps line import export import stable across two round trips", () => {
    const model = normalizeCustomSlide({
      elements: [
        {
          id: "line-a",
          type: "line",
          x: 40,
          y: 50,
          width: 0,
          height: 0,
          x2: 240,
          y2: 150,
          stroke: "#111111",
          strokeWidth: 2,
        },
      ],
    });

    const once = fabricObjectsToCustomSlide(customSlideToFabricObjects(model));
    const twice = fabricObjectsToCustomSlide(customSlideToFabricObjects(once));
    assert.deepEqual(once, model);
    assert.deepEqual(twice, model);
  });

  it("imports rotated fabric boxes from center and right bottom origins", () => {
    const cases = [
      {
        id: "center-90",
        object: {
          type: "rect",
          elementType: "rect",
          customElementId: "center-90",
          originX: "center",
          originY: "center",
          left: 300,
          top: 200,
          width: 100,
          height: 80,
          scaleX: 1,
          scaleY: 1,
          angle: 90,
          fill: "#ff0000",
        },
      },
      {
        id: "center-45",
        object: {
          type: "rect",
          elementType: "rect",
          customElementId: "center-45",
          originX: "center",
          originY: "center",
          left: 400,
          top: 300,
          width: 120,
          height: 60,
          scaleX: 1,
          scaleY: 1,
          angle: 45,
          fill: "#00ff00",
        },
      },
      {
        id: "right-bottom",
        object: {
          type: "rect",
          elementType: "rect",
          customElementId: "right-bottom",
          originX: "right",
          originY: "bottom",
          left: 500,
          top: 400,
          width: 80,
          height: 50,
          scaleX: 1,
          scaleY: 1,
          angle: 90,
          fill: "#0000ff",
        },
      },
      {
        id: "mixed-45",
        object: {
          type: "rect",
          elementType: "rect",
          customElementId: "mixed-45",
          originX: "right",
          originY: "center",
          left: 600,
          top: 300,
          width: 100,
          height: 80,
          scaleX: 1,
          scaleY: 1,
          angle: 45,
          fill: "#aa00aa",
        },
      },
    ];

    for (const testCase of cases) {
      const expected = expectedFabricTopLeft(testCase.object);
      const slide = fabricObjectsToCustomSlide([
        {
          type: "rect",
          role: "background",
          left: 0,
          top: 0,
          width: 1280,
          height: 720,
          fill: "#ffffff",
          selectable: false,
          evented: false,
        },
        testCase.object,
      ]);
      const rect = slide.elements[0];
      assert.equal(rect.x, expected.x, `${testCase.id} x`);
      assert.equal(rect.y, expected.y, `${testCase.id} y`);
      assert.equal(rect.width, expected.width, `${testCase.id} width`);
      assert.equal(rect.height, expected.height, `${testCase.id} height`);
      assert.equal(rect.rotation, expected.rotation, `${testCase.id} rotation`);
    }
  });

  // The editor bakes a text scale into fontSize/width before it serializes
  // (see `bakeTextScale`), so a scaled descriptor only reaches this pure
  // function from older callers: the box flattens, the font size stays put.
  it("preserves text fontSize while flattening scaled fabric text boxes", () => {
    const slide = fabricObjectsToCustomSlide([
      {
        type: "rect",
        role: "background",
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        fill: "#ffffff",
        selectable: false,
        evented: false,
      },
      {
        type: "textbox",
        elementType: "text",
        customElementId: "text-1",
        originX: "center",
        originY: "center",
        left: 300,
        top: 200,
        width: 100,
        height: 40,
        scaleX: 2,
        scaleY: 1.5,
        angle: 0,
        fontSize: 24,
        text: "Hello",
        fill: "#000000",
      },
    ]);

    const text = slide.elements[0];
    assert.equal(text.fontSize, 24);
    assert.equal(text.width, 200);
    assert.equal(text.height, 60);
    assert.equal(text.x, 200);
    assert.equal(text.y, 170);
  });

  it("scales roundRect rx with the minimum absolute fabric scale", () => {
    const slide = fabricObjectsToCustomSlide([
      {
        type: "rect",
        role: "background",
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        fill: "#ffffff",
        selectable: false,
        evented: false,
      },
      {
        type: "rect",
        elementType: "roundRect",
        customElementId: "rr-1",
        originX: "left",
        originY: "top",
        left: 100,
        top: 100,
        width: 80,
        height: 60,
        scaleX: 2,
        scaleY: 1.5,
        rx: 8,
        fill: "#cccccc",
      },
    ]);

    assert.equal(slide.elements[0].rx, 12);
  });

  it("converts negative fabric flips into absolute scale and normalized top-left", () => {
    const slide = fabricObjectsToCustomSlide([
      {
        type: "rect",
        role: "background",
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        fill: "#ffffff",
        selectable: false,
        evented: false,
      },
      {
        type: "rect",
        elementType: "rect",
        customElementId: "flip",
        originX: "left",
        originY: "top",
        left: 300,
        top: 200,
        width: 100,
        height: 80,
        scaleX: -2,
        scaleY: -1.5,
        fill: "#ff0000",
      },
    ]);

    const rect = slide.elements[0];
    assert.equal(rect.x, 100);
    assert.equal(rect.y, 80);
    assert.equal(rect.width, 200);
    assert.equal(rect.height, 120);
  });

  it("exports center-origin descriptors and round-trips non-sequential zIndex slides twice", () => {
    const model = normalizeCustomSlide({
      background: { color: "#223344" },
      elements: [
        {
          id: "back",
          type: "rect",
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          rotation: 15,
          zIndex: 40,
          fill: "#111111",
        },
        {
          id: "front",
          type: "text",
          x: 200,
          y: 100,
          width: 160,
          height: 50,
          rotation: 0,
          zIndex: 5,
          text: "Front",
          fontSize: 28,
        },
      ],
    });

    const normalized = normalizeCustomSlide(model);
    const exported = customSlideToFabricObjects(normalized);
    assert.equal(exported.length, 3);
    assert.deepEqual(exported[0], {
      type: "rect",
      role: "background",
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
      fill: "#223344",
      selectable: false,
      evented: false,
    });

    const front = normalized.elements.find((element) => element.id === "front");
    const back = normalized.elements.find((element) => element.id === "back");

    const textDescriptor = exported[1];
    assert.equal(textDescriptor.elementType, "text");
    assert.equal(textDescriptor.originX, "center");
    assert.equal(textDescriptor.originY, "center");
    assert.equal(textDescriptor.left, front.x + front.width / 2);
    assert.equal(textDescriptor.top, front.y + front.height / 2);
    assert.equal(textDescriptor.fontSize, 28);

    const rectDescriptor = exported[2];
    assert.equal(rectDescriptor.elementType, "rect");
    assert.equal(rectDescriptor.originX, "center");
    assert.equal(rectDescriptor.originY, "center");
    assert.equal(rectDescriptor.left, back.x + back.width / 2);
    assert.equal(rectDescriptor.top, back.y + back.height / 2);
    assert.equal(rectDescriptor.angle, 15);

    const once = fabricObjectsToCustomSlide(exported);
    const twice = fabricObjectsToCustomSlide(customSlideToFabricObjects(once));
    assert.deepEqual(once, normalized);
    assert.deepEqual(twice, normalized);
  });

  it("applies slide background color to fabric descriptors", () => {
    const model = normalizeCustomSlide({
      background: { color: "#445566" },
      elements: [],
    });

    const fabricObjects = customSlideToFabricObjects(model);
    assert.deepEqual(fabricObjects, [
      {
        type: "rect",
        role: "background",
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        fill: "#445566",
        selectable: false,
        evented: false,
      },
    ]);
  });
});
