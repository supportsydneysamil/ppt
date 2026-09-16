import test from "node:test";
import assert from "node:assert/strict";

import {
  CUSTOM_SLIDE_TEMPLATES,
  instantiateTemplate,
  decideKeyboardCommand,
  computeSnapAdjustment,
  clampBoxToCanvas,
  clampLineIntoCanvas,
  limitScaleToCanvas,
  alignBoxToSlide,
  alignBoxesTogether,
  distributeBoxes,
  serializeAfterRestoringSelection,
  isActiveSelection,
  selectedFabricObjects,
  applyImageFit,
  buildFabricObject,
  buildFabricImage,
  fabricObjectToDescriptor,
  bakeTextScale,
  fitCanvasToStage,
} from "../public/custom-slide-editor.js";
import * as fakeFabric from "./fixtures/fake-fabric.js";
import {
  normalizeCustomSlide,
  fabricObjectsToCustomSlide,
} from "../public/custom-slide-model.js";

const CANVAS = { width: 1280, height: 720 };

function templateModel(id) {
  return CUSTOM_SLIDE_TEMPLATES.find((template) => template.id === id)?.model;
}

function elementIds(id) {
  return new Set(templateModel(id)?.elements.map((element) => element.id) ?? []);
}

function assertElementIds(templateId, requiredIds) {
  const ids = elementIds(templateId);
  for (const id of requiredIds) {
    assert.ok(ids.has(id), `${templateId} is missing ${id}`);
  }
}

function assertElementInsideCanvas(templateId, element) {
  if (element.type === "line") {
    assert.ok(element.x >= 0 && element.x <= CANVAS.width, `${element.id} x`);
    assert.ok(element.y >= 0 && element.y <= CANVAS.height, `${element.id} y`);
    assert.ok(element.x2 >= 0 && element.x2 <= CANVAS.width, `${element.id} x2`);
    assert.ok(element.y2 >= 0 && element.y2 <= CANVAS.height, `${element.id} y2`);
    return;
  }
  assert.ok(element.x >= 0, `${templateId}/${element.id} x`);
  assert.ok(element.y >= 0, `${templateId}/${element.id} y`);
  assert.ok(element.x + element.width <= CANVAS.width, `${templateId}/${element.id} width`);
  assert.ok(element.y + element.height <= CANVAS.height, `${templateId}/${element.id} height`);
}

test("templates include fifteen church layouts with roles", () => {
  const expected = [
    ["blank", "빈 슬라이드"],
    ["title-hero", "타이틀 히어로"],
    ["split-photo", "좌우 분할 (사진)"],
    ["quote-card", "인용 카드"],
    ["agenda-list", "예배 순서"],
    ["scripture", "성경 본문"],
    ["lyrics", "찬양 가사"],
    ["sermon-title", "설교 제목"],
    ["sermon-points", "설교 요점"],
    ["announcements", "교회 광고"],
    ["creed", "공동 고백·기도문"],
    ["prayer", "기도 제목"],
    ["welcome", "환영"],
    ["offering", "봉헌"],
    ["next-week", "다음 주 안내"],
  ];
  assert.deepEqual(
    CUSTOM_SLIDE_TEMPLATES.map((template) => [template.id, template.label]),
    expected
  );

  const designs = CUSTOM_SLIDE_TEMPLATES.filter((template) => template.id !== "blank");
  for (const template of designs) {
    const roled = template.model.elements.filter((element) => element.themeRole);
    assert.ok(roled.length > 0, `${template.id} needs themeRole`);
  }

  const hero = instantiateTemplate("title-hero");
  assert.equal(hero.background.color, "#101c33");
  assert.equal(hero.templateId, "title-hero");
  assert.equal(hero.themeId, "native");

  const plainHero = instantiateTemplate("title-hero", undefined, "plain");
  assert.equal(plainHero.background.color, "#ffffff");
  const title = plainHero.elements.find((element) => element.themeRole === "title");
  assert.equal(title.color, "#111827");
  assert.equal(title.text, "은혜 위에 세워진 공동체");
});

