import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";

import {
  CUSTOM_SLIDE_TEMPLATES,
  createCustomSlideEditor,
} from "../public/custom-slide-editor.js";
import { CUSTOM_SLIDE_THEMES } from "../public/custom-slide-themes.js";
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

function imageSlide(id = "image-1", overrides = {}) {
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
        ...overrides,
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
  const first = fieldEl(ctx.root, name);
  const element =
    first?.type === "radio"
      ? ctx.root.querySelector(
          `[data-editor-field="${name}"][value="${String(value)}"]`
        )
      : first;
  assert.ok(element, `missing field ${name}`);
  if (element.type === "checkbox" || element.type === "radio") {
    element.checked = Boolean(value);
    if (element.type === "radio") element.checked = true;
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

// The layer list also ships with the React chrome. It has to exist before the
// editor is created, because the first load() renders the rows.
function addLayerPanel(host) {
  const panel = host.document.createElement("aside");
  panel.className = "custom-editor-layers";
  const list = host.document.createElement("ol");
  list.className = "custom-editor-layer-list";
  list.dataset.editorUi = "layers";
  const empty = host.document.createElement("p");
  empty.className = "hint";
  empty.dataset.editorUi = "layers-empty";
  empty.textContent = "아직 개체가 없습니다.";
  panel.append(list, empty);
  host.root.append(panel);
  return { list, empty };
}

function layerRows(ctx) {
  return [...ctx.root.querySelectorAll("[data-editor-ui='layers'] .custom-editor-layer")];
}

// The floating text toolbar ships with the React chrome, so the plain
// index.html markup the controller tests boot from has to grow one.
function addContextToolbar(ctx) {
  const toolbar = ctx.document.createElement("div");
  toolbar.className = "custom-editor-context-toolbar";
  toolbar.dataset.editorUi = "context-toolbar";
  toolbar.hidden = true;
  ctx.root.append(toolbar);
  return toolbar;
}

/** jsdom does no layout, so the canvas has to report a rect of its own. */
function stubCanvasRect(ctx, rect) {
  const current = { ...rect };
  Object.defineProperty(ctx.canvas.lowerCanvasEl, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: current.left,
      y: current.top,
      left: current.left,
      top: current.top,
      width: current.width,
      height: current.height,
      right: current.left + current.width,
      bottom: current.top + current.height,
      toJSON() {},
    }),
  });
  return current;
}

/**
 * jsdom keeps every rect at zero, so a scrolled page has to be spelled out:
 * a browser reports `documentElement` shifted up by the scroll offset, and
 * that offset is what separates page coordinates from viewport coordinates.
 */
function scrollPageTo(ctx, y) {
  Object.defineProperty(ctx.window, "scrollY", { value: y, configurable: true });
  Object.defineProperty(ctx.window, "pageYOffset", { value: y, configurable: true });
  Object.defineProperty(ctx.document.documentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: -y,
      left: 0,
      top: -y,
      width: 0,
      height: 0,
      right: 0,
      bottom: -y,
      toJSON() {},
    }),
  });
}

// @floating-ui/dom refuses to treat anything as a DOM node until the globals
// below exist, which jsdom under node does not provide by itself.
const FLOATING_UI_GLOBALS = [
  "Node",
  "Element",
  "HTMLElement",
  "ShadowRoot",
  "getComputedStyle",
  "DOMRect",
];

function withGlobalWindow(t, view) {
  const saved = new Map();
  for (const name of ["window", ...FLOATING_UI_GLOBALS]) {
    saved.set(name, name in globalThis ? globalThis[name] : undefined);
    globalThis[name] = name === "window" ? view : view[name];
  }
  t.after(() => {
    for (const [name, previous] of saved) {
      if (previous === undefined) {
        delete globalThis[name];
      } else {
        globalThis[name] = previous;
      }
    }
  });
}

