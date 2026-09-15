# Word-Style Custom Editor Ribbon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the adaptive ellipsis-based custom editor ribbon with four stable Word-style category tabs and grouped command panels.

**Architecture:** A small browser-independent module defines tab order and keyboard navigation. `CustomEditorChrome` keeps one active-tab UI state, renders every command exactly once in one tab panel, and keeps Undo/Redo in the tab strip; CSS supplies Word-style group labels and limits narrow-screen overflow to the active panel.

**Tech Stack:** JavaScript ES modules, React 19, Lucide React, CSS Grid/Flexbox, Node test runner, Playwright

## Global Constraints

- Do not change the first-band editor header.
- Keep one ribbon card.
- Preserve all existing editor action identifiers and behavior.
- Do not use generic ellipsis overflow triggers.
- Tab state is UI-only and must not affect dirty state or persistence.
- Use the same component in inline and pop-out editors.
- Preserve unrelated work in the main checkout by working only in `.worktrees/word-style-custom-ribbon`.

---

### Task 1: Tab model and keyboard navigation

**Files:**
- Create: `public/custom-editor-ribbon.js`
- Create: `test/custom-editor-ribbon.test.js`

**Interfaces:**
- Produces: `CUSTOM_EDITOR_RIBBON_TABS`
- Produces: `ribbonTabIndexForKey(key, currentIndex, count?) -> number | null`

- [ ] **Step 1: Write the failing unit tests**

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_EDITOR_RIBBON_TABS,
  ribbonTabIndexForKey,
} from "../public/custom-editor-ribbon.js";

test("custom editor ribbon exposes the approved tab order", () => {
  assert.deepEqual(
    CUSTOM_EDITOR_RIBBON_TABS.map(({ id, label }) => [id, label]),
    [
      ["design", "디자인"],
      ["insert", "삽입"],
      ["align", "정렬"],
      ["arrange", "배치"],
    ]
  );
});