test("core message templates use their approved professional structure", () => {
  assertElementIds("title-hero", ["hero-frame", "hero-kicker", "hero-title", "hero-meta"]);
  assertElementIds("split-photo", ["photo-panel", "photo-shape-back", "photo-title", "photo-body"]);
  assertElementIds("quote-card", ["quote-mark", "quote-body", "quote-source"]);
  assertElementIds("scripture", [
    "scripture-book",
    "scripture-chapter",
    "scripture-verse-number",
    "scripture-divider",
    "scripture-body",
  ]);
  assertElementIds("sermon-title", [
    "sermon-kicker",
    "sermon-heading",
    "sermon-index-frame",
    "sermon-index",
    "sermon-meta",
  ]);
});

test("information templates expose independently editable content units", () => {
  assertElementIds("agenda-list", [
    "agenda-row-1-number",
    "agenda-row-1-title",
    "agenda-row-1-owner",
    "agenda-row-2-number",
    "agenda-row-2-title",
    "agenda-row-2-owner",
    "agenda-row-3-number",
    "agenda-row-3-title",
    "agenda-row-3-owner",
  ]);
  assertElementIds("sermon-points", [
    "sermon-point-1-number",
    "sermon-point-1-text",
    "sermon-point-2-number",
    "sermon-point-2-text",
    "sermon-point-3-number",
    "sermon-point-3-text",
  ]);
  assertElementIds("announcements", [
    "announcement-1-date",
    "announcement-1-title",
    "announcement-1-detail",
    "announcement-2-date",
    "announcement-2-title",
    "announcement-2-detail",
    "announcement-3-date",
    "announcement-3-title",
    "announcement-3-detail",
  ]);
});

test("pastoral templates use approved editable units", () => {
  assertElementIds("prayer", [
    "prayer-1-number",
    "prayer-1-text",
    "prayer-2-number",
    "prayer-2-text",
    "prayer-3-number",
    "prayer-3-text",
    "prayer-orbit",
  ]);
  assertElementIds("welcome", [
    "welcome-orbit",
    "welcome-title",
    "welcome-newcomer-panel",
  ]);
  assertElementIds("offering", [
    "offering-frame",
    "offering-title",
    "offering-scripture",
  ]);
  assertElementIds("next-week", [
    "next-week-day",
    "next-week-month",
    "next-week-event",
    "next-week-cta",
  ]);
});

test("professional templates keep non-bleed elements inside the slide", () => {
  const allowedBleed = new Set(["prayer-orbit", "welcome-orbit"]);
  for (const template of CUSTOM_SLIDE_TEMPLATES) {
    for (const element of template.model.elements) {
      if (!allowedBleed.has(element.id)) {
        assertElementInsideCanvas(template.id, element);
      }
    }
  }
});

test("professional templates retain geometry and copy across themes", () => {
  for (const template of CUSTOM_SLIDE_TEMPLATES.filter(({ id }) => id !== "blank")) {
    const plain = instantiateTemplate(template.id, undefined, "plain");
    const dark = instantiateTemplate(template.id, undefined, "deep-black");
    assert.deepEqual(
      plain.elements.map(({ x, y, width, height, text }) => ({
        x,
        y,
        width,
        height,
        text,
      })),
      dark.elements.map(({ x, y, width, height, text }) => ({
        x,
        y,
        width,
        height,
        text,
      }))
    );
  }
});

test("every template model survives normalization unchanged", () => {
  for (const template of CUSTOM_SLIDE_TEMPLATES) {
    const normalized = normalizeCustomSlide(template.model);
    assert.deepEqual(
      normalized,
      normalizeCustomSlide(normalized),
      `${template.id} is not a stable custom slide model`
    );
    assert.equal(normalized.width, 1280);
    assert.equal(normalized.height, 720);
    assert.equal(normalized.elements.length, template.model.elements.length);
  }
});

