# Panel Collapse Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the slide-list and inspector collapse controls belong to the panels they operate, by moving them into panel headers, giving the inspector a real divider, and turning each collapsed 44px rail into a single expand button.

**Architecture:** No JavaScript state changes. The existing `ppt-workspace-ui.js` reducer and the `data-layout-mode` / `data-slides-open` / `data-inspector-open` attributes on `#pptWorkspace` stay exactly as they are. Work is markup placement plus CSS: collapse chevrons move into header flow, two new rail buttons are added as expand-only controls that live outside the `inert` regions, and `app.js` gains two click listeners.

**Tech Stack:** Plain HTML, CSS (Grid, sticky positioning, `writing-mode`), vanilla ES modules, Node test runner, Playwright, Vite

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-15-panel-collapse-affordance-design.md`.
- Keep every existing element ID stable: `#slidePanelCollapseBtn`, `#inspectorPanelCollapseBtn`, `#slideListPanel`, `#slideEditor`, `#slideForm`, `#customSlideInspector`, `#pptSlidesPaneBtn`, `#pptInspectorPaneBtn`, `#pptFocusModeBtn`.
- Do not change `public/ppt-workspace-ui.js`. No new reducer actions.
- Do not change save, cancel, reset, delete, download, or unsaved-change behavior. Toggling layout must never enable `#editorSaveBtn` on a clean slide.
- New IDs, exactly these spellings: `#slideListRailBtn`, `#inspectorRailBtn`.
- New class names, exactly these spellings: `.panel-collapse-btn`, `.panel-rail-btn`, `.panel-rail-label`, `.inspector-header`.
- Korean copy, verbatim: collapse labels `슬라이드 목록 닫기` and `속성 패널 닫기`; expand labels `슬라이드 목록 열기` and `속성 패널 열기`; rail labels `슬라이드 목록` and `상세 설정`; panel heading `슬라이드 편집`; inspector heading `상세 설정`.
- Small controls size on `--ctrl-h-sm` (34px). Never hard-code 30px.
- Layout breakpoints are unchanged: wide `>= 1280px`, compact `900-1279px`, mobile `< 900px`.
- Rail buttons exist only in wide mode. They must be `display: none` in compact and mobile.
- Leave the uncommitted work in `data/templates.json`, `scripts/upload-preview-check.mjs`, `tmp-preview-height-check.mjs`, `tmp-template-list-shot.mjs`, and `docs/superpowers/specs/2026-09-15-preview-stage-height-design.md` untouched and unstaged. `public/styles.css` also has uncommitted work in it — you are editing that same file, so stage it deliberately with `git add public/styles.css` and never use `git add -A` or `git add .`.
- `public/styles.css` is large and being edited by others. **Anchor every edit on the CSS selector text, not on line numbers.** Line numbers in this plan are advisory only and may have drifted.

---

### Task 1: Rail buttons as the expand affordance

The collapsed 44px rail becomes one full-height button. This has to land first: later tasks move the chevrons into headers that get `inert` when collapsed, and without the rail there would be no way to re-expand.

**Files:**
- Modify: `public/index.html` (inside `#slideListPanel`, inside `#slideEditor`)
- Modify: `public/styles.css` (near `.slide-list-panel`, and the `.ppt-interface[data-slides-open="false"]` / `[data-inspector-open="false"]` block around `:3628-3662`)
- Modify: `public/app.js` (element lookups near `:849`, listeners near `:2584`)
- Test: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Consumes: the existing `dispatchPptWorkspaceUi({ type: "toggle-slides" })` and `dispatchPptWorkspaceUi({ type: "toggle-inspector" })` functions in `public/app.js`, and the existing `data-layout-mode` / `data-slides-open` / `data-inspector-open` attributes on `#pptWorkspace`.
- Produces: `#slideListRailBtn` and `#inspectorRailBtn`, the `.panel-rail-btn` and `.panel-rail-label` classes, and the `const slideListRailBtn` / `const inspectorRailBtn` module-level bindings in `app.js`.

**Note on ARIA:** the spec asked for `applyPptWorkspaceUi()` to synchronise the rail buttons' `aria-expanded`. Because CSS keeps them `display: none` whenever their panel is open, they are only ever exposed in the collapsed state, so static `aria-expanded="false"` is always accurate. Do not add sync code for them.

- [ ] **Step 1: Write the failing test**

Append this `describe` block to the end of `test/ppt-workspace-ui.test.js`:

