# Professional Custom Slide Template Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fourteen designed custom-slide templates with the approved professional, purpose-specific compositions while retaining all fifteen IDs, saved-slide compatibility, and all twenty-one color themes.

**Architecture:** Keep the existing model and theme engine unchanged. Strengthen template contract tests first, then replace only the relevant objects in `TEMPLATE_DEFINITIONS` in three reviewable groups. Validate structural semantics in Node tests and validate the shipped Fabric rendering through the existing browser suite and manual native/light/dark contact-sheet review.

**Tech Stack:** JavaScript ES modules, Node test runner, Fabric 6, Playwright browser regression suite, existing semantic theme-role system.

## Global Constraints

- Preserve all 15 template IDs, Korean labels, and ordering.
- Preserve 1280×720 dimensions and current model/Fabric serialization.
- Use only existing model types: `text`, `rect`, `roundRect`, `ellipse`, and `line`.
- Use `Malgun Gothic` for template text.
- Use only semantic palette roles: `background`, `surface`, `accent`, `title`, `body`, `muted`, and `stroke`.
- Do not add external image, icon, or illustration assets.
- Do not change the 21-theme catalog, template picker behavior, slide persistence, or Sunday-title catalog.
- Keep `blank` element-free.
- Treat the user's existing unrelated PPTX/font working-tree changes as out of scope; do not stage or modify them.

---

### Task 1: Add shared template-contract helpers

**Files:**
- Modify: `test/custom-slide-editor.test.js:30-82`

**Interfaces:**
- Consumes: `CUSTOM_SLIDE_TEMPLATES` and normalized element descriptors.
- Produces: shared assertions used by the three template-group test cycles.

- [ ] **Step 1: Add test helpers**

Add these helpers after `CANVAS`:

```js
function templateModel(id) {
  return CUSTOM_SLIDE_TEMPLATES.find((template) => template.id === id)?.model;
}

function elementIds(id) {
  return new Set(templateModel(id)?.elements.map((element) => element.id) ?? []);
}

function assertElementIds(templateId, requiredIds) {
  const ids = elementIds(templateId);
  for (const id of requiredIds) {
    assert.ok(ids.has(id), `${templateId} is missing ${id}`);
  }
}

function assertElementInsideCanvas(templateId, element) {
  if (element.type === "line") {
    assert.ok(element.x >= 0 && element.x <= CANVAS.width, `${element.id} x`);
    assert.ok(element.y >= 0 && element.y <= CANVAS.height, `${element.id} y`);
    assert.ok(element.x2 >= 0 && element.x2 <= CANVAS.width, `${element.id} x2`);
    assert.ok(element.y2 >= 0 && element.y2 <= CANVAS.height, `${element.id} y2`);
    return;
  }
  assert.ok(element.x >= 0, `${templateId}/${element.id} x`);
  assert.ok(element.y >= 0, `${templateId}/${element.id} y`);
  assert.ok(element.x + element.width <= CANVAS.width, `${templateId}/${element.id} width`);
  assert.ok(element.y + element.height <= CANVAS.height, `${templateId}/${element.id} height`);
}
```

- [ ] **Step 2: Run the existing test and keep the baseline GREEN**

Run:

```bash
node --test test/custom-slide-editor.test.js
```

Expected: PASS. These helpers are test-only setup; no production behavior changes in this task.

---

### Task 2: Redesign the five core message templates

**Files:**
- Modify: `public/custom-slide-editor.js:29-410`
- Test: `test/custom-slide-editor.test.js`

**Interfaces:**
- Produces revised definitions for `title-hero`, `split-photo`, `quote-card`, `scripture`, and `sermon-title`.
- Preserves IDs at the template level and the existing `nativePaletteFromDefinition` flow.

- [ ] **Step 1: Write the failing core-template contract**

```js
test("core message templates use their approved professional structure", () => {
  assertElementIds("title-hero", ["hero-frame", "hero-kicker", "hero-title", "hero-meta"]);
  assertElementIds("split-photo", ["photo-panel", "photo-shape-back", "photo-title", "photo-body"]);
  assertElementIds("quote-card", ["quote-mark", "quote-body", "quote-source"]);
  assertElementIds("scripture", [
    "scripture-book", "scripture-chapter", "scripture-verse-number",
    "scripture-divider", "scripture-body",
  ]);
  assertElementIds("sermon-title", [
    "sermon-kicker", "sermon-heading", "sermon-index-frame", "sermon-index", "sermon-meta",
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test --test-name-pattern="core message templates" test/custom-slide-editor.test.js
```

