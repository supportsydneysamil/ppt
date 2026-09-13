import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";

import {
  CUSTOM_SLIDE_TEMPLATES,
  createCustomSlideEditor,
} from "../public/custom-slide-editor.js";
import * as fakeFabric from "./fixtures/fake-fabric.js";

const FAKE_FABRIC_URL = new URL("./fixtures/fake-fabric.js", import.meta.url).href;
const INDEX_HTML = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

function createHost() {
  const dom = new JSDOM(INDEX_HTML, { url: "https://editor.test/" });
  const root = dom.window.document.getElementById("customSlideEditor");
  assert.ok(root, "index.html must contain #customSlideEditor");
  root.hidden = false;
  return { dom, window: dom.window, document: dom.window.document, root };
}

async function createEditor({ host = createHost(), ...options } = {}) {
  fakeFabric.__resetFakeFabric();
  const changes = [];
  const errors = [];
  const editor = await createCustomSlideEditor(host.root, {
    fabricModuleUrl: FAKE_FABRIC_URL,
    onChange: (model, meta) => changes.push({ model, meta }),
    onError: (message, cause) => errors.push({ message, cause }),
    ...options,
  });
  return { ...host, editor, canvas: editor.canvas, changes, errors };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function rectSlide(id, overrides = {}) {
  return {
    elements: [
      {
        id,
        type: "rect",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        fill: "#ff0000",
        stroke: "",
        strokeWidth: 0,
        zIndex: 0,
        ...overrides,
      },
    ],
  };
}

function imageSlide(id = "image-1") {
  return {
    elements: [
      {
        id,
        type: "image",
        src: "/uploads/photo.png",
        fit: "contain",
        x: 340,
        y: 160,
        width: 600,
        height: 400,
        zIndex: 0,
      },
    ],
  };
}

function lineSlide(id = "line-1") {
  return {
    elements: [
      {
        id,
        type: "line",
        x: 100,
        y: 100,
        x2: 500,
        y2: 100,
        stroke: "#000000",
        strokeWidth: 4,
        zIndex: 0,
      },
    ],
  };
}

function action(root, name) {
  return root.querySelector(`[data-editor-action="${name}"]`);
}

function fieldEl(root, name) {
  return root.querySelector(`[data-editor-field="${name}"]`);
}

function setField(ctx, name, value) {
  const element = fieldEl(ctx.root, name);
  assert.ok(element, `missing field ${name}`);
  if (element.type === "checkbox") {
    element.checked = Boolean(value);
    element.dispatchEvent(new ctx.window.Event("change", { bubbles: true }));
    return element;
  }
  element.value = String(value);
  const eventName = element.tagName === "SELECT" ? "change" : "input";
  element.dispatchEvent(new ctx.window.Event(eventName, { bubbles: true }));
  return element;
}

function select(ctx, object) {
  ctx.canvas.setActiveObject(object);
  ctx.canvas.fire("selection:created", { selected: [object] });
}

function pressKey(ctx, init) {
  return pressKeyOn(ctx, ctx.document, init);
}

function pressKeyOn(ctx, target, init) {
  const event = new ctx.window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function clickAt(ctx, target) {
  target.dispatchEvent(new ctx.window.Event("mousedown", { bubbles: true }));
}

function textSlide(id = "text-1", overrides = {}) {
  return {
    elements: [
      {
        id,
        type: "text",
        x: 100,
        y: 80,
        width: 400,
        height: 120,
        text: "한 줄",
        fontFamily: "Malgun Gothic",
        fontSize: 40,
        zIndex: 0,
        ...overrides,
      },
    ],
  };
}

/** Picks a file through the hidden input the way the toolbar button does. */
function chooseFile(ctx, file = { name: "photo.png", type: "image/png" }) {
  const input = ctx.root.querySelector('[data-custom-editor="file"]');
  assert.ok(input, "editor must expose a file input");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new ctx.window.Event("change", { bubbles: true }));
  return input;
}

/** Lets every already-resolved await in the editor run to completion. */
async function settle(times = 6) {
  for (let index = 0; index < times; index += 1) {
    await flush();
  }
}

test("load seeds a fresh history so a new slide cannot undo into the previous one", async () => {
  const ctx = await createEditor();

  await ctx.editor.load(rectSlide("slide-a"));
  action(ctx.root, "add-text").click();
  await flush();
  assert.equal(ctx.editor.isDirty(), true);
  assert.equal(ctx.editor.serialize().elements.length, 2);

  await ctx.editor.load(rectSlide("slide-b"));

  assert.equal(ctx.editor.isDirty(), false);
  assert.equal(action(ctx.root, "undo").disabled, true);

  await ctx.editor.undo();
  const serialized = ctx.editor.serialize();
  assert.equal(serialized.elements.length, 1);
  assert.equal(serialized.elements[0].id, "slide-b");

  await ctx.editor.destroy();
});

test("load returns the post-render serialized state and keeps serialize stable", async () => {
  const ctx = await createEditor();

  const loaded = await ctx.editor.load({
    elements: [
      {
        id: "text-1",
        type: "text",
        x: 100,
        y: 80,
        width: 400,
        height: 120,
        text: "첫 줄\n둘째 줄",
        fontSize: 48,
        zIndex: 0,
      },
    ],
  });

  const first = ctx.editor.serialize();
  assert.deepEqual(loaded, first, "load must return what serialize reports");
  assert.deepEqual(ctx.editor.serialize(), first, "serialize must be idempotent");
  assert.equal(ctx.editor.isDirty(), false);
  assert.equal(first.elements[0].y, 80);

  await ctx.editor.destroy();
});

test("undo and redo walk edits made to the loaded slide", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));

  action(ctx.root, "add-rect").click();
  await flush();
  assert.equal(ctx.editor.serialize().elements.length, 2);
  assert.equal(action(ctx.root, "undo").disabled, false);

  await ctx.editor.undo();
  assert.equal(ctx.editor.serialize().elements.length, 1);

  await ctx.editor.redo();
  assert.equal(ctx.editor.serialize().elements.length, 2);

  await ctx.editor.destroy();
});