```javascript
describe("PPT panel collapse affordances", () => {
  it("expands a collapsed pane from a full-rail button", () => {
    assert.match(
      html,
      /id="slideListRailBtn"[\s\S]*?aria-controls="slideListPanel"/
    );
    assert.match(
      html,
      /id="inspectorRailBtn"[\s\S]*?aria-controls="slideForm customSlideInspector"/
    );
    assert.match(html, /id="slideListRailBtn"[\s\S]*?슬라이드 목록 열기/);
    assert.match(html, /id="inspectorRailBtn"[\s\S]*?속성 패널 열기/);
    assert.match(css, /\.panel-rail-btn\s*\{[\s\S]*?display:\s*none/);
    assert.match(
      css,
      /\[data-layout-mode="wide"\]\[data-slides-open="false"\]\s*#slideListRailBtn[\s\S]*?display:\s*flex/
    );
    assert.match(
      css,
      /\.panel-rail-label\s*\{[\s\S]*?writing-mode:\s*vertical-rl/
    );
    assert.match(appSource, /slideListRailBtn\?\.addEventListener/);
    assert.match(appSource, /inspectorRailBtn\?\.addEventListener/);
  });

  it("hides the collapse chevrons while collapsed so the rail owns the target", () => {
    assert.match(
      css,
      /\[data-slides-open="false"\]\s*#slidePanelCollapseBtn\s*\{[\s\S]*?display:\s*none/
    );
    assert.match(
      css,
      /\[data-inspector-open="false"\]\s*#inspectorPanelCollapseBtn\s*\{[\s\S]*?display:\s*none/
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: FAIL. Both new assertions report no match for `id="slideListRailBtn"`.

- [ ] **Step 3: Add the slide-list rail button**

In `public/index.html`, `#slideListPanel` currently opens like this (around `:306-320`):

```html
        <div class="slide-list-panel" id="slideListPanel">
          <button
            id="slidePanelCollapseBtn"
```

Insert the rail button as the first child, immediately after the opening `<div class="slide-list-panel" id="slideListPanel">` line and before the existing `#slidePanelCollapseBtn`:

```html
          <button
            id="slideListRailBtn"
            type="button"
            class="panel-rail-btn"
            aria-controls="slideListPanel"
            aria-expanded="false"
            aria-label="슬라이드 목록 열기"
            title="슬라이드 목록 열기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6"></path>
            </svg>
            <span class="panel-rail-label">슬라이드 목록</span>
          </button>
```

The chevron points right (`m9 18 6-6-6-6`) because this button opens a pane that expands to the right.

- [ ] **Step 4: Add the inspector rail button**

In `public/index.html`, `.slide-editor-panel` ends after `.preview-area` (around `:1286-1293`):

```html
          <div class="preview-area">
            <h4>미리보기</h4>
            <div id="slidePreview" class="slide-preview-box">
              <!-- Preview Content -->
              <div class="preview-placeholder">설정을 변경하면 미리보기가 표시됩니다.</div>
            </div>
          </div>
        </div>
```

Insert the rail button between `</div>` (closing `.preview-area`) and `</div>` (closing `.slide-editor-panel`), so it is last in tab order:

```html
          <button
            id="inspectorRailBtn"
            type="button"
            class="panel-rail-btn"
            aria-controls="slideForm customSlideInspector"
            aria-expanded="false"
            aria-label="속성 패널 열기"
            title="속성 패널 열기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6"></path>
            </svg>
            <span class="panel-rail-label">상세 설정</span>
          </button>
```

The chevron points left (`m15 18-6-6 6-6`) because this pane expands leftward.

- [ ] **Step 5: Style the rail buttons**

In `public/styles.css`, find the `.slide-list-panel` rule (around `:1984`):

```css
.slide-list-panel {
  position: relative;
  background: var(--panel);
  border-radius: 16px;
  padding: 16px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-self: start;
}
```

Insert this block immediately *before* it. `.panel-rail-btn` is hidden by default; the state rules in Step 6 reveal it.

```css
/* A collapsed pane shrinks to a 44px strip. Rather than leave a lone icon
   floating in it, the whole strip is the button, labelled so the strip says
   what it holds. */
.panel-rail-btn {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 10px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.panel-rail-btn:hover {
  color: var(--ink);
  background: var(--panel-soft);
}

.panel-rail-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.panel-rail-btn svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

.panel-rail-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;
  letter-spacing: 0.04em;
}

#slideListRailBtn {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: 16px;
}

/* Grid placement, not absolute offsets: the inspector area is already exactly
   the right column below the header, in both the plain and custom layouts. */
#inspectorRailBtn {
  grid-area: inspector;
  align-self: stretch;
  z-index: 3;
  min-height: 180px;
}
```

- [ ] **Step 6: Swap the collapsed-state rules from chevron to rail**

In `public/styles.css`, find this block (around `:3628-3662`):

