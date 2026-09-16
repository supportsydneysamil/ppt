# Image Fill and Crop Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit image display modes, Stretch Fill, and focal/zoom Cover controls with Fabric/PPTX parity.

**Architecture:** Normalize three crop fields in the image model, centralize
crop-window math in the editor, map the same window into PptxGenJS native crop
sizing, and expose the values through conditional inspector controls.

**Tech Stack:** JavaScript, React 19, Fabric 6, PptxGenJS 4, Node test runner, Playwright

## Constraints

- Default new and legacy images to Full Image (`contain`).
- Use no rasterization or custom OOXML.
- Keep previous flips, alt text, replacement, geometry, and effects intact.
- Every production change follows a failing focused test.

---

### Task 1: Model and geometry

**Files:** `public/custom-slide-model.js`, `public/custom-slide-editor.js`,
`test/custom-slide-model.test.js`, `test/custom-slide-editor.test.js`

- [ ] Add failing tests for `stretch`, focal defaults/clamps, zoom clamps, all
  four focal corners, center crop, zoom, and mode round trips.
- [ ] Extend image normalization with `focalX`, `focalY`, and `imageZoom`.
- [ ] Extend `applyImageFit(image, fit, width, height, cropOptions)` with
  contain, cover, and stretch branches.
- [ ] Persist crop metadata on Fabric objects and descriptors.
- [ ] Run focused tests and commit.

### Task 2: Native PPTX parity

**Files:** `lib/custom-slide-pptx.js`, `test/custom-slide-pptx.test.js`

- [ ] Add failing XML tests for left/top and right/bottom crop percentages,
  200% zoom, exact output box size, and Stretch with no crop.
- [ ] Add a pure crop-geometry helper that scales natural and crop dimensions
  into the authored output box.
- [ ] Use native `sizing: { type: "crop" }` for Cover with custom crop values.
- [ ] Use plain authored box geometry for Stretch.
- [ ] Run focused tests and commit.

### Task 3: Inspector UI and controller

**Files:** `public/custom-editor-chrome.jsx`, `public/index.html`,
`public/styles.css`, `public/custom-slide-editor.js`,
`test/custom-slide-editor-controller.test.js`,
`test/ppt-workspace-ui.test.js`

- [ ] Add failing source/controller tests for three explicit mode labels,
  conditional crop controls, focal grid, sliders/readouts, reset, and undo.
- [ ] Render `전체 보기`, `프레임 채우기`, and `늘여서 채우기`.
- [ ] Add focal/zoom fields and nine focal buttons.
- [ ] Synchronize selection, mode visibility, readouts, and pressed anchor.
- [ ] Reapply image fit after every crop field/action change.
- [ ] Add scoped compact inspector styling.
- [ ] Run focused tests/build and commit.

### Task 4: Browser and full verification

**Files:** `test/browser/save-flow.playwright.mjs`

- [ ] Extend the native image scenario through Cover, focal position, zoom,
  Stretch, reset, and replacement preservation.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:browser`.
- [ ] Run `git diff --check` and verify a clean worktree.

## Self-Review

- The plan implements only library-native display/crop behavior.
- Browser and PPTX use one normalized focal/zoom model.
- Stretch is explicit and carries a distortion warning.
- No direct crop mode, filters, or masks are introduced.