test("markSaved clears dirty and reset leaves a dirty blank slide with one undo", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));

  action(ctx.root, "add-rect").click();
  await flush();
  assert.equal(ctx.editor.isDirty(), true);

  ctx.editor.markSaved();
  assert.equal(ctx.editor.isDirty(), false);

  await ctx.editor.reset();
  assert.equal(ctx.editor.serialize().elements.length, 0);
  assert.equal(ctx.editor.isDirty(), true);
  assert.equal(action(ctx.root, "undo").disabled, false);

  await ctx.editor.undo();
  assert.equal(ctx.editor.serialize().elements.length, 2);

  await ctx.editor.destroy();
});

test("image fit toggles preserve the authored layout box", async () => {
  const ctx = await createEditor();
  fakeFabric.__setImageBehaviour({ width: 100, height: 50 });

  await ctx.editor.load(imageSlide());
  const [image] = ctx.canvas.getObjects();
  select(ctx, image);

  const box = () => {
    const element = ctx.editor.serialize().elements[0];
    return { width: element.width, height: element.height, x: element.x, y: element.y };
  };
  const authored = { width: 600, height: 400, x: 340, y: 160 };
  assert.deepEqual(box(), authored);

  setField(ctx, "fit", "cover");
  assert.deepEqual(box(), authored);
  assert.equal(ctx.editor.serialize().elements[0].fit, "cover");

  setField(ctx, "fit", "contain");
  assert.deepEqual(box(), authored);
  assert.equal(ctx.editor.serialize().elements[0].fit, "contain");

  await ctx.editor.destroy();
});

test("aligning a letterboxed image keeps the canvas and the model in sync", async () => {
  const ctx = await createEditor();
  fakeFabric.__setImageBehaviour({ width: 100, height: 50 });

  await ctx.editor.load(imageSlide());
  const [image] = ctx.canvas.getObjects();
  select(ctx, image);

  action(ctx.root, "align-bottom").click();
  await flush();

  const element = ctx.editor.serialize().elements[0];
  assert.equal(element.height, 400, "the authored box must not shrink");
  assert.equal(element.y, 320);
  assert.equal(
    image.top,
    element.y + element.height / 2,
    "the live object center must match the serialized box"
  );

  await ctx.editor.destroy();
});

