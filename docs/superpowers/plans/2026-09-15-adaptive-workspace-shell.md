# Adaptive Workspace Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the scripture extractor and PPT generator independent responsive width policies, and reliably reflow every active preview or custom canvas when the workspace width changes.

**Architecture:** Add a small browser-safe layout-state module that maps the current view and PPT surface to declarative data attributes. CSS derives the shell maximum width from those attributes. A requestAnimationFrame-batched reflow coordinator rerenders width-bound previews and explicitly resizes the custom Fabric editor while leaving the PPTX viewer's existing adaptive `ResizeObserver` intact.

**Tech Stack:** JavaScript ES modules, CSS Grid, ResizeObserver, Fabric.js 6, Node test runner, JSDOM, Playwright, Vite

## Global Constraints

- Keep the extractor workspace at a maximum width of 980px.
- Give the PPT gallery a maximum width of 1400px.
- Give the PPT slide and template editors a maximum width of 1600px.
- Base all responsive decisions on browser viewport width, not physical monitor size.
- Preserve all existing element IDs, slide records, template schemas, export geometry, and server APIs.
- Do not add dependencies.
- Do not rerender an already-mounted PPTX upload viewer on width-only changes; it owns an internal adaptive ResizeObserver.
- Layout state and reflow must never mark a slide dirty.
- Preserve the existing uncommitted changes in `scripts/upload-preview-check.mjs`.

---

### Task 1: Declarative Workspace Layout State

**Files:**
- Create: `public/workspace-layout.js`
- Create: `test/workspace-layout.test.js`

**Interfaces:**
- Produces: `resolveWorkspaceLayoutState({ viewName, pptTab, activeTemplateId }) -> { workspace, pptSurface }`
- Produces: `applyWorkspaceLayoutState(element, state) -> state`
- `workspace` is exactly `"extractor"` or `"ppt"`.
- `pptSurface` is exactly `"gallery"` or `"editor"` when `workspace === "ppt"`, otherwise `null`.

- [ ] **Step 1: Write the failing state-resolution tests**

Create `test/workspace-layout.test.js`:

```javascript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyWorkspaceLayoutState,
  resolveWorkspaceLayoutState,
} from "../public/workspace-layout.js";

describe("workspace layout state", () => {
  it("keeps the extractor on the reading-width surface", () => {
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "extractor",
        pptTab: "slides",
        activeTemplateId: null,
      }),
      { workspace: "extractor", pptSurface: null }
    );
  });

  it("uses gallery width only for the template gallery", () => {
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "ppt",
        pptTab: "templates",
        activeTemplateId: null,
      }),
      { workspace: "ppt", pptSurface: "gallery" }
    );
  });

  it("uses editor width for slides and an open template", () => {
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "ppt",
        pptTab: "slides",
        activeTemplateId: null,
      }),
      { workspace: "ppt", pptSurface: "editor" }
    );
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "ppt",
        pptTab: "templates",
        activeTemplateId: "template-1",
      }),
      { workspace: "ppt", pptSurface: "editor" }
    );
  });

  it("writes and removes the shell data attributes", () => {
    const element = { dataset: {} };
    applyWorkspaceLayoutState(element, {
      workspace: "ppt",
      pptSurface: "gallery",
    });
    assert.deepEqual(element.dataset, {
      workspace: "ppt",
      pptSurface: "gallery",
    });

    applyWorkspaceLayoutState(element, {
      workspace: "extractor",
      pptSurface: null,
    });
    assert.equal(element.dataset.workspace, "extractor");
    assert.equal("pptSurface" in element.dataset, false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/workspace-layout.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `public/workspace-layout.js`.

- [ ] **Step 3: Implement the layout-state module**

Create `public/workspace-layout.js`:

```javascript
export function resolveWorkspaceLayoutState({
  viewName,
  pptTab,
  activeTemplateId,
} = {}) {
  const workspace = viewName === "ppt" ? "ppt" : "extractor";
  if (workspace === "extractor") {
    return { workspace, pptSurface: null };
  }

  const isTemplateGallery =
    pptTab === "templates" && !activeTemplateId;
  return {
    workspace,
    pptSurface: isTemplateGallery ? "gallery" : "editor",
  };
}

