# Slide Control Menu UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make slide controls accurately describe their behavior, keep the editor command bar stationary, and expose contextual duplicate/delete actions without changing the save model.

**Architecture:** Keep `public/app.js` as the workspace orchestrator and reuse its existing persistence paths. Refactor duplicate/delete commands from implicit `currentSlideId` operations into ID-addressed commands with thin current-slide wrappers, then wire the header and card menus to those commands. Keep the visible save label stable and move progress detail to a reserved spinner plus live region.

**Tech Stack:** Node.js ESM, browser DOM APIs, Express-backed existing APIs, CSS, Node test runner, Playwright.

## Global Constraints

- The header label is exactly `변경 취소`; custom-canvas undo/redo behavior does not change.
- Dirty save state is communicated by existing enabled/disabled color only; no dot or size-changing label.
- The visible save label remains exactly `저장` in every state.
- Header and card actions reuse existing duplicate/delete persistence logic.
- Existing `data/templates.json` and `.omo/` worktree changes are user-owned and must not be staged or modified.
- Card-menu actions on a non-current slide preserve the current selection and dirty draft.
- Saved-slide deletion still requires confirmation; unsaved-slide deletion does not.

---

### Task 1: Stable save and change-cancel controls

**Files:**
- Modify: `public/index.html:437-461`
- Modify: `public/styles.css:2517-2522`
- Modify: `public/app.js:779-791, 1270-1320, 5927-5939, 6366-6372`
- Test: `test/ppt-workspace-ui.test.js:792-845`
- Test: `test/browser/save-flow.playwright.mjs:1435-1470`

**Interfaces:**
- Consumes: existing `slideDirty`, `slideSaving`, `deriveSaveButtonState()`.
- Produces: `showSaveProgress(label: string): () => void`, stable `#editorSaveBtn`, and `#editorSaveStatus`.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions to `test/ppt-workspace-ui.test.js`:

```js
it("labels saved-state recovery as change cancellation", () => {
  const headerEnd = html.indexOf('<form id="slideForm"');
  const header = html.slice(html.indexOf('<div class="editor-header">'), headerEnd);
  assert.match(header, /id="editorCancelBtn"[^>]*>변경 취소</);
  assert.doesNotMatch(header, /id="editorCancelBtn"[^>]*>되돌리기</);
});

it("keeps save progress inside a fixed button shell", () => {
  assert.match(
    html,
    /id="editorSaveBtn"[\s\S]*?class="save-progress-slot"[\s\S]*?class="save-label">저장/
  );
  assert.match(
    html,
    /id="editorSaveStatus"[^>]*class="visually-hidden"[^>]*aria-live="polite"/
  );
  assert.doesNotMatch(css, /#editorSaveBtn\.is-dirty::after/);
  assert.doesNotMatch(appSource, /editorSaveBtn\.classList\.toggle\("is-dirty"/);
  assert.doesNotMatch(appSource, /editorSaveBtn\.textContent\s*=/);
  assert.match(appSource, /editorSaveBtn\.toggleAttribute\("aria-busy", Boolean\(label\)\)/);
});
```

- [ ] **Step 2: Run the source-contract tests and verify failure**

Run:

```bash
node --test test/ppt-workspace-ui.test.js
```

Expected: FAIL because the header still says `되돌리기`, the dirty pseudo-element exists, and save progress replaces `textContent`.

- [ ] **Step 3: Implement fixed save markup and progress**

Change the header controls in `public/index.html` to:

```html
<button id="editorCancelBtn" type="button" class="ghost small">변경 취소</button>
<button id="editorDownloadBtn" type="button" class="ghost small icon-btn" title="PPTX 다운로드" aria-label="PPTX 다운로드">
  <!-- existing SVG unchanged -->
</button>
<button id="editorSaveBtn" type="button" class="cta small">
  <span class="save-progress-slot" aria-hidden="true"></span>
  <span class="save-label">저장</span>
</button>
<span id="editorSaveStatus" class="visually-hidden" aria-live="polite"></span>
```

Replace the dirty-dot CSS with a reserved spinner slot:

```css
#editorSaveBtn {
  min-width: 78px;
}

.save-progress-slot {
  width: 12px;
  height: 12px;
  border: 2px solid transparent;
  border-radius: 50%;
  flex: 0 0 12px;
}

#editorSaveBtn[aria-busy="true"] .save-progress-slot {
  border-color: color-mix(in srgb, currentColor 35%, transparent);
  border-top-color: currentColor;
  animation: save-progress-spin 700ms linear infinite;
}

@keyframes save-progress-spin {
  to { transform: rotate(360deg); }
}
```

Cache `editorSaveStatus` beside the other editor DOM references. Remove the `is-dirty` class toggle from `refreshSaveState()`. Add this save-only helper beside `showSaveButtonProgress()`:

```js
function showSaveProgress(label) {
  if (!editorSaveBtn) return () => {};
  editorSaveBtn.toggleAttribute("aria-busy", Boolean(label));
  if (editorSaveStatus) editorSaveStatus.textContent = label;
  return () => {
    editorSaveBtn.removeAttribute("aria-busy");
    if (editorSaveStatus) editorSaveStatus.textContent = "";
  };
}
```

Use `showSaveProgress("저장 중")` around `commitSlideCandidate()`. Keep duplicate-button progress on the existing helper for now; Task 2 removes its dependency on a changing button label.

- [ ] **Step 4: Add browser assertions for zero layout shift**

In the saved-types scenario, capture command positions before dirtying, after dirtying, and while a delayed save is in flight:

```js
const commandLefts = () =>
  page.locator("#editorCancelBtn, #editorDownloadBtn, #editorSaveBtn, #editorMoreBtn")
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));

const cleanPositions = await commandLefts();
await fillName(page, "레이아웃 고정");
assert.deepEqual(await commandLefts(), cleanPositions);
assert.equal(await page.locator("#editorSaveBtn .save-label").textContent(), "저장");
assert.equal(await page.locator("#editorSaveBtn").getAttribute("aria-busy"), null);
```

Use the existing `createGate()` and `onSlidePost` setup hook:

```js
const gate = createGate();
await setup(page, {
  onSlidePost: async () => {
    await gate.promise;
    return { status: 200, json: { success: true } };
  },
});
await selectMainSlide(page, 0);
const cleanPositions = await commandLefts();
await fillName(page, "레이아웃 고정");
assert.deepEqual(await commandLefts(), cleanPositions);

await page.locator("#editorSaveBtn").click();
await page.locator("#editorSaveBtn[aria-busy='true']").waitFor();
assert.equal(await page.locator("#editorSaveBtn .save-label").textContent(), "저장");
assert.deepEqual(await commandLefts(), cleanPositions);

gate.release();
await expectToastOnce(page, "슬라이드가 저장되었습니다");
assert.deepEqual(await commandLefts(), cleanPositions);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test test/ppt-workspace-ui.test.js test/save-state.test.js test/save-state-guards.test.js
npm run test:browser
```

