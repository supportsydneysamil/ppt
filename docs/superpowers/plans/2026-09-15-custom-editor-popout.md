# Custom Editor Pop-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the active custom Fabric editor into a synchronized independent browser window without losing draft, history, or existing save semantics.

**Architecture:** The main window remains the persistence authority and only one window owns editing. A versioned same-origin channel transfers serializable editor sessions. The pop-out has its own Vite entry and Fabric editor instance; the main window mirrors acknowledged snapshots and restores inline editing when the child closes.

**Tech Stack:** JavaScript ES modules, React 19, Fabric.js 6, BroadcastChannel, window.postMessage fallback, localStorage recovery, Node test runner, Playwright, Vite

## Global Constraints

- Support custom Fabric slides only.
- Never allow both windows to edit simultaneously.
- Keep the main window authoritative for save, cancel, reset, delete, selection, templates, and APIs.
- Do not change slide records, template schemas, or server persistence APIs.
- Open the child synchronously from the click event so popup blocking is detectable.
- Validate protocol version, session ID, slide ID, sequence, and postMessage origin.
- Preserve existing uncommitted `data/templates.json` and `scripts/upload-preview-check.mjs`.

---

### Task 1: Serializable History and Editor Sessions

**Files:**
- Modify: `public/custom-slide-history.js`
- Modify: `public/custom-slide-editor.js`
- Modify: `public/custom-slide-bridge.js`
- Modify: `test/custom-slide-history.test.js`
- Modify: `test/custom-slide-editor-controller.test.js`
- Modify: `test/custom-slide-bridge.test.js`

**Interfaces:**
- `history.exportState() -> { current, undo, redo, savedKey }`
- `history.importState(state) -> current`
- editor `exportSession() -> { model, history, activeElementIds }`
- editor `importSession(session) -> Promise<model>`
- session bridge delegates export/import only for the slide it owns.

- [ ] Write failing tests proving exported objects are deep copies, imported undo/redo order is retained, and another slide cannot export or import the active session.
- [ ] Run focused tests and verify RED.
- [ ] Add deep-cloned history export/import methods; reject malformed arrays and fall back to an empty canonical history.
- [ ] Export normalized model, history, and selected custom element IDs from the editor. Import by loading the model, importing history, and restoring only IDs present in the new Fabric object list.
- [ ] Expose ownership-checked bridge methods.
- [ ] Run focused tests and commit with `feat: serialize custom editor sessions`.

### Task 2: Versioned Pop-out Protocol and Recovery

**Files:**
- Create: `public/custom-editor-popout-protocol.js`
- Create: `test/custom-editor-popout-protocol.test.js`

**Interfaces:**
- `POPOUT_PROTOCOL_VERSION = 1`
- `createPopoutEnvelope({ sessionId, slideId, sequence, type, payload })`
- `validatePopoutEnvelope(value, expected) -> { valid, reason?, message? }`
- `createPopoutSequence() -> { next(type, payload), accept(message) }`
- `writeRecovery(storage, sessionId, record, now?)`
- `readRecovery(storage, sessionId, now?)`
- `clearRecovery(storage, sessionId)`
- Recovery TTL: 24 hours.

- [ ] Write failing tests for valid messages, wrong session/slide/version, stale sequence rejection, deep-cloned payloads, storage failure, expiry, and cleanup.
- [ ] Verify RED.
- [ ] Implement exact message validation with an allowlist of `READY`, `INITIALIZE_SESSION`, `EDITOR_CHANGED`, `SAVE_REQUEST`, `SAVE_RESULT`, `RESET_REQUEST`, `RESET_RESULT`, `CLOSE_REQUEST`, `FINAL_SNAPSHOT`, `FINAL_ACK`, and `CONNECTION_STATE`.
- [ ] Implement sequence and recovery helpers without browser globals so Node tests use in-memory storage.
- [ ] Verify GREEN and commit with `feat: add custom editor popout protocol`.

### Task 3: Main-Window Pop-out Host

