import test from "node:test";
import assert from "node:assert/strict";

import {
  copyCustomSlideModel,
  createCustomEditorSession,
  createEmptyCustomSlide,
  customSlideDownloadFilename,
  decideCustomVisibility,
  parseSkippedImageWarnings,
  resolveCustomDirtyState,
  resolveCustomFormDirty,
  stageCustomSlideSave,
  uploadCustomImage,
  validateCustomImageFile,
  withStagedSlide,
} from "../public/custom-slide-bridge.js";
import { createDefaultCustomSlide } from "../public/custom-slide-model.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeFile(name, type) {
  return { name, type, size: 10 };
}

function rectModel(id) {
  return {
    background: { color: "#ffffff" },
    elements: [
      {
        id,
        type: "rect",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fill: "#ff0000",
        zIndex: 0,
      },
    ],
  };
}

/**
 * Records every interaction so tests can assert the session never talks to a
 * superseded slide, and lets a load be held open to simulate a slow render.
 */
function createFakeEditorFactory({ holdLoad = false } = {}) {
  const state = {
    instances: 0,
    loads: [],
    markSavedCalls: 0,
    resetCalls: 0,
    serializeCalls: 0,
    pendingLoads: [],
    onChange: null,
    options: null,
    dirty: false,
  };

  async function createEditor(root, options) {
    state.instances += 1;
    state.options = options;
    state.onChange = options.onChange;
    state.root = root;
    return {
      async load(model, loadOptions) {
        state.loads.push({ model, loadOptions });
        state.dirty = loadOptions?.markSaved === false;
        // The real editor notifies on every load.
        options.onChange?.(model, { dirty: state.dirty });
        if (holdLoad) {
          const gate = deferred();
          state.pendingLoads.push(gate);
          await gate.promise;
        }
        return model;
      },
      serialize() {
        state.serializeCalls += 1;
        return state.loads.at(-1)?.model ?? createDefaultCustomSlide();
      },
      isDirty() {
        return state.dirty;
      },
      markSaved() {
        state.markSavedCalls += 1;
        state.dirty = false;
      },
      async reset() {
        state.resetCalls += 1;
        state.dirty = true;
      },
      async destroy() {
        state.destroyed = true;
      },
    };
  }

  return { createEditor, state };
}

test("createEmptyCustomSlide matches the canonical model", () => {
  assert.deepEqual(createEmptyCustomSlide(), createDefaultCustomSlide());
});

test("copyCustomSlideModel", async (t) => {
  await t.test("deep copies without sharing references", () => {
    const source = rectModel("rect-1");
    const copy = copyCustomSlideModel(source);

    assert.notEqual(copy, source);
    assert.notEqual(copy.background, source.background);
    assert.notEqual(copy.elements, source.elements);
    assert.notEqual(copy.elements[0], source.elements[0]);

    copy.background.color = "#000000";
    copy.elements[0].x = 500;

    assert.equal(source.background.color, "#ffffff");
    assert.equal(source.elements[0].x, 0);
  });

  await t.test("normalizes to the shared canonical shape", () => {
    const copy = copyCustomSlideModel({
      width: 99,
      rogue: true,
      elements: [{ id: "x", type: "nope" }],
    });

    assert.equal(copy.width, 1280);
    assert.equal(copy.height, 720);
    assert.equal(copy.rogue, undefined);
    assert.deepEqual(copy.elements, []);
  });

  await t.test("keeps null for slides without a custom model", () => {
    assert.equal(copyCustomSlideModel(null), null);
    assert.equal(copyCustomSlideModel(undefined), null);
  });
});

test("decideCustomVisibility", async (t) => {
  await t.test("shows only the custom workspace for custom slides", () => {
    assert.deepEqual(decideCustomVisibility("custom"), {
      isCustom: true,
      showCustomWorkspace: true,
      showSlideSettings: false,
      showPreview: false,
    });
  });

  await t.test("restores the form and preview for every other type", () => {
    for (const type of ["simple", "hymn", "scripture", "ad", "title", "custom-title", ""]) {
      assert.deepEqual(
        decideCustomVisibility(type),
        {
          isCustom: false,
          showCustomWorkspace: false,
          showSlideSettings: true,
          showPreview: true,
        },
        `unexpected visibility for ${type || "(empty)"}`
      );
    }
  });
});