Expected: PASS; the browser scenario observes identical command positions in clean, dirty, and saving states.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/styles.css public/app.js test/ppt-workspace-ui.test.js test/browser/save-flow.playwright.mjs
git commit -m "fix(ppt): stabilize slide save controls"
```

---

### Task 2: ID-addressed slide duplicate and delete commands

**Files:**
- Modify: `public/app.js:2683-2800, 7238-7286`
- Test: `test/slide-duplicate.test.js`
- Test: `test/ppt-workspace-ui.test.js`

**Interfaces:**
- Consumes: `slides`, `currentSlideId`, `slideDirty`, `isTemplateMode()`, `persistCurrentWorkspace()`, `removeTemplateSlideIds()`.
- Produces: `duplicateSlideById(sourceId: string, options?: { selectDuplicate?: boolean }): Promise<boolean>`, `deleteSlideById(slideId: string): Promise<boolean>`, `discardUnsavedSlide(slideId: string): void`.

- [ ] **Step 1: Write failing command-boundary tests**

Extend `test/slide-duplicate.test.js`:

```js
it("addresses duplicate by source id and makes selection explicit", () => {
  const body = functionBody(app, "duplicateSlideById");
  assert.match(body, /slides\.find\(\(entry\) => entry\.id === sourceId\)/);
  assert.match(body, /selectDuplicate/);
  assert.match(body, /if \(selectDuplicate\)\s*\{\s*applySlideSelection/);
  assert.match(
    functionBody(app, "duplicateCurrentSlide"),
    /duplicateSlideById\(currentSlideId,\s*\{\s*selectDuplicate:\s*true\s*\}\)/
  );
});
```

Extend `test/ppt-workspace-ui.test.js`:

```js
it("addresses deletion by slide id without forcing current selection", () => {
  assert.match(
    appSource,
    /async function deleteSlideById\(slideId\)[\s\S]*?slides\.find\(\(entry\) => entry\.id === slideId\)/
  );
  assert.match(appSource, /const deletesCurrent = slideId === currentSlideId/);
  assert.match(
    appSource,
    /const neighborId = deletesCurrent\s*\?\s*resolveAdjacentSlideId/
  );
  assert.match(
    appSource,
    /function deleteCurrentSlide\(\)\s*\{\s*return deleteSlideById\(currentSlideId\)/
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test test/slide-duplicate.test.js test/ppt-workspace-ui.test.js
```

Expected: FAIL because the ID-addressed commands do not exist.

- [ ] **Step 3: Refactor duplicate into an ID-addressed command**

Implement this boundary in `public/app.js`:

```js
function finishDuplicate(duplicate, { selectDuplicate }) {
  if (selectDuplicate) {
    applySlideSelection(duplicate.id);
  } else {
    renderSlideList();
  }
  showToast(`슬라이드를 복제했습니다: ${duplicate.name}`);
  return true;
}

async function duplicateSlideById(
  sourceId,
  { selectDuplicate = false } = {}
) {
  if (duplicateInProgress || !sourceId || blockedBySaveInProgress()) return false;
  const duplicatesCurrent = sourceId === currentSlideId;
  if (!duplicatesCurrent && slideDirty) {
    alert("현재 슬라이드의 변경사항을 먼저 저장하거나 변경 취소해 주세요.");
    return false;
  }

  duplicateInProgress = true;
  refreshSaveState();
  try {
    if (duplicatesCurrent && !(await ensureNoPendingChanges())) return false;
    if (blockedBySaveInProgress()) return false;

    const source = slides.find((entry) => entry.id === sourceId);
    const draft = duplicatesCurrent ? collectCurrentSlideDraft() : cloneSlide(source);
    if (!draft) return false;

    if (
      draft.pendingFile ||
      draft.pendingBackgroundFile ||
      draft.pendingScriptureImage
    ) {
      alert("선택한 파일을 먼저 저장한 뒤 복제해 주세요.");
      return false;
    }

    structureSaving = true;
    refreshSaveState();
    duplicateSlideBtn?.toggleAttribute("aria-busy", true);

    if (isTemplateMode()) {
      const payload = await requestTemplateWrite(
        activeTemplateId,
        `/slides/${encodeURIComponent(sourceId)}/duplicate`,
        { method: "POST" }
      );
      applyTemplateFromServer(payload.template);
      return finishDuplicate(cloneSlide(payload.slide), { selectDuplicate });
    }

    let duplicate;
    if (hasOwnedSlideAsset(draft)) {
      const response = await fetch("/api/slides/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: buildSerializableSlide(draft) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "슬라이드 복제에 실패했습니다.");
      }
      duplicate = cloneSlide(payload);
    } else {
      duplicate = cloneSlide(draft, { regenerateId: true });
    }

    duplicate.name = createDuplicateSlideName(
      draft.name,
      slides.map((slide) => slide.name)
    );
    const nextSlides = insertSlideAfter(slides, sourceId, duplicate);
    if (nextSlides.length === slides.length) return false;

    if (isSlideUnsaved(draft)) {
      slides = nextSlides;
      syncWorkingSlidesToState();
    } else {
      const persisted = await persistCurrentWorkspace(nextSlides);
      if (!persisted) {
        throw new Error("슬라이드 복제본을 저장하지 못했습니다.");
      }
      slides = nextSlides;
    }

    return finishDuplicate(duplicate, { selectDuplicate });
  } catch (error) {
    console.error("Failed to duplicate slide", error);
    alert(error.message || "슬라이드 복제 중 오류가 발생했습니다.");
    return false;
  } finally {
    duplicateSlideBtn?.removeAttribute("aria-busy");
    structureSaving = false;
    duplicateInProgress = false;
    refreshSaveState();
  }
}

function duplicateCurrentSlide() {
  return duplicateSlideById(currentSlideId, { selectDuplicate: true });
}
```

Delete the old `announceDuplicate()` helper and the old `duplicateCurrentSlide()` body after this replacement, so only one persistence implementation remains. Delete `showSaveButtonProgress()` as well: Task 1 moved save feedback to `showSaveProgress()`, and the duplicate command now uses `aria-busy` without changing its visible label.

- [ ] **Step 4: Refactor delete into an ID-addressed command**

Implement:

```js
async function deleteSlideById(slideId) {
  if (!slideId || blockedBySaveInProgress()) return false;
  const slide = slides.find((entry) => entry.id === slideId);
  if (!slide) return false;
  const deletesCurrent = slideId === currentSlideId;
  if (!deletesCurrent && slideDirty) {
    alert("현재 슬라이드의 변경사항을 먼저 저장하거나 변경 취소해 주세요.");
    return false;
  }

  const neighborId = deletesCurrent ? resolveAdjacentSlideId(slides, slideId) : null;
  if (!isSlideUnsaved(slide) && !confirm("정말 이 슬라이드를 삭제하시겠습니까?")) {
    return false;
  }

  if (isSlideUnsaved(slide)) {
    slides = slides.filter((entry) => entry.id !== slideId);
    syncWorkingSlidesToState();
  } else if (isTemplateMode()) {
    await removeTemplateSlideIds([slideId]);
  } else {
    const response = await fetch(`/api/slides/${slideId}`, { method: "DELETE" });
    if (!response.ok) throw new Error("슬라이드 삭제에 실패했습니다.");
    slides = slides.filter((entry) => entry.id !== slideId);
    mainSlides = slides.map(cloneSlide);
  }

  if (deletesCurrent) {
    if (neighborId) applySlideSelection(neighborId);
    else resetEditorSelection();
  } else {
    renderSlideList();
  }
  return true;
}

function deleteCurrentSlide() {
  return deleteSlideById(currentSlideId);
}
```

Retain a single `discardUnsavedSlide(slideId)` helper if it is still shared, but make it preserve selection when `slideId !== currentSlideId`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test test/slide-duplicate.test.js test/ppt-workspace-ui.test.js test/save-state-guards.test.js
```

Expected: PASS; current-slide wrappers delegate to ID-addressed commands and non-current commands do not select their targets.

- [ ] **Step 6: Commit**

```bash
git add public/app.js test/slide-duplicate.test.js test/ppt-workspace-ui.test.js
git commit -m "refactor(ppt): address slide actions by id"
```

---

### Task 3: Header overflow duplicate action

**Files:**
- Modify: `public/index.html:446-462`
- Modify: `public/app.js:779-791, 7213-7222`
- Test: `test/ppt-workspace-ui.test.js:826-845`
- Test: `test/browser/save-flow.playwright.mjs:805-814`

**Interfaces:**
- Consumes: `duplicateCurrentSlide(): Promise<boolean>`, existing editor overflow lifecycle.
- Produces: `#editorDuplicateBtn`.

- [ ] **Step 1: Write a failing menu-order test**

Replace the existing overflow assertion with:

```js
it("puts duplicate, reset, and delete in editor overflow order", () => {
  assert.match(
    html,
    /id="editorMoreMenu"[\s\S]*?id="editorDuplicateBtn"[\s\S]*?id="editorResetBtn"[\s\S]*?id="editorDeleteBtn"/
  );
  assert.match(
    appSource,
    /editorDuplicateBtn\.addEventListener\("click",[\s\S]*?duplicateCurrentSlide/
  );
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
node --test test/ppt-workspace-ui.test.js
```

Expected: FAIL because `editorDuplicateBtn` is absent.

- [ ] **Step 3: Add the header-menu action**

Insert before reset in `#editorMoreMenu`:

```html
<button id="editorDuplicateBtn" type="button" class="bulk-dropdown-item" role="menuitem">
  슬라이드 복제
</button>
```

Cache the element and wire it:

```js
editorDuplicateBtn.addEventListener("click", () => {
  closeEditorMoreMenu();
  duplicateCurrentSlide();
});
```

In `refreshSaveState()`, disable both duplicate controls from the same condition:

```js
const duplicateDisabled =
  !draft || duplicateInProgress || isSaveBusy(getSaveState());
duplicateSlideBtn.disabled = duplicateDisabled;
editorDuplicateBtn.disabled = duplicateDisabled;
```

- [ ] **Step 4: Add a browser flow**

Use `clickEditorMenuItem(page, "#editorDuplicateBtn")`, then assert:

```js
assert.equal(state.counts.slidePost, 1);
await page.locator("#slideListContainer .slide-card").nth(1).waitFor();
assert.equal(
  await page.locator("#slideListContainer .slide-card.active h4").textContent(),
  "첫 슬라이드 복사"
);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test test/ppt-workspace-ui.test.js test/slide-duplicate.test.js
npm run test:browser
```

Expected: PASS; header overflow duplicate selects the inserted copy.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.js test/ppt-workspace-ui.test.js test/browser/save-flow.playwright.mjs
git commit -m "feat(ppt): add duplicate to editor menu"
```

---

### Task 4: Contextual slide-card overflow menu

**Files:**
- Modify: `public/app.js:5767-5910, 7340-7379`
- Modify: `public/styles.css:2255-2386`
- Test: `test/ppt-workspace-ui.test.js`
- Test: `test/browser/save-flow.playwright.mjs`

**Interfaces:**
- Consumes: `duplicateSlideById(sourceId, { selectDuplicate: false })`, `deleteSlideById(slideId)`.
- Produces: `closeSlideCardMenu({ restoreFocus?: boolean }): void`, one `.slide-card-more-btn` and `.slide-card-menu` per rendered card.

- [ ] **Step 1: Write failing source-contract tests**

Add:

```js
it("renders an accessible per-card duplicate and delete menu", () => {
  assert.match(appSource, /function renderSlideList\(\)[\s\S]*slide-card-more-btn/);
  assert.match(appSource, /`\$\{slide\.name\} 작업 메뉴`/);
  assert.match(appSource, /duplicateSlideById\(slide\.id,\s*\{\s*selectDuplicate:\s*false\s*\}\)/);
  assert.match(appSource, /deleteSlideById\(slide\.id\)/);
  assert.match(appSource, /event\.stopPropagation\(\)/);
  assert.match(appSource, /card\.draggable = false/);
});

it("closes card menus on outside click and Escape", () => {
  assert.match(appSource, /function closeSlideCardMenu\(/);
  assert.match(appSource, /if \(openSlideCardMenu[\s\S]*closeSlideCardMenu/);
  assert.match(appSource, /e\.key !== "Escape"[\s\S]*closeSlideCardMenu/);
});
```

- [ ] **Step 2: Run the source-contract tests and verify failure**

Run:

```bash
node --test test/ppt-workspace-ui.test.js
```

Expected: FAIL because card menus are not rendered.

- [ ] **Step 3: Implement one-open-menu state and lifecycle**

Add:

```js
let openSlideCardMenu = null;

function closeSlideCardMenu({ restoreFocus = false } = {}) {
  if (!openSlideCardMenu) return;
  const { button, menu, card } = openSlideCardMenu;
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
  card.draggable = true;
  openSlideCardMenu = null;
  if (restoreFocus) button.focus();
}
```

Call `closeSlideCardMenu()` before clearing `slideListContainer` in `renderSlideList()`, from the existing document outside-click handler, and from the Escape handler with `{ restoreFocus: true }`.

- [ ] **Step 4: Render and wire each card menu**

Inside `renderSlideList()`, append this structure to each card:

```js
const more = document.createElement("button");
more.type = "button";
more.className = "slide-card-more-btn";
more.setAttribute("aria-label", `${slide.name} 작업 메뉴`);
more.setAttribute("aria-haspopup", "menu");
more.setAttribute("aria-expanded", "false");
more.textContent = "⋯";

const menu = document.createElement("div");
menu.className = "slide-card-menu bulk-dropdown";
menu.hidden = true;
menu.setAttribute("role", "menu");

const duplicate = document.createElement("button");
duplicate.type = "button";
duplicate.className = "bulk-dropdown-item";
duplicate.setAttribute("role", "menuitem");
duplicate.textContent = "복제";

const remove = document.createElement("button");
remove.type = "button";
remove.className = "bulk-dropdown-item danger";
remove.setAttribute("role", "menuitem");
remove.textContent = "삭제";
```

Every menu/button listener starts with `event.stopPropagation()`. Opening closes the prior menu, sets `card.draggable = false`, and records `{ button: more, menu, card }`. Duplicate closes the menu and calls:

```js
await duplicateSlideById(slide.id, { selectDuplicate: false });
```

Delete closes the menu and calls:

```js
await deleteSlideById(slide.id);
```

- [ ] **Step 5: Add card-menu CSS**

Add:

```css
.slide-card {
  position: relative;
}

.slide-card-header {
  padding-right: 28px;
}

.slide-card-more-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
}

.slide-card-menu {
  position: absolute;
  top: 38px;
  right: 8px;
  z-index: 8;
}

@media (hover: hover) {
  .slide-card-more-btn {
    opacity: 0.62;
  }
  .slide-card:hover .slide-card-more-btn,
  .slide-card:focus-within .slide-card-more-btn,
  .slide-card-more-btn[aria-expanded="true"] {
    opacity: 1;
  }
}
```

Do not hide the button with `display:none` or `visibility:hidden`; it must remain keyboard reachable and always present on touch.

- [ ] **Step 6: Add browser flows for target and selection behavior**

Add one scenario that selects card 0, opens card 1's menu, duplicates card 1, and asserts:

```js
assert.equal(
  await page.locator("#slideListContainer .slide-card.active").getAttribute("data-slide-id"),
  originalCurrentId
);
assert.equal(
  await page.locator("#slideListContainer .slide-card").nth(2).locator("h4").textContent(),
  "두 번째 슬라이드 복사"
);
```

Then delete the non-current copy through its card menu, accept the confirmation, and assert the active card ID remains `originalCurrentId`. Add a second assertion that clicking a card menu button does not select that card and Escape restores focus to the menu button.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test test/ppt-workspace-ui.test.js test/slide-duplicate.test.js
npm run test:browser
```

Expected: PASS for mouse, keyboard Escape, target-card duplicate/delete, and selection preservation.

- [ ] **Step 8: Commit**

```bash
git add public/app.js public/styles.css test/ppt-workspace-ui.test.js test/browser/save-flow.playwright.mjs
git commit -m "feat(ppt): add slide card action menus"
```

---

### Task 5: Full regression verification

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified integrated slide-control flow.

- [ ] **Step 1: Run the complete unit suite**

Run:

```bash
npm test
```

Expected: all Node tests pass.

- [ ] **Step 2: Run the complete browser suite**

Run:

```bash
npm run test:browser
```

Expected: all Playwright scenarios pass.

- [ ] **Step 3: Build production assets**

Run:

```bash
npm run build
```

Expected: Vite exits successfully with production assets generated.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only user-owned pre-existing changes and any intentional implementation files remain.

- [ ] **Step 5: Commit verification-only fixes if required**

If verification required a code correction, stage only files from this plan and commit:

```bash
git add public/index.html public/styles.css public/app.js test/ppt-workspace-ui.test.js test/slide-duplicate.test.js test/browser/save-flow.playwright.mjs
git commit -m "test(ppt): verify slide control menu flows"
```

If no correction was required, do not create an empty commit.
