# Task 2 Report: Current-slide duplicate UI and workflow

## Status

Implemented on `feat/slide-duplicate` in
`/Users/hchoi/Projects/Samil/.worktrees/slide-duplicate`, based on Task 1
commit `6565578` (`feat: add asset-safe slide clone API`).

## TDD evidence

### RED 1: duplicate helper and control contract

Command:

```text
node --test test/slide-duplicate.test.js
```

Expected failure before production changes:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'.../lib/slide-duplicate.js'
tests 1
pass 0
fail 1
```

This established that the duplicate helper module required by the focused
tests did not yet exist.

### RED 2: duplicate operation participates in the busy guard

Command:

```text
node --test test/save-state-guards.test.js
```

Expected failure:

```text
not ok 2 - counts a pending slide duplicate as busy
Expected values to be strictly equal:
false !== true
tests 18
pass 17
fail 1
```

The minimal production change extended `isSaveBusy` to include
`duplicateSaving`.

### GREEN 1: initial focused behavior

Command:

```text
node --test test/slide-duplicate.test.js test/save-state-guards.test.js
```

Result:

```text
tests 23
pass 23
fail 0
```

### RED 3: self-review regression test for save-button races

Self-review found that `deriveSaveButtonState` did not yet receive
`duplicateSaving`, which could leave the slide/template Save buttons enabled
during duplication.

Command:

```text
node --test test/save-state-guards.test.js
```

Expected failure:

```text
not ok 5 - disables both save buttons while a duplicate is persisting
Expected values to be strictly equal:
false !== true
tests 19
pass 18
fail 1
```

The minimal fix threaded `duplicateSaving` through
`deriveSaveButtonState` and the app's save-state projection.

### Final focused GREEN

Command:

```text
node --test test/slide-duplicate.test.js test/save-state-guards.test.js test/slide-clone-route.test.js
```

Result:

```text
tests 25
pass 25
fail 0
duration_ms 306.790416
```

Covered:

- Korean copy names and suffix continuation from the root name.
- Non-mutating insert-immediately-after behavior.
- Detection of all four owned `/uploads/` asset locations.
- Duplicate button presence, styling, label, and default disabled state.
- Duplicate busy-state blocking and Save button disabling.
- Task 1 asset-safe clone route behavior.

## Implementation

- Added a disabled-by-default `ghost small` `복제` button beside `추가`.
- Added a small flex wrapper for the two slide-list header actions.
- Added pure helpers for duplicate naming, insertion, and owned-asset
  detection.
- Duplicates `currentSlideId` only; checkbox selection is neither read,
  cleared, nor reinterpreted.
- Runs through `blockedBySaveInProgress` and `guardTransition`, then
  recollects the active draft inside the resolved transition.
- Exits if discard removed a never-saved source.
- Rejects pending file/background/scripture image inputs with a save-first
  alert.
- Uses `POST /api/slides/clone` only when the draft owns a `/uploads/` asset;
  otherwise uses `cloneSlide(..., { regenerateId: true })`.
- Inserts immediately after the source and activates the clone.
- Main mode persists a saved source's complete staged list before assigning
  it to `slides`; failures retain the previous list, active slide, and bulk
  selection.
- Template mode stages the clone locally, preserves its `saved` value, and
  calls `markTemplateDirty`.
- Unsaved sources remain local and are not posted to `/api/slides`.
- Added `복제 중...`, success toast, concise failure alerts, and a busy flag
  that blocks double invocation and concurrent mutations/saves.

## Files changed

- `lib/slide-duplicate.js` — pure naming, insertion, and owned-asset helpers.
- `lib/save-state.js` — include duplicate persistence in shared busy state.
- `public/app.js` — duplicate state, guard-aware workflow, persistence,
  activation, feedback, and event wiring.
- `public/index.html` — duplicate button and action wrapper.
- `public/styles.css` — action wrapper layout.
- `test/slide-duplicate.test.js` — focused helper and UI tests.
- `test/save-state-guards.test.js` — duplicate busy-state tests.
- `.superpowers/sdd/task-2-report.md` — this report.

No root-checkout files were edited.

## Verification commands and output

### Focused tests

```text
node --test test/slide-duplicate.test.js test/save-state-guards.test.js test/slide-clone-route.test.js
tests 25
pass 25
fail 0
```

### Build

```text
npm run build
✓ 1886 modules transformed.
✓ built in 204ms
```

Vite emitted the existing non-fatal `INEFFECTIVE_DYNAMIC_IMPORT` warning for
`public/custom-slide-editor.js`.

### Full suite (run once as requested)

```text
npm test
tests 298
pass 296
fail 2
```

The only failing assertion is the documented baseline macOS
`resolveUploadsChildPath` failure; Node also counts its parent suite as failed:

```text
not ok 1 - resolves uploads-relative paths
Expected:
'C:/app/uploads/photo.png'
Actual:
'/Users/hchoi/Projects/Samil/.worktrees/slide-duplicate/C:/app/uploads/photo.png'