test("resolveCustomDirtyState", async (t) => {
  await t.test("keeps a brand new slide dirty even when the editor is clean", () => {
    assert.equal(resolveCustomDirtyState({ slideSaved: false, editorDirty: false }), true);
  });

  await t.test("treats a freshly loaded saved slide as clean", () => {
    assert.equal(resolveCustomDirtyState({ slideSaved: true, editorDirty: false }), false);
  });

  await t.test("marks edits on a saved slide dirty", () => {
    assert.equal(resolveCustomDirtyState({ slideSaved: true, editorDirty: true }), true);
  });

  await t.test("keeps a pending rename dirty even when the canvas is clean", () => {
    assert.equal(
      resolveCustomDirtyState({ slideSaved: true, editorDirty: false, formDirty: true }),
      true
    );
  });

  await t.test("stays clean only when nothing is pending", () => {
    assert.equal(
      resolveCustomDirtyState({ slideSaved: true, editorDirty: false, formDirty: false }),
      false
    );
  });

  await t.test(
    "keeps a saved slide switched to custom dirty after the canvas returns to clean",
    () => {
      const slide = { name: "주보 1면", type: "sermon", saved: true };
      const formDirty = resolveCustomFormDirty(slide.name, slide, "custom");
      assert.equal(
        resolveCustomDirtyState({ slideSaved: true, editorDirty: false, formDirty }),
        true
      );
    }
  );
});

test("resolveCustomFormDirty", async (t) => {
  await t.test("detects a pending rename", () => {
    assert.equal(resolveCustomFormDirty("새 이름", { name: "옛 이름" }), true);
  });

  await t.test("ignores surrounding whitespace", () => {
    assert.equal(resolveCustomFormDirty("  주보 1면  ", { name: "주보 1면" }), false);
  });

  await t.test("treats a missing slide or name as a difference only when text differs", () => {
    assert.equal(resolveCustomFormDirty("이름", null), true);
    assert.equal(resolveCustomFormDirty("", null), false);
    assert.equal(resolveCustomFormDirty(undefined, { name: "" }), false);
  });

  await t.test("detects a pending type switch on a saved slide", () => {
    assert.equal(
      resolveCustomFormDirty("주보 1면", { name: "주보 1면", type: "sermon" }, "custom"),
      true
    );
  });

  await t.test("stays clean when an already custom slide keeps its type", () => {
    assert.equal(
      resolveCustomFormDirty("주보 1면", { name: "주보 1면", type: "custom" }, "custom"),
      false
    );
  });

  await t.test("ignores whitespace around the selected type", () => {
    assert.equal(
      resolveCustomFormDirty("주보 1면", { name: "주보 1면", type: "custom" }, "  custom  "),
      false
    );
  });

  await t.test("skips the type comparison when no type is supplied", () => {
    assert.equal(resolveCustomFormDirty("주보 1면", { name: "주보 1면", type: "sermon" }), false);
  });
});

test("parseSkippedImageWarnings", async (t) => {
  await t.test("parses the header count", () => {
    assert.equal(parseSkippedImageWarnings("3"), 3);
    assert.equal(parseSkippedImageWarnings("0"), 0);
  });

  await t.test("treats anything unusable as no warnings", () => {
    assert.equal(parseSkippedImageWarnings(null), 0);
    assert.equal(parseSkippedImageWarnings(undefined), 0);
    assert.equal(parseSkippedImageWarnings(""), 0);
    assert.equal(parseSkippedImageWarnings("nope"), 0);
    assert.equal(parseSkippedImageWarnings("-2"), 0);
    assert.equal(parseSkippedImageWarnings("1.9"), 1);
  });
});