Expected: FAIL because `hero-frame` and the other approved structure IDs do not exist.

- [ ] **Step 3: Replace the five template definitions**

Use the approved element structure:

```js
const CORE_TEMPLATE_ELEMENTS = {
  "title-hero": [
    ["hero-frame", "rect", "stroke"],
    ["hero-accent", "rect", "accent"],
    ["hero-kicker", "text", "muted"],
    ["hero-title", "text", "title"],
    ["hero-rule", "line", "stroke"],
    ["hero-meta", "text", "body"],
  ],
  "split-photo": [
    ["photo-panel", "rect", "surface"],
    ["photo-shape-back", "ellipse", "accent"],
    ["photo-shape-front", "roundRect", "surface"],
    ["photo-kicker", "text", "muted"],
    ["photo-title", "text", "title"],
    ["photo-body", "text", "body"],
    ["photo-accent", "rect", "accent"],
  ],
  "quote-card": [
    ["quote-mark", "text", "accent"],
    ["quote-body", "text", "body"],
    ["quote-rule", "line", "stroke"],
    ["quote-source", "text", "muted"],
  ],
  scripture: [
    ["scripture-book", "text", "muted"],
    ["scripture-chapter", "text", "title"],
    ["scripture-verse-number", "text", "accent"],
    ["scripture-divider", "line", "stroke"],
    ["scripture-body", "text", "body"],
    ["scripture-footer", "text", "muted"],
  ],
  "sermon-title": [
    ["sermon-kicker", "text", "muted"],
    ["sermon-heading", "text", "title"],
    ["sermon-index-frame", "rect", "surface"],
    ["sermon-index", "text", "accent"],
    ["sermon-meta", "text", "body"],
    ["sermon-rule", "line", "stroke"],
  ],
};
```

Implement those descriptors directly as normalized template elements, using the coordinates and copy from the approved spec:

- `title-hero`: inset frame `(88,56,1104,608)`, centered title box `(152,232,976,136)`, meta `(256,472,768,48)`.
- `split-photo`: visual region width `560`; content starts at `664`; title supports two lines; all decorative shapes stay within the left visual region.
- `quote-card`: quote mark occupies the upper-left visual field; body starts at `(160,208)` with width `896`; source is right-aligned below a horizontal rule.
- `scripture`: citation rail ends at x `304`; body starts at x `392` with width no greater than `760`.
- `sermon-title`: title occupies the left 57%; index panel begins at x `832`; body metadata remains separate from the series index.

Use the native palettes shown in the approved mockups:

- `title-hero` and `sermon-title`: navy/gold.
- `split-photo` and `scripture`: ivory/ink.
- `quote-card`: warm sand.

- [ ] **Step 4: Run the focused tests and make this group GREEN**