test("a slow render that is superseded never adds its objects", async () => {
  const ctx = await createEditor();
  fakeFabric.__setImageBehaviour({ width: 100, height: 50, delayMs: 40 });

  const stale = ctx.editor.load(imageSlide());
  const fresh = ctx.editor.load(rectSlide("slide-b"));
  await Promise.all([stale, fresh]);

  const objects = ctx.canvas.getObjects();
  assert.equal(objects.length, 1);
  assert.equal(objects[0].elementType, "rect");

  // The superseded render must not have left the editor with sync suspended.
  action(ctx.root, "add-rect").click();
  await flush();
  assert.equal(ctx.editor.serialize().elements.length, 2);
  assert.equal(ctx.editor.isDirty(), true);

  await ctx.editor.destroy();
});

test("destroy during an in-flight render disposes the canvas and drops the render", async () => {
  const ctx = await createEditor();
  fakeFabric.__setImageBehaviour({ width: 100, height: 50, delayMs: 40 });

  const pending = ctx.editor.load(imageSlide());
  await ctx.editor.destroy();
  await pending;

  assert.equal(ctx.canvas.disposed, true);
  assert.equal(ctx.canvas.disposeCount, 1);
  assert.equal(ctx.canvas.getObjects().length, 0);

  // Public methods stay safe after destroy.
  await ctx.editor.load(rectSlide("ignored"));
  await ctx.editor.undo();
  await ctx.editor.redo();
  await ctx.editor.applyTemplate("title-hero");
  await ctx.editor.reset();
  assert.equal(ctx.canvas.getObjects().length, 0);
  assert.doesNotThrow(() => ctx.editor.serialize());
  assert.doesNotThrow(() => ctx.editor.isDirty());
  await ctx.editor.destroy();
  assert.equal(ctx.canvas.disposeCount, 1, "destroy must be idempotent");
});

test("destroy removes the listeners it registered and makes the toolbar inert", async () => {
  const host = createHost();
  const added = [];
  const removed = [];
  const document = host.document;
  const originalAdd = document.addEventListener.bind(document);
  const originalRemove = document.removeEventListener.bind(document);
  document.addEventListener = (type, handler, options) => {
    added.push({ type, handler });
    originalAdd(type, handler, options);
  };
  document.removeEventListener = (type, handler, options) => {
    removed.push({ type, handler });
    originalRemove(type, handler, options);
  };

  const ctx = await createEditor({ host });
  await ctx.editor.load(rectSlide("slide-a"));
  assert.ok(added.length >= 1, "editor must register a document listener");

  await ctx.editor.destroy();

  for (const entry of added) {
    assert.ok(
      removed.some((item) => item.type === entry.type && item.handler === entry.handler),
      `listener ${entry.type} was not removed`
    );
  }

  const before = ctx.canvas.getObjects().length;
  action(ctx.root, "add-rect").click();
  await flush();
  assert.equal(ctx.canvas.getObjects().length, before);
});

test("keyboard shortcuts only call preventDefault when they can run", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));

  assert.equal(pressKey(ctx, { key: "c", ctrlKey: true }).defaultPrevented, false);
  assert.equal(pressKey(ctx, { key: "Delete" }).defaultPrevented, false);
  assert.equal(pressKey(ctx, { key: "v", ctrlKey: true }).defaultPrevented, false);
  assert.equal(pressKey(ctx, { key: "z", ctrlKey: true }).defaultPrevented, false);
  assert.equal(pressKey(ctx, { key: "y", ctrlKey: true }).defaultPrevented, false);

  const [rect] = ctx.canvas.getObjects();
  select(ctx, rect);
  assert.equal(pressKey(ctx, { key: "c", ctrlKey: true }).defaultPrevented, true);
  assert.equal(pressKey(ctx, { key: "v", ctrlKey: true }).defaultPrevented, true);
  await flush();
  assert.equal(pressKey(ctx, { key: "Delete" }).defaultPrevented, true);
  await flush();
  assert.equal(pressKey(ctx, { key: "z", ctrlKey: true }).defaultPrevented, true);
  await flush();

  await ctx.editor.destroy();
});

