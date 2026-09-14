# Hymn and Scripture Cover Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the original plus four Custom-title-aligned selectable themes to hymn and scripture cover slides.

**Architecture:** Introduce a focused cover-title module that owns theme normalization and maps hymn/scripture content into the existing Custom title renderer. Keep all original renderers untouched and route only non-original themes through the shared renderer. Persist one `titleThemeId` field through drafts, templates, scripture signatures, APIs, previews, and bundled exports.

**Tech Stack:** Node.js ES modules, PptxGenJS, vanilla HTML/CSS/JavaScript, Node test runner, Vite.

## Global Constraints

- Allowed theme IDs are exactly `original`, `aurora`, `monolith`, `ivory`, and `marquee`.
- Missing or invalid values normalize to `original`.
- The original hymn, scripture, and scripture-reading PPTX output remains unchanged.
- `titleThemeId` is independent of scripture body `themeId`, `titleDesign`, and `customTitleDesign`.
- The standalone scripture extraction form and scripture web view remain out of scope.
- Implementation must occur in an isolated git worktree.

---

### Task 1: Cover Theme Domain and Shared Renderer

**Files:**
- Create: `lib/cover-title-slide.js`
- Modify: `lib/custom-title-slide.js`
- Test: `test/cover-title-slide.test.js`
- Test: `test/custom-title-slide.test.js`

**Interfaces:**
- Consumes: `appendCustomTitleSlide(pptx, slide)` from `lib/custom-title-slide.js`.
- Produces: `COVER_TITLE_THEMES`, `normalizeTitleThemeId(value)`, `buildCoverTitleContent(kind, data)`, and `appendThemedCoverTitleSlide(pptx, options)`.
- `kind` is one of `hymn`, `scripture`, `scripture-reading`.

- [ ] **Step 1: Write failing normalization and mapping tests**

Add tests asserting:

```js
assert.equal(normalizeTitleThemeId("aurora"), "aurora");
assert.equal(normalizeTitleThemeId("unknown"), "original");
assert.deepEqual(
  buildCoverTitleContent("hymn", {
    hymnNumber: 1,
    hymnKorTitle: "찬양하라",
    hymnEngTitle: "Praise Him",
  }),
  {
    ko: "찬송",
    en: "HYMN",
    subtitle: "1. 찬양하라\n(Praise Him)",
  }
);
assert.deepEqual(
  buildCoverTitleContent("scripture-reading", { referenceText: "창세기 1:1-3" }),
  {
    ko: "성경봉독",
    en: "SCRIPTURE READING",
    subtitle: "창세기 1:1-3",
  }
);
```

Also assert that `appendThemedCoverTitleSlide` adds one slide carrying the mapped headline and subtitle for `aurora`.

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test test/cover-title-slide.test.js`

Expected: FAIL because `lib/cover-title-slide.js` does not exist.

- [ ] **Step 3: Expose a content-oriented Custom renderer**

Refactor `lib/custom-title-slide.js` without changing output:

```js
export function appendCustomTitleContentSlide(pptx, design, content) {
  const normalized = normalizeCustomTitleDesign(design);
  // Dispatch the existing addAuroraSlide/addMonolithSlide/addIvorySlide/
  // addMarqueeSlide functions with { ko, en, subtitle }.
}

export function appendCustomTitleSlide(pptx, slide) {
  return appendCustomTitleContentSlide(
    pptx,
    slide?.customTitleDesign,
    buildContent(slide)
  );
}
```

This is the only sharing boundary: palettes, frames, typography, and subtitle halo remain implemented once in the Custom title module.

- [ ] **Step 4: Implement the cover theme module**

Implement exact constants and fallback:

```js
export const COVER_TITLE_THEMES = [
  "original",
  "aurora",
  "monolith",
  "ivory",
  "marquee",
];