test("instantiateTemplate clones fresh element ids on every call", () => {
  const design = CUSTOM_SLIDE_TEMPLATES.find((template) => template.id !== "blank");

  const first = instantiateTemplate(design.id);
  const second = instantiateTemplate(design.id);

  assert.equal(first.elements.length, design.model.elements.length);
  const firstIds = first.elements.map((element) => element.id);
  const secondIds = second.elements.map((element) => element.id);

  assert.equal(new Set(firstIds).size, firstIds.length);
  for (const id of firstIds) {
    assert.equal(secondIds.includes(id), false, "ids must not repeat across instances");
  }

  const sourceIds = design.model.elements.map((element) => element.id).filter(Boolean);
  for (const id of sourceIds) {
    assert.equal(firstIds.includes(id), false, "ids must not reuse template ids");
  }

  // Template models must not be mutated by instantiation.
  assert.deepEqual(
    design.model,
    CUSTOM_SLIDE_TEMPLATES.find((template) => template.id === design.id).model
  );
});

test("instantiateTemplate supports an injected id factory and unknown ids fall back to blank", () => {
  const design = CUSTOM_SLIDE_TEMPLATES.find((template) => template.id !== "blank");
  let counter = 0;
  const instance = instantiateTemplate(design.id, () => `fixed-${(counter += 1)}`);
  assert.deepEqual(
    instance.elements.map((element) => element.id),
    design.model.elements.map((_, index) => `fixed-${index + 1}`)
  );

  const unknown = instantiateTemplate("does-not-exist");
  assert.equal(unknown.elements.length, 0);
});

test("decideKeyboardCommand maps editor shortcuts", () => {
  const base = { target: { tagName: "CANVAS" }, isTextEditing: false };

  assert.equal(decideKeyboardCommand({ ...base, key: "c", ctrlKey: true }), "copy");
  assert.equal(decideKeyboardCommand({ ...base, key: "C", metaKey: true }), "copy");
  assert.equal(decideKeyboardCommand({ ...base, key: "v", ctrlKey: true }), "paste");
  assert.equal(decideKeyboardCommand({ ...base, key: "z", ctrlKey: true }), "undo");
  assert.equal(
    decideKeyboardCommand({ ...base, key: "z", metaKey: true, shiftKey: true }),
    "redo"
  );
  assert.equal(decideKeyboardCommand({ ...base, key: "y", ctrlKey: true }), "redo");
  assert.equal(decideKeyboardCommand({ ...base, key: "Delete" }), "delete");
  assert.equal(decideKeyboardCommand({ ...base, key: "Backspace" }), "delete");
  assert.equal(decideKeyboardCommand({ ...base, key: "d", ctrlKey: true }), "duplicate");
  assert.equal(decideKeyboardCommand({ ...base, key: "a", ctrlKey: true }), "select-all");
  assert.equal(decideKeyboardCommand({ ...base, key: "Escape" }), "deselect");
  assert.equal(decideKeyboardCommand({ ...base, key: "[", ctrlKey: true, shiftKey: true }), "backward");
  assert.equal(decideKeyboardCommand({ ...base, key: "]", ctrlKey: true, shiftKey: true }), "forward");
  assert.equal(decideKeyboardCommand({ ...base, key: "ArrowLeft" }), "nudge-left");
  assert.equal(decideKeyboardCommand({ ...base, key: "ArrowLeft", shiftKey: true }), "nudge-left-large");
});

test("decideKeyboardCommand ignores typing contexts and unknown keys", () => {
  assert.equal(
    decideKeyboardCommand({ key: "Delete", target: { tagName: "INPUT" } }),
    null
  );
  assert.equal(
    decideKeyboardCommand({ key: "z", ctrlKey: true, target: { tagName: "TEXTAREA" } }),
    null
  );
  assert.equal(
    decideKeyboardCommand({ key: "Backspace", target: { tagName: "SELECT" } }),
    null
  );
  assert.equal(
    decideKeyboardCommand({
      key: "Backspace",
      target: { tagName: "DIV", isContentEditable: true },
    }),
    null
  );
  assert.equal(
    decideKeyboardCommand({
      key: "Backspace",
      target: { tagName: "CANVAS" },
      isTextEditing: true,
    }),
    null
  );
  assert.equal(
    decideKeyboardCommand({ key: "c", target: { tagName: "CANVAS" } }),
    null
  );
  assert.equal(decideKeyboardCommand(null), null);
});