test("selection events are wired through a single merged handler", async () => {
  const ctx = await createEditor();

  assert.equal(ctx.canvas.handlerCount("selection:created"), 1);
  assert.equal(ctx.canvas.handlerCount("selection:updated"), 1);
  assert.equal(ctx.canvas.handlerCount("selection:cleared"), 1);

  await ctx.editor.destroy();
});

test("the no-stroke field clears and restores the shape stroke", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a", { stroke: "#123456", strokeWidth: 4 }));
  const [rect] = ctx.canvas.getObjects();
  select(ctx, rect);

  const noStroke = fieldEl(ctx.root, "noStroke");
  assert.ok(noStroke, "shape panel must expose a no-stroke field");
  assert.equal(noStroke.checked, false);

  setField(ctx, "noStroke", true);
  let element = ctx.editor.serialize().elements[0];
  assert.equal(element.stroke, "");
  assert.equal(element.strokeWidth, 0);
  assert.equal(fieldEl(ctx.root, "stroke").disabled, true);
  assert.equal(fieldEl(ctx.root, "strokeWidth").disabled, true);

  setField(ctx, "noStroke", false);
  element = ctx.editor.serialize().elements[0];
  assert.equal(element.stroke, "#123456");
  assert.equal(element.strokeWidth, 4);
  assert.equal(fieldEl(ctx.root, "stroke").disabled, false);
  assert.equal(fieldEl(ctx.root, "strokeWidth").disabled, false);

  await ctx.editor.destroy();
});

test("the no-stroke field reflects the selected shape", async () => {
  const ctx = await createEditor();
  await ctx.editor.load({
    elements: [
      { id: "plain", type: "rect", x: 0, y: 0, width: 100, height: 100, stroke: "", zIndex: 0 },
      {
        id: "outlined",
        type: "rect",
        x: 200,
        y: 0,
        width: 100,
        height: 100,
        stroke: "#00ff00",
        strokeWidth: 2,
        zIndex: 1,
      },
    ],
  });

  const [plain, outlined] = ctx.canvas.getObjects();
  select(ctx, plain);
  assert.equal(fieldEl(ctx.root, "noStroke").checked, true);

  ctx.canvas.setActiveObject(outlined);
  ctx.canvas.fire("selection:updated", { selected: [outlined] });
  assert.equal(fieldEl(ctx.root, "noStroke").checked, false);

  await ctx.editor.destroy();
});

test("the alert region is revealed before its text changes", async () => {
  const ctx = await createEditor();
  const errorElement = ctx.root.querySelector('[data-custom-editor="error"]');
  assert.equal(errorElement.getAttribute("role"), "alert");
  assert.equal(errorElement.hidden, true);

  const records = [];
  const observer = new ctx.window.MutationObserver((mutations) => {
    for (const mutation of mutations) {
      records.push(mutation.type);
    }
  });
  observer.observe(errorElement, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  fakeFabric.__setImageBehaviour({ fail: true });
  await ctx.editor.load(imageSlide());
  await flush();
  observer.disconnect();

  assert.ok(records.length >= 2, `expected attribute and text mutations, got ${records}`);
  assert.equal(records[0], "attributes", "hidden must be cleared before the text is written");
  assert.ok(records.slice(1).some((type) => type === "childList" || type === "characterData"));
  assert.equal(errorElement.hidden, false);
  assert.ok(errorElement.textContent.length > 0);
  assert.ok(ctx.errors.length >= 1);

  await ctx.editor.destroy();
});

test("moving a line out of bounds translates both endpoints together", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(lineSlide());
  const [line] = ctx.canvas.getObjects();

  line.set({ left: 1200 });
  ctx.canvas.fire("object:moving", { target: line });
  ctx.canvas.fire("object:modified", { target: line });

  const element = ctx.editor.serialize().elements[0];
  assert.equal(element.x2 - element.x, 400, "line length must be preserved");
  assert.equal(element.x2, 1280);
  assert.equal(element.x, 880);
  assert.equal(element.y, 100);

  await ctx.editor.destroy();
});