**Files:**
- Create: `public/custom-editor-popout-host.js`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Create: `test/custom-editor-popout-host.test.js`

**Interfaces:**
- `createCustomEditorPopoutHost(options)`.
- Returned methods: `open(slideId)`, `sendSaveResult(result)`, `close()`, `destroy()`, `isActive(slideId)`.
- Callbacks: `exportSession`, `importSession`, `requestSave`, `requestReset`, `onConnectionChange`, `onError`.

- [ ] Write failing host tests using fake window/channel/storage objects: popup blocked leaves inline ownership unchanged; READY initializes; newer edits mirror recovery; stale edits are ignored; save/reset requests delegate; FINAL_SNAPSHOT is acknowledged and restores inline ownership.
- [ ] Verify RED.
- [ ] Add `#customEditorPopoutBtn` to the editor command bar, hidden unless `data-slide-type="custom"`.
- [ ] Open `/custom-editor-popout.html?session=<random>` synchronously with `width=1440,height=900`.
- [ ] Export the inline session only after a child READY message; then release inline ownership and show a connected placeholder.
- [ ] Mirror every accepted `EDITOR_CHANGED` snapshot into main-window state and recovery storage without calling the save API.
- [ ] Route SAVE/RESET through existing `saveCurrentSlide` and reset orchestration, then return result envelopes.
- [ ] On blocked popup or initialization failure, keep inline editing and show a toast.
- [ ] On FINAL_SNAPSHOT, import the child session, ACK, clear recovery, and restore inline editing.
- [ ] Verify focused tests and commit with `feat: host custom editor popout`.

### Task 4: Independent Pop-out Application

**Files:**
- Create: `public/custom-editor-popout.html`
- Create: `public/custom-editor-popout.jsx`
- Create: `public/custom-editor-popout.css`
- Modify: `vite.config.js`
- Modify: `public/custom-editor-chrome.jsx`
- Create: `test/custom-editor-popout-ui.test.js`

**Interfaces:**
- New Vite input: `customEditorPopout`.
- Reuses `CustomEditorChrome`, `createCustomSlideEditor`, themes, fonts, and color picker.
- Child state: `connecting | ready | saving | disconnected | closing`.

- [ ] Write failing source/DOM tests for the new entry, status region, document title, reconnect state, Save, Reset, and “주 창으로 합치기” controls.
- [ ] Verify RED.
- [ ] Render a full-viewport stage plus 320px inspector using existing custom-editor chrome.
- [ ] Send READY after channel creation and import INITIALIZE_SESSION before enabling controls.
- [ ] Send versioned editor snapshots from `onChange`; save and reset buttons send requests and wait for results.
- [ ] On `pagehide`, send FINAL_SNAPSHOT. The merge button performs the same handshake before closing.
- [ ] If the channel disconnects, keep editing locally, disable Save, show recovery status, and continuously update the 24-hour recovery record.
- [ ] Add Vite input and verify build output.
- [ ] Commit with `feat: add custom editor popout window`.

### Task 5: Two-Window Integration Tests

**Files:**
- Modify: `test/browser/save-flow.playwright.mjs`
- Modify: `scripts/ime-composition-test.mjs`

- [ ] Add Playwright scenarios for blocked popup, successful popup, one active editor, child edits reflected in main dirty state, child save through parent, close-and-inline restoration, reset, stale message rejection, child reload, and recovery after abnormal close.
- [ ] Run Korean composition in the pop-out and assert text `한`, selection 1, and caret delta 0.
- [ ] Verify existing focus/drawer scenarios remain green.
- [ ] Commit with `test: cover custom editor popout lifecycle`.

### Task 6: Verification

- [ ] Run `npm test`; require zero failures.
- [ ] Run `npm run test:browser`; require zero failures.
- [ ] Run `PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" node scripts/ime-composition-test.mjs`; require both inline and pop-out assertions.
- [ ] Run `npm run build` and `git diff --check`.
- [ ] Manually verify popup blocked, normal close, forced close recovery, and main-window navigation warning.
- [ ] Confirm unrelated uncommitted files remain untouched.