test("alignBoxToSlide aligns against the 1280x720 slide", () => {
  const box = { x: 10, y: 20, width: 280, height: 120 };

  assert.deepEqual(alignBoxToSlide(box, "left", CANVAS), { ...box, x: 0, y: 20 });
  assert.deepEqual(alignBoxToSlide(box, "center", CANVAS), { ...box, x: 500, y: 20 });
  assert.deepEqual(alignBoxToSlide(box, "right", CANVAS), { ...box, x: 1000, y: 20 });
  assert.deepEqual(alignBoxToSlide(box, "top", CANVAS), { ...box, x: 10, y: 0 });
  assert.deepEqual(alignBoxToSlide(box, "middle", CANVAS), { ...box, x: 10, y: 300 });
  assert.deepEqual(alignBoxToSlide(box, "bottom", CANVAS), { ...box, x: 10, y: 600 });
  assert.deepEqual(alignBoxToSlide(box, "nonsense", CANVAS), box);
});

test("alignBoxesTogether and distributeBoxes operate on the selection", () => {
  const boxes = [
    { x: 10, y: 10, width: 20, height: 20 },
    { x: 80, y: 40, width: 20, height: 20 },
    { x: 200, y: 80, width: 20, height: 20 },
  ];
  const left = alignBoxesTogether(boxes, "left");
  assert.equal(left[0].x, 10);
  assert.equal(left[1].x, 10);
  assert.equal(left[2].x, 10);

  const distributed = distributeBoxes(boxes, "x");
  assert.equal(distributed[0].x, 10);
  assert.equal(distributed[2].x, 200);
  assert.ok(distributed[1].x > 10 && distributed[1].x < 200);
});

test("a multi-selection is recognized whichever casing fabric reports", () => {
  for (const type of ["activeselection", "activeSelection"]) {
    assert.ok(isActiveSelection({ type }), `${type} should read as a selection`);
  }
  assert.ok(!isActiveSelection({ type: "rect" }));
  assert.ok(!isActiveSelection(null));
});

test("selectedFabricObjects returns every member of a multi-selection", () => {
  const members = [
    { left: 10, top: 10, role: "element" },
    { left: 80, top: 40, role: "element" },
  ];
  const selection = new fakeFabric.ActiveSelection(members);
  const canvas = { getActiveObject: () => selection };
  assert.deepEqual(selectedFabricObjects(canvas), members);
});

test("serializeAfterRestoringSelection discards ActiveSelection before reading coords", () => {
  const members = [
    { left: 10, top: 20, role: "element" },
    { left: 30, top: 40, role: "element" },
  ];
  const selection = new fakeFabric.ActiveSelection(members);
  assert.notEqual(members[0].left, 10);
  let restored = false;
  const canvas = {
    getActiveObject: () => selection,
    discardActiveObject() {
      selection.restoreAbsolute();
      this._active = null;
    },
    setActiveObject() {
      restored = true;
    },
  };
  const result = serializeAfterRestoringSelection(canvas, fakeFabric, () => {
    return members.map((member) => member.left);
  });
  assert.deepEqual(result, [10, 30]);
  assert.equal(restored, true);
});

test("clampBoxToCanvas keeps unrotated boxes inside the slide", () => {
  assert.deepEqual(
    clampBoxToCanvas({ x: -40, y: -10, width: 200, height: 100, rotation: 0 }, CANVAS),
    { x: 0, y: 0, width: 200, height: 100, rotation: 0 }
  );
  assert.deepEqual(
    clampBoxToCanvas({ x: 1200, y: 700, width: 200, height: 100, rotation: 0 }, CANVAS),
    { x: 1080, y: 620, width: 200, height: 100, rotation: 0 }
  );
  assert.deepEqual(
    clampBoxToCanvas({ x: 100, y: 100, width: 200, height: 100, rotation: 0 }, CANVAS),
    { x: 100, y: 100, width: 200, height: 100, rotation: 0 }
  );
});

test("clampBoxToCanvas accounts for rotation and oversized boxes", () => {
  // A 90deg rotated 200x100 box has a 100x200 bounding box around the same center,
  // so its top edge sticks out by 50px and the box must slide down.
  const rotated = clampBoxToCanvas(
    { x: 0, y: 0, width: 200, height: 100, rotation: 90 },
    CANVAS
  );
  assert.equal(rotated.x, 0);
  assert.equal(rotated.y, 50);

  const oversized = clampBoxToCanvas(
    { x: -500, y: -500, width: 2000, height: 1000, rotation: 0 },
    CANVAS
  );
  assert.equal(oversized.x, -360);
  assert.equal(oversized.y, -140);
});