test("scaling is capped so the serialized box neither shrinks nor jumps", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));
  const [rect] = ctx.canvas.getObjects();
  select(ctx, rect);

  rect.set({ scaleX: 8, scaleY: 8 });
  ctx.canvas.fire("object:scaling", { target: rect });

  assert.equal(rect.scaleX, 6.4);
  assert.equal(rect.scaleY, 6.4);

  ctx.canvas.fire("object:modified", { target: rect });
  const first = ctx.editor.serialize().elements[0];
  assert.equal(first.width, 1280);
  assert.equal(first.height, 640);
  assert.equal(first.x, 0);

  assert.deepEqual(ctx.editor.serialize().elements[0], first, "serialize must not drift");

  await ctx.editor.destroy();
});

test("an upload that resolves after a slide switch never touches the new slide", async () => {
  let resolveUpload = null;
  const ctx = await createEditor({
    uploadImage: () =>
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
  });

  await ctx.editor.load(imageSlide("image-a"));
  chooseFile(ctx);
  await settle();
  assert.ok(resolveUpload, "the upload must have started");

  await ctx.editor.load(rectSlide("slide-b"));
  const baseline = ctx.editor.serialize();
  const statusBefore = ctx.root.querySelector('[data-custom-editor="status"]').textContent;

  resolveUpload("/uploads/late.png");
  await settle();

  const after = ctx.editor.serialize();
  assert.deepEqual(after, baseline, "the superseded upload must not change slide B");
  assert.equal(after.elements.length, 1);
  assert.equal(after.elements[0].id, "slide-b");
  assert.equal(ctx.editor.isDirty(), false, "slide B must stay clean");
  assert.equal(action(ctx.root, "undo").disabled, true);
  assert.equal(
    ctx.root.querySelector('[data-custom-editor="status"]').textContent,
    statusBefore
  );
  assert.equal(ctx.root.querySelector('[data-custom-editor="error"]').hidden, true);
  assert.deepEqual(ctx.errors, []);

  await ctx.editor.destroy();
});

test("a pasted image that resolves after a slide switch never touches the new slide", async () => {
  const ctx = await createEditor();
  fakeFabric.__setImageBehaviour({ width: 100, height: 50 });
  await ctx.editor.load(imageSlide("image-a"));

  const [image] = ctx.canvas.getObjects();
  select(ctx, image);
  assert.equal(pressKey(ctx, { key: "c", ctrlKey: true }).defaultPrevented, true);

  fakeFabric.__setImageBehaviour({ width: 100, height: 50, delayMs: 40 });
  assert.equal(pressKey(ctx, { key: "v", ctrlKey: true }).defaultPrevented, true);

  await ctx.editor.load(rectSlide("slide-b"));
  const baseline = ctx.editor.serialize();

  await new Promise((resolve) => setTimeout(resolve, 80));
  await settle();

  const after = ctx.editor.serialize();
  assert.deepEqual(after, baseline, "the superseded paste must not change slide B");
  assert.equal(after.elements.length, 1);
  assert.equal(after.elements[0].id, "slide-b");
  assert.equal(ctx.editor.isDirty(), false, "slide B must stay clean");
  assert.deepEqual(ctx.errors, []);

  await ctx.editor.destroy();
});

test("a successful upload centers the picture, pushes history and reports status", async () => {
  const received = [];
  const ctx = await createEditor({
    uploadImage: async (file) => {
      received.push(file);
      return "/uploads/new.png";
    },
  });
  fakeFabric.__setImageBehaviour({ width: 200, height: 100 });

  await ctx.editor.load(rectSlide("slide-a"));
  const input = chooseFile(ctx, { name: "new.png", type: "image/png" });
  await settle();

  assert.equal(received.length, 1);
  assert.equal(input.value, "", "the input must be cleared for the next pick");

  const elements = ctx.editor.serialize().elements;
  assert.equal(elements.length, 2);
  const image = elements.find((element) => element.type === "image");
  assert.ok(image, "the upload must add an image element");
  assert.equal(image.src, "/uploads/new.png");
  assert.equal(image.fit, "contain");
  assert.equal(image.width, 768);
  assert.equal(image.height, 432);
  assert.equal(image.x, 256);
  assert.equal(image.y, 144);
  assert.equal(ctx.editor.isDirty(), true);
  assert.equal(
    ctx.root.querySelector('[data-custom-editor="status"]').textContent,
    "이미지를 추가했습니다."
  );
  assert.deepEqual(ctx.errors, []);

  await ctx.editor.destroy();
});