test("ribbon arrow keys wrap and Home/End reach the boundaries", () => {
  assert.equal(ribbonTabIndexForKey("ArrowRight", 3), 0);
  assert.equal(ribbonTabIndexForKey("ArrowLeft", 0), 3);
  assert.equal(ribbonTabIndexForKey("Home", 2), 0);
  assert.equal(ribbonTabIndexForKey("End", 1), 3);
  assert.equal(ribbonTabIndexForKey("Enter", 1), null);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/custom-editor-ribbon.test.js
```

Expected: FAIL because `public/custom-editor-ribbon.js` does not exist.

- [ ] **Step 3: Implement the minimal tab model**

```js
export const CUSTOM_EDITOR_RIBBON_TABS = Object.freeze([
  Object.freeze({ id: "design", label: "디자인" }),
  Object.freeze({ id: "insert", label: "삽입" }),
  Object.freeze({ id: "align", label: "정렬" }),
  Object.freeze({ id: "arrange", label: "배치" }),
]);

export function ribbonTabIndexForKey(
  key,
  currentIndex,
  count = CUSTOM_EDITOR_RIBBON_TABS.length
) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % count;
  if (key === "ArrowLeft") return (currentIndex - 1 + count) % count;
  return null;
}
```

- [ ] **Step 4: Run and verify GREEN**

```bash
node --test test/custom-editor-ribbon.test.js
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/custom-editor-ribbon.js test/custom-editor-ribbon.test.js
git commit -m "feat: define custom ribbon tabs"
```

---

### Task 2: Replace overflow controls with Word-style tab panels

**Files:**
- Modify: `test/ppt-workspace-ui.test.js`
- Modify: `public/custom-editor-chrome.jsx`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `CUSTOM_EDITOR_RIBBON_TABS`, `ribbonTabIndexForKey`
- Produces: `.custom-editor-ribbon-tablist`, `.custom-editor-ribbon-tab`,
  `.custom-editor-ribbon-panel`, `.custom-editor-ribbon-group`

- [ ] **Step 1: Add failing source contracts**

Add tests asserting:

```js
assert.match(chromeSource, /role="tablist"/);
assert.match(chromeSource, /role="tab"/);
assert.match(chromeSource, /role="tabpanel"/);
assert.match(chromeSource, /CUSTOM_EDITOR_RIBBON_TABS\.map/);
assert.match(chromeSource, /ribbonTabIndexForKey/);
assert.match(chromeSource, /custom-editor-ribbon-quick-access/);
assert.doesNotMatch(chromeSource, /RibbonOverflowMenu/);
assert.doesNotMatch(chromeSource, /MoreHorizontal/);
assert.doesNotMatch(chromeSource, /label="정렬·배치"/);
assert.doesNotMatch(chromeSource, /label="보기"/);
```

Assert group labels and panel ownership:

```js
for (const label of [
  "템플릿",
  "테마 및 배경",
  "보기",
  "콘텐츠",
  "도형",
  "슬라이드에 맞춤",
  "선택 개체에 맞춤",
  "쌓는 순서",
  "개체 관리",
]) {
  assert.match(chromeSource, new RegExp(`>${label}<`));
}
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test --test-name-pattern="Word-style ribbon" test/ppt-workspace-ui.test.js
```

Expected: FAIL because current source still uses overflow menus and has no tabs.

- [ ] **Step 3: Remove overflow implementation and add reusable ribbon groups**

In `custom-editor-chrome.jsx`:

- remove `MoreHorizontal`, `useEffect`, and `RibbonOverflowMenu`;
- import the tab model;
- keep `useId`, `useRef`, and `useState`;
- replace menu-aware helper components with components that render one direct
  set of buttons.

Add:

```jsx
function RibbonGroup({ label, className = "", children }) {
  return (
    <div
      className={`custom-editor-ribbon-group ${className}`.trim()}
      role="group"
      aria-label={label}
    >
      <div className="custom-editor-ribbon-group-controls">{children}</div>
      <span className="custom-editor-ribbon-group-label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Add active-tab state and keyboard handling**

At the start of `CustomEditorChrome`:

```jsx
const [activeRibbonTab, setActiveRibbonTab] = useState("design");
const ribbonId = useId();
const ribbonTabRefs = useRef([]);

function activateRibbonTab(index, focus = false) {
  const tab = CUSTOM_EDITOR_RIBBON_TABS[index];
  if (!tab) return;
  setActiveRibbonTab(tab.id);
  if (focus) requestAnimationFrame(() => ribbonTabRefs.current[index]?.focus());
}

function handleRibbonTabKeyDown(event, index) {
  const nextIndex = ribbonTabIndexForKey(event.key, index);
  if (nextIndex === null) return;
  event.preventDefault();
  activateRibbonTab(nextIndex, true);
}
```

This state must not call editor callbacks or dispatch DOM input/change events.

- [ ] **Step 5: Render the tab strip and quick-access history**

```jsx
<div className="custom-editor-ribbon-tabbar">
  <div className="custom-editor-ribbon-tablist" role="tablist" aria-label="편집 도구 카테고리">
    {CUSTOM_EDITOR_RIBBON_TABS.map((tab, index) => {
      const selected = activeRibbonTab === tab.id;
      return (
        <button
          key={tab.id}
          ref={(node) => { ribbonTabRefs.current[index] = node; }}
          id={`${ribbonId}-${tab.id}-tab`}
          type="button"
          className="custom-editor-ribbon-tab"
          role="tab"
          aria-selected={selected}
          aria-controls={`${ribbonId}-${tab.id}-panel`}
          tabIndex={selected ? 0 : -1}
          onClick={() => activateRibbonTab(index)}
          onKeyDown={(event) => handleRibbonTabKeyDown(event, index)}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
  <div className="custom-editor-ribbon-quick-access" role="group" aria-label="편집 이력">
    <ToolButton action="undo" label="실행 취소"><Undo2 size={16} /></ToolButton>
    <ToolButton action="redo" label="다시 실행"><Redo2 size={16} /></ToolButton>
  </div>
</div>
```

- [ ] **Step 6: Render each command exactly once in its approved panel**

For each tab, render:

```jsx
<div
  id={`${ribbonId}-${tabId}-panel`}
  className="custom-editor-ribbon-panel"
  role="tabpanel"
  aria-labelledby={`${ribbonId}-${tabId}-tab`}
  hidden={activeRibbonTab !== tabId}
>
  {/* Approved RibbonGroup components and existing controls. */}
</div>
```

Use the exact mapping from the design spec. Keep Template, Theme, Background,
and ColorPicker mounted in the Design panel even while hidden so the editor's
cached DOM references remain stable.

- [ ] **Step 7: Replace adaptive overflow CSS with Word-style ribbon CSS**

Remove `.custom-editor-overflow*`, old design/tools row rules, and the 1080,
560, and 420 container-query menu switching.

Add:

```css
.custom-editor-ribbon {
  container-type: inline-size;
  display: grid;
  grid-template-rows: auto minmax(80px, auto);
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-soft);
}

.custom-editor-ribbon-tabbar {
  display: flex;
  align-items: end;
  gap: 2px;
  min-width: 0;
  padding: 5px 7px 0;
  background: color-mix(in srgb, var(--panel) 72%, transparent);
}

.custom-editor-ribbon-tablist {
  display: flex;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.custom-editor-ribbon-tab {
  height: var(--ctrl-h-xs);
  padding: 0 12px;
  border: 0;
  border-radius: 7px 7px 0 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
}

.custom-editor-ribbon-tab[aria-selected="true"] {
  color: var(--ink);
  background: var(--panel-soft);
  box-shadow: inset 0 -2px 0 var(--brand);
}

.custom-editor-ribbon-quick-access {
  display: flex;
  gap: 2px;
  margin-left: auto;
  padding-bottom: 3px;
}

.custom-editor-ribbon-panel {
  display: flex;
  align-items: stretch;
  min-width: 0;
  min-height: 80px;
  padding: var(--sp-2);
  overflow-x: hidden;
}

.custom-editor-ribbon-panel[hidden] {
  display: none;
}

.custom-editor-ribbon-group {
  position: relative;
  display: flex;
  align-items: center;
  flex: none;
  min-width: 0;
  padding: 2px 12px 18px;
}

.custom-editor-ribbon-group + .custom-editor-ribbon-group {
  border-left: 1px solid var(--border);
}

.custom-editor-ribbon-group-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}

.custom-editor-ribbon-group-label {
  position: absolute;
  right: 8px;
  bottom: 1px;
  left: 8px;
  overflow: hidden;
  color: var(--muted);
  font-size: 9px;
  font-weight: 700;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@container (max-width: 559px) {
  .custom-editor-ribbon-panel {
    overflow-x: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  }
}
```

- [ ] **Step 8: Run source tests and build**

```bash
node --test test/custom-editor-ribbon.test.js test/ppt-workspace-ui.test.js
npm run build
```

Expected: PASS and successful Vite build.

- [ ] **Step 9: Commit**

```bash
git add public/custom-editor-chrome.jsx public/styles.css test/ppt-workspace-ui.test.js
git commit -m "feat: build Word-style custom editor ribbon"
```

---

### Task 3: Browser behavior, pop-out, and fallback

**Files:**
- Modify: `public/index.html`
- Modify: `test/browser/save-flow.playwright.mjs`

**Interfaces:**
- Consumes: tabbed `CustomEditorChrome`
- Produces: browser evidence for tabs, actions, responsive scrolling, and pop-out

- [ ] **Step 1: Add failing browser expectations**

Replace the prior adaptive-overflow ribbon scenario with checks that:

- Design is selected by default.
- Four tabs are present in exact order.
- ArrowRight, ArrowLeft, Home, and End select/focus the expected tab.
- Tab changes leave Save disabled on a clean slide.
- Insert → Add Rectangle enables Save.
- Align exposes and runs `align-left`.
- Arrange exposes Duplicate/Delete and layer controls.
- Collapsing and reopening the inspector preserves the active tab.
- At a 390px viewport, the active panel scrolls internally and the document
  has no horizontal overflow.
- The pop-out exposes the same four tabs.

- [ ] **Step 2: Run browser suite and verify RED**

```bash
npm run test:browser
```

Expected: FAIL because current browser tests still expect overflow menus and
the fallback has no category structure.

- [ ] **Step 3: Update the static fallback**

In `index.html`, replace the prior fallback two-row ribbon with four labelled
category sections. Design is visible by default. Preserve all existing fallback
inputs and `data-editor-action` attributes. The primary React path remains the
interactive tab implementation.

- [ ] **Step 4: Implement browser scenario adjustments**

Use role-based locators:

```js
const ribbon = page.locator(
  "#customSlideEditor .custom-editor-ribbon:not(.custom-editor-ribbon--fallback)"
);
const tabs = ribbon.getByRole("tab");
assert.deepEqual(await tabs.allTextContents(), ["디자인", "삽입", "정렬", "배치"]);
assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true");
assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);

await tabs.nth(1).focus();
await page.keyboard.press("ArrowRight");
assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
await page.keyboard.press("End");
assert.equal(await tabs.nth(3).getAttribute("aria-selected"), "true");
await page.keyboard.press("Home");
assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true");
assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
```

Scope action locators to the visible tabpanel.

- [ ] **Step 5: Run browser suite and commit**

```bash
npm run test:browser
```

Expected: all scenarios pass.

```bash
git add public/index.html test/browser/save-flow.playwright.mjs
git commit -m "test: cover Word-style ribbon interactions"
```

---

### Task 4: Final verification

**Files:**
- No production changes expected.

- [ ] **Step 1: Run all Node tests**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: successful Vite build.

- [ ] **Step 3: Run browser suite**

```bash
npm run test:browser
```

Expected: all scenarios pass.

- [ ] **Step 4: Inspect repository state**

```bash
git diff --check
git status --short
git log --oneline -6
```

Expected: clean feature worktree with only the planned commits.

## Self-Review

- Spec coverage: category mapping, quick access, UI-only state, keyboard tabs,
  responsive scrolling, pop-out, fallback, and first-band exclusion are
  covered.
- Every production change follows a failing test.
- Template, Theme, and Background remain unique stable DOM controls.
- Every action appears in one category panel, eliminating duplicate action
  selectors and disabled-state synchronization problems.