test("the floating text toolbar is placed in viewport coordinates", async (t) => {
  const ctx = await createEditor();
  withGlobalWindow(t, ctx.window);
  const toolbar = addContextToolbar(ctx);
  stubCanvasRect(ctx, { left: 40, top: 120, width: 640, height: 360 });
  await ctx.editor.load(textSlide());
  const [textbox] = ctx.canvas.getObjects();

  select(ctx, textbox);
  await settle();
  assert.equal(toolbar.hidden, false, "selecting text must reveal the toolbar");
  const unscrolled = { left: toolbar.style.left, top: toolbar.style.top };
  assert.notEqual(unscrolled.top, "", "the toolbar must be positioned");

  // The canvas has not moved on screen, so neither may the toolbar: the offsets
  // are consumed as `position: fixed`, which is relative to the viewport.
  scrollPageTo(ctx, 900);
  select(ctx, textbox);
  await settle();

  assert.equal(ctx.window.getComputedStyle(toolbar).position, "fixed");
  assert.deepEqual(
    { left: toolbar.style.left, top: toolbar.style.top },
    unscrolled,
    "page scroll must not offset a viewport-positioned toolbar"
  );

  await ctx.editor.destroy();
});

test("the floating text toolbar follows the canvas while it stays open", async (t) => {
  const ctx = await createEditor();
  withGlobalWindow(t, ctx.window);
  const toolbar = addContextToolbar(ctx);
  const rect = stubCanvasRect(ctx, { left: 40, top: 400, width: 640, height: 360 });
  await ctx.editor.load(textSlide());
  const [textbox] = ctx.canvas.getObjects();

  select(ctx, textbox);
  await settle();
  const before = Number.parseFloat(toolbar.style.top);

  // Scrolling the page moves the canvas up; nothing re-selects the text, so the
  // toolbar has to reposition itself.
  rect.top -= 250;
  scrollPageTo(ctx, 250);
  ctx.window.dispatchEvent(new ctx.window.Event("scroll"));
  await settle();

  assert.equal(
    Number.parseFloat(toolbar.style.top),
    before - 250,
    "the toolbar must track the canvas across a scroll"
  );

  await ctx.editor.destroy();
});

test("the floating text toolbar follows the text while it is manipulated", async (t) => {
  const ctx = await createEditor();
  withGlobalWindow(t, ctx.window);
  const toolbar = addContextToolbar(ctx);
  // The stage renders the 720-unit slide 360px tall, so it is at half scale.
  stubCanvasRect(ctx, { left: 40, top: 120, width: 640, height: 360 });
  await ctx.editor.load(textSlide());
  const [textbox] = ctx.canvas.getObjects();

  select(ctx, textbox);
  await settle();
  const before = Number.parseFloat(toolbar.style.top);
  const yBefore = ctx.editor.serialize().elements[0].y;

  // Fabric reports a drag in progress long before it reports it finished.
  textbox.set({ top: textbox.top + 200 });
  ctx.canvas.fire("object:moving", { target: textbox });
  await settle();

  const yAfter = ctx.editor.serialize().elements[0].y;
  assert.notEqual(yAfter, yBefore, "the drag must have moved the text");
  assert.equal(
    Number.parseFloat(toolbar.style.top),
    before + (yAfter - yBefore) / 2,
    "the toolbar must follow the text mid-drag"
  );

  await ctx.editor.destroy();
});

test("destroying the editor stops the floating toolbar from repositioning", async (t) => {
  const ctx = await createEditor();
  withGlobalWindow(t, ctx.window);
  const toolbar = addContextToolbar(ctx);
  const rect = stubCanvasRect(ctx, { left: 40, top: 400, width: 640, height: 360 });
  await ctx.editor.load(textSlide());
  const [textbox] = ctx.canvas.getObjects();

  select(ctx, textbox);
  await settle();
  await ctx.editor.destroy();
  const afterDestroy = toolbar.style.top;

  rect.top -= 250;
  ctx.window.dispatchEvent(new ctx.window.Event("scroll"));
  await settle();

  assert.equal(toolbar.style.top, afterDestroy, "a destroyed editor must not keep positioning");
});

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