test("an upload that answers with an off-uploads path is rejected", async () => {
  const ctx = await createEditor({
    uploadImage: async () => "https://evil.test/photo.png",
  });

  await ctx.editor.load(rectSlide("slide-a"));
  chooseFile(ctx);
  await settle();

  assert.equal(ctx.editor.serialize().elements.length, 1);
  assert.equal(ctx.editor.isDirty(), false);
  assert.equal(ctx.root.querySelector('[data-custom-editor="status"]').textContent, "");
  assert.equal(
    ctx.root.querySelector('[data-custom-editor="error"]').textContent,
    "이미지 업로드에 실패했습니다."
  );
  assert.equal(ctx.errors.length, 1);

  await ctx.editor.destroy();
});

test("a failed upload leaves the slide untouched and reports the error", async () => {
  const ctx = await createEditor({
    uploadImage: async () => {
      throw new Error("boom");
    },
  });

  await ctx.editor.load(rectSlide("slide-a"));
  chooseFile(ctx);
  await settle();

  assert.equal(ctx.canvas.getObjects().length, 1);
  assert.equal(ctx.editor.isDirty(), false);
  assert.equal(ctx.errors.at(-1)?.cause?.message, "boom");

  await ctx.editor.destroy();
});

test("picking a file without an upload handler reports a configuration error", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));

  chooseFile(ctx);
  await settle();

  assert.equal(ctx.editor.serialize().elements.length, 1);
  assert.equal(
    ctx.root.querySelector('[data-custom-editor="error"]').textContent,
    "이미지 업로드 기능이 준비되지 않았습니다."
  );

  await ctx.editor.destroy();
});

test("corner-resizing text bakes the scale into the canonical font size", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(textSlide());

  const [textbox] = ctx.canvas.getObjects();
  select(ctx, textbox);
  const before = ctx.editor.serialize().elements[0];
  assert.equal(before.fontSize, 40);
  assert.equal(before.width, 400);

  // A bottom-right corner drag doubles the glyphs and keeps the top-left edge.
  const displayedWidth = before.width * 2;
  const displayedHeight = before.height * 2;
  textbox.set({
    scaleX: 2,
    scaleY: 2,
    left: before.x + displayedWidth / 2,
    top: before.y + displayedHeight / 2,
  });
  ctx.canvas.fire("object:scaling", { target: textbox });
  ctx.canvas.fire("object:modified", { target: textbox });

  assert.equal(textbox.scaleX, 1, "the scale must be baked away");
  assert.equal(textbox.scaleY, 1);
  assert.equal(textbox.fontSize, 80);
  assert.equal(textbox.width, displayedWidth);

  const after = ctx.editor.serialize().elements[0];
  assert.equal(after.fontSize, 80, "the saved font size must match the canvas");
  assert.equal(after.width, displayedWidth);
  assert.equal(after.height, displayedHeight);
  assert.equal(after.x, before.x, "the top-left edge must not move");
  assert.equal(after.y, before.y);
  assert.equal(
    fieldEl(ctx.root, "fontSize").value,
    "80",
    "the panel must show the baked font size"
  );

  await ctx.editor.destroy();
});

