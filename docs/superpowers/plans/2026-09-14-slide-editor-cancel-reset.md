# Slide Editor Cancel and Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep slide context on cancel and provide a confirmed, type-preserving slide initialization action.

**Architecture:** Put type-default construction and action decisions in small pure helpers in `lib/save-state.js`, then let `public/app.js` apply those decisions to the existing draft, editor and list state. Reuse the existing custom-editor reset API through the bridge session and use a dedicated dialog for destructive initialization.

**Tech Stack:** Browser JavaScript, Node test runner, JSDOM, Playwright, Fabric.js

## Global Constraints

- Cancel affects only the current slide draft, not template-level changes.
- Reset preserves slide ID, list position, type and name.
- Reset remains a dirty draft until explicitly saved, except when it exactly restores an already-default saved slide.
- Existing save-in-progress protection remains authoritative.

---

### Task 1: Pure slide action decisions and defaults

**Files:**
- Modify: `lib/save-state.js`
- Test: `test/save-state.test.js`

**Interfaces:**
- Produces: `buildResetSlideDraft(slide)` returning a slide with preserved identity metadata and type-specific initial values.
- Produces: `resolveAdjacentSlideId(slides, removedId)` returning the next slide ID, previous slide ID, or `null`.

- [x] **Step 1: Write failing tests**

Add tests that verify preserved `id`, `name`, `type` and reset content for every supported type, plus next/previous/empty adjacent selection.

- [x] **Step 2: Verify the tests fail**

Run: `node --test test/save-state.test.js`
Expected: FAIL because the new exports do not exist.

- [x] **Step 3: Implement the pure helpers**

Construct reset defaults without mutating the source slide. Clear uploaded media references and initialize custom slides with a normalized empty model shape.

- [x] **Step 4: Verify the tests pass**

Run: `node --test test/save-state.test.js`
Expected: PASS.

### Task 2: Cancel behavior

**Files:**
- Modify: `public/app.js`
- Test: `test/browser/save-flow.playwright.mjs`

**Interfaces:**
- Consumes: `resolveAdjacentSlideId(slides, removedId)`.
- Produces: cancel behavior that restores an existing slide in place or removes a new slide and selects its neighbor.

- [x] **Step 1: Write failing browser scenarios**

Cover existing dirty slide cancellation, template-level dirty state isolation, and new-slide neighbor selection.

- [x] **Step 2: Verify the scenarios fail**

Run: `npm run test:browser`
Expected: FAIL because cancel currently calls `resetEditorSelection()`.

- [x] **Step 3: Implement cancel in place**

For an existing slide, repopulate its saved model and preserve `currentSlideId`. For a new slide, remove it, sync the workspace, and select the resolved neighbor. Do not route this action through the global navigation guard.

- [x] **Step 4: Verify the browser scenarios pass**

Run: `npm run test:browser`
Expected: PASS.

### Task 3: Confirmed type-preserving initialization

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/custom-slide-bridge.js`
- Modify: `public/styles.css`
- Test: `test/custom-slide-bridge.test.js`
- Test: `test/browser/save-flow.playwright.mjs`

**Interfaces:**
- Consumes: `buildResetSlideDraft(slide)`.
- Produces: bridge session `reset(slideId)` that delegates to the active custom editor.

- [x] **Step 1: Write failing bridge and browser tests**

Verify dialog cancellation is inert, confirmation preserves type/name/selection, reset marks the slide dirty, and a custom slide becomes a blank canvas.

- [x] **Step 2: Verify the tests fail**

Run: `node --test test/custom-slide-bridge.test.js && npm run test:browser`
Expected: FAIL because reset is not exposed by the session and no confirmation dialog exists.

- [x] **Step 3: Add the initialization dialog and action**

Rename the button to `슬라이드 초기화`, add the dedicated dialog, apply pure defaults to the form, call the custom reset API when appropriate, clear transient files, refresh preview/save state, and preserve selection.

- [x] **Step 4: Verify focused tests pass**

Run: `node --test test/custom-slide-bridge.test.js && npm run test:browser`
Expected: PASS.

### Task 4: Full verification

**Files:**
- Test: all affected test suites

- [ ] **Step 1: Run unit and integration tests**

Run: `npm test`
Expected: PASS with zero failures.

Current status: the focused affected suites pass, but the full command still has an unrelated macOS failure in the pre-existing Windows-path `resolveUploadsChildPath` assertion.

- [x] **Step 2: Run browser tests**

Run: `npm run test:browser`
Expected: PASS with zero failed scenarios.

- [x] **Step 3: Run the production build**

Run: `npm run build`
Expected: exit code 0.

- [x] **Step 4: Inspect the final diff**

Run: `git diff --check && git status --short`
Expected: no whitespace errors and only intended files changed.
