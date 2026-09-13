# PPT Generator Save State and Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 미저장 변경이 있을 때만 슬라이드·템플릿 저장 버튼을 활성화하고, 모든 이탈 경로에서 단일 저장 확인 팝업과 일관된 성공·실패 처리를 제공한다.

**Architecture:** DOM과 무관한 스냅샷 비교·버튼 상태·저장 순서 결정은 `lib/save-state.js`의 순수 함수로 분리한다. `public/app.js`는 저장 모델과 편집 초안을 분리하고 순수 함수의 결과로 UI를 갱신하며, 모든 화면 이동은 하나의 비동기 이동 가드를 통과한다.

**Tech Stack:** Node.js ESM, `node:test`, Vanilla JavaScript, HTML `<dialog>`, CSS

## Global Constraints

- 템플릿 편집은 `슬라이드 저장 → 템플릿 저장`의 2단계를 유지한다.
- 실제 변경을 원래 저장값으로 되돌리면 저장 버튼은 다시 비활성화되어야 한다.
- 일반 슬라이드 목록의 기존 순서 변경 즉시 저장 동작은 유지한다.
- 서버 성공 응답 전에는 저장 기준과 `saved` 표시를 변경하지 않는다.
- 저장 실패 시 초안과 선택한 파일을 유지하고 이동하지 않는다.
- 기존 사용자 변경인 `data/templates.json`은 수정하거나 커밋하지 않는다.

---

### Task 1: 저장 상태 순수 함수

**Files:**
- Create: `lib/save-state.js`
- Create: `test/save-state.test.js`

**Interfaces:**
- Produces: `createSnapshot(value): string`
- Produces: `isSnapshotDirty(value, baselineSnapshot): boolean`
- Produces: `deriveSaveButtonState(input): { slideDisabled: boolean, templateDisabled: boolean }`
- Produces: `getPendingChangeScopes(input): string[]`
- Produces: `getSaveSequence(input): string[]`

- [ ] **Step 1: 스냅샷 비교 실패 테스트 작성**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSnapshot,
  isSnapshotDirty,
} from "../lib/save-state.js";