test("a baked text resize reloads at the size the canvas displayed", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(textSlide());

  const [textbox] = ctx.canvas.getObjects();
  const before = ctx.editor.serialize().elements[0];
  textbox.set({
    scaleX: 1.5,
    scaleY: 1.5,
    left: before.x + (before.width * 1.5) / 2,
    top: before.y + (before.height * 1.5) / 2,
  });
  ctx.canvas.fire("object:modified", { target: textbox });

  const saved = ctx.editor.serialize();
  const reloaded = await ctx.editor.load(saved);
  assert.deepEqual(reloaded, saved, "a reload must reproduce the saved geometry");

  const [reloadedText] = ctx.canvas.getObjects();
  assert.equal(reloadedText.fontSize, 60);
  assert.equal(reloadedText.width, 600);
  assert.equal(ctx.editor.isDirty(), false);

  await ctx.editor.destroy();
});

test("scaling a shape still flattens into the box without touching a font size", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));
  const [rect] = ctx.canvas.getObjects();

  rect.set({ scaleX: 2, scaleY: 2 });
  ctx.canvas.fire("object:modified", { target: rect });

  const element = ctx.editor.serialize().elements[0];
  assert.equal(element.width, 400);
  assert.equal(element.height, 200);
  assert.equal(element.fontSize, undefined);

  await ctx.editor.destroy();
});

test("clipboard and delete keys are ignored while focus sits outside the editor", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));
  const [rect] = ctx.canvas.getObjects();
  select(ctx, rect);
  assert.equal(pressKey(ctx, { key: "c", ctrlKey: true }).defaultPrevented, true);

  const outside = ctx.document.getElementById("slidePreview") ?? ctx.document.body;
  assert.ok(!ctx.root.contains(outside), "the probe must live outside the editor");
  clickAt(ctx, outside);

  assert.equal(pressKeyOn(ctx, outside, { key: "c", ctrlKey: true }).defaultPrevented, false);
  assert.equal(pressKeyOn(ctx, outside, { key: "v", ctrlKey: true }).defaultPrevented, false);
  assert.equal(pressKeyOn(ctx, outside, { key: "Delete" }).defaultPrevented, false);
  assert.equal(ctx.editor.serialize().elements.length, 1, "nothing may be deleted");

  await ctx.editor.destroy();
});

test("clipboard and delete keys resume once the canvas is used again", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));
  const [rect] = ctx.canvas.getObjects();
  select(ctx, rect);

  clickAt(ctx, ctx.document.body);
  assert.equal(pressKey(ctx, { key: "c", ctrlKey: true }).defaultPrevented, false);

  clickAt(ctx, ctx.root.querySelector('[data-custom-editor="canvas"]'));
  assert.equal(pressKey(ctx, { key: "c", ctrlKey: true }).defaultPrevented, true);
  assert.equal(pressKey(ctx, { key: "Delete" }).defaultPrevented, true);
  await flush();
  assert.equal(ctx.editor.serialize().elements.length, 0);

  await ctx.editor.destroy();
});

test("undo stays available while the editor is open, wherever focus sits", async () => {
  const ctx = await createEditor();
  await ctx.editor.load(rectSlide("slide-a"));
  action(ctx.root, "add-rect").click();
  await flush();

  clickAt(ctx, ctx.document.body);
  assert.equal(pressKey(ctx, { key: "z", ctrlKey: true }).defaultPrevented, true);
  await settle();
  assert.equal(ctx.editor.serialize().elements.length, 1);

  await ctx.editor.destroy();
});

test("the custom image input accepts only the formats the uploader supports", async () => {
  const host = createHost();
  const input = host.root.querySelector('[data-custom-editor="file"]');
  assert.deepEqual(input.getAttribute("accept").split(","), [
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
});

test("template options come from the editor module instead of the markup", async () => {
  const host = createHost();
  const select = host.root.querySelector('[data-custom-editor="template"]');
  assert.equal(select.options.length, 0, "index.html must not hardcode template options");

  const ctx = await createEditor({ host });
  assert.deepEqual(
    Array.from(select.options).map((option) => option.value),
    CUSTOM_SLIDE_TEMPLATES.map((template) => template.id)
  );
  assert.deepEqual(
    Array.from(select.options).map((option) => option.textContent),
    CUSTOM_SLIDE_TEMPLATES.map((template) => template.label)
  );

  await ctx.editor.destroy();
});