test("computeSnapAdjustment snaps to slide center, edges and neighbours", () => {
  const centered = computeSnapAdjustment(
    { x: 496, y: 200, width: 280, height: 120 },
    CANVAS,
    [],
    8
  );
  assert.equal(centered.dx, 4);
  assert.equal(centered.dy, 0);
  assert.deepEqual(centered.guides, [{ orientation: "vertical", position: 640 }]);

  const edge = computeSnapAdjustment(
    { x: 3, y: 714, width: 100, height: 100 },
    CANVAS,
    [],
    8
  );
  assert.equal(edge.dx, -3);
  assert.equal(edge.dy, 6);

  const neighbour = computeSnapAdjustment(
    { x: 200, y: 500, width: 100, height: 50 },
    CANVAS,
    [{ x: 195, y: 100, width: 100, height: 50 }],
    8
  );
  assert.equal(neighbour.dx, -5);
  assert.deepEqual(neighbour.guides, [{ orientation: "vertical", position: 195 }]);

  const far = computeSnapAdjustment(
    { x: 300, y: 200, width: 100, height: 50 },
    CANVAS,
    [],
    8
  );
  assert.equal(far.dx, 0);
  assert.equal(far.dy, 0);
  assert.deepEqual(far.guides, []);
});

test("clampLineIntoCanvas translates both endpoints together", () => {
  assert.deepEqual(
    clampLineIntoCanvas({ x1: 100, y1: 100, x2: 500, y2: 200 }, CANVAS),
    { dx: 0, dy: 0, x1: 100, y1: 100, x2: 500, y2: 200 }
  );

  assert.deepEqual(
    clampLineIntoCanvas({ x1: -40, y1: -10, x2: 200, y2: 300 }, CANVAS),
    { dx: 40, dy: 10, x1: 0, y1: 0, x2: 240, y2: 310 }
  );

  assert.deepEqual(
    clampLineIntoCanvas({ x1: 1100, y1: 600, x2: 1400, y2: 800 }, CANVAS),
    { dx: -120, dy: -80, x1: 980, y1: 520, x2: 1280, y2: 720 }
  );
});

test("clampLineIntoCanvas keeps the leading edge visible for oversized lines", () => {
  // Translation alone cannot fit a 1600px span, so the start edge wins.
  assert.deepEqual(
    clampLineIntoCanvas({ x1: -100, y1: 100, x2: 1500, y2: 200 }, CANVAS),
    { dx: 100, dy: 0, x1: 0, y1: 100, x2: 1600, y2: 200 }
  );
});

test("limitScaleToCanvas caps scaling so rotated extents stay inside the slide", () => {
  assert.deepEqual(
    limitScaleToCanvas({ width: 200, height: 100, rotation: 0, scaleX: 1, scaleY: 1 }, CANVAS),
    { scaleX: 1, scaleY: 1 }
  );

  assert.deepEqual(
    limitScaleToCanvas({ width: 200, height: 100, rotation: 0, scaleX: 8, scaleY: 8 }, CANVAS),
    { scaleX: 6.4, scaleY: 6.4 }
  );

  assert.deepEqual(
    limitScaleToCanvas({ width: 400, height: 100, rotation: 0, scaleX: 4, scaleY: 2 }, CANVAS),
    { scaleX: 3.2, scaleY: 1.6 }
  );

  const rotated = limitScaleToCanvas(
    { width: 200, height: 200, rotation: 45, scaleX: 4, scaleY: 4 },
    CANVAS
  );
  const extent = 200 * rotated.scaleX * Math.SQRT2;
  assert.ok(extent <= 720 + 1e-6, `rotated extent ${extent} must fit 720`);
  assert.ok(extent > 719, `rotated extent ${extent} should use the available height`);
  assert.equal(rotated.scaleX, rotated.scaleY);
});