export function applyWorkspaceLayoutState(element, state) {
  if (!element) {
    return state;
  }

  element.dataset.workspace = state.workspace;
  if (state.pptSurface) {
    element.dataset.pptSurface = state.pptSurface;
  } else {
    delete element.dataset.pptSurface;
  }
  return state;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test test/workspace-layout.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the state seam**

```bash
git add public/workspace-layout.js test/workspace-layout.test.js
git commit -m "feat: add workspace layout state"
```

---

### Task 2: Workspace-Specific Shell Widths

**Files:**
- Modify: `public/styles.css:102-108`
- Modify: `public/app.js:1-52, 815-828, 1519-1552, 2384-2414`
- Modify: `test/workspace-layout.test.js`

**Interfaces:**
- Consumes: `resolveWorkspaceLayoutState` and `applyWorkspaceLayoutState` from Task 1.
- Produces: `.page[data-workspace][data-ppt-surface]` as the CSS layout contract.
- Produces: `syncWorkspaceLayoutState(viewName?) -> { workspace, pptSurface }` inside `app.js`.

- [ ] **Step 1: Add failing source-contract tests**

Append to `test/workspace-layout.test.js`:

```javascript
import { readFile } from "node:fs/promises";

const [css, appSource] = await Promise.all([
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

describe("workspace shell wiring", () => {
  it("declares distinct extractor, gallery, and editor maximum widths", () => {
    assert.match(css, /--workspace-max:\s*980px/);
    assert.match(
      css,
      /\.page\[data-workspace="ppt"\]\[data-ppt-surface="gallery"\][\s\S]*--workspace-max:\s*1400px/
    );
    assert.match(
      css,
      /\.page\[data-workspace="ppt"\]\[data-ppt-surface="editor"\][\s\S]*--workspace-max:\s*1600px/
    );
  });

  it("syncs layout state from both view and PPT-surface transitions", () => {
    assert.match(appSource, /function syncWorkspaceLayoutState\(/);
    assert.match(
      appSource,
      /function applyViewChange\([\s\S]*syncWorkspaceLayoutState\(viewName\)/
    );
    assert.match(
      appSource,
      /function renderPptScreen\([\s\S]*syncWorkspaceLayoutState\("ppt"\)/
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/workspace-layout.test.js
```

Expected: 2 new tests fail because width variables and wiring do not exist.

- [ ] **Step 3: Replace the global fixed width with a workspace variable**

Change the `.page` rule and add explicit workspace rules in `public/styles.css`:

```css
.page {
  --workspace-max: 980px;
  width: 100%;
  max-width: var(--workspace-max);
  margin: 0 auto;
  padding: 48px 24px 64px;
  display: grid;
  gap: 32px;
}

.page[data-workspace="ppt"][data-ppt-surface="gallery"] {
  --workspace-max: 1400px;
}

.page[data-workspace="ppt"][data-ppt-surface="editor"] {
  --workspace-max: 1600px;
}
```

Do not animate `max-width`; a width animation would continuously invalidate preview geometry.

- [ ] **Step 4: Wire layout state into `app.js`**

Add the import with the other browser modules:

```javascript
import {
  applyWorkspaceLayoutState,
  resolveWorkspaceLayoutState,
} from "./workspace-layout.js";
```

Add the shell reference beside the navigation references:

```javascript
const appPage = document.querySelector(".page");
const navExtractor = document.getElementById("navExtractor");
const navPpt = document.getElementById("navPpt");
```

Add this helper after the PPT state declarations so it can read `pptTab` and `activeTemplateId`:

```javascript
function syncWorkspaceLayoutState(viewName) {
  const currentView =
    viewName ??
    (navExtractor.classList.contains("active") ? "extractor" : "ppt");
  return applyWorkspaceLayoutState(
    appPage,
    resolveWorkspaceLayoutState({
      viewName: currentView,
      pptTab,
      activeTemplateId,
    })
  );
}
```

At the end of `renderPptScreen()`, before returning, add:

```javascript
  syncWorkspaceLayoutState("ppt");
```

At the end of `applyViewChange(viewName)`, after the visible view and active navigation item are updated, add:

```javascript
  syncWorkspaceLayoutState(viewName);
```

After navigation listeners are registered, seed the server-rendered default:

```javascript
syncWorkspaceLayoutState("extractor");
```

- [ ] **Step 5: Run focused and navigation regression tests**

Run:

```bash
node --test test/workspace-layout.test.js test/save-state.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Build the browser bundle**

Run:

```bash
npm run build
```

Expected: Vite exits 0 with both `index.html` and `scripture-web-view.html` bundles.

- [ ] **Step 7: Commit workspace width wiring**

```bash
git add public/styles.css public/app.js test/workspace-layout.test.js
git commit -m "feat: adapt shell width by workspace"
```

---

### Task 3: Explicit Custom Canvas Resize Seam

**Files:**
- Modify: `public/custom-slide-editor.js:4083-4100, 4124-4175`
- Modify: `public/custom-slide-bridge.js:230-280`
- Modify: `test/custom-slide-editor-controller.test.js`
- Modify: `test/custom-slide-bridge.test.js`

**Interfaces:**
- Produces: editor method `resize() -> boolean`.
- Produces: session method `resize(slideId) -> boolean`.
- Returns `false` when the editor is destroyed, detached, hidden, or does not own `slideId`.
- Returns `true` only after CSS canvas dimensions are updated.

- [ ] **Step 1: Write failing editor resize tests**

Append to `test/custom-slide-editor-controller.test.js`:

```javascript
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
```

- [ ] **Step 2: Write a failing session ownership test**

In `test/custom-slide-bridge.test.js`, add `resizeCalls` to the state in `createFakeEditorFactory()`:

```javascript
resizeCalls: 0,
```

Add `resize()` to the fake editor returned by `createEditor()`:

```javascript
resize() {
  state.resizeCalls += 1;
  return true;
},
```

Then add this subtest inside `test("createCustomEditorSession", async (t) => { ... })`:

```javascript
  await t.test("resizes only the custom slide it owns", async () => {
    const { createEditor, state } = createFakeEditorFactory();
    const session = createCustomEditorSession({ root: {}, createEditor });
    await session.showSlide("slide-a", rectModel("slide-a"));

    assert.equal(session.resize("slide-b"), false);
    assert.equal(session.resize("slide-a"), true);
    assert.equal(state.resizeCalls, 1);
  });
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
node --test test/custom-slide-editor-controller.test.js test/custom-slide-bridge.test.js
```

Expected: FAIL because neither returned API exposes `resize`.

- [ ] **Step 4: Expose the editor resize method**

Change `resizeToStage()` in `public/custom-slide-editor.js`:

```javascript
  function resizeToStage() {
    if (destroyed) {
      return false;
    }
    const host = dom.stage ?? root;
    const available = host.clientWidth;
    if (!available) {
      return false;
    }
    const width = Math.min(available, SLIDE_WIDTH) * zoom;
    const height = (width * SLIDE_HEIGHT) / SLIDE_WIDTH;
    canvas.setDimensions(
      { width: `${width}px`, height: `${height}px` },
      { cssOnly: true }
    );
    positionToolbar?.();
    return true;
  }
```

Expose it in the returned editor API:

```javascript
  return {
    canvas,
    load,
    resize: resizeToStage,
    serialize() {
```

- [ ] **Step 5: Expose the owned-session resize method**

Add to the returned object in `createCustomEditorSession()`:

```javascript
    resize(slideId) {
      if (!ownsSlide(slideId) || typeof editor.resize !== "function") {
        return false;
      }
      return editor.resize();
    },
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test test/custom-slide-editor-controller.test.js test/custom-slide-bridge.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit the explicit resize seam**

```bash
git add public/custom-slide-editor.js public/custom-slide-bridge.js \
  test/custom-slide-editor-controller.test.js test/custom-slide-bridge.test.js
git commit -m "feat: expose custom editor reflow"
```

---

### Task 4: Frame-Batched Workspace Reflow Coordinator

**Files:**
- Modify: `public/workspace-layout.js`
- Modify: `test/workspace-layout.test.js`
- Modify: `public/app.js:3037-3240, 5055-5124`

**Interfaces:**
- Produces: `createWidthReflowCoordinator(options)`.
- `options.measure() -> number`.
- `options.reflow(width) -> void | Promise<void>`.
- `options.requestFrame(callback) -> frameId`.
- `options.cancelFrame(frameId) -> void`.
- Returned API: `{ schedule({ force }?), disconnect() }`.

- [ ] **Step 1: Write failing coordinator tests**

Extend the existing import in `test/workspace-layout.test.js`:

```javascript
import {
  applyWorkspaceLayoutState,
  createWidthReflowCoordinator,
  resolveWorkspaceLayoutState,
} from "../public/workspace-layout.js";
```

Then append:

```javascript
describe("width reflow coordinator", () => {
  it("batches requests and skips unchanged widths", () => {
    let width = 600;
    let nextFrame = null;
    const calls = [];
    const coordinator = createWidthReflowCoordinator({
      measure: () => width,
      reflow: (measured) => calls.push(measured),
      requestFrame: (callback) => {
        nextFrame = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    coordinator.schedule();
    coordinator.schedule();
    nextFrame();
    assert.deepEqual(calls, [600]);

    coordinator.schedule();
    nextFrame();
    assert.deepEqual(calls, [600]);

    width = 900;
    coordinator.schedule();
    nextFrame();
    assert.deepEqual(calls, [600, 900]);
  });

  it("supports a forced reflow and ignores zero-width stages", () => {
    let width = 0;
    let nextFrame = null;
    const calls = [];
    const coordinator = createWidthReflowCoordinator({
      measure: () => width,
      reflow: (measured) => calls.push(measured),
      requestFrame: (callback) => {
        nextFrame = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    coordinator.schedule({ force: true });
    nextFrame();
    assert.deepEqual(calls, []);

    width = 700;
    coordinator.schedule({ force: true });
    nextFrame();
    assert.deepEqual(calls, [700]);

    coordinator.schedule({ force: true });
    nextFrame();
    assert.deepEqual(calls, [700, 700]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/workspace-layout.test.js
```

Expected: FAIL because `createWidthReflowCoordinator` is not exported.

- [ ] **Step 3: Implement the coordinator**

Append to `public/workspace-layout.js`:

```javascript
export function createWidthReflowCoordinator({
  measure,
  reflow,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
} = {}) {
  let frameId = null;
  let lastWidth = 0;
  let forceNext = false;

  function run() {
    frameId = null;
    const width = Math.round(Number(measure?.()) || 0);
    const forced = forceNext;
    forceNext = false;
    if (width <= 0 || (!forced && width === lastWidth)) {
      return;
    }
    lastWidth = width;
    reflow?.(width);
  }

  return {
    schedule({ force = false } = {}) {
      forceNext ||= force;
      if (frameId !== null) {
        return;
      }
      if (typeof requestFrame !== "function") {
        run();
        return;
      }
      frameId = requestFrame(run);
    },
    disconnect() {
      if (frameId !== null && typeof cancelFrame === "function") {
        cancelFrame(frameId);
      }
      frameId = null;
      forceNext = false;
    },
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test test/workspace-layout.test.js
```

Expected: all workspace-layout tests pass.

- [ ] **Step 5: Wire one active-stage coordinator into `app.js`**

Extend the Task 1 import:

```javascript
import {
  applyWorkspaceLayoutState,
  createWidthReflowCoordinator,
  resolveWorkspaceLayoutState,
} from "./workspace-layout.js";
```

After `customEditorSession`, `currentSlideId`, and preview elements exist, add:

```javascript
function activePptStageWidth() {
  if (slideTypeSelect.value === "custom") {
    return customSlideEditorRoot
      ?.querySelector('[data-custom-editor="stage"]')
      ?.clientWidth ?? 0;
  }
  return slidePreview?.clientWidth ?? 0;
}

function reflowActivePptStage() {
  if (navExtractor.classList.contains("active")) {
    return;
  }

  if (slideTypeSelect.value === "custom") {
    customEditorSession?.resize(currentSlideId);
    return;
  }

  // The mounted PPTX viewer owns its own ResizeObserver. Recreating it here
  // would discard parsing work, zoom, scroll, and lazy-mounted slide state.
  if (slidePreview?.__pptxPreviewState?.viewer) {
    return;
  }
  renderPreview();
}

const workspaceResizeObserver =
  typeof ResizeObserver === "function"
    ? new ResizeObserver(() => workspaceReflow?.schedule())
    : null;
workspaceResizeObserver?.observe(slideEditor);
```

At the end of `syncWorkspaceLayoutState()` add:

```javascript
  workspaceReflow?.schedule({ force: true });
```

Because the coordinator is declared later in the module, declare it before use:

```javascript
let workspaceReflow = null;
```

Then assign the coordinator after all required DOM and editor-session references are initialized:

```javascript
workspaceReflow = createWidthReflowCoordinator({
  measure: activePptStageWidth,
  reflow: reflowActivePptStage,
});
```

After `setHidden(customSlideEditorRoot, ...)` and `setHidden(slidePreviewArea, ...)` in `updateSettingsVisibility()`, add:

```javascript
  workspaceReflow?.schedule({ force: true });
```

After a custom slide finishes loading in `showCustomSlideInEditor()`, add:

```javascript
      workspaceReflow?.schedule({ force: true });
```

Do not call `refreshSaveState()` from reflow code.

- [ ] **Step 6: Run unit and controller regression tests**

Run:

```bash
node --test test/workspace-layout.test.js \
  test/custom-slide-editor-controller.test.js \
  test/custom-slide-bridge.test.js \
  test/save-state.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit the reflow coordinator**

```bash
git add public/workspace-layout.js public/app.js test/workspace-layout.test.js
git commit -m "feat: reflow active PPT stage"
```

---

### Task 5: Browser Width and Reflow Regression Coverage

**Files:**
- Modify: `test/browser/save-flow.playwright.mjs`

**Interfaces:**
- Consumes: `.page[data-workspace][data-ppt-surface]`.
- Consumes: the explicit custom-editor resize seam and active-stage reflow coordinator.
- Produces: regression coverage for 1024, 1440, and 1920px browser viewports.

- [ ] **Step 1: Add a failing workspace-width browser scenario**

Add this scenario after the basic navigation scenarios in `test/browser/save-flow.playwright.mjs`:

```javascript
await runScenario(
  "workspace width follows the active product without widening scripture",
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setup(page, { slides: customCanvasSlides });
    await page.locator("#navExtractor").click();

    const extractorShellWidth = await page.locator(".page").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    assert.equal(extractorShellWidth, 980);
    assert.equal(
      await page.locator(".page").getAttribute("data-workspace"),
      "extractor"
    );

    await page.locator("#navPpt").click();
    assert.equal(
      await page.locator(".page").getAttribute("data-ppt-surface"),
      "editor"
    );
    const pptShellWidth = await page.locator(".page").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    assert.ok(pptShellWidth >= 1390, `PPT shell stayed narrow: ${pptShellWidth}`);

    await page.locator("#tabTemplatesBtn").click();
    assert.equal(
      await page.locator(".page").getAttribute("data-ppt-surface"),
      "gallery"
    );
    await page.locator("#navExtractor").click();
    assert.equal(
      await page.locator(".page").getAttribute("data-workspace"),
      "extractor"
    );
  }
);
```

- [ ] **Step 2: Add a failing custom-canvas reflow scenario**

Add:

```javascript
await runScenario(
  "custom canvas grows with the browser and recovers after a hidden view",
  async (page) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await setup(page, { slides: customCanvasSlides });
    await selectMainSlide(page, 0);
    const status = page
      .locator("#customSlideEditor [data-custom-editor='status']")
      .first();
    await status.filter({ hasText: "슬라이드를 불러왔습니다" }).waitFor();

    const narrowWidth = await page.locator(
      "#customSlideEditor .canvas-container"
    ).evaluate((node) => Math.round(node.getBoundingClientRect().width));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(
      (before) =>
        document.querySelector("#customSlideEditor .canvas-container")
          ?.getBoundingClientRect().width > before + 200,
      narrowWidth
    );

    const wideWidth = await page.locator(
      "#customSlideEditor .canvas-container"
    ).evaluate((node) => Math.round(node.getBoundingClientRect().width));
    assert.ok(wideWidth >= 900, `custom canvas stayed narrow: ${wideWidth}`);

    await page.locator("#navExtractor").click();
    await page.locator("#navPpt").click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          document.querySelector("#customSlideEditor .canvas-container")
            ?.getBoundingClientRect().width - expected
        ) <= 2,
      wideWidth
    );
  }
);
```

- [ ] **Step 3: Add a failing title-preview reflow scenario**

Add:

```javascript
await runScenario(
  "title preview rerenders at the current stage width",
  async (page) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await setup(page);
    await selectMainSlide(page, 0);
    await page.locator("#slideType").selectOption("title");
    await page.locator("#titleKo").fill("주일예배");

    const initial = await page.locator("#slidePreview > div").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(
      (before) =>
        document.querySelector("#slidePreview > div")
          ?.getBoundingClientRect().width > before + 200,
      initial
    );

    const resized = await page.locator("#slidePreview > div").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    const host = await page.locator("#slidePreview").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    assert.ok(Math.abs(resized - host) <= 2, `${resized} did not fit ${host}`);
  }
);
```

- [ ] **Step 4: Run the integrated browser contracts**

```bash
npm run test:browser
```

Expected: all browser scenarios pass. Tasks 1–4 were driven by focused failing tests; these scenarios verify the integrated browser behavior and report zero unexpected console or page errors.

- [ ] **Step 5: Verify no horizontal overflow at target widths**

Extend the first scenario with:

```javascript
    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      assert.ok(overflow <= 1, `${width}px viewport overflowed by ${overflow}px`);
    }
