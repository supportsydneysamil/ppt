# Custom Title Subtitle Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the low-impact inline Custom title subtitle with the approved lower signature panel across all four designs.

**Architecture:** Keep the existing `customTitleSubtitle` data flow unchanged. Move subtitle sizing into the shared Custom title text module, render theme-specific PPTX panel decorations at fixed lower-third geometry, and mirror those values in the browser preview.

**Tech Stack:** Node.js test runner, vanilla JavaScript, PptxGenJS, Vite

## Global Constraints

- Default subtitle size is 28pt; 17–24 non-space characters use 24pt; 25 or more use 22pt.
- The panel is 0.85 inches high and 0.55 inches above the slide bottom.
- When a subtitle exists, the Korean/English title stack moves up 0.45 inches.
- When no subtitle exists, the current Custom title layout and output remain unchanged.
- Every panel has a fully transparent outline.
- Aurora uses only its translucent fill; Monolith adds one short accent line; Ivory adds two small gold dots; Marquee keeps two small gold diamonds.

---

### Task 1: Share the subtitle font-size rule

**Files:**
- Modify: `test/custom-title-slide.test.js`
- Modify: `lib/custom-title-text.js`

**Interfaces:**
- Produces: `subtitleFontSize(text: string): 28 | 24 | 22`
- Consumed by: `lib/custom-title-slide.js` and `public/app.js` through `window.CustomTitleText`

- [ ] **Step 1: Write failing boundary tests**

```javascript
assert.equal(subtitleFontSize("1234567890123456"), 28);
assert.equal(subtitleFontSize("12345678901234567"), 24);
assert.equal(subtitleFontSize("123456789012345678901234"), 24);
assert.equal(subtitleFontSize("1234567890123456789012345"), 22);
assert.equal(subtitleFontSize("1234 5678 9012 3456"), 28);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/custom-title-slide.test.js`

Expected: FAIL because `subtitleFontSize` is not exported.

- [ ] **Step 3: Implement the exact thresholds**

```javascript
export function subtitleFontSize(text) {
  const length = [...(text || "").replace(/\s/g, "")].length;
  if (length <= 16) return 28;
  if (length <= 24) return 24;
  return 22;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/custom-title-slide.test.js`

Expected: all tests PASS.

### Task 2: Render the PPTX signature panels

**Files:**
- Modify: `test/custom-title-slide.test.js`
- Modify: `lib/custom-title-slide.js`

**Interfaces:**
- Consumes: `subtitleFontSize()` and the existing normalized subtitle
- Produces: a panel at `{ x: 1.07, y: 6.10, w: 11.19, h: 0.85 }`

- [ ] **Step 1: Replace the old renderer assertions with failing geometry tests**

Parse each generated slide XML and assert:

```javascript
assert.equal(subtitleText.y, 6.1);
assert.equal(subtitleText.h, 0.85);
assert.equal(subtitleText.fontSize, 28);
assert.equal(
  Number((subtitleKo.y - baselineKo.y).toFixed(2)),
  -0.45
);
```

Assert each design’s panel fill color and transparent outline: Aurora `170E33`, Monolith `111216`, Ivory `F2EADC`, Marquee `34131C`. Assert the minimal accent object names for Monolith, Ivory, and Marquee.

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `node --test test/custom-title-slide.test.js`

Expected: FAIL because the subtitle remains in the centered title stack at 18pt.

- [ ] **Step 3: Move the title stack and draw a separate panel**

Remove the subtitle block from `stackTitleBlocks()`. Apply `-0.45` to every title-stack draw coordinate only when the normalized subtitle is non-empty. Add per-design `drawSubtitlePanel()` callbacks using the fixed geometry, `subtitleFontSize()`, bold Malgun Gothic text, a transparent outline, and the approved minimal accents.

- [ ] **Step 4: Preserve the no-subtitle layout**

Render each design with and without `customTitleSubtitle: ""` and assert the Korean title transform is identical.

- [ ] **Step 5: Run renderer tests and verify GREEN**

Run: `node --test test/custom-title-slide.test.js`

Expected: all tests PASS.

### Task 3: Mirror the signature panel in browser preview

**Files:**
- Modify: `test/custom-title-subtitle-ui.test.js`
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `customTitleSubtitleSize(text)` backed by `window.CustomTitleText.subtitleFontSize`
- Produces: an absolute-positioned lower panel and an upward-shifted title stack

- [ ] **Step 1: Write failing preview contract tests**

Assert the app source includes the shared size API, an absolute subtitle panel helper, the 0.45-inch title transform, and calls the panel helper outside the title stack:

```javascript
assert.match(app, /api\.subtitleFontSize\(text\)/);
assert.match(app, /transform:translateY\(\$\{inch\(-0\.45\)\}px\)/);
assert.match(app, /function addCustomTitleSubtitlePanel\(/);
assert.match(app, /font-size:\$\{pt\(customTitleSubtitleSize\(subtitle\)\)\}px/);
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --test test/custom-title-subtitle-ui.test.js`

Expected: FAIL because the preview still appends a small inline subtitle.

- [ ] **Step 3: Add theme panel tokens**

Extend each `CUSTOM_TITLE_THEMES` entry with `subtitlePanelFill` and `subtitlePanelText`. Add an accent type and color for Monolith’s short line, Ivory’s dots, and Marquee’s diamonds.

- [ ] **Step 4: Build the fixed preview panel**

Implement `addCustomTitleSubtitlePanel(container, subtitle, theme, unit)` with left/right 8%, bottom `inch(0.55)`, height `inch(0.85)`, no border, shared size helper, bold text, and minimal theme accents. Remove the old inline subtitle node.

- [ ] **Step 5: Shift only non-empty subtitle title stacks**

Add `transform:translateY(${inch(-0.45)}px)` to the title stack only when `subtitle` is non-empty.

- [ ] **Step 6: Run focused tests and build**

Run: `node --test test/custom-title-slide.test.js test/custom-title-subtitle-ui.test.js && npm run build`

Expected: focused tests PASS and Vite exits with code 0.

### Task 4: Verify and commit

**Files:**
- Verify: `lib/custom-title-text.js`
- Verify: `lib/custom-title-slide.js`
- Verify: `public/app.js`
- Verify: updated tests

- [ ] **Step 1: Run the full suite**

Run: `npm test`

Expected: no new failures beyond the two pre-existing macOS failures in `resolveUploadsChildPath`.

- [ ] **Step 2: Check diagnostics and diff**

Run edited-file diagnostics and `git diff --check`.

Expected: no newly introduced diagnostics or whitespace errors.

- [ ] **Step 3: Commit the redesign**

```bash
git add lib/custom-title-text.js lib/custom-title-slide.js public/app.js test/custom-title-slide.test.js test/custom-title-subtitle-ui.test.js
git commit -m "feat: emphasize custom title subtitle"
```