test("applyImageFit stores the authored layout box and stays stable across toggles", () => {
  const image = new fakeFabric.FabricImage({ width: 100, height: 50 });
  image.set({ customNaturalWidth: 100, customNaturalHeight: 50 });

  applyImageFit(image, "contain", 600, 400);
  const contain = {
    width: image.width,
    height: image.height,
    scaleX: image.scaleX,
    scaleY: image.scaleY,
    cropX: image.cropX,
    cropY: image.cropY,
  };
  assert.deepEqual(contain, {
    width: 100,
    height: 50,
    scaleX: 6,
    scaleY: 6,
    cropX: 0,
    cropY: 0,
  });
  assert.equal(image.customBoxWidth, 600);
  assert.equal(image.customBoxHeight, 400);
  assert.equal(image.customFit, "contain");

  applyImageFit(image, "cover", image.customBoxWidth, image.customBoxHeight);
  assert.equal(image.width, 75);
  assert.equal(image.height, 50);
  assert.equal(image.scaleX, 8);
  assert.equal(image.scaleY, 8);
  assert.equal(image.customBoxWidth, 600);
  assert.equal(image.customBoxHeight, 400);

  applyImageFit(image, "contain", image.customBoxWidth, image.customBoxHeight);
  assert.deepEqual(
    {
      width: image.width,
      height: image.height,
      scaleX: image.scaleX,
      scaleY: image.scaleY,
      cropX: image.cropX,
      cropY: image.cropY,
    },
    contain
  );
  assert.equal(image.customBoxWidth, 600);
  assert.equal(image.customBoxHeight, 400);
});

test("image descriptors serialize the authored box instead of letterboxed pixels", async () => {
  fakeFabric.__resetFakeFabric();
  fakeFabric.__setImageBehaviour({ width: 100, height: 50 });

  const element = {
    id: "image-1",
    type: "image",
    src: "/uploads/photo.png",
    fit: "contain",
    x: 340,
    y: 160,
    width: 600,
    height: 400,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    flipH: true,
    flipV: true,
    altText: "강단 위의 성경",
  };

  const image = await buildFabricImage(fakeFabric, element);
  assert.equal(image.customBoxWidth, 600);
  assert.equal(image.customBoxHeight, 400);
  assert.equal(image.flipX, true);
  assert.equal(image.flipY, true);
  assert.equal(image.customAltText, "강단 위의 성경");

  const descriptor = fabricObjectToDescriptor(image);
  assert.equal(descriptor.width, 600);
  assert.equal(descriptor.height, 400);
  assert.equal(descriptor.scaleX, 1);
  assert.equal(descriptor.scaleY, 1);
  assert.equal(descriptor.flipH, true);
  assert.equal(descriptor.flipV, true);
  assert.equal(descriptor.altText, "강단 위의 성경");

  const slide = fabricObjectsToCustomSlide([descriptor]);
  assert.deepEqual(
    {
      x: slide.elements[0].x,
      y: slide.elements[0].y,
      width: slide.elements[0].width,
      height: slide.elements[0].height,
      fit: slide.elements[0].fit,
      src: slide.elements[0].src,
      flipH: slide.elements[0].flipH,
      flipV: slide.elements[0].flipV,
      altText: slide.elements[0].altText,
    },
    {
      x: 340,
      y: 160,
      width: 600,
      height: 400,
      fit: "contain",
      src: "/uploads/photo.png",
      flipH: true,
      flipV: true,
      altText: "강단 위의 성경",
    }
  );
});

test("textboxes anchor their top edge to the model y using the computed height", () => {
  const element = {
    id: "text-1",
    type: "text",
    x: 100,
    y: 80,
    width: 400,
    height: 120,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    text: "첫 줄\n둘째 줄",
    fontFamily: "Arial",
    fontSize: 48,
    fontWeight: "bold",
    color: "#112233",
    textAlign: "center",
  };

  const textbox = buildFabricObject(fakeFabric, element);
  // The fake mirrors Fabric: height comes from wrapped text, not the model.
  assert.notEqual(textbox.height, element.height);
  assert.equal(textbox.width, 400, "authored width must be preserved");
  assert.equal(textbox.left, 300);
  assert.equal(textbox.top, element.y + textbox.height / 2);

  const slide = fabricObjectsToCustomSlide([fabricObjectToDescriptor(textbox)]);
  assert.equal(slide.elements[0].y, element.y);
  assert.equal(slide.elements[0].x, element.x);
  assert.equal(slide.elements[0].width, 400);
  assert.equal(slide.elements[0].height, textbox.height);
});