export function normalizeTitleThemeId(value) {
  return COVER_TITLE_THEMES.includes(value) ? value : "original";
}
```

Map the three content kinds exactly as specified, omit empty hymn subtitle parts, and reject `original` in `appendThemedCoverTitleSlide` because original rendering remains at the server routing layer.

- [ ] **Step 5: Run renderer tests and verify GREEN**

Run: `node --test test/cover-title-slide.test.js test/custom-title-slide.test.js`

Expected: all tests PASS and existing Custom title XML assertions remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/cover-title-slide.js lib/custom-title-slide.js test/cover-title-slide.test.js test/custom-title-slide.test.js
git commit -m "feat: add shared cover title themes"
```

---

### Task 2: Persistence and Scripture Regeneration State

**Files:**
- Modify: `lib/slide-record.js`
- Modify: `public/app.js`
- Test: `test/slide-record.test.js`
- Create: `test/cover-title-state.test.js`

**Interfaces:**
- Consumes: `normalizeTitleThemeId(value)` from `lib/cover-title-slide.js` where server-side normalization is needed.
- Produces: canonical persisted field `titleThemeId`; scripture request field with the same name.

- [ ] **Step 1: Write failing persistence tests**

Extend `test/slide-record.test.js` to assert:

```js
assert.equal(saved.titleThemeId, "marquee");
```

and for an old record:

```js
assert.equal(saved.titleThemeId, "original");
```

Add source-level UI state tests asserting `titleThemeId` appears in hymn draft collection, scripture draft collection, editor population, the scripture signature, and `generateScriptureSlideFile` request body.

- [ ] **Step 2: Run state tests and verify RED**

Run: `node --test test/slide-record.test.js test/cover-title-state.test.js`

Expected: FAIL because the field is not persisted or included in scripture state.

- [ ] **Step 3: Persist and propagate `titleThemeId`**

In `sanitizeSlideForTemplate`, add:

```js
titleThemeId: slide.titleThemeId || "original",
```

In `public/app.js`, add the field to hymn and scripture drafts, slide-to-form population, saved slide assignment, exported slide payloads, and:

```js
titleThemeId: slide.titleThemeId || "original",
```

inside both `buildScriptureSignature` and `generateScriptureSlideFile`.

- [ ] **Step 4: Run state tests and verify GREEN**

Run: `node --test test/slide-record.test.js test/cover-title-state.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/slide-record.js public/app.js test/slide-record.test.js test/cover-title-state.test.js
git commit -m "feat: persist cover title theme selection"
```

---

### Task 3: Server Routing for Hymn and Scripture Covers

**Files:**
- Modify: `server.js`
- Modify: `test/export-media-integrity.test.js`
- Create: `test/cover-title-server.test.js`

**Interfaces:**
- Consumes: `normalizeTitleThemeId`, `appendThemedCoverTitleSlide`.
- Produces: original-or-themed routing for hymn bundled export and scripture generated PPTX.

- [ ] **Step 1: Write failing server routing tests**

Add tests covering:

1. hymn `original` still uses the existing image-based title slide;
2. hymn `aurora` uses `appendThemedCoverTitleSlide`;
3. scripture `original` still uses `addScriptureTitleSlide`;
4. scripture-reading `aurora` maps to `성경봉독` and `SCRIPTURE READING`;
5. invalid IDs route to original;
6. `includeTitle: false` adds no cover.

Use generated PPTX buffers/XML or exported pure routing helpers rather than mocks.

- [ ] **Step 2: Run server tests and verify RED**

Run: `node --test test/cover-title-server.test.js test/export-media-integrity.test.js`

Expected: FAIL because server routing ignores `titleThemeId`.

- [ ] **Step 3: Route hymn cover generation**

Normalize `slideData.titleThemeId`. For `original`, call the unchanged `addHymnTitleSlide`. Otherwise call:

```js
appendThemedCoverTitleSlide(pptx, {
  kind: "hymn",
  themeId,
  hymnNumber: slideData.hymnNumber,
  hymnKorTitle: slideData.hymnKorTitle,
  hymnEngTitle: slideData.hymnEngTitle,
});
```

