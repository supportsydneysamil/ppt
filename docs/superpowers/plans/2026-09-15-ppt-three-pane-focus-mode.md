# PPT Three-Pane Workspace and Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the adaptive PPT editor into slides, stage, and inspector regions with accessible panel controls, compact drawers, and a canvas-first focus mode.

**Architecture:** Preserve the existing DOM controls and IDs. Add a pure workspace UI-state module, expose three control buttons in the current HTML, and use CSS Grid areas to place the existing form, preview, and custom-editor chrome. The application writes declarative data attributes; CSS owns wide, compact, mobile, collapsed, and focus layouts.

**Tech Stack:** JavaScript ES modules, CSS Grid, HTML inert/ARIA, ResizeObserver, Node test runner, JSDOM, Playwright, Vite

## Global Constraints

- Keep all current input, button, preview, custom-editor, and template IDs stable.
- Preserve save, cancel, reset, delete, download, unsaved-change, and template behavior.
- Use wide mode at browser widths of 1280px and above.
- Use compact drawer mode from 900px through 1279px.
- Use the vertical mobile layout below 900px.
- Focus mode must never modify slide or template data.
- Opening one compact drawer closes the other.
- Mobile mode keeps the slide list and inspector in normal document flow.
- Every panel-state change must schedule the existing workspace reflow coordinator.
- Do not implement the pop-out window or Korean IME production fix in this milestone.
- Preserve uncommitted changes in `data/templates.json` and `scripts/upload-preview-check.mjs`.

---

### Task 1: Pure PPT Workspace UI State

**Files:**
- Create: `public/ppt-workspace-ui.js`
- Create: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Produces: `pptWorkspaceMode(width) -> "wide" | "compact" | "mobile"`.
- Produces: `createPptWorkspaceUiState(width, preference?) -> state`.
- Produces: `reducePptWorkspaceUi(state, action) -> state`.
- State shape: `{ mode, focusMode, slidesOpen, inspectorOpen }`.

- [ ] Write failing tests covering 899/900/1279/1280 boundaries, wide defaults, compact single-drawer behavior, mobile flow, focus entry/exit, and resize normalization.
- [ ] Run `node --test test/ppt-workspace-ui.test.js`; expect module-not-found failure.
- [ ] Implement:

```javascript
export function pptWorkspaceMode(width) {
  const value = Number(width) || 0;
  if (value >= 1280) return "wide";
  if (value >= 900) return "compact";
  return "mobile";
}

export function createPptWorkspaceUiState(width, preference = {}) {
  const mode = pptWorkspaceMode(width);
  const focusMode = mode !== "mobile" && Boolean(preference.focusMode);
  if (mode === "mobile") {
    return { mode, focusMode: false, slidesOpen: true, inspectorOpen: true };
  }
  if (focusMode) {
    return { mode, focusMode, slidesOpen: false, inspectorOpen: false };
  }
  if (mode === "compact") {
    return {
      mode,
      focusMode: false,
      slidesOpen: Boolean(preference.slidesOpen),
      inspectorOpen:
        !preference.slidesOpen && Boolean(preference.inspectorOpen),
    };
  }
  return {
    mode,
    focusMode: false,
    slidesOpen: preference.slidesOpen !== false,
    inspectorOpen: preference.inspectorOpen !== false,
  };
}

export function reducePptWorkspaceUi(state, action = {}) {
  if (action.type === "resize") {
    return createPptWorkspaceUiState(action.width, state);
  }
  if (action.type === "toggle-focus" && state.mode !== "mobile") {
    return state.focusMode
      ? createPptWorkspaceUiState(
          state.mode === "wide" ? 1280 : 900,
          { focusMode: false }
        )
      : { ...state, focusMode: true, slidesOpen: false, inspectorOpen: false };
  }
  if (action.type === "toggle-slides" && state.mode !== "mobile") {
    const slidesOpen = !state.slidesOpen;
    return {
      ...state,
      focusMode: false,
      slidesOpen,
      inspectorOpen:
        state.mode === "compact" && slidesOpen ? false : state.inspectorOpen,
    };
  }
  if (action.type === "toggle-inspector" && state.mode !== "mobile") {
    const inspectorOpen = !state.inspectorOpen;
    return {
      ...state,
      focusMode: false,
      inspectorOpen,
      slidesOpen:
        state.mode === "compact" && inspectorOpen ? false : state.slidesOpen,
    };
  }
  return state;
}
```

- [ ] Run the focused test; expect all state tests to pass.
- [ ] Commit with `git commit -m "feat: add PPT workspace UI state"`.

