# Custom Editor Ribbon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom editor's separate second and third control bands with the approved compact, responsive two-row ribbon while leaving the first-band editor header unchanged.

**Architecture:** `CustomEditorChrome` owns one `.custom-editor-ribbon` containing a design row and an object-tools row. Existing controls and `data-editor-action` values remain the controller interface; responsive overflow menus duplicate only action buttons, whose disabled states are already synchronized by `refreshActionStates()`, while value controls remain single stable DOM elements.

**Tech Stack:** React 19, Lucide React, CSS Grid/Flexbox, CSS container queries, delegated DOM events, Node test runner, Playwright

## Global Constraints

- Do not change the first-band editor header or its buttons.
- Preserve every existing command and its behavior.
- Preserve existing `data-editor-action`, `data-custom-editor`, and accessibility hooks.
- Keep the ribbon at no more than two rows at supported desktop widths.
- Do not change the canvas, inspector, slide data, save flow, or export logic.
- Preserve the static HTML controls as a functional fallback when React chrome does not mount.
- Do not stage or modify the user's unrelated `data/templates.json`, `public/styles.css` scrollbar work, `test/ppt-workspace-ui.test.js` scrollbar test, or temporary scripts except where this plan intentionally adds adjacent ribbon code to the two shared files.

---

### Task 1: Establish the two-row ribbon structure

**Files:**
- Modify: `test/ppt-workspace-ui.test.js:567-579`
- Modify: `public/custom-editor-chrome.jsx:45-449`
- Modify: `public/index.html:1115-1190`
- Modify: `public/styles.css:3396-3473, 3864-3900, 4180-4215`

**Interfaces:**
- Consumes: existing `ToolButton`, `ColorPicker`, `CUSTOM_SLIDE_TEMPLATES`, `CUSTOM_SLIDE_THEMES`, and controller selectors.
- Produces: `.custom-editor-ribbon`, `.custom-editor-design-row`, `.custom-editor-tools-row`, `.custom-editor-tool-cluster`, and `.custom-editor-group-label`.

- [ ] **Step 1: Add the failing ribbon structure contract**

Append these assertions to the existing `"builds the custom toolbar out of one uniform icon set"` test:

```js
assert.match(
  chromeSource,
  /className="custom-editor-ribbon"[\s\S]*className="custom-editor-bar custom-editor-design-row"[\s\S]*className="custom-editor-toolbar custom-editor-tools-row"/
);
assert.match(chromeSource, /<span className="custom-editor-group-label">추가<\/span>/);
assert.match(chromeSource, /<span className="custom-editor-group-label">기록<\/span>/);
assert.match(chromeSource, /<span className="custom-editor-group-label">정렬<\/span>/);
assert.match(chromeSource, /<span className="custom-editor-group-label">배치<\/span>/);
assert.match(
  css,
  /\.custom-editor-ribbon\s*\{[^}]*?display:\s*grid[^}]*?grid-template-rows:\s*auto auto/
);
assert.doesNotMatch(
  css,
  /\.custom-editor-tool-group\s*\{[^}]*?border-right:/
);
```

Add a separate test proving the first band remains untouched:

```js
it("leaves the first-band editor header outside the custom ribbon", () => {
  assert.match(
    html,
    /<div class="editor-header">[\s\S]*?<h3>슬라이드 편집<\/h3>[\s\S]*?id="editorSaveBtn"[\s\S]*?<\/div>\s*<\/div>\s*<form id="slideForm"/
  );
  assert.doesNotMatch(
    html,
    /<div class="editor-header">[\s\S]*?custom-editor-ribbon[\s\S]*?<\/div>\s*<form id="slideForm"/
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="custom toolbar|first-band editor header" test/ppt-workspace-ui.test.js
```

Expected: FAIL because `.custom-editor-ribbon`, row modifiers, and visible group labels do not exist.

- [ ] **Step 3: Add the React ribbon wrapper and visible group labels**

In `CustomEditorChrome`, wrap only the existing bar and toolbar:

```jsx
<div className="custom-editor-ribbon">
  <div className="custom-editor-bar custom-editor-design-row">
    {/* Existing template, apply, theme, background, and zoom controls. */}
  </div>

  <div
    className="custom-editor-toolbar custom-editor-tools-row"
    role="toolbar"
    aria-label="커스텀 슬라이드 도구"
  >
    <div className="custom-editor-tool-group custom-editor-tool-cluster" role="group" aria-label="개체 추가">
      <span className="custom-editor-group-label">추가</span>
      {/* Existing six add ToolButtons. */}
    </div>
    <div className="custom-editor-tool-group custom-editor-tool-cluster" role="group" aria-label="편집 이력">
      <span className="custom-editor-group-label">기록</span>
      {/* Existing undo and redo ToolButtons. */}
    </div>
    <div
      className="custom-editor-tool-group custom-editor-tool-cluster custom-editor-layout-tools"
      role="group"
      aria-label="슬라이드 기준 정렬"
    >
      <span className="custom-editor-group-label">정렬</span>
      {/* Existing six slide-alignment ToolButtons. */}
    </div>
    <div
      className="custom-editor-tool-group custom-editor-tool-cluster custom-editor-layout-tools"
      role="group"
      aria-label="개체 간 정렬"
    >
      <span className="visually-hidden">개체 간 정렬</span>
      {/* Existing three selection-alignment/distribution ToolButtons. */}
    </div>
    <div
      className="custom-editor-tool-group custom-editor-tool-cluster custom-editor-layout-tools"
      role="group"
      aria-label="쌓는 순서"
    >
      <span className="custom-editor-group-label">배치</span>
      {/* Existing four layer-order ToolButtons. */}
    </div>
    <div
      className="custom-editor-tool-group custom-editor-tool-cluster custom-editor-object-tools"
      role="group"
      aria-label="개체 관리"
    >
      {/* Existing duplicate and delete ToolButtons. */}
    </div>
  </div>
</div>
```

Move neither the context toolbar nor context menu into the ribbon.

- [ ] **Step 4: Give the static fallback the same two-row semantics**

Wrap `index.html`'s existing `.custom-editor-bar` and `.custom-editor-toolbar` in:

```html
<div class="custom-editor-ribbon custom-editor-ribbon--fallback">
  <!-- existing .custom-editor-bar -->
  <!-- existing .custom-editor-toolbar -->
</div>
```

Add the row modifier classes and the same short visible labels to each fallback group. Preserve every existing ID, `data-editor-action`, `data-custom-editor`, title, and `aria-label`.

- [ ] **Step 5: Replace separate-band CSS with one ribbon surface**

Use this base structure in `public/styles.css`:

```css
.custom-editor-ribbon {
  grid-area: ribbon;
  container-type: inline-size;
  display: grid;
  grid-template-rows: auto auto;
  min-width: 0;
  overflow: visible;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-soft);
}

.custom-editor-design-row,
.custom-editor-tools-row {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: var(--sp-2);
}

.custom-editor-design-row {
  gap: var(--sp-2);
  border-bottom: 1px solid var(--border);
}

.custom-editor-tools-row {
  gap: var(--sp-2);
  border: 0;
  border-radius: 0;
  background: transparent;
}

.custom-editor-field {
  display: flex;
  align-items: center;
  min-width: 0;
}

.custom-editor-design-row .custom-editor-field > .field-label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.custom-editor-field select {
  min-width: 0;
  height: var(--ctrl-h-sm);
}

.custom-editor-tool-group,
.custom-editor-tool-cluster {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel) 58%, transparent);
}

.custom-editor-group-label {
  margin: 0 4px 0 3px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.custom-editor-object-tools {
  margin-left: auto;
}
```

Remove `.custom-editor-tool-group`'s `padding-right`, `border-right`, and `:last-child` cleanup rule.

- [ ] **Step 6: Make the ribbon one grid row in both inline and pop-out editors**

Replace the React chrome grid areas with:

```css
.custom-editor[data-react-chrome="true"]:not([hidden]) {
  grid-template-areas:
    "ribbon"
    "stage"
    "side";
}

.custom-editor[data-react-chrome="true"] .custom-editor-ribbon {
  grid-area: ribbon;
}
```

For the main workspace custom slide:

```css
.slide-editor-panel[data-slide-type="custom"] .custom-editor[data-react-chrome="true"]:not([hidden]) {
  grid-template-areas:
    "ribbon"
    "stage"
    "status";
  grid-template-rows: auto minmax(0, 1fr) auto;
}
```

Replace the old direct fallback-hiding selectors with:

```css
.custom-editor[data-react-chrome="true"] > .custom-editor-ribbon--fallback,
.custom-editor[data-react-chrome="true"] > .custom-editor-body > .custom-editor-props {
  display: none;
}
```

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
node --test test/ppt-workspace-ui.test.js test/custom-slide-editor.test.js
```

Expected: PASS.

Commit only intentional Task 1 hunks; preserve pre-existing scrollbar hunks in the shared CSS/test files:

```bash
git add -p public/styles.css test/ppt-workspace-ui.test.js
git add public/custom-editor-chrome.jsx public/index.html
git commit -m "feat: unify custom editor controls into ribbon"
```

---

### Task 2: Add responsive action overflow menus

**Files:**
- Modify: `test/ppt-workspace-ui.test.js`
- Modify: `public/custom-editor-chrome.jsx`
- Modify: `public/styles.css`
- Modify: `test/browser/save-flow.playwright.mjs:1056`

**Interfaces:**
- Consumes: existing delegated `[data-editor-action]` click handling and `refreshActionStates()`.
- Produces: `RibbonOverflowMenu({ label, menuLabel, className, children })` and responsive `정렬·배치` / `보기` menus.

- [ ] **Step 1: Add failing source contracts for overflow behavior**

Add this test under the custom editor toolbar test:

```js
it("moves lower-priority ribbon actions into accessible overflow menus", () => {
  assert.match(chromeSource, /function RibbonOverflowMenu\(/);
  assert.match(chromeSource, /label="정렬·배치"/);
  assert.match(chromeSource, /label="보기"/);
  assert.match(chromeSource, /aria-haspopup="menu"/);
  assert.match(chromeSource, /aria-expanded=\{open\}/);
  assert.match(chromeSource, /event\.key === "Escape"/);
  assert.match(chromeSource, /requestAnimationFrame\(\(\) => setOpen\(false\)\)/);
  assert.match(css, /@container\s*\(max-width:\s*1080px\)/);
  assert.match(css, /@container\s*\(max-width:\s*560px\)/);
});
```

Also verify value controls are not duplicated:

```js
assert.equal(
  (chromeSource.match(/<ColorPicker[\s\S]*?background/g) ?? []).length,
  1
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="lower-priority ribbon actions" test/ppt-workspace-ui.test.js
```

Expected: FAIL because no overflow component or container queries exist.

- [ ] **Step 3: Implement the reusable overflow component**

Add React hooks and `MoreHorizontal`:

```jsx
import { useEffect, useId, useRef, useState } from "react";
import {
  // existing icons
  MoreHorizontal,
} from "lucide-react";
```

Add:

```jsx
function RibbonOverflowMenu({ label, menuLabel, className = "", children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      rootRef.current?.querySelector('[aria-haspopup="menu"]')?.focus();
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`custom-editor-overflow ${className}`.trim()}>
      <button
        type="button"
        className="custom-editor-overflow-trigger"
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <MoreHorizontal size={14} aria-hidden="true" />
      </button>
      <div
        id={menuId}
        className="custom-editor-overflow-menu"
        role="menu"
        aria-label={menuLabel}
        hidden={!open}
        onClick={(event) => {
          if (!event.target.closest("[data-editor-action]")) return;
          requestAnimationFrame(() => setOpen(false));
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

The delayed close is required so the existing native delegated click listener
can resolve the clicked button before React unmounts the menu.

- [ ] **Step 4: Add the two menus using existing action identifiers**

After the direct layout groups, add a hidden-by-default menu:

```jsx
<RibbonOverflowMenu
  label="정렬·배치"
  menuLabel="정렬 및 배치 도구"
  className="custom-editor-layout-overflow"
>
  <div className="custom-editor-overflow-section" role="group" aria-label="슬라이드 기준 정렬">
    {/* ToolButtons: align-left, align-center, align-right,
        align-top, align-middle, align-bottom */}
  </div>
  <div className="custom-editor-overflow-section" role="group" aria-label="개체 간 정렬">
    {/* ToolButtons: align-selection-left, distribute-x, distribute-y */}
  </div>
  <div className="custom-editor-overflow-section" role="group" aria-label="쌓는 순서">
    {/* ToolButtons: to-front, forward, backward, to-back */}
  </div>
</RibbonOverflowMenu>
```

Beside the direct zoom group add:

```jsx
<RibbonOverflowMenu
  label="보기"
  menuLabel="확대 및 축소 도구"
  className="custom-editor-view-overflow"
>
  <div className="custom-editor-overflow-section" role="group" aria-label="확대 및 축소">
    <ToolButton action="zoom-out" label="축소"><ZoomOut size={16} /></ToolButton>
    <ToolButton action="zoom-in" label="확대"><ZoomIn size={16} /></ToolButton>
  </div>
</RibbonOverflowMenu>
```

Do not duplicate template, theme, background, or fit controls. Existing
`queryAllHosts("[data-editor-action]")` automatically mirrors disabled state
to direct and overflow action buttons.

- [ ] **Step 5: Add menu presentation and container-query switching**

Add:

```css
.custom-editor-overflow {
  position: relative;
  display: none;
  flex: none;
}

.custom-editor-overflow-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: var(--ctrl-h-sm);
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
}

.custom-editor-overflow-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  gap: var(--sp-2);
  min-width: max-content;
  padding: var(--sp-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.custom-editor-overflow-menu[hidden] {
  display: none;
}

.custom-editor-overflow-section {
  display: flex;
  align-items: center;
  gap: 2px;
}

@container (max-width: 1080px) {
  .custom-editor-layout-tools {
    display: none;
  }

  .custom-editor-layout-overflow {
    display: block;
  }
}

@container (max-width: 560px) {
  .custom-editor-design-row {
    gap: var(--sp-1);
  }

  .custom-editor-design-row select {
    max-width: 96px;
  }

  .custom-editor-zoom [data-editor-action="zoom-out"],
  .custom-editor-zoom [data-editor-action="zoom-in"] {
    display: none;
  }

  .custom-editor-view-overflow {
    display: block;
  }
}
```

Add `@supports not (container-type: inline-size)` media-query fallbacks using
`max-width: 1480px` for layout overflow and `max-width: 899px` for compact view
overflow.

- [ ] **Step 6: Add a browser regression for layout stability and menu actions**

Insert a scenario after the wide workspace scenario:

```js
await runScenario(
  "custom editor ribbon stays two rows and overflow actions remain wired",
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setup(page, { slides: customCanvasSlides });
    await selectMainSlide(page, 0);
    await page
      .locator("#customSlideEditor [data-custom-editor='status']")
      .first()
      .filter({ hasText: "슬라이드를 불러왔습니다" })
      .waitFor();

    const ribbon = page.locator("#customSlideEditor .custom-editor-ribbon").first();
    const header = page.locator(".editor-header");
    const headerHtml = await header.evaluate((node) => node.outerHTML);
    const ribbonRows = await ribbon.locator(":scope > .custom-editor-design-row, :scope > .custom-editor-tools-row").count();
    assert.equal(ribbonRows, 2);

    const beforeHeight = await ribbon.evaluate((node) => Math.round(node.getBoundingClientRect().height));
    await page.locator(".custom-editor-layout-overflow:visible [aria-haspopup='menu']").click();
    const menu = page.locator(".custom-editor-layout-overflow:visible [role='menu']");
    await menu.waitFor();
    const afterHeight = await ribbon.evaluate((node) => Math.round(node.getBoundingClientRect().height));
    assert.equal(afterHeight, beforeHeight);

    await page.locator("[data-editor-action='add-rect']:visible").click();
    await menu.locator("[data-editor-action='align-left']").click();
    await menu.waitFor({ state: "hidden" });
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), false);
    assert.equal(await header.evaluate((node) => node.outerHTML), headerHtml);

    await page.locator(".custom-editor-layout-overflow:visible [aria-haspopup='menu']").click();
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
  }
);
```

- [ ] **Step 7: Run focused checks and commit**

Run:

```bash
node --test test/ppt-workspace-ui.test.js test/custom-slide-editor.test.js
npm run test:browser
```

Expected: PASS.

Commit only Task 2 hunks:

```bash
git add public/custom-editor-chrome.jsx test/browser/save-flow.playwright.mjs
git add -p public/styles.css test/ppt-workspace-ui.test.js
git commit -m "feat: adapt custom editor ribbon to narrow stages"
```

---

### Task 3: Production verification

**Files:**
- No production changes expected.
- Fix any discovered regression in the narrowest relevant file with a failing
  test before changing implementation.

**Interfaces:**
- Consumes: completed two-row ribbon.
- Produces: evidence that the ribbon ships without changing editor behavior or unrelated work.

- [ ] **Step 1: Run all Node tests**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 2: Build the production client**

```bash
npm run build
```

Expected: Vite completes with no JSX, CSS, or unresolved-import errors.

- [ ] **Step 3: Run browser regression tests**

```bash
npm run test:browser
```

Expected: all scenarios pass, including the new ribbon scenario.

- [ ] **Step 4: Verify the approved viewport matrix**

At 1440px, 1024px, 800px, 560px, and 390px viewport widths verify:

- exactly two ribbon rows;
- no document-level horizontal overflow;
- no stray vertical group separators;
- zoom remains at the design row's right side;
- layout tools use `정렬·배치` at container widths at or below 1080px;
- zoom out/in use `보기` at container widths at or below 560px;
- Template, Apply, Theme, Background, and Fit remain directly visible;
- menu opening does not change ribbon or canvas height;
- disabled states match between direct and overflow actions;
- the first-band editor header is visually and structurally unchanged.

- [ ] **Step 5: Review final diff without staging unrelated work**

```bash
git diff --check
git status --short
git log --oneline -5
```

Expected: only ribbon implementation/test commits were added. The existing
`data/templates.json`, scrollbar work, and temporary scripts remain untouched
unless their owner committed them independently.

## Self-Review

- Spec coverage: structure, command preservation, responsive thresholds,
  accessibility, stable value controls, static fallback, testing, and
  first-band exclusion each have an implementation step.
- Placeholder scan: every code-changing step names exact markup, selectors,
  behavior, commands, and expected results.
- Interface consistency: both menus use `RibbonOverflowMenu`; all duplicated
  controls are action buttons with existing `data-editor-action` identifiers;
  template, theme, and background controls remain unique.