```bash
node --test test/custom-slide-editor.test.js test/custom-slide-themes.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the core redesign and shared helpers**

```bash
git add public/custom-slide-editor.js test/custom-slide-editor.test.js
git commit -m "feat: redesign core custom slide templates"
```

---

### Task 3: Redesign the five information and reading templates

**Files:**
- Modify: `public/custom-slide-editor.js:213-558`
- Test: `test/custom-slide-editor.test.js`

**Interfaces:**
- Produces revised definitions for `agenda-list`, `lyrics`, `sermon-points`, `announcements`, and `creed`.
- Produces the independent-content IDs asserted by this task's test.

- [ ] **Step 1: Write the failing independent-content contract**

```js
test("information templates expose independently editable content units", () => {
  assertElementIds("agenda-list", [
    "agenda-row-1-number", "agenda-row-1-title", "agenda-row-1-owner",
    "agenda-row-2-number", "agenda-row-2-title", "agenda-row-2-owner",
    "agenda-row-3-number", "agenda-row-3-title", "agenda-row-3-owner",
  ]);
  assertElementIds("sermon-points", [
    "sermon-point-1-number", "sermon-point-1-text",
    "sermon-point-2-number", "sermon-point-2-text",
    "sermon-point-3-number", "sermon-point-3-text",
  ]);
  assertElementIds("announcements", [
    "announcement-1-date", "announcement-1-title", "announcement-1-detail",
    "announcement-2-date", "announcement-2-title", "announcement-2-detail",
    "announcement-3-date", "announcement-3-title", "announcement-3-detail",
  ]);
});
```

- [ ] **Step 2: Run the contract and verify RED**

```bash
node --test --test-name-pattern="information templates expose" test/custom-slide-editor.test.js
```

Expected: FAIL because the current templates store each list as one text block.

- [ ] **Step 3: Implement the approved information structures**

Use these exact editing units:

```js
const INFORMATION_UNITS = {
  "agenda-list": [
    ["agenda-row-1-number", "01"], ["agenda-row-1-title", "예배의 부름"], ["agenda-row-1-owner", "인도자"],
    ["agenda-row-2-number", "02"], ["agenda-row-2-title", "찬양과 경배"], ["agenda-row-2-owner", "다함께"],
    ["agenda-row-3-number", "03"], ["agenda-row-3-title", "말씀 선포"], ["agenda-row-3-owner", "김목사"],
  ],
  "sermon-points": [
    ["sermon-point-1-number", "01"], ["sermon-point-1-text", "은혜를 기억하십시오"],
    ["sermon-point-2-number", "02"], ["sermon-point-2-text", "말씀에 응답하십시오"],
    ["sermon-point-3-number", "03"], ["sermon-point-3-text", "사랑으로 살아가십시오"],
  ],
  announcements: [
    ["announcement-1-date", "SEP 27 · SUN"], ["announcement-1-title", "새가족 환영회"], ["announcement-1-detail", "오후 1시 · 교육관"],
    ["announcement-2-date", "OCT 04 · SUN"], ["announcement-2-title", "정기 제직회"], ["announcement-2-detail", "예배 후 · 본당"],
    ["announcement-3-date", "EVERY WED"], ["announcement-3-title", "수요 기도회"], ["announcement-3-detail", "오후 7시 30분 · 본당"],
  ],
};
```

Layout constraints:

- `agenda-list`: three 104px-high rows from y `264`; one surface rectangle behind row 3; number/title/owner columns begin at x `96/208/1032`.
- `lyrics`: song/stanza at `(80,64)`, page number right-aligned at `(1080,56)`, centered lyric box `(128,208,1024,320)`, 56px title-role text, short accent below.
- `sermon-points`: three 104px rows; number starts at x `96`, point starts at x `232`; reference is right-aligned in the footer.
- `announcements`: three equal cards at x `80/448/816`, each 304px wide; every card has a surface, 4px accent top rule, date, title, and detail.
- `creed`: left-aligned reading column `(208,280,864,280)`; header, divider, page, and reader remain independent elements.

- [ ] **Step 4: Run the focused tests**

```bash
node --test test/custom-slide-editor.test.js test/custom-slide-model.test.js test/custom-slide-themes.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the information redesign**

```bash
git add public/custom-slide-editor.js test/custom-slide-editor.test.js
git commit -m "feat: redesign church information templates"
```

---

### Task 4: Redesign the four pastoral and action templates

**Files:**
- Modify: `public/custom-slide-editor.js:522-684`
- Test: `test/custom-slide-editor.test.js`

**Interfaces:**
- Produces revised definitions for `prayer`, `welcome`, `offering`, and `next-week`.
- Leaves `blank` unchanged.

- [ ] **Step 1: Write the failing pastoral-structure and bounds contracts**

```js
test("pastoral templates use approved editable units", () => {
  assertElementIds("prayer", [
    "prayer-1-number", "prayer-1-text",
    "prayer-2-number", "prayer-2-text",
    "prayer-3-number", "prayer-3-text",
    "prayer-orbit",
  ]);
  assertElementIds("welcome", ["welcome-orbit", "welcome-title", "welcome-newcomer-panel"]);
  assertElementIds("offering", ["offering-frame", "offering-title", "offering-scripture"]);
  assertElementIds("next-week", ["next-week-day", "next-week-month", "next-week-event", "next-week-cta"]);
});

test("professional templates keep non-bleed elements inside the slide", () => {
  const allowedBleed = new Set(["prayer-orbit", "welcome-orbit"]);
  for (const template of CUSTOM_SLIDE_TEMPLATES) {
    for (const element of template.model.elements) {
      if (!allowedBleed.has(element.id)) assertElementInsideCanvas(template.id, element);
    }
  }
});

test("professional templates retain geometry and copy across themes", () => {
  for (const template of CUSTOM_SLIDE_TEMPLATES.filter(({ id }) => id !== "blank")) {
    const plain = instantiateTemplate(template.id, undefined, "plain");
    const dark = instantiateTemplate(template.id, undefined, "deep-black");
    assert.deepEqual(
      plain.elements.map(({ x, y, width, height, text }) => ({ x, y, width, height, text })),
      dark.elements.map(({ x, y, width, height, text }) => ({ x, y, width, height, text }))
    );
  }
});
```

