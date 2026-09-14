# Custom Title Subtitle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional subtitle field to `타이틀 (Custom)` slides and render it below the English title in previews and generated PPTX files.

**Architecture:** Extend the canonical slide record with `customTitleSubtitle`, then carry that field through the existing Custom title form, draft, preview, save, download, and combined-deck paths. The PPTX renderer keeps using its shared centered stack and adds the subtitle as its final optional block, preserving the old layout when the field is empty.

**Tech Stack:** Node.js test runner, vanilla JavaScript/HTML, PptxGenJS, Vite

## Global Constraints

- The field name is `customTitleSubtitle` and its default is an empty string.
- The subtitle is optional and appears below the English title.
- If the English title is empty, the subtitle follows the Korean title without an English divider.
- An empty subtitle must preserve the existing Custom title output and layout.
- The browser preview and PPTX renderer use the same ordering, spacing ratio, small sans-serif treatment, and theme auxiliary color.

---

### Task 1: Persist the subtitle in the canonical slide record

**Files:**
- Modify: `test/slide-record.test.js`
- Modify: `lib/slide-record.js`

**Interfaces:**
- Consumes: browser slide objects containing `customTitleSubtitle?: string`
- Produces: `sanitizeSlideForTemplate(slide).customTitleSubtitle: string`

- [ ] **Step 1: Write the failing persistence tests**

Add `customTitleSubtitle: "예배와 성찬"` to `uploadedSlide()` and assert the default:

```javascript
assert.equal(sanitized.customTitleSubtitle, "");
```

The existing “preserves every field” subtest will verify that a non-empty value survives sanitization.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/slide-record.test.js`

Expected: FAIL because `sanitizeSlideForTemplate()` drops `customTitleSubtitle`.

- [ ] **Step 3: Add the canonical field**

Add this next to the other Custom title fields:

```javascript
customTitleSubtitle: slide.customTitleSubtitle || "",
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/slide-record.test.js`

Expected: all subtests PASS.

- [ ] **Step 5: Commit the persistence change**

```bash
git add test/slide-record.test.js lib/slide-record.js
git commit -m "feat: persist custom title subtitle"
```

### Task 2: Render the subtitle in generated PPTX files

**Files:**
- Create: `test/custom-title-slide.test.js`
- Modify: `lib/custom-title-slide.js`

**Interfaces:**
- Consumes: `{ customTitleDesign, customTitleKo, customTitleEn, customTitleSubtitle }`
- Produces: one PptxGenJS slide whose final optional title-stack text is the subtitle

- [ ] **Step 1: Write a failing renderer test**

Render each Custom title design, unzip the PPTX, and inspect `ppt/slides/slide1.xml`:

```javascript
for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
  const slideXml = await render({
    customTitleDesign,
    customTitleKo: "성찬 예배",
    customTitleEn: "Holy Communion",
    customTitleSubtitle: "한 몸을 이루는 교회",
  });
  assert.match(slideXml, /<a:t>한 몸을 이루는 교회<\/a:t>/);
  assert.ok(
    slideXml.indexOf("HOLY COMMUNION") <
      slideXml.indexOf("한 몸을 이루는 교회")
  );
}
```

Add a second case with an empty English title and a non-empty subtitle. Render the same design once without a subtitle, count `p:cxnSp` divider shapes in both XML documents, and assert the counts are equal while only the subtitle render contains its text.

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `node --test test/custom-title-slide.test.js`

Expected: FAIL because the subtitle text is absent from slide XML.

- [ ] **Step 3: Extend the shared content and stack**

Normalize the field in `buildContent()`:

```javascript
subtitle: (slide?.customTitleSubtitle || "").trim(),
```

Add an optional final stack block after the English block:

```javascript
content.subtitle && {
  h: 0.36,
  draw: (y) =>
    centeredText(slide, content.subtitle, {
      y,
      h: 0.36,
      fontFace: SANS,
      fontSize: 18,
      bold: true,
      color: design.subtitleColor,
    }),
},
```

Give the English block `gap: content.subtitle ? 0.2 : 0`, give the subtitle block `gap: 0`, and supply `subtitleColor` from each theme’s existing auxiliary color.

- [ ] **Step 4: Run renderer and persistence tests and verify GREEN**

Run: `node --test test/custom-title-slide.test.js test/slide-record.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the renderer change**