not ok 5 - resolveUploadsChildPath
error: '1 subtest failed'
```

No other full-suite failures occurred.

### Static checks

```text
git diff --check
# no output; exit 0
```

IDE diagnostics reported no linter errors in the changed source and test
files.

## Self-review

### Rollback safety

- The main-mode saved path builds `nextSlides` without mutating `slides`.
- `/api/slides` must succeed before the local insertion is assigned.
- On clone or persistence failure, `slides`, `currentSlideId`, and
  `selectedSlideIds` remain unchanged.
- Template and unsaved-local paths intentionally commit locally because their
  persistence contracts are deferred.

### Double-click and race behavior

- `duplicateSaving` is set before clone/persistence network work.
- It participates in shared `isSaveBusy`, disabling duplicate, slide Save,
  and template Save controls and blocking other guarded mutations.
- `unsavedGuardActive` rejects a second click while the unsaved dialog is
  awaiting a choice.
- The `finally` path always restores the button label and clears busy state.

### Selection semantics

- The source is recollected from `currentSlideId` after the guard resolves.
- `selectedSlideIds` is not consulted or cleared.
- Rendering only removes IDs that no longer exist, so existing checkbox
  selections survive; the new clone is active but is not bulk-selected.

### Scope

- No card hover action, editor-header action, keyboard shortcut, or
  multi-duplicate behavior was added.
- Existing custom-editor Ctrl+D behavior was untouched.
- No dependencies were added.

## Concerns

- If asset cloning succeeds but the subsequent main `/api/slides` persistence
  fails, local slide state rolls back correctly, but Task 1 exposes no cleanup
  API for the newly copied upload files. Those copied files can remain
  orphaned on disk. Addressing server-side orphan cleanup would require a
  separate API/Task 1 contract change and was intentionally kept out of this
  UI task.
- The known macOS `resolveUploadsChildPath` baseline failure remains unchanged.

## Review fix: nested-guard mutation loss during duplication

### Blocking issue

Review found that the duplicate awaited the server from inside
`guardTransition`, so `guardedTransitionDepth` stayed above zero for the whole
request. Nested `guardTransition` callers therefore ran their mutation
immediately instead of being refused, and `createSlide` had no
`blockedBySaveInProgress` pre-check. Clicking `추가` while `duplicateSaving`
was true pushed a slide onto `slides`, and the staged duplicate list assigned
after the await silently dropped that added slide.

### RED

Command:

```text
node --test test/slide-duplicate.test.js
```

Expected failures (new suite
`slide list mutations while a duplicate is in flight`):

```text
not ok 1 - refuses to add a slide while a save or duplicate owns the list
The input did not match the regular expression /blockedBySaveInProgress\(\)/.
Input:
'{\n  return guardTransition(async () => {\n    appendNewSlide();\n  });\n}'

not ok 2 - keeps duplicate network work out of a nested guarded transition
The input did not match the regular expression /ensureNoPendingChanges\(\)/.

tests 7
pass 5
fail 2
```

### Fix

- `createSlide` now calls `blockedBySaveInProgress()` before entering
  `guardTransition`.
- `duplicateCurrentSlide` settles pending work through the existing
  `ensureNoPendingChanges()` preflight and then performs the clone,
  persistence, and activation outside the guard, so the awaits run at
  `guardedTransitionDepth === 0`.
- A busy re-check runs after the guard resolves, matching the existing
  confirm/prompt yield-point pattern.
- Draft re-collection, the never-saved-source exit, transient-file rejection,
  rollback behavior, and selection semantics are unchanged.

The guard architecture itself was not refactored; only the duplicate's own
call placement and the missing `createSlide` pre-check changed.

### Binding requirement check

With the awaits at depth zero, `runGuardedTransition` refuses every guarded
entry point while `isSaveBusy` is true, so no mutation can slip through:

- `createSlide`: explicit pre-check, plus the top-level guard.
- `cancelEdit`, `selectSlide`, `setPptTab`, `openTemplateWorkspace`,
  `closeTemplateWorkspace`, `switchView`: refused by the top-level guard.
- `deleteCurrentSlide`, `deleteSelectedSlides`, `moveSlideToIndex`,
  `resetCurrentSlide`: existing `blockedBySaveInProgress` checks.
- `saveCurrentSlide`, `saveActiveTemplateToServer`: existing `isSaveBusy`
  checks.

### GREEN

```text
node --test test/slide-duplicate.test.js test/save-state-guards.test.js
ok 1 - refuses to add a slide while a save or duplicate owns the list
ok 2 - keeps duplicate network work out of a nested guarded transition
tests 26
pass 26
fail 0
```

Build after the production change:

```text
npm run build
✓ 1886 modules transformed.
✓ built in 191ms
```

The pre-existing non-fatal `INEFFECTIVE_DYNAMIC_IMPORT` warning is unchanged.
IDE diagnostics reported no linter errors.

### Files changed in this fix

- `public/app.js` — `createSlide` busy pre-check; duplicate work moved out of
  the nested guarded transition.
- `test/slide-duplicate.test.js` — focused regression suite for the blocked
  mutation and the guard placement.

### Concerns after the fix

- The orphan-upload concern above still stands and is intentionally left
  open: no cleanup API was added in this fix.
- The duplicate regression tests assert against `public/app.js` source
  structure, following the existing `custom-title-subtitle-ui.test.js`
  precedent, because the workflow is DOM-coupled. They would need updating if
  the functions are renamed.
