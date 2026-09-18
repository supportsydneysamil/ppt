# Scripture Web Presenter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the scripture web view into a popup-based backup presenter with best-effort automatic fullscreen, reliable manual fallback, presentation controls, blackout, and centered 16:9 rendering.

**Architecture:** Keep the existing server session payload and slide rendering unchanged. Add a small browser-only presenter controller that owns fullscreen, blackout, navigation input, swipe recognition, and control visibility; `scripture-web-view.js` supplies slide movement callbacks and remains responsible for loading and rendering scripture data.

**Tech Stack:** Vanilla ES modules, Fullscreen API, Pointer Events, DOM/CSS, Node test runner, JSDOM, Vite.

## Global Constraints

- Keep the existing popup flow; do not add a new-tab fallback.
- Attempt fullscreen after the web view renders, but treat browser rejection as a normal fallback state.
- Manual fullscreen must remain available through a large 「전체화면으로 시작」 button and the `F` key.
- Hide presentation chrome and the pointer after 2.5 seconds in fullscreen.
- Keep the existing scripture session APIs, 30-minute in-memory lifetime, payload, text fitting, theme, and custom background behavior unchanged.
- Do not add presenter notes, dual-monitor control, thumbnails, scripture editing, offline persistence, or a title slide.
- Keep unrelated uncommitted project changes intact and stage only files or hunks created by this plan.

---

### Task 1: Presenter input and state controller

**Files:**
- Create: `public/scripture-web-presenter.js`
- Create: `test/scripture-web-presenter.test.js`

**Interfaces:**
- Consumes: DOM elements with IDs `presenterControls`, `fullscreenBtn`, `fullscreenStart`, `fullscreenStartBtn`, `fullscreenMessage`, `blackoutBtn`, `blackoutLayer`, and `stageViewport`.
- Produces: `createScripturePresenter(options)` returning `{ attemptAutoFullscreen, requestFullscreen, toggleBlackout, showControls, destroy }`.
- Produces: `navigationFromKey(event)`, `navigationFromTap(clientX, width)`, and `navigationFromSwipe(start, end)` returning `"next"`, `"previous"`, `"first"`, `"last"`, or `null`.

- [ ] **Step 1: Write failing pure input tests**

Create `test/scripture-web-presenter.test.js` with assertions covering all specified keys, focused controls, tap halves, and horizontal swipe thresholds:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import {
  createScripturePresenter,
  navigationFromKey,
  navigationFromSwipe,
  navigationFromTap,
} from "../public/scripture-web-presenter.js";