```css
.ppt-interface[data-slides-open="false"] .slide-list-panel {
  min-height: 64px;
  padding: 6px;
  overflow: hidden;
}

.ppt-interface[data-slides-open="false"] .slide-list-panel > * {
  visibility: hidden;
}

.ppt-interface[data-slides-open="false"] .slide-panel-collapse {
  top: 6px;
  right: 6px;
  visibility: visible;
  transform: rotate(180deg);
}
```

Replace those three rules with the following. The collapsed panel gets taller so the vertical label fits, the chevron is hidden outright, and the rail button opts back out of the blanket `visibility: hidden`.

```css
.ppt-interface[data-slides-open="false"] .slide-list-panel {
  min-height: 180px;
  padding: 0;
  overflow: hidden;
}

.ppt-interface[data-slides-open="false"] .slide-list-panel > * {
  visibility: hidden;
}

.ppt-interface[data-slides-open="false"] #slidePanelCollapseBtn {
  display: none;
}

.ppt-interface[data-layout-mode="wide"][data-slides-open="false"] #slideListRailBtn,
.ppt-interface[data-layout-mode="wide"][data-inspector-open="false"] #inspectorRailBtn {
  display: flex;
  visibility: visible;
}
```

Then find this rule a few lines below (around `:3657`):

```css
.ppt-interface[data-inspector-open="false"] .inspector-panel-collapse {
  top: 76px;
  right: 6px;
  transform: rotate(180deg);
}
```

Replace it with:

```css
.ppt-interface[data-inspector-open="false"] #inspectorPanelCollapseBtn {
  display: none;
}
```

- [ ] **Step 7: Wire the clicks**

In `public/app.js`, after the `inspectorPanelCollapseBtn` lookup (around `:849-852`):

```javascript
const slidePanelCollapseBtn = document.getElementById("slidePanelCollapseBtn");
const inspectorPanelCollapseBtn = document.getElementById(
  "inspectorPanelCollapseBtn"
);
```

add:

```javascript
const slideListRailBtn = document.getElementById("slideListRailBtn");
const inspectorRailBtn = document.getElementById("inspectorRailBtn");
```

Then after the `inspectorPanelCollapseBtn` listener (around `:2590-2592`):

```javascript
inspectorPanelCollapseBtn?.addEventListener("click", () => {
  dispatchPptWorkspaceUi({ type: "toggle-inspector" });
});
```

add:

```javascript
slideListRailBtn?.addEventListener("click", () => {
  dispatchPptWorkspaceUi({ type: "toggle-slides" });
});
inspectorRailBtn?.addEventListener("click", () => {
  dispatchPptWorkspaceUi({ type: "toggle-inspector" });
});
```

- [ ] **Step 8: Guard the stage-click handler**

`public/app.js` has a `pointerdown` handler on `#slideEditor` that closes compact drawers when the click misses the inspector (around `:2597-2604`):

```javascript
slideEditor?.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest?.(
      ".editor-form, .custom-editor-side, .editor-actions, .custom-editor-context-toolbar"
    )
  ) {
    return;
  }
```

`#inspectorRailBtn` is a child of `#slideEditor` and matches none of those selectors, so a click on it would be treated as a stage click. Add it to the ignore list:

```javascript
      ".editor-form, .custom-editor-side, .editor-actions, .custom-editor-context-toolbar, .panel-rail-btn"
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 10: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add public/index.html public/styles.css public/app.js test/ppt-workspace-ui.test.js
git commit -m "feat: make the collapsed panel rail a single expand button"
```

---

### Task 2: Slide-list chevron joins the header row

**Files:**
- Modify: `public/index.html` (`#slidePanelCollapseBtn` moves into `.slide-list-actions`)
- Modify: `public/styles.css` (delete `.slide-panel-collapse`, `.slide-panel-collapse svg`, and `.slide-list-header { padding-right: 34px }`; add `.panel-collapse-btn svg`)
- Test: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Consumes: `#slideListRailBtn` from Task 1 as the expand path. Also consumes the existing `ghost`, `small`, and `icon-btn` classes: `.ghost` supplies border, background and font; `.small` supplies `min-height: var(--ctrl-h-sm)` and `border-radius: 10px`; `.icon-btn` supplies `min-width: var(--ctrl-h-sm)` and `padding: 0`.
- Produces: the `.panel-collapse-btn` class, used here and again in Task 3.

- [ ] **Step 1: Write the failing test**

In `test/ppt-workspace-ui.test.js`, inside the `describe("PPT panel collapse affordances", ...)` block added in Task 1, append this test:

```javascript
  it("seats the slide-list chevron in the header action row", () => {
    assert.match(
      html,
      /id="duplicateSlideBtn"[\s\S]*?id="slidePanelCollapseBtn"[\s\S]*?<\/div>\s*<\/div>\s*<div class="slide-list-toolbar">/
    );
    assert.match(
      html,
      /id="slidePanelCollapseBtn"[\s\S]*?class="ghost small icon-btn panel-collapse-btn"/
    );
    assert.doesNotMatch(css, /\.slide-panel-collapse/);
    assert.doesNotMatch(
      css,
      /\.slide-list-header\s*\{\s*padding-right:\s*34px/
    );
    assert.match(
      css,
      /\.panel-collapse-btn svg\s*\{[\s\S]*?stroke:\s*currentColor/
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: FAIL on the `id="duplicateSlideBtn"` ordering assertion, because the chevron still precedes the header.

- [ ] **Step 3: Delete the chevron from its floating position**

In `public/index.html`, delete this whole element from inside `#slideListPanel` (around `:307-319`, now sitting just after the `#slideListRailBtn` added in Task 1):

```html
          <button
            id="slidePanelCollapseBtn"
            type="button"
            class="slide-panel-collapse"
            aria-controls="slideListPanel"
            aria-expanded="true"
            aria-label="슬라이드 목록 닫기"
            title="슬라이드 목록 닫기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6"></path>
            </svg>
          </button>
```

- [ ] **Step 4: Re-add it as the last item in the header action row**

In `public/index.html`, `.slide-list-actions` ends with the 복제 button (around `:351-354`):

```html
              <button id="duplicateSlideBtn" type="button" class="ghost small" disabled>
                복제
              </button>
            </div>
```

Insert the chevron between the 복제 button and the closing `</div>`:

```html
              <button
                id="slidePanelCollapseBtn"
                type="button"
                class="ghost small icon-btn panel-collapse-btn"
                aria-controls="slideListPanel"
                aria-expanded="true"
                aria-label="슬라이드 목록 닫기"
                title="슬라이드 목록 닫기"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m15 18-6-6 6-6"></path>
                </svg>
              </button>
```

- [ ] **Step 5: Delete the floating styles and the header dodge**

In `public/styles.css`, delete these three rules (around `:1995-2022`):

```css
.slide-panel-collapse {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  width: 30px;
  height: 30px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-soft);
  color: var(--muted);
  cursor: pointer;
}

.slide-panel-collapse svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

.slide-list-header {
  padding-right: 34px;
}
```

Note there are two consecutive `.slide-list-header { ... }` rules. Delete only the first one — the `padding-right: 34px` one. Keep the `display: flex` one that follows.

Replace the deleted block with the shared icon rule. `.ghost small icon-btn` already sizes and frames the button; only the stroke-style SVG needs describing, because `.icon-btn .icon` in this codebase assumes `fill`:

```css
/* The collapse chevrons are stroked outlines, unlike the filled `.icon-btn`
   glyphs elsewhere. */
.panel-collapse-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}
```

- [ ] **Step 6: Retarget the mobile hide rule**

In `public/styles.css`, inside `@media (max-width: 899px)` (around `:3905`):

```css
  .slide-panel-collapse {
    display: none;
  }
```

Change the selector to the ID, since the class is gone:

```css
  #slidePanelCollapseBtn {
    display: none;
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/styles.css test/ppt-workspace-ui.test.js
git commit -m "fix: seat the slide-list collapse chevron in its header row"
```

---

### Task 3: Inspector header and divider

**Files:**
- Modify: `public/index.html` (`#inspectorPanelCollapseBtn` moves into a new `.inspector-header` at the top of `#slideForm`)
- Modify: `public/styles.css` (delete `.inspector-panel-collapse`, its `svg` rule, and the `@media (max-width: 1279px)` block that hid it; add `--inspector-header-h` and `.inspector-header`; add `border-left` to `.editor-form` and `.custom-editor-side`; widen the custom-slide `padding-top`; extend the custom-slide `> :not(.settings-section)` hide rule)
- Test: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Consumes: `#inspectorRailBtn` from Task 1 as the expand path, and `.panel-collapse-btn` from Task 2 for the chevron glyph.
- Produces: the `.inspector-header` class and the `--inspector-header-h` custom property on `.slide-editor-panel`. Task 4 reads `--inspector-header-h`.

**Background you need:** for `slide-type="custom"` the custom editor spans both columns as its own nested grid, and `#slideForm` is overlaid on top of the inspector area at `z-index: 2` while `.custom-editor-side` sits underneath with a `padding-top` that clears it. Both stacked elements therefore need the same `border-left` to read as one continuous divider, and that `padding-top` has to grow by the full height of the new header row — which is the button height plus the header's own `padding-bottom` and border, plus the form's row `gap`. That is why the header height gets a custom property instead of a hard-coded number: the same sum is needed again in Task 4 for the compact drawer.