### Task 2: Accessible Workspace Controls and State Wiring

**Files:**
- Modify: `public/index.html:240-255, 295-365`
- Modify: `public/app.js:819-860, 960-1010, 1519-1572, 2402-2445, 5194-5234`
- Modify: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Consumes: Task 1 state functions.
- Produces buttons `#pptSlidesPaneBtn`, `#pptInspectorPaneBtn`, `#pptFocusModeBtn`.
- Produces data attributes on `#pptWorkspace`: `data-layout-mode`, `data-focus-mode`, `data-slides-open`, `data-inspector-open`.
- Persists preference key `samil-ppt-workspace-ui-v1`.

- [ ] Add failing source-contract tests asserting all three controls, their `aria-controls`, the preference key, and calls to `workspaceReflow.schedule({ force: true })`.
- [ ] Run focused tests and verify the source contracts fail.
- [ ] Add `#pptSlidesPaneBtn` to `.ppt-tabbar-actions`:

```html
<button
  id="pptSlidesPaneBtn"
  type="button"
  class="ghost small ppt-pane-toggle"
  aria-controls="slideListPanel"
  aria-expanded="true"
>
  슬라이드
</button>
```

- [ ] Add `id="slideListPanel"` to `.slide-list-panel`.
- [ ] Add inspector and focus controls before Cancel in `.editor-actions`:

```html
<button
  id="pptInspectorPaneBtn"
  type="button"
  class="ghost small ppt-pane-toggle"
  aria-controls="slideForm customSlideInspector"
  aria-expanded="true"
>
  속성
</button>
<button
  id="pptFocusModeBtn"
  type="button"
  class="ghost small"
  aria-pressed="false"
>
  집중 모드
</button>
```

- [ ] Add `id="customSlideInspector"` only to the React `.custom-editor-side` in `public/custom-editor-chrome.jsx`; do not duplicate that ID on the hidden legacy markup.
- [ ] Import Task 1 functions and initialize state from `window.innerWidth` and JSON parsed from localStorage. Invalid storage falls back to defaults.
- [ ] Implement `applyPptWorkspaceUi()` to write all four data attributes, synchronize button ARIA state/text, set `inert` on hidden inspector/list contents without disabling their toggle buttons, persist `{ focusMode, slidesOpen, inspectorOpen }`, and force workspace reflow.
- [ ] Wire button clicks to reducer actions and window resize to a requestAnimationFrame-batched `resize` action.
- [ ] Set `slideEditor.dataset.slideType = type` in `updateSettingsVisibility()`.
- [ ] Change visible editor assignment from `slideEditor.style.display = "flex"` to `"grid"`.
- [ ] Run focused Node tests and `npm run build`.
- [ ] Commit with `git commit -m "feat: add PPT workspace controls"`.

### Task 3: Wide Three-Pane CSS Layout

**Files:**
- Modify: `public/styles.css:1940-1968, 2275-2445, 3175-3478`
- Modify: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Consumes Task 2 data attributes and stable DOM IDs.
- Wide layout columns: 260px slides + remaining editor.
- Editor columns: `minmax(0, 1fr)` stage + `clamp(280px, 22vw, 320px)` inspector.

- [ ] Add failing CSS source tests for the outer columns, editor grid areas, custom editor columns, and collapsed states.
- [ ] Verify RED.
- [ ] Change the desktop outer workspace:

```css
.ppt-interface {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  position: relative;
}
```

- [ ] Make the selected slide editor an internal grid:

```css
.slide-editor-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(280px, 22vw, 320px);
  grid-template-areas:
    "header header"
    "stage inspector";
  gap: var(--sp-4);
}

.editor-header { grid-area: header; }
.editor-form {
  grid-area: inspector;
  min-width: 0;
  max-height: calc(100vh - 190px);
  overflow: auto;
  padding-right: 4px;
}
.preview-area {
  grid-area: stage;
  align-self: start;
  min-width: 0;
  border-top: 0;
  padding-top: 0;
}
```

- [ ] For custom slides, let the custom editor span the stage and inspector, keep the common name/type form in the inspector, and place custom tools/stage left with layers/properties right:

```css
.slide-editor-panel[data-slide-type="custom"] .custom-editor[data-react-chrome="true"]:not([hidden]) {
  grid-column: 1 / -1;
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(280px, 22vw, 320px);
  grid-template-areas:
    "bar side"
    "tools side"
    "stage side"
    "status side";
  gap: var(--sp-3) var(--sp-4);
}

.slide-editor-panel[data-slide-type="custom"] .editor-form {
  grid-area: inspector;
  z-index: 2;
  align-self: start;
}

.slide-editor-panel[data-slide-type="custom"] .editor-form > :not(.settings-section) {
  display: none;
}

.slide-editor-panel[data-slide-type="custom"] .custom-editor-bar { grid-area: bar; }
.slide-editor-panel[data-slide-type="custom"] .custom-editor-toolbar { grid-area: tools; }
.slide-editor-panel[data-slide-type="custom"] .custom-editor-body { grid-area: stage; }
.slide-editor-panel[data-slide-type="custom"] .custom-editor-side {
  grid-area: side;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding-top: 150px;
}
```

- [ ] Add wide collapsed states. Closed slides use a 44px rail; closed inspector uses a 44px rail. Focus mode closes both while keeping header toggle controls visible.
- [ ] Ensure stage and inspector descendants have `min-width: 0`; do not place `overflow` on ancestors of the sticky slide list.
- [ ] Run focused tests and build.
- [ ] Commit with `git commit -m "feat: add three-pane PPT workspace"`.

### Task 4: Compact Drawers and Mobile Flow

**Files:**
- Modify: `public/styles.css`
- Modify: `test/ppt-workspace-ui.test.js`
- Modify: `test/browser/save-flow.playwright.mjs`

**Interfaces:**
- Compact: 900–1279px, stage in normal flow, list/inspector as overlays.
- Mobile: below 900px, all visible regions return to normal vertical flow.

- [ ] Add failing CSS and browser tests for 899, 900, 1279, and 1280px.
- [ ] At 900–1279px, use a one-column outer grid. Position an open slide list as an absolute left drawer with a maximum width of 320px and an open inspector as an absolute right drawer with a maximum width of 340px. Closed drawers use `visibility: hidden` and `pointer-events: none`; their toggle buttons remain available in the tab bar/header.
- [ ] Add a non-interactive backdrop through `#pptWorkspace::before` whenever either compact drawer is open. Clicking the stage closes the active drawer through a `close-drawers` reducer action.
- [ ] Extend the reducer with:

```javascript
if (action.type === "close-drawers" && state.mode === "compact") {
  return { ...state, slidesOpen: false, inspectorOpen: false };
}
```

- [ ] Below 900px, remove absolute positioning, backdrop, height caps, and inert state. Render slide list first, stage second, inspector third. Hide focus mode because vertical flow already exposes the full stage width.
- [ ] Verify tab order, Escape drawer dismissal, and no document-level horizontal overflow.
- [ ] Run focused tests and browser tests.
- [ ] Commit with `git commit -m "feat: add responsive PPT workspace drawers"`.

### Task 5: Focus Mode and Visual Regression Coverage

**Files:**
- Modify: `test/browser/save-flow.playwright.mjs`
- Modify: `scripts/pointer-mapping-test.mjs` only if a larger stage places a probe target outside its viewport

**Interfaces:**
- Verifies layout and interaction; does not change production behavior.

- [ ] Add browser scenarios that assert:
  - 1440px uses `data-layout-mode="wide"`;
  - stage, slides, and inspector are simultaneously visible;
  - focus mode hides interactive panel contents and expands the custom stage;
  - exiting focus restores wide panels;
  - 1024px opens only one drawer at a time;
  - 899px uses mobile flow;
  - switching extractor→PPT and template gallery→editor preserves the correct state;
  - toggling layout never enables Save on a clean slide;
  - floating text toolbar remains aligned after focus-mode changes.
- [ ] Run `npm run test:browser`; expect all scenarios to pass with no unexpected console/page errors.
- [ ] Run Chromium DPR 1 and 2 caret probes and the pointer probe.
- [ ] Commit with `git commit -m "test: cover PPT focus and drawer layouts"`.

### Task 6: Milestone Verification

**Files:**
- No planned production changes.

- [ ] Run `npm test`; expect zero failures.
- [ ] Run `npm run test:browser`; expect zero failures.
- [ ] Run `npm run build`; expect Vite exit 0.
- [ ] Run `git diff --check`; expect no output.
- [ ] At 1440×1000, verify normal three-pane custom canvas is at least 720×405 and focus-mode canvas is at least 960×540.
- [ ] Confirm `data/templates.json` and `scripts/upload-preview-check.mjs` remain unstaged and unchanged by this milestone.
- [ ] Stop at this checkpoint and write the separate Korean IME reproduction plan before applying any caret production fix.