```bash
git add test/custom-title-slide.test.js lib/custom-title-slide.js
git commit -m "feat: render custom title subtitle"
```

### Task 3: Wire the subtitle through the browser editor

**Files:**
- Create: `test/custom-title-subtitle-ui.test.js`
- Modify: `public/index.html`
- Modify: `public/app.js`

**Interfaces:**
- Consumes: optional text from `#customTitleSubtitle`
- Produces: `customTitleSubtitle` in live drafts, saved slides, serialized slides, preview data, and the individual download request

- [ ] **Step 1: Write a failing browser-wiring test**

Read the static HTML and app source, then assert the required contract:

```javascript
assert.match(html, /id="customTitleSubtitle"/);
assert.match(app, /customTitleSubtitle:\s*customTitleSubtitleInput\.value\.trim\(\)/);
assert.match(app, /customTitleSubtitleInput\.value\s*=\s*slide\.customTitleSubtitle\s*\|\|\s*['"]{2}/);
assert.match(app, /customTitleSubtitle:\s*slide\.customTitleSubtitle/);
assert.match(app, /customTitleSubtitleInput\.addEventListener\(['"]input['"]/);
```

- [ ] **Step 2: Run the browser-wiring test and verify RED**

Run: `node --test test/custom-title-subtitle-ui.test.js`

Expected: FAIL because the input and application wiring do not exist.

- [ ] **Step 3: Add the optional form field**

Add this row after the English title input:

```html
<div class="rte-panel-row">
  <span class="rte-row-label">부제 <span class="rte-panel-hint">선택</span></span>
  <input id="customTitleSubtitle" type="text" class="rte-url-input" placeholder="예: 한 몸을 이루는 교회" />
</div>
```

- [ ] **Step 4: Add editor data flow**

Create `customTitleSubtitleInput`, include its trimmed value in `collectCustomTitleSlideData()`, initialize new slides with `customTitleSubtitle: ""`, restore it in `populateEditor()`, include it in `buildSerializableSlide()`, and send it in the individual Custom title download body.

- [ ] **Step 5: Add the preview block and input listener**

Read `customTitleSubtitle` in `buildCustomTitleSlidePreview()` and append a small sans-serif block after the optional English title:

```javascript
if (subtitle) {
  stack.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_SANS};font-weight:600;font-size:${pt(18)}px;` +
        `line-height:1.35;color:${theme.enColor};white-space:nowrap;` +
        `margin-top:${inch(en ? 0.2 : 0.28)}px;`,
      subtitle
    )
  );
}
```

Register an `input` listener that calls `renderPreview()` and `refreshSaveState()`.

- [ ] **Step 6: Run the focused UI test and verify GREEN**

Run: `node --test test/custom-title-subtitle-ui.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the browser integration**

```bash
git add test/custom-title-subtitle-ui.test.js public/index.html public/app.js
git commit -m "feat: add custom title subtitle field"
```

### Task 4: Verify the complete change

**Files:**
- Verify: all files changed in Tasks 1–3

**Interfaces:**
- Consumes: the completed feature
- Produces: test and production-build evidence

- [ ] **Step 1: Run all automated tests**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Build the frontend**

Run: `npm run build`

Expected: Vite exits with code 0.

- [ ] **Step 3: Check edited-file diagnostics**

Check diagnostics for `lib/custom-title-slide.js`, `lib/slide-record.js`, `public/app.js`, and the new tests.

Expected: no newly introduced errors.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check HEAD~3..HEAD && git status --short`

Expected: no whitespace errors; only the pre-existing `.omo/` files remain untracked.