**Also delete the obsolete chevron hide here, not later:** `@media (max-width: 1279px) { .inspector-panel-collapse { display: none } }` exists because the chevron was anchored to a stage/inspector seam that does not exist in drawer mode. Now that it lives in the drawer's own header it reads correctly as that drawer's close button, so the rule goes away with the class rather than being retargeted. Step 1's `doesNotMatch` assertion fails if you leave this block behind.

- [ ] **Step 1: Write the failing test**

In `test/ppt-workspace-ui.test.js`, inside the `describe("PPT panel collapse affordances", ...)` block, append:

```javascript
  it("gives the inspector its own header and a real divider", () => {
    assert.match(
      html,
      /<form id="slideForm" class="editor-form">\s*<div class="inspector-header">\s*<h4>상세 설정<\/h4>\s*<button\s*id="inspectorPanelCollapseBtn"/
    );
    // Also proves the `@media (max-width: 1279px)` block that hid it is gone.
    assert.doesNotMatch(css, /\.inspector-panel-collapse/);
    assert.match(
      css,
      /\.inspector-header\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*0/
    );
    assert.match(
      css,
      /\.editor-form\s*\{[\s\S]*?border-left:\s*1px solid var\(--border\)/
    );
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.custom-editor-side\s*\{[\s\S]*?border-left:\s*1px solid var\(--border\)/
    );
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.editor-form > :not\(\.settings-section\):not\(\.inspector-header\)/
    );
    assert.match(
      css,
      /--inspector-header-h:\s*calc\(var\(--ctrl-h-sm\) \+ var\(--sp-3\) \+ 1px\)/
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: FAIL on the `<form id="slideForm">` assertion, because `.inspector-header` does not exist yet.

- [ ] **Step 3: Delete the chevron from its floating position**

In `public/index.html`, delete this whole element from the top of `.slide-editor-panel` (around `:373-385`):

```html
          <button
            id="inspectorPanelCollapseBtn"
            type="button"
            class="inspector-panel-collapse"
            aria-controls="slideForm customSlideInspector"
            aria-expanded="true"
            aria-label="속성 패널 닫기"
            title="속성 패널 닫기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6"></path>
            </svg>
          </button>
```

After this deletion `.slide-editor-panel` opens directly onto `<div class="editor-header">`.

- [ ] **Step 4: Add the inspector header**

In `public/index.html`, `#slideForm` currently opens like this (around `:427-429`):

```html
          <form id="slideForm" class="editor-form">
            <div class="settings-section">
```

Insert the header row as the form's first child:

```html
          <form id="slideForm" class="editor-form">
            <div class="inspector-header">
              <h4>상세 설정</h4>
              <button
                id="inspectorPanelCollapseBtn"
                type="button"
                class="ghost small icon-btn panel-collapse-btn"
                aria-controls="slideForm customSlideInspector"
                aria-expanded="true"
                aria-label="속성 패널 닫기"
                title="속성 패널 닫기"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6"></path>
                </svg>
              </button>
            </div>
            <div class="settings-section">
```

`type="button"` is required — without it this button would submit the form.

- [ ] **Step 5: Delete the floating inspector styles**

In `public/styles.css`, delete these two rules (around `:2365-2388`):

```css
.inspector-panel-collapse {
  position: absolute;
  z-index: 30;
  top: 76px;
  right: calc(var(--inspector-width) + 8px);
  width: 30px;
  height: 30px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-soft);
  color: var(--muted);
  cursor: pointer;
}

.inspector-panel-collapse svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}
```

Then delete this whole media block (around `:3763-3766`), which only existed to hide the class you just deleted:

```css
@media (max-width: 1279px) {
  .inspector-panel-collapse {
    display: none;
  }
}
```

- [ ] **Step 6: Declare the header height on the editor panel**

In `public/styles.css`, find the `.slide-editor-panel` rule (around `:2340`). It already opens with a block of custom properties:

```css
.slide-editor-panel {
  --inspector-width: clamp(360px, 27vw, 400px);
  /* Stage and inspector scroll independently, so they have to stop at the same
     line or the taller one drags the page scrollbar along with it. */
  --stage-max-h: calc(100vh - 190px);
  position: relative;
```

Add the header height alongside them, because two separate `padding-top` values further down have to clear this exact height:

```css
.slide-editor-panel {
  --inspector-width: clamp(360px, 27vw, 400px);
  /* Stage and inspector scroll independently, so they have to stop at the same
     line or the taller one drags the page scrollbar along with it. */
  --stage-max-h: calc(100vh - 190px);
  /* Button height plus the header's own padding-bottom and bottom border. */
  --inspector-header-h: calc(var(--ctrl-h-sm) + var(--sp-3) + 1px);
  position: relative;
```

Leave the rest of the rule untouched.

- [ ] **Step 7: Give the inspector a boundary and a header**

In `public/styles.css`, find the `.editor-form` rule (around `:2440`):