describe("save state snapshots", () => {
  it("ignores object key insertion order", () => {
    assert.equal(
      createSnapshot({ name: "예배", settings: { size: 40, align: "center" } }),
      createSnapshot({ settings: { align: "center", size: 40 }, name: "예배" })
    );
  });

  it("becomes clean when a changed value returns to the baseline", () => {
    const baseline = createSnapshot({ name: "원본", size: 40 });
    assert.equal(isSnapshotDirty({ name: "수정", size: 40 }, baseline), true);
    assert.equal(isSnapshotDirty({ name: "원본", size: 40 }, baseline), false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/save-state.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/save-state.js`.

- [ ] **Step 3: 안정적인 직렬화 최소 구현**

```js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = normalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

export function createSnapshot(value) {
  return JSON.stringify(normalize(value));
}

export function isSnapshotDirty(value, baselineSnapshot) {
  return createSnapshot(value) !== baselineSnapshot;
}
```

- [ ] **Step 4: 버튼·이탈 범위·저장 순서 실패 테스트 추가**

```js
import {
  deriveSaveButtonState,
  getPendingChangeScopes,
  getSaveSequence,
} from "../lib/save-state.js";

it("enables only the button that has pending work", () => {
  assert.deepEqual(
    deriveSaveButtonState({
      hasSlide: true,
      hasTemplate: true,
      slideDirty: true,
      templateDirty: false,
      slideSaving: false,
      templateSaving: false,
    }),
    { slideDisabled: false, templateDisabled: true }
  );
});

it("disables both buttons while either save is running", () => {
  assert.deepEqual(
    deriveSaveButtonState({
      hasSlide: true,
      hasTemplate: true,
      slideDirty: true,
      templateDirty: true,
      slideSaving: true,
      templateSaving: false,
    }),
    { slideDisabled: true, templateDisabled: true }
  );
});

it("reports both dirty scopes once and saves slide before template", () => {
  const input = { slideDirty: true, templateDirty: true };
  assert.deepEqual(getPendingChangeScopes(input), ["slide", "template"]);
  assert.deepEqual(getSaveSequence(input), ["slide", "template"]);
});
```

- [ ] **Step 5: 상태 결정 함수 구현**

```js
export function deriveSaveButtonState({
  hasSlide,
  hasTemplate,
  slideDirty,
  templateDirty,
  slideSaving,
  templateSaving,
}) {
  const busy = slideSaving || templateSaving;
  return {
    slideDisabled: !hasSlide || !slideDirty || busy,
    templateDisabled: !hasTemplate || !templateDirty || busy,
  };
}

export function getPendingChangeScopes({ slideDirty, templateDirty }) {
  return [
    ...(slideDirty ? ["slide"] : []),
    ...(templateDirty ? ["template"] : []),
  ];
}

export function getSaveSequence(input) {
  return getPendingChangeScopes(input);
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test test/save-state.test.js`

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add lib/save-state.js test/save-state.test.js
git commit -m "test: add deterministic save state model"
```

---

### Task 2: 슬라이드 초안과 저장 버튼 연결

**Files:**
- Modify: `public/index.html:1102`
- Modify: `public/app.js:838-968, 1271-1666, 1948-1985, 2648-2780, 3553-3573, 3741-4019, 4629-4887`
- Test: `test/save-state.test.js`

**Interfaces:**
- Consumes: Task 1의 `createSnapshot`, `isSnapshotDirty`, `deriveSaveButtonState`
- Produces: `toFileMetadata(file): { name: string, size: number, lastModified: number } | null`
- Produces: `collectCurrentSlideDraft(): object | null`
- Produces: `refreshSaveState(): void`
- Produces: `commitSlideCandidate(candidate, options): Promise<boolean>`

- [ ] **Step 1: 브라우저에서 사용하는 정적 모듈 경로 테스트 추가**

```js
import { toFileMetadata } from "../lib/save-state.js";

it("keeps transient file metadata stable for dirty comparison", () => {
  assert.deepEqual(toFileMetadata({
    name: "wide.pptx",
    size: 10,
    lastModified: 1,
    path: "ignored browser detail",
  }), {
    name: "wide.pptx",
    size: 10,
    lastModified: 1,
  });
  assert.equal(toFileMetadata(null), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/save-state.test.js`

Expected: FAIL because `toFileMetadata` is not exported.

- [ ] **Step 3: 파일 메타데이터 정규화 구현**

`lib/save-state.js`:

```js
export function toFileMetadata(file) {
  return file
    ? {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      }
    : null;
}
```

- [ ] **Step 4: 앱 스크립트를 ESM으로 전환하고 상태 함수 import**

`public/index.html`:

```html
<script type="module" src="/app.js"></script>
```

`public/app.js` 첫 줄:

```js
import {
  createSnapshot,
  deriveSaveButtonState,
  isSnapshotDirty,
  toFileMetadata,
} from "/lib/save-state.js";
```

- [ ] **Step 5: 편집 기준과 런타임 초안 상태 추가**

```js
let slideBaselineSnapshot = null;
let slideRuntimeDraft = {};
let slideDirty = false;
let slideSaving = false;
let templateSaving = false;
```

- [ ] **Step 6: 폼 전체를 저장 후보로 수집하는 함수 구현**

`collectCurrentSlideDraft()`는 현재 저장 모델을 `cloneSlide`한 뒤 슬라이드 타입별 폼 값을 적용한다. 공통으로 `name`, `type`, `sourceType`을 포함하고, 기존 `saveCurrentSlide()`가 읽는 모든 필드와 `slideRuntimeDraft`의 `serverFilePath`, `fileName`, `thumbnail`, `customImageData`, `adBgImagePath`를 포함한다.

```js
function collectCurrentSlideDraft() {
  const savedSlide = slides.find((slide) => slide.id === currentSlideId);
  if (!savedSlide) return null;

  const draft = { ...cloneSlide(savedSlide), ...slideRuntimeDraft };
  draft.name = slideNameInput.value.trim();
  draft.type = slideTypeSelect.value;

  if (draft.type === "scripture") Object.assign(draft, collectScriptureSlideFields());
  if (draft.type === "title") Object.assign(draft, collectTitleSlideData());
  if (draft.type === "custom-title") Object.assign(draft, collectCustomTitleSlideData());
  if (draft.type === "hymn") {
    draft.hymnNumber = hymnNumberInput.value;
    draft.includeTitle = hymnIncludeTitle.checked;
    draft.hymnKorTitle = hymnKorTitleInput.value.trim();
    draft.hymnEngTitle = hymnEngTitleInput.value.trim();
  }

  draft.pendingFile = toFileMetadata(userPptxFile?.files?.[0]);
  draft.pendingBackgroundFile = toFileMetadata(adBgImageFile?.files?.[0]);
  draft.pendingScriptureImage = toFileMetadata(scripturePptxImageInput?.files?.[0]);
  return draft;
}
```

단순·광고 타입에는 기존 저장 함수가 읽는 `content`, `font`, `fontSize`, `align`, `bg`, `adTitle`, `adTitleSize`, `adTitleAlign`, `adBgSource`, `adBgImageUrl`, `adBgOpacity` 할당을 같은 함수 안에 추가한다.

- [ ] **Step 7: 중앙 상태 갱신과 버튼 비활성 연결**

```js
function refreshSaveState() {
  const draft = collectCurrentSlideDraft();
  slideDirty = Boolean(
    draft &&
      (slideBaselineSnapshot === null ||
        isSnapshotDirty(draft, slideBaselineSnapshot))
  );

  const state = deriveSaveButtonState({
    hasSlide: Boolean(draft),
    hasTemplate: Boolean(getActiveTemplate()),
    slideDirty,
    templateDirty: hasPendingTemplateChanges,
    slideSaving,
    templateSaving,
  });
  editorSaveBtn.disabled = state.slideDisabled;
  templateSaveBtn.disabled = state.templateDisabled;
}
```

`selectSlide()`에서 폼을 채우고 `slideRuntimeDraft = {}`로 초기화한 다음 `slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft())`를 기록한다. 새 슬라이드는 `slideBaselineSnapshot = null`로 유지한다. `resetEditorSelection()`은 기준과 런타임 초안을 모두 비운다.

- [ ] **Step 8: 모든 편집 이벤트를 중앙 함수로 연결**

기존 `hasUnsavedChanges = true`만 수행하는 입력·change·토글 핸들러는 미리보기 갱신 후 `refreshSaveState()`를 호출한다. `setBgValue`, `setAlignValue`, 자동 이름 변경, 파일 선택·제거, 찬송가 제목 자동 입력도 동일하게 처리한다. 기존 `hasUnsavedChanges`는 전환 기간 동안 `slideDirty`의 별칭으로만 읽고 직접 쓰는 코드를 제거한다.

- [ ] **Step 9: 저장을 후보 객체 기반 트랜잭션으로 변경**

`saveCurrentSlide()`은 원본 `slide`를 직접 수정하지 않고 `candidate = collectCurrentSlideDraft()`를 만든다. 업로드·찬송가 다운로드·성경 생성 결과도 candidate에만 적용한다.

```js
async function commitSlideCandidate(candidate) {
  const index = slides.findIndex((slide) => slide.id === candidate.id);
  if (index === -1) return false;

  candidate.saved = true;
  const nextSlides = slides.map((slide, i) =>
    i === index ? cloneSlide(candidate) : cloneSlide(slide)
  );

  if (!isTemplateMode()) {
    const resp = await fetch("/api/slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextSlides.map(buildSerializableSlide)),
    });
    if (!resp.ok) return false;
  }

  slides = nextSlides;
  if (isTemplateMode()) markTemplateDirty();
  else mainSlides = nextSlides.map(cloneSlide);
  return true;
}
```

성공한 뒤에만 `populateEditor(candidate)`, `slideRuntimeDraft = {}`, `slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft())`, `refreshSaveState()`를 수행한다. 실패 시 기준을 바꾸지 않는다.

- [ ] **Step 10: 테스트와 구문 확인**

Run: `npm test`

Expected: all tests PASS.

Run: `node --check public/app.js`

Expected: exit code 0.

- [ ] **Step 11: 커밋**

```bash
git add lib/save-state.js public/index.html public/app.js test/save-state.test.js
git commit -m "feat: activate slide save only for real changes"
```

---

### Task 3: 템플릿 2단계 저장 스냅샷

**Files:**
- Modify: `lib/save-state.js`
- Modify: `public/app.js:838-1078, 1730-1764, 1796-1809, 1885-1914, 4321-4526`
- Test: `test/save-state.test.js`

**Interfaces:**
- Consumes: Task 1의 `createSnapshot`, `isSnapshotDirty`, `deriveSaveButtonState`
- Produces: `isTemplateDirty(templateDraft, baselineSnapshot): boolean`
- Produces: `collectActiveTemplateDraft(): object | null`
- Produces: `captureTemplateBaseline(): void`
- Produces: `refreshTemplateDirtyState(): void`

- [ ] **Step 1: 배열 순서와 이름 변경 감지 테스트 추가**

```js
import { isTemplateDirty } from "../lib/save-state.js";

it("detects template name and slide order changes", () => {
  const baseline = createSnapshot({
    name: "주일",
    slides: [{ id: "1" }, { id: "2" }],
  });
  assert.equal(
    isTemplateDirty(
      { name: "주일 예배", slides: [{ id: "1" }, { id: "2" }] },
      baseline
    ),
    true
  );
  assert.equal(
    isTemplateDirty(
      { name: "주일", slides: [{ id: "2" }, { id: "1" }] },
      baseline
    ),
    true
  );
});
```

- [ ] **Step 2: 테스트 실행**

Run: `node --test test/save-state.test.js`

Expected: FAIL because `isTemplateDirty` is not exported.

- [ ] **Step 3: 템플릿 비교 함수 구현**

`lib/save-state.js`:

```js
export function isTemplateDirty(templateDraft, baselineSnapshot) {
  return isSnapshotDirty(templateDraft, baselineSnapshot);
}
```

- [ ] **Step 4: 템플릿 기준 스냅샷 구현**

```js
let templateBaselineSnapshot = null;

function collectActiveTemplateDraft() {
  const template = getActiveTemplate();
  return template
    ? {
        id: template.id,
        name: template.name,
        slides: slides.map(buildSerializableSlide),
      }
    : null;
}

function captureTemplateBaseline() {
  const draft = collectActiveTemplateDraft();
  templateBaselineSnapshot = draft ? createSnapshot(draft) : null;
}

function refreshTemplateDirtyState() {
  const draft = collectActiveTemplateDraft();
  hasPendingTemplateChanges = Boolean(
    draft &&
      templateBaselineSnapshot &&
      isTemplateDirty(draft, templateBaselineSnapshot)
  );
  refreshSaveState();
}
```

- [ ] **Step 5: 템플릿 변경 지점 연결**

`openTemplateWorkspace()`와 템플릿 서버 저장 성공 시 `captureTemplateBaseline()`을 호출한다. `markTemplateDirty()`는 boolean을 강제로 참으로 만들지 않고 작업본 동기화 후 `refreshTemplateDirtyState()`를 호출한다. 이름 변경, 순서 변경, 추가, 삭제, 슬라이드 1단계 저장이 모두 이 경로를 사용한다.

- [ ] **Step 6: 템플릿 저장 진행·실패 상태 처리**

```js
async function saveActiveTemplateToServer({ silent = false } = {}) {
  if (!getActiveTemplate() || !hasPendingTemplateChanges || templateSaving) {
    return !hasPendingTemplateChanges;
  }
  templateSaving = true;
  refreshSaveState();
  try {
    // existing PUT request
    captureTemplateBaseline();
    refreshTemplateDirtyState();
    if (!silent) showToast("템플릿이 저장되었습니다");
    return true;
  } catch (error) {
    showSaveError(error.message || "템플릿 저장에 실패했습니다.");
    return false;
  } finally {
    templateSaving = false;
    refreshSaveState();
  }
}
```

- [ ] **Step 7: 1단계와 2단계 알림 문구 분리**

일반 슬라이드 서버 저장 성공은 `슬라이드가 저장되었습니다`, 템플릿 내부 슬라이드 반영은 `슬라이드 변경사항이 반영되었습니다 · 템플릿 저장 필요`, 템플릿 PUT 성공은 `템플릿이 저장되었습니다`를 사용한다. 기존 `alert("저장되었습니다.")`를 제거한다.

- [ ] **Step 8: 전체 테스트와 구문 확인**

Run: `npm test`

Expected: all tests PASS.

Run: `node --check public/app.js`

Expected: exit code 0.

- [ ] **Step 9: 커밋**

```bash
git add lib/save-state.js public/app.js test/save-state.test.js
git commit -m "feat: track two-stage template save state"
```

---

### Task 4: 단일 이탈 팝업과 비차단 알림

**Files:**
- Modify: `lib/save-state.js`
- Modify: `public/index.html:941-1080`
- Modify: `public/styles.css:610-670`
- Modify: `public/app.js:921-1078, 1669-1707, 2648-2687, 4011-4019, 4568-4627`
- Test: `test/save-state.test.js`

**Interfaces:**
- Consumes: Task 1의 `getPendingChangeScopes`, `getSaveSequence`
- Produces: `getUnsavedChangesMessage(scopes): string`
- Produces: `showUnsavedChangesDialog(scopes): Promise<"save" | "discard" | "cancel">`
- Produces: `guardTransition(transition): Promise<boolean>`
- Produces: `discardPendingChanges(): Promise<void>`
- Produces: `showToast(message): void`

- [ ] **Step 1: 이탈 저장 순서와 빈 상태 테스트 보강**

```js
import { getUnsavedChangesMessage } from "../lib/save-state.js";

it("does not request a popup or save when nothing is dirty", () => {
  assert.deepEqual(
    getPendingChangeScopes({ slideDirty: false, templateDirty: false }),
    []
  );
  assert.deepEqual(
    getSaveSequence({ slideDirty: false, templateDirty: false }),
    []
  );
});

it("requests only template save after the slide draft was committed", () => {
  assert.deepEqual(
    getSaveSequence({ slideDirty: false, templateDirty: true }),
    ["template"]
  );
});

it("summarizes both dirty scopes in one popup message", () => {
  assert.equal(
    getUnsavedChangesMessage(["slide", "template"]),
    "슬라이드 편집과 템플릿 변경사항이 있습니다."
  );
});
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `node --test test/save-state.test.js`

Expected: FAIL because `getUnsavedChangesMessage` is not exported.

- [ ] **Step 3: 팝업 문구 결정 함수 구현**

`lib/save-state.js`:

```js
export function getUnsavedChangesMessage(scopes) {
  if (scopes.includes("slide") && scopes.includes("template")) {
    return "슬라이드 편집과 템플릿 변경사항이 있습니다.";
  }
  return scopes.includes("template")
    ? "템플릿에 저장하지 않은 변경사항이 있습니다."
    : "슬라이드에 저장하지 않은 변경사항이 있습니다.";
}
```

- [ ] **Step 4: HTML 팝업과 토스트 영역 추가**

```html
<dialog id="unsavedChangesModal" class="modal-dialog">
  <div class="modal-card">
    <div class="modal-header">
      <div>
        <h3>저장하지 않은 변경사항</h3>
        <p id="unsavedChangesMessage"></p>
      </div>
    </div>
    <div class="modal-actions modal-actions-three">
      <button type="button" id="unsavedCancelBtn" class="ghost">계속 편집</button>
      <button type="button" id="unsavedDiscardBtn" class="ghost danger">저장하지 않고 이동</button>
      <button type="button" id="unsavedSaveBtn" class="cta">저장 후 이동</button>
    </div>
  </div>
</dialog>
<div id="appToastRegion" class="toast-region" aria-live="polite"></div>
```

- [ ] **Step 5: 팝업 Promise와 토스트 구현**

```js
function showUnsavedChangesDialog(scopes) {
  unsavedChangesMessage.textContent = getUnsavedChangesMessage(scopes);

  return new Promise((resolve) => {
    const finish = (choice) => {
      unsavedChangesModal.close();
      resolve(choice);
    };
    unsavedSaveBtn.onclick = () => finish("save");
    unsavedDiscardBtn.onclick = () => finish("discard");
    unsavedCancelBtn.onclick = () => finish("cancel");
    unsavedChangesModal.oncancel = (event) => {
      event.preventDefault();
      finish("cancel");
    };
    unsavedChangesModal.showModal();
  });
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "app-toast";
  toast.textContent = message;
  appToastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}
```

- [ ] **Step 6: 저장·폐기·취소를 처리하는 단일 이동 가드 구현**

```js
async function guardTransition(transition) {
  const scopes = getPendingChangeScopes({
    slideDirty,
    templateDirty: hasPendingTemplateChanges,
  });
  if (scopes.length === 0) {
    await transition();
    return true;
  }

  const choice = await showUnsavedChangesDialog(scopes);
  if (choice === "cancel") return false;
  if (choice === "discard") {
    await discardPendingChanges();
    await transition();
    return true;
  }

  for (const scope of getSaveSequence({
    slideDirty,
    templateDirty: hasPendingTemplateChanges,
  })) {
    const saved =
      scope === "slide"
        ? await saveCurrentSlide({ silent: true })
        : await saveActiveTemplateToServer({ silent: true });
    if (!saved) return false;
  }
  await transition();
  return true;
}
```

- [ ] **Step 7: 폐기 시 정확한 기준 복원**

새 슬라이드는 `slides`에서 제거한다. 기존 슬라이드는 저장 모델을 다시 `populateEditor()`해 편집 초안을 버린다. 템플릿 dirty가 있으면 보존한 템플릿 기준 객체 또는 `loadTemplatesFromServer()`로 작업본을 복원한다. 복원 후 모든 기준 스냅샷과 버튼 상태를 다시 계산한다.

```js
async function discardPendingChanges() {
  const current = slides.find((slide) => slide.id === currentSlideId);
  if (slideDirty && current?.saved === false) {
    slides = slides.filter((slide) => slide.id !== currentSlideId);
    resetEditorSelection();
  } else if (slideDirty && current) {
    slideRuntimeDraft = {};
    populateEditor(current);
    slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft());
    slideDirty = false;
  }

  if (isTemplateMode() && hasPendingTemplateChanges) {
    const templateId = activeTemplateId;
    await loadTemplatesFromServer();
    const restored = templates.find((template) => template.id === templateId);
    if (restored) loadWorkspaceSlides(restored.slides);
    activeTemplateId = restored ? templateId : null;
    captureTemplateBaseline();
    refreshTemplateDirtyState();
  }
  refreshSaveState();
}
```

- [ ] **Step 8: 모든 내부 이동을 가드로 통합**

`selectSlide`, `setPptTab`, `openTemplateWorkspace`, `closeTemplateWorkspace`, `switchView`, `cancelEdit`의 기존 개별 `confirm()`을 제거하고 목적지 변경 부분을 `guardTransition(async () => { ... })`에 전달한다. 같은 슬라이드 재선택과 같은 화면 재선택은 즉시 반환한다. 템플릿 저장과 슬라이드 저장이 함께 필요한 경우 팝업은 한 번만 표시된다.

- [ ] **Step 9: 브라우저 종료 경고 연결**

```js
window.addEventListener("beforeunload", (event) => {
  if (!slideDirty && !hasPendingTemplateChanges) return;
  event.preventDefault();
  event.returnValue = "";
});
```

- [ ] **Step 10: 팝업·토스트 스타일 추가**

```css
.modal-actions-three {
  flex-wrap: wrap;
}

.toast-region {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1000;
  display: grid;
  gap: 8px;
  pointer-events: none;
}

.app-toast {
  max-width: min(420px, calc(100vw - 40px));
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--ink);
  box-shadow: var(--shadow);
}
```

- [ ] **Step 11: 테스트와 구문 확인**

Run: `npm test`

Expected: all tests PASS.

Run: `node --check public/app.js`

Expected: exit code 0.

- [ ] **Step 12: 커밋**

```bash
git add lib/save-state.js public/index.html public/styles.css public/app.js test/save-state.test.js
git commit -m "feat: unify unsaved changes popup flow"
```

---

### Task 5: 실패 경로 및 회귀 검증

**Files:**
- Modify: `public/app.js` only if verification reveals a defect
- Modify: `test/save-state.test.js` only if verification reveals a missing regression

**Interfaces:**
- Consumes: Tasks 1-4의 저장 상태·이동 가드
- Produces: 검증된 최종 동작

- [ ] **Step 1: 자동 테스트 전체 실행**

Run: `npm test`

Expected: all tests PASS with no warnings.

- [ ] **Step 2: 정적 검사**

Run: `node --check public/app.js`

Expected: exit code 0.

Run: `node --check lib/save-state.js`

Expected: exit code 0.

- [ ] **Step 3: 저장 버튼 수동 시나리오**

Run: `npm start`

Expected:

1. 저장된 모든 슬라이드 타입을 선택하면 `저장`이 비활성이다.
2. 한 필드를 바꾸면 활성, 원래 값으로 되돌리면 비활성이다.
3. 새 슬라이드는 즉시 활성이다.
4. 일반 슬라이드 저장 성공 후 비활성이고 성공 토스트가 한 번 표시된다.
5. 템플릿 내부 슬라이드 저장 후 슬라이드 버튼은 비활성, 템플릿 버튼은 활성이다.
6. 템플릿 저장 후 두 버튼이 비활성이다.

- [ ] **Step 4: 팝업 수동 시나리오**

Expected:

1. dirty 슬라이드에서 다른 슬라이드, 탭, 메인 화면으로 이동할 때 동일한 팝업이 한 번 표시된다.
2. 템플릿 슬라이드와 템플릿이 모두 dirty여도 팝업은 한 번만 표시된다.
3. `계속 편집`은 상태를 유지한다.
4. `저장하지 않고 이동`은 새 슬라이드를 제거하고 기존 슬라이드·템플릿을 서버 저장본으로 복원한다.
5. `저장 후 이동`은 일반 모드에서 슬라이드를, 템플릿 모드에서 슬라이드와 템플릿을 순서대로 저장한다.
6. dirty 상태에서 새로고침하면 브라우저 표준 경고가 표시되고 clean 상태에서는 표시되지 않는다.

- [ ] **Step 5: 실패 주입 검증**

브라우저 개발자 도구의 Network 탭에서 `POST /api/slides`, `PUT /api/templates/:id`, `/api/upload`, `/api/scripture/generate-slide` 요청을 각각 차단한다.

Expected: 오류가 표시되고 이동하지 않으며, 편집값과 파일 선택이 유지되고 해당 저장 버튼이 다시 활성화된다. 슬라이드 카드의 `저장됨` 표시는 실패 전 상태에서 바뀌지 않는다.

- [ ] **Step 6: 발견된 결함은 재현 테스트부터 추가**

결함이 발견되면 `test/save-state.test.js`에 가장 작은 실패 테스트를 추가하고 `node --test test/save-state.test.js`에서 예상한 이유로 실패하는 것을 확인한 뒤 최소 수정한다.

- [ ] **Step 7: 최종 전체 테스트**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 8: 최종 커밋**

수정이 있었을 때만 실행한다.

```bash
git add public/app.js test/save-state.test.js
git commit -m "fix: close save state regression gaps"
```