test("stageCustomSlideSave", async (t) => {
  await t.test("stages the fields a successful save will commit", () => {
    const staged = stageCustomSlideSave({
      name: "  주보 1면  ",
      serialized: rectModel("rect-1"),
    });

    assert.deepEqual(Object.keys(staged).sort(), [
      "customSlide",
      "name",
      "saved",
      "sourceType",
      "type",
    ]);
    assert.equal(staged.name, "주보 1면");
    assert.equal(staged.type, "custom");
    assert.equal(staged.sourceType, "basic");
    assert.equal(staged.saved, true);
    assert.equal(staged.customSlide.elements.length, 1);
  });

  await t.test("never shares the canvas model with the editor output", () => {
    const serialized = rectModel("rect-1");
    const staged = stageCustomSlideSave({ name: "x", serialized });

    staged.customSlide.elements[0].x = 900;
    assert.equal(serialized.elements[0].x, 0);
  });

  await t.test("falls back to the canonical empty model", () => {
    assert.deepEqual(
      stageCustomSlideSave({ name: "x", serialized: null }).customSlide,
      createDefaultCustomSlide()
    );
  });
});

test("withStagedSlide", async (t) => {
  await t.test("returns a new list with the staged values merged in", () => {
    const slides = [
      { id: "a", name: "A", saved: true },
      { id: "b", name: "B", saved: false },
    ];
    const staged = { name: "B2", saved: true };
    const next = withStagedSlide(slides, "b", staged);

    assert.notEqual(next, slides);
    assert.deepEqual(next[0], slides[0]);
    assert.deepEqual(next[1], { id: "b", name: "B2", saved: true });
  });

  await t.test("leaves the original records untouched", () => {
    const slide = { id: "a", name: "A", saved: false, customSlide: null };
    const next = withStagedSlide([slide], "a", {
      name: "A2",
      saved: true,
      customSlide: createDefaultCustomSlide(),
    });

    assert.notEqual(next[0], slide);
    assert.equal(slide.name, "A");
    assert.equal(slide.saved, false);
    assert.equal(slide.customSlide, null);
    assert.equal(next[0].name, "A2");
  });

  await t.test("passes unknown ids through unchanged", () => {
    const slides = [{ id: "a", name: "A" }];
    assert.deepEqual(withStagedSlide(slides, "zz", { name: "X" }), slides);
  });
});

test("validateCustomImageFile", async (t) => {
  await t.test("accepts png, jpeg and webp", () => {
    for (const file of [
      fakeFile("a.png", "image/png"),
      fakeFile("a.JPG", "image/jpeg"),
      fakeFile("사진.webp", "image/webp"),
    ]) {
      assert.deepEqual(validateCustomImageFile(file), { valid: true }, file.name);
    }
  });

  await t.test("rejects svg explicitly", () => {
    const result = validateCustomImageFile(fakeFile("a.svg", "image/svg+xml"));
    assert.equal(result.valid, false);
    assert.match(result.error, /SVG/);
  });

  await t.test("rejects a blank MIME type, matching the server", () => {
    const result = validateCustomImageFile(fakeFile("a.png", ""));
    assert.equal(result.valid, false);
    assert.match(result.error, /PNG/);
    assert.equal(validateCustomImageFile(fakeFile("a.png", undefined)).valid, false);
  });

  await t.test("rejects non-images and mismatched extensions", () => {
    for (const file of [
      fakeFile("deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
      fakeFile("a.png", "text/html"),
      fakeFile("a.gif", "image/gif"),
      fakeFile("a.exe", "image/png"),
    ]) {
      assert.equal(validateCustomImageFile(file).valid, false, file.name);
    }
    assert.equal(validateCustomImageFile(null).valid, false);
  });
});

test("uploadCustomImage", async (t) => {
  await t.test("posts to the image-marked upload endpoint and returns the path", async () => {
    const calls = [];
    const src = await uploadCustomImage(fakeFile("a.png", "image/png"), {
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, hasBody: init.body instanceof FormData });
        return { ok: true, json: async () => ({ path: "/uploads/1-a.png" }) };
      },
    });

    assert.equal(src, "/uploads/1-a.png");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^\/api\/upload\?/);
    assert.match(calls[0].url, /kind=image/);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].hasBody, true);
  });

  await t.test("rejects invalid files before touching the network", async () => {
    let called = false;
    await assert.rejects(
      () =>
        uploadCustomImage(fakeFile("a.svg", "image/svg+xml"), {
          fetchImpl: async () => {
            called = true;
            return { ok: true, json: async () => ({ path: "/uploads/a.svg" }) };
          },
        }),
      /SVG/
    );
    assert.equal(called, false);
  });

  await t.test("surfaces server errors and refuses non-upload paths", async () => {
    await assert.rejects(
      () =>
        uploadCustomImage(fakeFile("a.png", "image/png"), {
          fetchImpl: async () => ({
            ok: false,
            json: async () => ({ error: "이미지 형식이 아닙니다." }),
          }),
        }),
      /이미지 형식이 아닙니다/
    );

    await assert.rejects(
      () =>
        uploadCustomImage(fakeFile("a.png", "image/png"), {
          fetchImpl: async () => ({
            ok: true,
            json: async () => ({ path: "https://evil.test/a.png" }),
          }),
        }),
      /업로드/
    );
  });
});