describe("scripture presenter input", () => {
  it("maps presentation keys and ignores Space on controls", () => {
    assert.equal(navigationFromKey({ key: "ArrowRight" }), "next");
    assert.equal(navigationFromKey({ key: "PageUp" }), "previous");
    assert.equal(navigationFromKey({ key: "Home" }), "first");
    assert.equal(navigationFromKey({ key: "End" }), "last");
    assert.equal(
      navigationFromKey({ key: " ", target: { closest: () => ({}) } }),
      null
    );
  });

  it("maps tap halves and deliberate horizontal swipes", () => {
    assert.equal(navigationFromTap(20, 100), "previous");
    assert.equal(navigationFromTap(80, 100), "next");
    assert.equal(
      navigationFromSwipe({ x: 100, y: 20 }, { x: 20, y: 24 }),
      "next"
    );
    assert.equal(
      navigationFromSwipe({ x: 20, y: 20 }, { x: 100, y: 24 }),
      "previous"
    );
    assert.equal(
      navigationFromSwipe({ x: 20, y: 20 }, { x: 45, y: 80 }),
      null
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test test/scripture-web-presenter.test.js
```

Expected: FAIL because `public/scripture-web-presenter.js` does not exist.

- [ ] **Step 3: Implement the pure input helpers**

Create `public/scripture-web-presenter.js` with:

```js
export const CONTROL_HIDE_DELAY = 2500;
const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, [contenteditable='true']";

export function navigationFromKey(event) {
  if (event.target?.closest?.(INTERACTIVE_SELECTOR)) return null;
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) return "next";
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) return "previous";
  if (event.key === "Home") return "first";
  if (event.key === "End") return "last";
  return null;
}

export function navigationFromTap(clientX, width) {
  if (!Number.isFinite(width) || width <= 0) return null;
  return clientX < width / 2 ? "previous" : "next";
}

export function navigationFromSwipe(start, end, minimumDistance = 48) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < minimumDistance || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "next" : "previous";
}
```

- [ ] **Step 4: Add failing controller tests**

Extend the same test file with a JSDOM fixture. Mock `document.documentElement.requestFullscreen`, `document.exitFullscreen`, and a mutable `document.fullscreenElement`. Assert:

- successful `fullscreenchange` adds `is-presenting` to `<body>`, updates the button to 「전체화면 종료」, and hides the fallback;
- rejected automatic fullscreen shows `fullscreenStart` and message 「전체화면으로 시작」 without throwing;
- missing Fullscreen API shows 「이 브라우저에서는 전체화면을 지원하지 않습니다」;
- `toggleBlackout()` toggles `is-blackout`, `blackoutLayer.hidden`, and `blackoutBtn[aria-pressed]`;
- movement callbacks receive `next`, `previous`, `first`, and `last`;
- `destroy()` removes listeners and clears the hide timer.

- [ ] **Step 5: Run the focused test and verify controller failure**

Run:

```bash
node --test test/scripture-web-presenter.test.js
```

Expected: pure helper tests PASS; controller tests FAIL because `createScripturePresenter` is not exported.

- [ ] **Step 6: Implement `createScripturePresenter`**

Use dependency injection so tests can supply JSDOM. The function must resolve the eight IDs listed in the task interface, register every listener named below, and retain each bound callback so `destroy()` can remove the same function reference:

```js
export function createScripturePresenter({
  document,
  window,
  onNavigate,
  hideDelay = CONTROL_HIDE_DELAY,
}) {}
```

Implementation rules:

- `attemptAutoFullscreen()` calls `requestFullscreen({ navigationUI: "hide" })` and catches rejection.
- `requestFullscreen()` exits when already fullscreen and requests it otherwise.
- `keydown` routes `F` and `B` before navigation keys.
- Stage clicks navigate only when they are not the end of a swipe and the target is not interactive.
- Pointer movement in fullscreen calls `showControls()`.
- `showControls()` applies `controls-visible`, then removes it after `hideDelay` unless controls are hovered or focused.
- `fullscreenchange` is the only function that adds or removes `is-presenting`.

- [ ] **Step 7: Run the focused test and verify pass**

Run:

```bash
node --test test/scripture-web-presenter.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit the isolated controller**

```bash
git add public/scripture-web-presenter.js test/scripture-web-presenter.test.js
git commit -m "feat: add scripture presenter controls"
```

---

### Task 2: Presenter markup, rendering integration, and fullscreen layout

**Files:**
- Modify: `public/scripture-web-view.html`
- Modify: `public/scripture-web-view.js`
- Modify: `public/scripture-web-view.css`
- Modify: `test/scripture-web-presenter.test.js`

**Interfaces:**
- Consumes: `createScripturePresenter({ document, window, onNavigate })` from Task 1.
- Produces: `navigate(command)` in `scripture-web-view.js`, where command is `"next"`, `"previous"`, `"first"`, or `"last"`.
- Produces: the DOM IDs required by Task 1.

- [ ] **Step 1: Write failing DOM contract tests**

Read the HTML and CSS in `test/scripture-web-presenter.test.js`, parse HTML with JSDOM, and assert:

```js
for (const id of [
  "presenterControls",
  "fullscreenBtn",
  "blackoutBtn",
  "fullscreenStart",
  "fullscreenStartBtn",
  "fullscreenMessage",
  "blackoutLayer",
]) {
  assert.ok(document.getElementById(id), `${id} is missing`);
}
assert.match(css, /body\.is-presenting/);
assert.match(css, /\.blackout-layer/);
assert.match(css, /prefers-reduced-motion/);
```

Also assert `blackoutBtn` starts with `aria-pressed="false"`, `blackoutLayer` starts hidden, and the start CTA says 「전체화면으로 시작」.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test test/scripture-web-presenter.test.js
```

Expected: FAIL because the presenter elements and fullscreen CSS do not exist.

- [ ] **Step 3: Add presentation markup**

Update `public/scripture-web-view.html`:

```html
<div id="presenterControls" class="topbar-actions presenter-controls">
  <button id="prevBtn" type="button" class="nav-btn">이전</button>
  <span id="slideCounter" class="slide-counter" aria-live="polite">0 / 0</span>
  <button id="nextBtn" type="button" class="nav-btn">다음</button>
  <button id="blackoutBtn" type="button" class="nav-btn" aria-pressed="false">
    검정 화면
  </button>
  <button id="fullscreenBtn" type="button" class="nav-btn">전체화면</button>
</div>
```

Place these siblings inside the stage shell:

```html
<div id="fullscreenStart" class="fullscreen-start" hidden>
  <p id="fullscreenMessage">발표를 전체화면으로 시작하세요.</p>
  <button id="fullscreenStartBtn" type="button">전체화면으로 시작</button>
  <small>단축키 F</small>
</div>
<div id="blackoutLayer" class="blackout-layer" hidden aria-hidden="true"></div>
```

- [ ] **Step 4: Integrate presenter navigation**

At the top of `public/scripture-web-view.js`:

```js
import { createScripturePresenter } from "./scripture-web-presenter.js";
```

Replace offset-only keyboard handling with:

```js
function navigate(command) {
  if (!deckData?.slides.length) return;
  if (command === "first") currentIndex = 0;
  if (command === "last") currentIndex = deckData.slides.length - 1;
  if (command === "next") currentIndex = Math.min(currentIndex + 1, deckData.slides.length - 1);
  if (command === "previous") currentIndex = Math.max(currentIndex - 1, 0);
  renderSlide();
}

const presenter = createScripturePresenter({
  document,
  window,
  onNavigate: navigate,
});
```

Keep previous/next buttons wired through `navigate`. After `renderSlide()` and `applyScale()` complete in `loadSession()`, call:

```js
await presenter.attemptAutoFullscreen();
```

Do not remove existing session loading, theme rendering, or background fallback.

- [ ] **Step 5: Implement centered presentation CSS**

Update `public/scripture-web-view.css` so:

- `.stage-canvas` uses `transform-origin: center center`;
- `.stage-viewport` centers the fixed 1333×750 canvas at every scale;
- `body.is-presenting` and its shell/stage occupy `100vw` × `100vh`, use black backgrounds, and remove padding, borders, radii, and shadows;
- `.is-presenting .webview-topbar` becomes a fixed overlay;
- presentation controls and cursor hide by default, then show under `.controls-visible`;
- `.fullscreen-start` is a centered high-contrast overlay above the slide;
- `.blackout-layer` is fixed, inset `0`, pure black, and above slide and controls;
- reduced-motion media rules disable opacity and transform transitions.

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
node --test test/scripture-web-presenter.test.js test/browser-module-graph.test.js
npm run build
```

Expected: all tests PASS and Vite exits 0 with the web view entry bundled.

- [ ] **Step 7: Commit the web view integration**

```bash
git add public/scripture-web-view.html public/scripture-web-view.js public/scripture-web-view.css test/scripture-web-presenter.test.js
git commit -m "feat: turn scripture web view into presenter"
```

---

### Task 3: Popup-blocked feedback and regression verification

**Files:**
- Modify: `public/app.js:734-769`
- Create: `test/scripture-web-popup.test.js`

**Interfaces:**
- Consumes: existing `handleOpenWebView()`, `buildPptxPayload()`, `fetch`, and `window.open`.
- Produces: exact blocked-popup message and the guarantee that no session request is sent when opening fails.

- [ ] **Step 1: Write the failing popup test**

Create `test/scripture-web-popup.test.js` using `compileAsyncFunction` from `test/helpers/app-function.js`. Compile `handleOpenWebView` with mocked `window.open`, `fetch`, `buildPptxPayload`, and `alert`:

```js
it("warns clearly and does not create a session when popup opening is blocked", async () => {
  let fetchCalls = 0;
  const alerts = [];
  const handleOpenWebView = compileAsyncFunction(
    app,
    "handleOpenWebView",
    [],
    {
      window: { open: () => null },
      fetch: async () => { fetchCalls += 1; },
      buildPptxPayload: async () => ({}),
      alert: (message) => alerts.push(message),
      encodeURIComponent,
    }
  );

  await handleOpenWebView();

  assert.equal(fetchCalls, 0);
  assert.deepEqual(alerts, [
    "팝업이 차단되었습니다. 주소창의 팝업 허용을 켠 뒤 다시 시도하세요.",
  ]);
});
```

Add a second case proving a successful popup receives `/scripture-web-view.html?session=...` and a session or payload failure closes the popup.

- [ ] **Step 2: Run the popup test and verify failure**

Run:

```bash
node --test test/scripture-web-popup.test.js
```

Expected: FAIL because the current blocked-popup copy differs.

- [ ] **Step 3: Update popup feedback**

In `handleOpenWebView()`, replace only the blocked-popup error:

```js
if (!popup || popup.closed) {
  throw new Error(
    "팝업이 차단되었습니다. 주소창의 팝업 허용을 켠 뒤 다시 시도하세요."
  );
}
```

Keep `window.open()` inside the original click handler and before `buildPptxPayload()` or `fetch()`. Keep the existing loading document and close-on-error behavior.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node --test test/scripture-web-popup.test.js test/scripture-web-presenter.test.js test/browser-module-graph.test.js
npm test
npm run build
```

Expected: focused tests PASS, the full Node suite reports zero failures, and Vite exits 0.

- [ ] **Step 5: Perform manual browser verification**

Run on a non-default port to avoid conflicts:

```bash
PORT=4010 npm run dev
```

Verify in Chrome and Safari:

- allowed popup opens and renders the first slide;
- fullscreen is attempted, and rejection reveals the one-click CTA;
- `F`, `Esc`, `B`, all navigation keys, stage halves, and horizontal swipes behave as specified;
- controls and pointer hide after 2.5 seconds in fullscreen and return on movement;
- popup blocking displays the exact guidance and retry succeeds after permission is enabled;
- slide remains centered with black bars at multiple window and display ratios.

- [ ] **Step 6: Commit the popup feedback hunk**

Stage only the `handleOpenWebView` hunk because `public/app.js` already contains unrelated uncommitted work:

```bash
git add test/scripture-web-popup.test.js
git diff -- public/app.js
git add -p public/app.js
git commit -m "fix: explain blocked scripture presenter popup"
```