```css
.editor-form {
  grid-area: inspector;
  display: grid;
  gap: var(--sp-5);
  min-width: 0;
  max-height: var(--stage-max-h);
  overflow: auto;
  padding-right: 4px;
}
```

Replace it with the bordered version, and add the header rules right after:

```css
.editor-form {
  grid-area: inspector;
  display: grid;
  gap: var(--sp-5);
  min-width: 0;
  max-height: var(--stage-max-h);
  overflow: auto;
  /* The collapse chevron used to be anchored to this seam while the seam was
     invisible, so it read as floating. The divider is what it points at. */
  border-left: 1px solid var(--border);
  padding-left: var(--sp-4);
  padding-right: 4px;
}

.inspector-header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding-bottom: var(--sp-3);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.inspector-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
}
```

- [ ] **Step 8: Carry the divider and header through the custom-slide layout**

In `public/styles.css`, find this rule (around `:3598`):

```css
.slide-editor-panel[data-slide-type="custom"] .editor-form > :not(.settings-section) {
  display: none;
}
```

Custom slides keep only the name/type fields from this form. The new header has to survive that cull. Keep the selector on one line, matching the rule you are replacing:

```css
.slide-editor-panel[data-slide-type="custom"] .editor-form > :not(.settings-section):not(.inspector-header) {
  display: none;
}
```

Then find this rule (around `:3616`):

```css
.slide-editor-panel[data-slide-type="custom"] .custom-editor-side {
  grid-area: side;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding-top: 150px;
}
```

Replace it with:

```css
.slide-editor-panel[data-slide-type="custom"] .custom-editor-side {
  grid-area: side;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  /* `.editor-form` is overlaid on the top of this same column, so this clears
     its name/type fields plus the inspector header row now above them, plus
     the form's row gap between the two. */
  padding-top: calc(150px + var(--inspector-header-h) + var(--sp-5));
  padding-left: var(--sp-4);
  /* Continues the `.editor-form` divider down the rest of the column. */
  border-left: 1px solid var(--border);
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 10: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add public/index.html public/styles.css test/ppt-workspace-ui.test.js
git commit -m "fix: give the inspector its own header and divider"
```

---

### Task 4: Title ownership and responsive cleanup

**Files:**
- Modify: `public/index.html` (`.editor-header h3` copy)
- Modify: `public/styles.css` (compact custom-drawer `padding-top`; mobile overrides)
- Modify: `public/app.js` (`applyPptWorkspaceUi()` label logic around `:1045-1071`)
- Test: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1-3, including the `--inspector-header-h` custom property from Task 3.
- Produces: no new names.

**Compact mode needs almost nothing.** Task 1 scoped the rail reveal to `[data-layout-mode="wide"]`, so the rails are already `display: none` everywhere else — no per-breakpoint hide is needed, and adding one would be dead CSS. The compact drawer rules also already neutralise Task 3's divider for free: `.ppt-interface[data-layout-mode="compact"] .editor-form` declares `border: 1px solid var(--border)` and `padding: 16px`, shorthands that overwrite `border-left` and `padding-left` at higher specificity. The compact `.custom-editor-side` rule does the same, and although it ties Task 3's rule on specificity it appears later in the file, so it wins on source order. The only compact change actually required is the drawer `padding-top`.

**Mobile mode does need explicit resets.** The mobile rules for `.editor-form` and `.custom-editor-side` set `position`, `width`, `max-height`, `overflow`, and `visibility` but never touch `border-left`, so Task 3's divider would survive into the stacked layout. The sticky inspector header also has to be pinned back down: with `overflow: visible` on the form, `position: sticky` would resolve against the page and follow the viewport while scrolling.

**Why the labels become constant:** each chevron is now collapse-only, since the rail buttons own expansion. `applyPptWorkspaceUi()` currently swaps their labels to `열기` text that can never be seen, because CSS hides them whenever their panel is collapsed. `aria-expanded` still carries real meaning and stays synchronised.

- [ ] **Step 1: Write the failing test**

In `test/ppt-workspace-ui.test.js`, inside the `describe("PPT panel collapse affordances", ...)` block, append:

```javascript
  it("drops the seam divider where the panels are not side by side", () => {
    assert.match(
      css,
      /@media\s*\(max-width:\s*899px\)[\s\S]*?\[data-layout-mode="mobile"\] \.custom-editor-side\s*\{[\s\S]*?border-left:\s*0/
    );
    assert.match(
      css,
      /@media\s*\(max-width:\s*899px\)[\s\S]*?\.inspector-header\s*\{\s*position:\s*static/
    );
  });

  it("clears the taller overlaid form in the compact custom drawer", () => {
    assert.match(
      css,
      /padding:\s*calc\(164px \+ var\(--inspector-header-h\) \+ var\(--sp-5\)\) 16px 16px/
    );
  });

  it("names the panel and the inspector distinctly", () => {
    assert.match(html, /<div class="editor-header">\s*<h3>슬라이드 편집<\/h3>/);
    assert.match(appSource, /"슬라이드 목록 닫기"/);
    assert.doesNotMatch(appSource, /"슬라이드 목록 열기"/);
    assert.doesNotMatch(appSource, /"속성 패널 열기"/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: FAIL on all three. The mobile block has no `border-left: 0`, the compact drawer padding is still `164px 16px 16px`, and the `h3` still reads `상세 설정`.

- [ ] **Step 3: Hand the 상세 설정 name to the inspector**

In `public/index.html`, the editor panel header (around `:386-388`, or `:373` after Task 3's deletion) reads:

```html
          <div class="editor-header">
            <h3>상세 설정</h3>
```

That header spans the stage as well as the inspector, so the name now belongs to the inspector header added in Task 3. Change it to:

```html
          <div class="editor-header">
            <h3>슬라이드 편집</h3>
```

- [ ] **Step 4: Make room for the header in the compact custom drawer**

In `public/styles.css`, still inside `@media (min-width: 900px) and (max-width: 1279px)`, find the compact `.custom-editor-side` drawer (around `:3857-3869`):

```css
  .ppt-interface[data-layout-mode="compact"] .custom-editor-side {
    position: absolute;
    z-index: 21;
    top: 72px;
    right: 24px;
    width: min(340px, calc(100vw - 80px));
    max-height: calc(100vh - 190px);
    overflow: auto;
    padding: 164px 16px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
  }
```

This drawer sits at the same coordinates as the `.editor-form` drawer one z-index below, and its `padding-top` clears it. The form is now taller by the inspector header plus the form's row `gap`, so change the padding line to:

```css
    padding: calc(164px + var(--inspector-header-h) + var(--sp-5)) 16px 16px;
```

Leave the rest of the rule as it is.

- [ ] **Step 5: Drop the chevrons and the divider in mobile mode**

In `public/styles.css`, inside `@media (max-width: 899px)`, find the block retargeted in Task 2 (around `:3901-3907`):

```css
  .ppt-pane-toggle {
    display: none;
  }

  #slidePanelCollapseBtn {
    display: none;
  }
```

Everything is in normal vertical flow here, so there is nothing to collapse. Replace that with:

```css
  .ppt-pane-toggle {
    display: none;
  }

  #slidePanelCollapseBtn,
  #inspectorPanelCollapseBtn {
    display: none;
  }

  /* Stacked vertically there is no side-by-side seam to divide. The
     `.inspector-header` label stays, and earns its keep as a section break —
     but unpinned, or it would follow the page scroll instead of the form's. */
  .ppt-interface[data-layout-mode="mobile"] .editor-form,
  .ppt-interface[data-layout-mode="mobile"] .custom-editor-side {
    border-left: 0;
    padding-left: 0;
  }

  .ppt-interface[data-layout-mode="mobile"] .inspector-header {
    position: static;
  }
```

- [ ] **Step 6: Make the chevron labels constant**

In `public/app.js`, `applyPptWorkspaceUi()` contains these two blocks (around `:1045-1071`):

```javascript
  if (slidePanelCollapseBtn) {
    const expanded = String(pptWorkspaceUi.slidesOpen);
    const label = pptWorkspaceUi.slidesOpen
      ? "슬라이드 목록 닫기"
      : "슬라이드 목록 열기";
    slidePanelCollapseBtn.setAttribute("aria-expanded", expanded);
    slidePanelCollapseBtn.setAttribute("aria-label", label);
    slidePanelCollapseBtn.title = label;
  }
```

and

```javascript
  if (inspectorPanelCollapseBtn) {
    const expanded = String(pptWorkspaceUi.inspectorOpen);
    const label = pptWorkspaceUi.inspectorOpen
      ? "속성 패널 닫기"
      : "속성 패널 열기";
    inspectorPanelCollapseBtn.setAttribute("aria-expanded", expanded);
    inspectorPanelCollapseBtn.setAttribute("aria-label", label);
    inspectorPanelCollapseBtn.title = label;
  }
```

Replace them with, respectively:

```javascript
  if (slidePanelCollapseBtn) {
    slidePanelCollapseBtn.setAttribute(
      "aria-expanded",
      String(pptWorkspaceUi.slidesOpen)
    );
  }
```

and

```javascript
  if (inspectorPanelCollapseBtn) {
    inspectorPanelCollapseBtn.setAttribute(
      "aria-expanded",
      String(pptWorkspaceUi.inspectorOpen)
    );
  }