```

Run:

```bash
npm run test:browser
```

Expected: all three widths report no document-level horizontal overflow.

- [ ] **Step 6: Commit browser regression coverage**

```bash
git add test/browser/save-flow.playwright.mjs
git commit -m "test: cover adaptive workspace widths"
```

---

### Task 6: Milestone Verification

**Files:**
- No production changes unless a verification failure identifies a concrete defect.

**Interfaces:**
- Produces: a shippable adaptive-shell milestone and evidence for the next three-pane plan.

- [ ] **Step 1: Run the complete Node suite**

```bash
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the browser regression suite**

```bash
npm run test:browser
```

Expected: all scenarios pass with zero unexpected page or console errors.

- [ ] **Step 3: Run the existing caret and pointer probes**

Run Chromium DPR 1 and 2:

```bash
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
  ENGINE=chromium DSF=1 node scripts/caret-hit-test.mjs

PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
  ENGINE=chromium DSF=2 node scripts/caret-hit-test.mjs

PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
  node scripts/pointer-mapping-test.mjs
```

Expected: every click reports drift 0 and pointer mapping remains within the existing tolerance.

- [ ] **Step 4: Build and check whitespace**

```bash
npm run build
git diff --check
```

Expected: Vite exits 0 and `git diff --check` prints nothing.

- [ ] **Step 5: Inspect the milestone diff**

```bash
git status --short
git diff --stat HEAD~4..HEAD
```

Expected: only the planned layout, reflow, test, and documentation files appear. The pre-existing `scripts/upload-preview-check.mjs` modification remains uncommitted and unchanged.

- [ ] **Step 6: Proceed to the next plan**

Write and execute the separate three-pane PPT workspace and focus-mode plan only after this milestone passes. Do not start pop-out synchronization or IME production changes in this milestone.