- [ ] **Step 2: Run the contracts and verify RED**

```bash
node --test --test-name-pattern="pastoral templates|non-bleed|retain geometry" test/custom-slide-editor.test.js
```

Expected: FAIL because the approved pastoral IDs and bleed decorations do not exist.

- [ ] **Step 3: Implement the final approved structures**

Use these required IDs and constraints:

```js
const PRAYER_UNITS = [
  ["prayer-1-number", "01"], ["prayer-1-text", "교회와 다음 세대를 위해"],
  ["prayer-2-number", "02"], ["prayer-2-text", "선교지와 이웃을 위해"],
  ["prayer-3-number", "03"], ["prayer-3-text", "아픈 성도들의 회복을 위해"],
];
```

- `prayer`: labels and three rows occupy the left 72%; `prayer-orbit` is a large right-edge ellipse and `prayer-orbit-label` is rotated 270° inside the slide.
- `welcome`: `welcome-orbit` may bleed at the upper-left; welcome copy occupies the left 52%; a surface panel on the right contains `NEW HERE?`, `예배 후 새가족 안내`, and `로비 안내 데스크`.
- `offering`: inset frame `(88,56,1104,608)`, centered title and scripture, short top accent, no iconography.
- `next-week`: large day, month/weekday, divider, event title, time/location, and CTA surface are independent elements; use actual example copy `27`, `SEP\nSUN`, `주일예배`, and `오전 11:00\n시드니새일교회 본당`.

- [ ] **Step 4: Run the complete custom-slide unit set**

```bash
node --test \
  test/custom-slide-editor.test.js \
  test/custom-slide-editor-controller.test.js \
  test/custom-slide-model.test.js \
  test/custom-slide-themes.test.js \
  test/custom-slide-pptx.test.js
```

Expected: PASS with no failures.

- [ ] **Step 5: Commit the final template group and green contract tests**

```bash
git add public/custom-slide-editor.js test/custom-slide-editor.test.js
git commit -m "feat: complete professional custom template redesign"
```

---

### Task 5: Verify production rendering and theme resilience

**Files:**
- No production-file changes expected.
- If verification exposes a regression, stop this task and begin a separate red-green fix cycle that reproduces it in the narrowest relevant test file.

**Interfaces:**
- Consumes: the shipped Vite bundle, Fabric editor, template picker, and theme picker.
- Produces: evidence that all templates render and recolor in the actual browser path.

- [ ] **Step 1: Run all automated tests**

```bash
npm test
```

Expected: all Node tests pass.

- [ ] **Step 2: Build the shipped client**

```bash
npm run build
```

Expected: Vite completes successfully with no unresolved imports.

- [ ] **Step 3: Run the existing browser regression suite**

```bash
npm run test:browser
```

Expected: all browser scenarios pass, including custom-slide load/reset/save behavior.

- [ ] **Step 4: Perform the visual matrix review**

Start the app with:

```bash
npm run dev
```

For each non-blank template, verify native rendering and then apply `plain` and `deep-black`. Check:

- no unintended overlaps or clipping;
- titles remain dominant;
- body copy is legible at full-slide fit;
- semantic surfaces, accents, and strokes recolor correctly;
- the photo placeholder looks intentional without an image;
- `agenda-list`, `sermon-points`, `announcements`, and `prayer` expose independent selectable text units;
- no template resembles an editor wireframe or UI card layout.

- [ ] **Step 5: Review the final diff without staging unrelated work**

```bash
git diff --check
git status --short
git log --oneline -5
```

Expected: template redesign commits are present; pre-existing PPTX/font probe files remain unstaged and untouched.

## Self-Review

- Spec coverage: all 15 IDs are accounted for; `blank` remains unchanged and 14 designs are revised.
- Theme coverage: native, representative light, and representative dark themes are explicitly verified.
- Compatibility coverage: no schema, picker, persistence, or editor-controller changes are required.
- Placeholder scan: the plan contains no deferred implementation placeholders.
- Interface consistency: required element IDs in Task 1 exactly match the IDs produced in Tasks 3 and 4.