test("image controls synchronize fit, flips, and alternative text", async () => {
  const ctx = await createEditor();
  fakeFabric.__setImageBehaviour({ width: 100, height: 50 });

  await ctx.editor.load(imageSlide());
  const [image] = ctx.canvas.getObjects();
  select(ctx, image);

  assert.equal(
    ctx.root.querySelector(
      '[data-editor-field="fit"][value="contain"]'
    )?.checked,
    true
  );
  setField(ctx, "fit", "cover");
  setField(ctx, "flipH", true);
  setField(ctx, "flipV", true);
  setField(ctx, "altText", "강단 위의 성경");

  assert.deepEqual(
    {
      fit: ctx.editor.serialize().elements[0].fit,
      flipH: ctx.editor.serialize().elements[0].flipH,
      flipV: ctx.editor.serialize().elements[0].flipV,
      altText: ctx.editor.serialize().elements[0].altText,
    },
    {
      fit: "cover",
      flipH: true,
      flipV: true,
      altText: "강단 위의 성경",
    }
  );
  assert.equal(ctx.editor.isDirty(), true);

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

test("theme options come from the theme module and recolor without rewriting copy", async () => {
  const host = createHost();
  const select = host.root.querySelector('[data-custom-editor="theme"]');
  assert.equal(select.options.length, 0, "index.html must not hardcode theme options");

  const ctx = await createEditor({ host });
  const themeSelect = host.root.querySelector('[data-custom-editor="theme"]');
  assert.ok(themeSelect);
  assert.deepEqual(
    Array.from(themeSelect.options).map((option) => option.value),
    CUSTOM_SLIDE_THEMES.map((theme) => theme.id)
  );

  await ctx.editor.applyTemplate("title-hero");
  const before = ctx.editor.serialize();
  const title = before.elements.find((element) => element.themeRole === "title");
  assert.equal(title.text, "은혜 위에 세워진 공동체");
  assert.equal(before.background.color, "#101c33");

  themeSelect.value = "plain";
  themeSelect.dispatchEvent(new host.window.Event("change", { bubbles: true }));
  await flush();

  const after = ctx.editor.serialize();
  const afterTitle = after.elements.find((element) => element.themeRole === "title");
  assert.equal(after.background.color, "#ffffff");
  assert.equal(afterTitle.text, "은혜 위에 세워진 공동체");
  assert.equal(afterTitle.color, "#111827");
  assert.equal(after.themeId, "plain");

  await ctx.editor.destroy();
});

test("serializing an ActiveSelection restores absolute coordinates", async () => {
  const ctx = await createEditor();
  await ctx.editor.load({
    elements: [
      { id: "a", type: "rect", x: 100, y: 100, width: 80, height: 80, fill: "#ff0000", stroke: "", strokeWidth: 0 },
      { id: "b", type: "rect", x: 300, y: 120, width: 80, height: 80, fill: "#00ff00", stroke: "", strokeWidth: 0 },
    ],
  });
  const objects = ctx.canvas.getObjects().filter((object) => object.role === "element");
  ctx.canvas.setActiveObject(new fakeFabric.ActiveSelection(objects, { canvas: ctx.canvas }));
  const serialized = ctx.editor.serialize();
  assert.equal(serialized.elements[0].x, 100);
  assert.equal(serialized.elements[1].x, 300);
  await ctx.editor.destroy();
});

test("explicit resize uses the visible stage width", async () => {
  const ctx = await createEditor();
  const stage = ctx.root.querySelector('[data-custom-editor="stage"]');
  Object.defineProperty(stage, "clientWidth", {
    configurable: true,
    value: 960,
  });

  assert.equal(ctx.editor.resize(), true);
  assert.deepEqual(ctx.canvas.cssDimensions, {
    width: "960px",
    height: "540px",
    cssOnly: true,
  });
});

test("explicit resize is a no-op while the stage has no width", async () => {
  const ctx = await createEditor();
  const stage = ctx.root.querySelector('[data-custom-editor="stage"]');
  Object.defineProperty(stage, "clientWidth", {
    configurable: true,
    value: 0,
  });

  assert.equal(ctx.editor.resize(), false);
});

test("editor sessions transfer model, history, and selected element ids", async () => {
  const source = await createEditor();
  await source.editor.load(textSlide("session-text", { text: "처음" }));
  const text = source.canvas.getObjects().find((object) => object.elementType === "text");
  source.canvas.setActiveObject(text);
  text.set({ text: "수정됨" });
  source.canvas.fire("text:changed", { target: text });

  const session = source.editor.exportSession();
  assert.equal(session.model.elements[0].text, "수정됨");
  assert.deepEqual(session.activeElementIds, ["session-text"]);
  assert.equal(session.history.undo.length, 1);

  const target = await createEditor();
  await target.editor.importSession(session);
  assert.equal(target.editor.serialize().elements[0].text, "수정됨");
  assert.equal(target.editor.isDirty(), true);
  assert.equal(
    target.canvas.getActiveObject().customElementId,
    "session-text"
  );

  await target.editor.undo();
  assert.equal(target.editor.serialize().elements[0].text, "처음");
});

test("a layer row names its object, topmost first, and marks the selection", async () => {
  const host = createHost();
  const panel = addLayerPanel(host);
  const ctx = await createEditor({ host });
  await ctx.editor.load({
    elements: [
      { ...rectSlide("under").elements[0], zIndex: 0 },
      { ...textSlide("over", { text: "삼일교회  주일예배" }).elements[0], zIndex: 1 },
    ],
  });

  // The list reads top-to-bottom like the canvas stacks, so the last element
  // drawn is the first row.
  assert.deepEqual(
    layerRows(ctx).map((row) => row.querySelector(".custom-editor-layer-name").textContent),
    ["텍스트 · 삼일교회 주일예배", "사각형"]
  );
  assert.equal(panel.empty.hidden, true);

  const text = ctx.canvas
    .getObjects()
    .find((object) => object.customElementId === "over");
  select(ctx, text);

  const [first, second] = layerRows(ctx);
  assert.equal(first.classList.contains("is-active"), true);
  assert.equal(
    first.querySelector(".custom-editor-layer-name").getAttribute("aria-current"),
    "true"
  );
  assert.equal(second.classList.contains("is-active"), false);
});

test("the layer toggles carry their state as labels, not as button text", async () => {
  const host = createHost();
  addLayerPanel(host);
  const ctx = await createEditor({ host });
  await ctx.editor.load(rectSlide("only"));

  const toggles = () =>
    [...layerRows(ctx)[0].querySelectorAll(".custom-editor-layer-toggle")];
  const [visible, lock] = toggles();

  // Icon-only buttons, so the state has to be readable without the glyph.
  assert.equal(visible.textContent, "");
  assert.equal(visible.getAttribute("aria-pressed"), "false");
  assert.equal(visible.getAttribute("aria-label"), "레이어 숨기기");
  assert.equal(lock.getAttribute("aria-pressed"), "false");
  assert.equal(lock.getAttribute("aria-label"), "레이어 잠금");
  assert.ok(visible.querySelector("svg"), "a toggle must render an icon");

  visible.dispatchEvent(new ctx.window.Event("click", { bubbles: true }));
  const [hiddenToggle] = toggles();
  assert.equal(hiddenToggle.getAttribute("aria-pressed"), "true");
  assert.equal(hiddenToggle.getAttribute("aria-label"), "레이어 표시");
  assert.equal(layerRows(ctx)[0].classList.contains("is-hidden"), true);

  const [, unlocked] = toggles();
  unlocked.dispatchEvent(new ctx.window.Event("click", { bubbles: true }));
  const [, locked] = toggles();
  assert.equal(locked.getAttribute("aria-pressed"), "true");
  assert.equal(locked.getAttribute("aria-label"), "레이어 잠금 해제");
});

test("an empty slide shows the layer hint instead of an empty box", async () => {
  const host = createHost();
  const panel = addLayerPanel(host);
  const ctx = await createEditor({ host });
  await ctx.editor.load({ elements: [] });

  assert.equal(layerRows(ctx).length, 0);
  assert.equal(panel.empty.hidden, false);

  action(ctx.root, "add-text").click();
  await settle();

  assert.equal(layerRows(ctx).length, 1);
  assert.equal(panel.empty.hidden, true);
});