```

The `aria-label` and `title` set in the HTML stay put. `#slideListRailBtn` and `#inspectorRailBtn` carry the `열기` copy.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/styles.css public/app.js test/ppt-workspace-ui.test.js
git commit -m "refactor: hand the inspector its name and settle panel toggles per breakpoint"
```

---

### Task 5: Browser coverage and milestone verification

**Files:**
- Modify: `test/browser/save-flow.playwright.mjs:977-994`

**Interfaces:**
- Consumes: everything from Tasks 1-4. No production changes in this task.

- [ ] **Step 1: Split the collapse and expand paths in the browser test**

In `test/browser/save-flow.playwright.mjs`, the wide-workspace scenario currently clicks the same button twice (around `:977-994`):

```javascript
    await page.locator("#slidePanelCollapseBtn").click();
    await page.waitForFunction(
      (before) =>
        document.querySelector("#customSlideEditor .canvas-container")
          ?.getBoundingClientRect().width > before + 180,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-slides-open"), "false");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "true");
    await page.locator("#slidePanelCollapseBtn").click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          document.querySelector("#customSlideEditor .canvas-container")
            ?.getBoundingClientRect().width - expected
        ) <= 2,
      normalWidth
    );
```

Collapse is now the header chevron and expand is the rail button. Replace that whole passage with:

```javascript
    await page.locator("#slidePanelCollapseBtn").click();
    await page.waitForFunction(
      (before) =>
        document.querySelector("#customSlideEditor .canvas-container")
          ?.getBoundingClientRect().width > before + 180,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-slides-open"), "false");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "true");
    // The header chevron goes inert with the rest of the collapsed panel, so
    // the rail is the only way back.
    assert.equal(await page.locator("#slidePanelCollapseBtn").isVisible(), false);
    assert.equal(await page.locator("#slideListRailBtn").isVisible(), true);
    await page.locator("#slideListRailBtn").click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          document.querySelector("#customSlideEditor .canvas-container")
            ?.getBoundingClientRect().width - expected
        ) <= 2,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-slides-open"), "true");

    await page.locator("#inspectorPanelCollapseBtn").click();
    await page.waitForFunction(
      (before) =>
        document.querySelector("#customSlideEditor .canvas-container")
          ?.getBoundingClientRect().width > before + 180,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-inspector-open"), "false");
    assert.equal(
      await page.locator("#inspectorPanelCollapseBtn").isVisible(),
      false
    );
    assert.equal(await page.locator("#inspectorRailBtn").isVisible(), true);
    await page.locator("#inspectorRailBtn").click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          document.querySelector("#customSlideEditor .canvas-container")
            ?.getBoundingClientRect().width - expected
        ) <= 2,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-inspector-open"), "true");
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
```

The last assertion is the guard from the global constraints: four layout toggles must not have dirtied a clean slide.

- [ ] **Step 2: Run the browser tests**

Run: `npm run test:browser`
Expected: PASS, with no unexpected console or page errors.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: zero failures.

- [ ] **Step 4: Check for whitespace damage**

Run: `git diff --check`
Expected: no output.

- [ ] **Step 5: Confirm the unrelated uncommitted work survived**

Run: `git status --short`
Expected: `data/templates.json`, `scripts/upload-preview-check.mjs`, `docs/superpowers/specs/2026-09-15-preview-stage-height-design.md`, `tmp-preview-height-check.mjs`, and `tmp-template-list-shot.mjs` still listed as modified or untracked, and nothing from `public/` or `test/` left uncommitted.

- [ ] **Step 6: Manual visual check at 1440x1000**

Run the dev server and open the PPT editor with a custom slide selected. Confirm by eye:

1. The slide-list chevron sits on the same baseline as 추가 and 복제, at the same 34px height.
2. The inspector has a visible vertical divider, and the chevron sits on that divider's line inside the 상세 설정 header.
3. Scrolling the inspector keeps the 상세 설정 header pinned with an opaque background — no content bleeding through it.
4. Collapsing each panel yields a 44px strip with a chevron and a readable vertical label, and clicking anywhere on the strip re-expands it.
5. For a custom slide the divider is continuous from the top of the inspector to the bottom — no gap where `.editor-form` ends and `.custom-editor-side` begins.
6. Tab reaches the rail button while a panel is collapsed.

- [ ] **Step 7: Manual check at 1024px and 860px**

1. At 1024px both panels are overlay drawers; each drawer's header chevron closes it; no 44px rail or vertical label appears anywhere; the custom drawer's fields are not clipped at the top.
2. At 860px everything is stacked vertically; no chevrons and no rails; the 상세 설정 label still appears as a section heading; no horizontal page scrollbar.

- [ ] **Step 8: Commit**

```bash
git add test/browser/save-flow.playwright.mjs
git commit -m "test: cover collapse-by-chevron and expand-by-rail"
```