// Fabric text measuring needs the native `canvas` package in Node, so the Node-side
// smoke test covers shapes and lines only; text stays a browser concern.
test("real fabric objects round-trip through the app schema", async () => {
  const fabricModule = await import("fabric/node");
  const fabric = fabricModule.fabric ?? fabricModule;

  const elements = [
    {
      id: "rect-1",
      type: "rect",
      x: 200,
      y: 300,
      width: 240,
      height: 160,
      rotation: 30,
      opacity: 0.8,
      zIndex: 0,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 4,
    },
    {
      id: "ellipse-1",
      type: "ellipse",
      x: 700,
      y: 300,
      width: 200,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      fill: "#00ff00",
      stroke: "",
      strokeWidth: 0,
    },
    {
      id: "line-1",
      type: "line",
      x: 100,
      y: 600,
      x2: 500,
      y2: 620,
      opacity: 1,
      zIndex: 3,
      stroke: "#0000ff",
      strokeWidth: 6,
    },
  ];

  const objects = elements.map((element) => buildFabricObject(fabric, element));
  for (const object of objects) {
    assert.ok(object, "fabric object must be created");
  }

  const slide = fabricObjectsToCustomSlide(
    objects.map((object) => fabricObjectToDescriptor(object)),
    { background: { color: "#fafafa" } }
  );

  assert.equal(slide.elements.length, elements.length);
  for (const [index, element] of elements.entries()) {
    const actual = slide.elements[index];
    assert.equal(actual.id, element.id);
    assert.equal(actual.type, element.type);
    if (element.type === "line") {
      assert.ok(Math.abs(actual.x - element.x) < 0.5);
      assert.ok(Math.abs(actual.x2 - element.x2) < 0.5);
      assert.ok(Math.abs(actual.y2 - element.y2) < 0.5);
    } else {
      assert.ok(Math.abs(actual.x - element.x) < 0.5, `${element.id} x`);
      assert.ok(Math.abs(actual.y - element.y) < 0.5, `${element.id} y`);
      assert.ok(Math.abs(actual.width - element.width) < 0.5, `${element.id} width`);
      assert.ok(Math.abs(actual.height - element.height) < 0.5, `${element.id} height`);
      assert.equal(actual.rotation, element.rotation);
    }
  }

  assert.equal(slide.background.color, "#fafafa");
  assert.equal(slide.elements[0].fill, "#ff0000");
  assert.equal(slide.elements[0].strokeWidth, 4);
  assert.equal(slide.elements[0].opacity, 0.8);
  assert.equal(slide.elements[1].fill, "#00ff00");
  assert.equal(slide.elements[2].stroke, "#0000ff");
  assert.equal(slide.elements[2].strokeWidth, 6);
});

test("fabric descriptors follow scaling and movement of real objects", async () => {
  const fabricModule = await import("fabric/node");
  const fabric = fabricModule.fabric ?? fabricModule;

  const object = buildFabricObject(fabric, {
    id: "rect-1",
    type: "rect",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: "#123456",
    stroke: "",
    strokeWidth: 0,
  });

  object.set({ left: 400, top: 300, scaleX: 2, scaleY: 0.5 });
  object.setCoords();

  const slide = fabricObjectsToCustomSlide([fabricObjectToDescriptor(object)]);
  const element = slide.elements[0];

  assert.equal(element.width, 400);
  assert.equal(element.height, 50);
  assert.equal(element.x, 200);
  assert.equal(element.y, 275);
});