- [ ] **Step 4: Route scripture cover generation**

Pass `titleThemeId` into `buildPptx` options. Keep its current original branches and route non-original themes through:

```js
appendThemedCoverTitleSlide(pptx, {
  kind: options.titleSlideType === "봉독"
    ? "scripture-reading"
    : "scripture",
  themeId,
  referenceText: options.referenceText,
});
```

Do not alter scripture body theme resolution or custom image handling.

- [ ] **Step 5: Run server tests and verify GREEN**

Run: `node --test test/cover-title-server.test.js test/export-media-integrity.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server.js test/cover-title-server.test.js test/export-media-integrity.test.js
git commit -m "feat: render selected hymn and scripture cover themes"
```

---

### Task 4: Theme Picker UI and Hymn Preview

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Create: `test/cover-title-theme-ui.test.js`

**Interfaces:**
- Consumes: persisted `titleThemeId`.
- Produces: two synchronized card pickers and a themed hymn cover preview.

- [ ] **Step 1: Write failing UI structure tests**

Assert the HTML contains hymn and scripture grids with five buttons each:

```html
data-title-theme="original"
data-title-theme="aurora"
data-title-theme="monolith"
data-title-theme="ivory"
data-title-theme="marquee"
```

Assert the app binds both grids, defaults missing values to `original`, hides each grid when its include-title checkbox is off, marks exactly one active card, and passes the selected value to hymn preview rendering.

- [ ] **Step 2: Run UI test and verify RED**

Run: `node --test test/cover-title-theme-ui.test.js`

Expected: FAIL because the grids and bindings do not exist.

- [ ] **Step 3: Add the two card grids**

Use the existing `theme-option-grid`, `theme-option-card`, and Custom title preview classes. Add an original preview class and accessible labels. Keep original first and active by default.

- [ ] **Step 4: Add picker state and checkbox behavior**

Create focused helpers:

```js
function setCoverThemePicker(grid, value) { /* normalize and active class */ }
function getCoverThemePicker(grid) { /* active data-title-theme or original */ }
function setCoverThemeGridHidden(grid, hidden) { /* hidden attribute */ }
```

Bind clicks to dirty-state updates and preview refresh. Apply saved values during editor population. Toggle visibility from the existing hymn/scripture include-title change handlers.

- [ ] **Step 5: Render non-original hymn previews**

Keep `buildHymnTitleSlidePreview` unchanged for `original`. Add a themed preview path that uses the same Custom-title preview background/frame classes and maps:

```js
{ ko: "찬송", en: "HYMN", subtitle: hymnTitleText }
```

Ensure preview selection reads `titleThemeId` and does not alter non-cover slide preview behavior.

- [ ] **Step 6: Run UI tests and build**

Run: `node --test test/cover-title-theme-ui.test.js test/custom-title-subtitle-ui.test.js && npm run build`

Expected: tests PASS and Vite exits 0.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/styles.css public/app.js test/cover-title-theme-ui.test.js
git commit -m "feat: add hymn and scripture cover theme pickers"
```

---

### Task 5: Full Regression Verification

**Files:**
- Verify only: all files changed above

**Interfaces:**
- Consumes: completed feature.
- Produces: fresh evidence that tests and production build pass.

- [ ] **Step 1: Run targeted cover tests**

Run:

```bash
node --test \
  test/cover-title-slide.test.js \
  test/cover-title-state.test.js \
  test/cover-title-server.test.js \
  test/cover-title-theme-ui.test.js \
  test/custom-title-slide.test.js \
  test/export-media-integrity.test.js \
  test/slide-record.test.js
```

Expected: all targeted tests PASS with zero failures.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: exit 0 with zero failed tests.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Vite exits 0.

- [ ] **Step 4: Inspect diagnostics and diff**

Check IDE diagnostics on all changed JavaScript, HTML, and CSS files. Then run:

```bash
git status --short
git diff --check
git log --oneline --decorate -5
```

Expected: no unexpected files, no whitespace errors, and only planned commits.