test("customSlideDownloadFilename", async (t) => {
  await t.test("uses the slide name", () => {
    assert.equal(customSlideDownloadFilename("주보 1면"), "주보 1면.pptx");
  });

  await t.test("falls back when the name is blank", () => {
    assert.equal(customSlideDownloadFilename("  "), "custom_slide.pptx");
    assert.equal(customSlideDownloadFilename(undefined), "custom_slide.pptx");
  });
});

test("createCustomEditorSession", async (t) => {
  await t.test("initializes the editor exactly once", async () => {
    const { createEditor, state } = createFakeEditorFactory();
    const session = createCustomEditorSession({ root: {}, createEditor });

    await session.showSlide("a", rectModel("a"));
    await session.showSlide("b", rectModel("b"));
    await session.ensureEditor();

    assert.equal(state.instances, 1);
    assert.equal(state.loads.length, 2);
  });

  await t.test("only reports the load that is still current", async () => {
    const { createEditor, state } = createFakeEditorFactory({ holdLoad: true });
    const session = createCustomEditorSession({ root: {}, createEditor });

    const first = session.showSlide("a", rectModel("a"));
    await flush();
    const second = session.showSlide("b", rectModel("b"));
    await flush();

    // Release the loads in the order the editor queued them.
    assert.equal(state.pendingLoads.length, 2);
    for (const gate of state.pendingLoads) {
      gate.resolve();
      await flush();
    }

    assert.equal((await first).applied, false);
    assert.equal((await second).applied, true);
    assert.equal(session.activeSlideId, "b");
  });

  await t.test("suppresses change callbacks while a slide is loading", async () => {
    const { createEditor } = createFakeEditorFactory();
    const changes = [];
    const session = createCustomEditorSession({
      root: {},
      createEditor,
      onChange: (change) => changes.push(change),
    });

    await session.showSlide("a", rectModel("a"));
    assert.deepEqual(changes, []);
  });

  await t.test("attributes later changes to the active slide", async () => {
    const { createEditor, state } = createFakeEditorFactory();
    const changes = [];
    const session = createCustomEditorSession({
      root: {},
      createEditor,
      onChange: (change) => changes.push(change),
    });

    await session.showSlide("a", rectModel("a"));
    state.onChange(rectModel("a"), { dirty: true });

    assert.equal(changes.length, 1);
    assert.equal(changes[0].slideId, "a");
    assert.equal(changes[0].dirty, true);
  });

  await t.test("loads saved slides clean and new slides dirty", async () => {
    const { createEditor, state } = createFakeEditorFactory();
    const session = createCustomEditorSession({ root: {}, createEditor });

    const saved = await session.showSlide("a", rectModel("a"), { markSaved: true });
    assert.equal(saved.dirty, false);

    const fresh = await session.showSlide("b", rectModel("b"), { markSaved: false });
    assert.equal(fresh.dirty, true);
    assert.deepEqual(
      state.loads.map((load) => load.loadOptions.markSaved),
      [true, false]
    );
  });

  await t.test("refuses to serialize or mark another slide's state", async () => {
    const { createEditor, state } = createFakeEditorFactory();
    const session = createCustomEditorSession({ root: {}, createEditor });

    await session.showSlide("a", rectModel("a"));

    assert.equal(session.serialize("b"), null);
    session.markSaved("b");
    assert.equal(state.markSavedCalls, 0);

    assert.ok(session.serialize("a"));
    session.markSaved("a");
    assert.equal(state.markSavedCalls, 1);
  });

  await t.test("resets only the active slide through the editor", async () => {
    const { createEditor, state } = createFakeEditorFactory();
    const session = createCustomEditorSession({ root: {}, createEditor });

    await session.showSlide("a", rectModel("a"));

    assert.equal(await session.reset("b"), false);
    assert.equal(state.resetCalls, 0);
    assert.equal(state.dirty, false);

    assert.equal(await session.reset("a"), true);
    assert.equal(state.resetCalls, 1);
    assert.equal(state.dirty, true);
  });

  await t.test("serializes nothing before the editor exists", () => {
    const { createEditor } = createFakeEditorFactory();
    const session = createCustomEditorSession({ root: {}, createEditor });

    assert.equal(session.serialize("a"), null);
    assert.equal(session.isDirty(), false);
    assert.equal(session.isActive("a"), false);
  });

  await t.test("release detaches the editor from the slide being left", async () => {
    const { createEditor, state } = createFakeEditorFactory();
    const session = createCustomEditorSession({ root: {}, createEditor });

    await session.showSlide("a", rectModel("a"));
    session.release();

    assert.equal(session.activeSlideId, null);
    assert.equal(session.serialize("a"), null);
    session.markSaved("a");
    assert.equal(state.markSavedCalls, 0);
  });

  await t.test("claims no slide while a load is still running", async () => {
    const { createEditor, state } = createFakeEditorFactory({ holdLoad: true });
    const session = createCustomEditorSession({ root: {}, createEditor });

    const pending = session.showSlide("a", rectModel("a"));
    await flush();

    assert.equal(session.activeSlideId, null);
    assert.equal(session.serialize("a"), null);
    session.markSaved("a");
    assert.equal(state.markSavedCalls, 0);

    state.pendingLoads[0].resolve();
    await pending;

    assert.equal(session.activeSlideId, "a");
    assert.ok(session.serialize("a"));
  });

  await t.test("does not adopt a slide whose load threw", async () => {
    const state = { markSavedCalls: 0 };
    const session = createCustomEditorSession({
      root: {},
      createEditor: async () => ({
        async load() {
          throw new Error("render failed");
        },
        serialize: () => createDefaultCustomSlide(),
        isDirty: () => true,
        markSaved() {
          state.markSavedCalls += 1;
        },
        async reset() {},
        async destroy() {},
      }),
    });

    await assert.rejects(() => session.showSlide("a", rectModel("a")), /render failed/);

    assert.equal(session.activeSlideId, null);
    assert.equal(session.isActive("a"), false);
    assert.equal(session.serialize("a"), null);
    session.markSaved("a");
    assert.equal(state.markSavedCalls, 0);
  });

  await t.test("a superseded load never becomes the active slide", async () => {
    const { createEditor, state } = createFakeEditorFactory({ holdLoad: true });
    const session = createCustomEditorSession({ root: {}, createEditor });

    const first = session.showSlide("a", rectModel("a"));
    await flush();
    const second = session.showSlide("b", rectModel("b"));
    await flush();

    // Let the stale load finish first: it must not claim the canvas.
    state.pendingLoads[0].resolve();
    await first;
    assert.equal(session.activeSlideId, null);
    assert.equal(session.serialize("a"), null);

    state.pendingLoads[1].resolve();
    await second;
    assert.equal(session.activeSlideId, "b");
    assert.equal(session.serialize("a"), null);
    assert.ok(session.serialize("b"));
  });

  await t.test("recovers when the first initialization fails", async () => {
    let attempts = 0;
    const session = createCustomEditorSession({
      root: {},
      createEditor: async (root, options) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("fabric unavailable");
        }
        return {
          async load(model) {
            return model;
          },
          serialize: () => createDefaultCustomSlide(),
          isDirty: () => false,
          markSaved() {},
          async reset() {},
          async destroy() {},
        };
      },
    });

    await assert.rejects(() => session.showSlide("a", rectModel("a")), /fabric unavailable/);
    const result = await session.showSlide("a", rectModel("a"));

    assert.equal(result.applied, true);
    assert.equal(attempts, 2);
  });
});