test("baking a text scale folds it into the font size and the box width", () => {
  const textbox = buildFabricObject(fakeFabric, {
    id: "text-1",
    type: "text",
    x: 100,
    y: 80,
    width: 400,
    height: 120,
    text: "한 줄",
    fontFamily: "Malgun Gothic",
    fontSize: 40,
    fontWeight: "normal",
    color: "#111827",
    textAlign: "left",
    rotation: 0,
    opacity: 1,
    zIndex: 0,
  });

  const displayedWidth = textbox.width * 2;
  const displayedHeight = textbox.height * 2;
  textbox.set({
    scaleX: 2,
    scaleY: 2,
    left: 100 + displayedWidth / 2,
    top: 80 + displayedHeight / 2,
  });

  assert.equal(bakeTextScale(textbox), true);
  assert.equal(textbox.fontSize, 80);
  assert.equal(textbox.width, displayedWidth);
  assert.equal(textbox.height, displayedHeight);
  assert.equal(textbox.scaleX, 1);
  assert.equal(textbox.scaleY, 1);
  assert.equal(textbox.left - textbox.width / 2, 100, "the left edge must hold");
  assert.equal(textbox.top - textbox.height / 2, 80, "the top edge must hold");
});

test("baking is a no-op for an unscaled text box", () => {
  const textbox = new fakeFabric.Textbox("고정", { width: 300, fontSize: 24 });
  const before = { width: textbox.width, height: textbox.height, fontSize: 24 };

  assert.equal(bakeTextScale(textbox), false);
  assert.equal(textbox.fontSize, before.fontSize);
  assert.equal(textbox.width, before.width);
  assert.equal(textbox.height, before.height);
  assert.equal(bakeTextScale(null), false);
});

test("baking takes the font size from the vertical scale and the width from the horizontal one", () => {
  const textbox = new fakeFabric.Textbox("비율", { width: 200, fontSize: 30, originX: "center", originY: "center", left: 300, top: 200 });
  textbox.set({ scaleX: 3, scaleY: 0.5 });

  assert.equal(bakeTextScale(textbox), true);
  assert.equal(textbox.fontSize, 15);
  assert.equal(textbox.width, 600);
});

test("baking keeps the font size inside the range the model accepts", () => {
  const huge = new fakeFabric.Textbox("크게", { width: 100, fontSize: 400 });
  huge.set({ scaleX: 4, scaleY: 4 });
  assert.equal(bakeTextScale(huge), true);
  assert.equal(huge.fontSize, 512);

  const tiny = new fakeFabric.Textbox("작게", { width: 100, fontSize: 2 });
  tiny.set({ scaleX: 0.1, scaleY: 0.1 });
  assert.equal(bakeTextScale(tiny), true);
  assert.equal(tiny.fontSize, 1);
});

// The stage is a 16:9 box with a 1px border, so its content box is a hair
// shorter than its width implies. Sizing the canvas from the width alone left
// it ~0.9px too tall at every width, and that sliver is what handed the stage a
// scrollbar: where the bar takes layout width it shrinks the stage, the canvas
// refits smaller, the bar goes away, and the stage shakes between the two.
test("fitting the canvas keeps it inside a stage that is shorter than its width implies", () => {
  const fit = fitCanvasToStage({ width: 639, height: 358.671875 }, 1);

  assert.ok(fit.height <= 358.671875, `${fit.height} overflowed the stage`);
  assert.ok(fit.width <= 639);
  assert.equal(Math.round((fit.width / fit.height) * 1000), Math.round((1280 / 720) * 1000));
});

test("fitting the canvas fills the stage when the box is taller than 16:9", () => {
  const fit = fitCanvasToStage({ width: 640, height: 900 }, 1);

  assert.equal(fit.width, 640);
  assert.equal(fit.height, 360);
});

test("fitting the canvas never upscales past the slide's own size at 1x", () => {
  const fit = fitCanvasToStage({ width: 4000, height: 4000 }, 1);

  assert.equal(fit.width, 1280);
  assert.equal(fit.height, 720);
});

test("fitting the canvas lets zoom overflow the stage on purpose", () => {
  const fit = fitCanvasToStage({ width: 640, height: 360 }, 2);

  assert.equal(fit.width, 1280);
  assert.equal(fit.height, 720);
});

test("fitting the canvas ignores a stage that has not been laid out yet", () => {
  assert.equal(fitCanvasToStage({ width: 0, height: 0 }, 1), null);
  // A hidden ancestor reports no height; the width still describes the stage.
  assert.equal(fitCanvasToStage({ width: 640, height: 0 }, 1).width, 640);
});
