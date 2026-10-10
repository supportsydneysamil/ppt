# Slide List Overlay Scrollbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the slide list a thin translucent thumb that appears only while the list scrolls and takes no layout width.

**Architecture:** Native scrolling stays untouched and the native bar stays hidden. A new module reads the list's scroll metrics, draws a thumb in the panel's right padding, fades it in on scroll and out after 800ms, and maps thumb drags back to `scrollTop`. The geometry lives in pure functions so it is unit-tested; the DOM wiring is verified in a real browser.

**Tech Stack:** Vanilla browser ES modules bundled by Vite, `node:test`, Playwright for the browser check.

Spec: `docs/superpowers/specs/2026-10-11-slide-list-overlay-scrollbar-design.md`

## Global Constraints

- The native bar hiding rule for `.slide-cards` and its test stay as they are.
- The track lives in `.slide-list-panel`, never inside `#slideListContainer` (`renderSlideList()` wipes it with `innerHTML = ""`).
- Thumb: 6px wide, 8px on hover or drag, track 5px in from the panel's padding edge, minimum length 24px.
- Colour: `color-mix(in srgb, var(--ink) 32%, transparent)`, 48% on hover or drag.
- Hide delay 800ms. No fade under `prefers-reduced-motion: reduce`.
- Track and thumb are `aria-hidden="true"` and ignore the pointer while hidden.
- Do not stage `data/templates.json`.

---

### Task 1: Thumb geometry

**Files:**
- Create: `public/overlay-scrollbar.js`
- Test: `test/overlay-scrollbar.test.js`

**Interfaces:**
- Produces: `computeThumb({ scrollTop, scrollHeight, clientHeight, trackLength, minSize = 24 }) → { size, offset } | null`
- Produces: `scrollTopForDrag({ startScrollTop, deltaY, trackLength, thumbSize, scrollHeight, clientHeight }) → number`

- [ ] **Step 1: Write the failing tests**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeThumb, scrollTopForDrag } from "../public/overlay-scrollbar.js";

// A 400px list over 1600px of cards: 1200px of scroll range, and a 100px thumb
// leaves 300px of travel, so every thumb pixel is four content pixels.
const list = { scrollHeight: 1600, clientHeight: 400, trackLength: 400 };

describe("overlay scrollbar thumb", () => {
  it("draws nothing while the content fits", () => {
    assert.equal(computeThumb({ ...list, scrollHeight: 400, scrollTop: 0 }), null);
    assert.equal(computeThumb({ ...list, scrollHeight: 400.5, scrollTop: 0 }), null);
  });

  it("sizes the thumb by the share of the content in view", () => {
    assert.deepEqual(computeThumb({ ...list, scrollTop: 0 }), { size: 100, offset: 0 });
  });

  it("keeps a long list's thumb large enough to grab", () => {
    assert.equal(computeThumb({ ...list, scrollHeight: 40000, scrollTop: 0 }).size, 24);
  });

  it("moves the thumb with the scroll position", () => {
    assert.equal(computeThumb({ ...list, scrollTop: 600 }).offset, 150);
    assert.equal(computeThumb({ ...list, scrollTop: 1200 }).offset, 300);
  });

  it("never lets the thumb leave its track", () => {
    assert.equal(computeThumb({ ...list, scrollTop: -40 }).offset, 0);
    assert.equal(computeThumb({ ...list, scrollTop: 1300 }).offset, 300);
  });
});

describe("overlay scrollbar drag", () => {
  const drag = { ...list, thumbSize: 100 };

  it("scrolls the content in proportion to the thumb's travel", () => {
    assert.equal(scrollTopForDrag({ ...drag, startScrollTop: 100, deltaY: 50 }), 300);
    assert.equal(scrollTopForDrag({ ...drag, startScrollTop: 300, deltaY: -50 }), 100);
  });

  it("stops at either end of the content", () => {
    assert.equal(scrollTopForDrag({ ...drag, startScrollTop: 100, deltaY: -100 }), 0);
    assert.equal(scrollTopForDrag({ ...drag, startScrollTop: 100, deltaY: 500 }), 1200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/overlay-scrollbar.test.js`
Expected: FAIL, cannot find module `../public/overlay-scrollbar.js`.

- [ ] **Step 3: Write the geometry**

```js
const MIN_THUMB_SIZE = 24;

export function computeThumb({
  scrollTop = 0,
  scrollHeight = 0,
  clientHeight = 0,
  trackLength = clientHeight,
  minSize = MIN_THUMB_SIZE,
} = {}) {
  const range = scrollHeight - clientHeight;
  if (range < 1 || trackLength <= 0) {
    return null;
  }
  const size = Math.min(
    trackLength,
    Math.max(minSize, (trackLength * clientHeight) / scrollHeight)
  );
  const travel = trackLength - size;
  return { size, offset: clamp((travel * scrollTop) / range, 0, travel) };
}

export function scrollTopForDrag({
  startScrollTop = 0,
  deltaY = 0,
  trackLength = 0,
  thumbSize = 0,
  scrollHeight = 0,
  clientHeight = 0,
} = {}) {
  const range = Math.max(0, scrollHeight - clientHeight);
  const travel = trackLength - thumbSize;
  if (travel <= 0) {
    return clamp(startScrollTop, 0, range);
  }
  return clamp(startScrollTop + (deltaY * range) / travel, 0, range);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/overlay-scrollbar.test.js`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/overlay-scrollbar.js test/overlay-scrollbar.test.js
git commit -m "feat(ppt): compute an overlay scrollbar thumb"
```

---

### Task 2: Draw the thumb on the slide list

**Files:**
- Modify: `public/overlay-scrollbar.js` (append `attachOverlayScrollbar`)
- Modify: `public/app.js` (import block near line 44, call after `slideListContainer` at line 846)
- Modify: `public/styles.css` (thumb rules after `.slide-cards` at line 2437; one sentence in the hiding-rule comment at line 2779)
- Test: `test/ppt-workspace-ui.test.js` (inside the existing describe that holds "keeps the scrolling panes from reserving a scrollbar gutter")

**Interfaces:**
- Consumes: `computeThumb`, `scrollTopForDrag` from Task 1
- Produces: `attachOverlayScrollbar(pane, { host = pane.parentElement, hideDelay = 800 }) → { update, destroy } | null`

- [ ] **Step 1: Write the failing wiring tests**

Add after the "keeps the scrolling panes from reserving a scrollbar gutter" test:

```js
  it("draws the slide list's own scrollbar outside the list", () => {
    // renderSlideList() empties the list wholesale, so the track has to live in
    // the panel or every render would take it away.
    assert.match(
      appSource,
      /import \{ attachOverlayScrollbar \} from "\.\/overlay-scrollbar\.js";/
    );
    assert.match(appSource, /attachOverlayScrollbar\(slideListContainer\);/);
    assert.match(css, /\.overlay-scrollbar\s*\{[^}]*position:\s*absolute/);
    assert.match(
      css,
      /\.overlay-scrollbar-thumb\s*\{[^}]*color-mix\(in srgb, var\(--ink\) 32%, transparent\)/
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/ppt-workspace-ui.test.js`
Expected: FAIL on the import assertion.

- [ ] **Step 3: Append the DOM wiring to `public/overlay-scrollbar.js`**

```js
// The thumb is drawn over a pane whose native bar is hidden, so it takes no
// layout width. It lives in `host` rather than the pane: a pane that replaces
// its children wholesale would otherwise take the thumb with it.
export function attachOverlayScrollbar(
  pane,
  { host = pane?.parentElement, hideDelay = 800 } = {}
) {
  if (!pane || !host) {
    return null;
  }
  const doc = pane.ownerDocument;
  const track = doc.createElement("div");
  track.className = "overlay-scrollbar";
  track.setAttribute("aria-hidden", "true");
  const thumb = doc.createElement("div");
  thumb.className = "overlay-scrollbar-thumb";
  track.append(thumb);
  host.append(track);

  let geometry = null;
  let frame = null;
  let hideTimer = null;
  let hovered = false;
  let drag = null;

  function update() {
    frame = null;
    const trackLength = pane.clientHeight;
    geometry = computeThumb({
      scrollTop: pane.scrollTop,
      scrollHeight: pane.scrollHeight,
      clientHeight: pane.clientHeight,
      trackLength,
    });
    track.hidden = !geometry;
    if (!geometry) {
      track.classList.remove("is-visible");
      return;
    }
    track.style.top = `${pane.offsetTop}px`;
    track.style.height = `${trackLength}px`;
    thumb.style.height = `${geometry.size}px`;
    thumb.style.transform = `translateY(${geometry.offset}px)`;
  }

  function schedule() {
    if (frame === null) {
      frame = requestAnimationFrame(update);
    }
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!hovered && !drag) {
        track.classList.remove("is-visible");
      }
    }, hideDelay);
  }

  function onScroll() {
    schedule();
    track.classList.add("is-visible");
    scheduleHide();
  }

  function endDrag(event) {
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    drag = null;
    track.classList.remove("is-dragging");
    scheduleHide();
  }

  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !geometry) {
      return;
    }
    event.preventDefault();
    thumb.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: pane.scrollTop,
    };
    track.classList.add("is-dragging");
  });
  thumb.addEventListener("pointermove", (event) => {
    if (drag?.pointerId !== event.pointerId || !geometry) {
      return;
    }
    pane.scrollTop = scrollTopForDrag({
      startScrollTop: drag.startScrollTop,
      deltaY: event.clientY - drag.startY,
      trackLength: pane.clientHeight,
      thumbSize: geometry.size,
      scrollHeight: pane.scrollHeight,
      clientHeight: pane.clientHeight,
    });
  });
  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);
  thumb.addEventListener("pointerenter", () => {
    hovered = true;
  });
  thumb.addEventListener("pointerleave", () => {
    hovered = false;
    scheduleHide();
  });

  pane.addEventListener("scroll", onScroll, { passive: true });
  // Cards coming and going change the content height but not the pane's box,
  // which is all a ResizeObserver sees.
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(pane);
  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(pane, { childList: true });
  update();

  return {
    update: schedule,
    destroy() {
      pane.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      clearTimeout(hideTimer);
      track.remove();
    },
  };
}
```

- [ ] **Step 4: Wire it in `public/app.js`**

Import after the `./ppt-workspace-ui.js` import:

```js
import { attachOverlayScrollbar } from "./overlay-scrollbar.js";
```

Call right after the container is looked up:

```js
const slideListContainer = document.getElementById("slideListContainer");
attachOverlayScrollbar(slideListContainer);
```

- [ ] **Step 5: Add the thumb CSS after the `.slide-cards` rule**

```css
/* The list's native bar is hidden (see the shared rule further down), so it
   draws its own: a thumb in the panel's right padding, clear of the cards,
   shown while the list scrolls. */
.overlay-scrollbar {
  position: absolute;
  right: 5px;
  z-index: 2;
  width: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
}

.overlay-scrollbar.is-visible {
  opacity: 1;
  transition-duration: 120ms;
}

.overlay-scrollbar-thumb {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 32%, transparent);
  transition: width 120ms ease, background-color 120ms ease;
}

.overlay-scrollbar.is-visible .overlay-scrollbar-thumb {
  pointer-events: auto;
}

.overlay-scrollbar-thumb:hover,
.overlay-scrollbar.is-dragging .overlay-scrollbar-thumb {
  width: 8px;
  background: color-mix(in srgb, var(--ink) 48%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .overlay-scrollbar,
  .overlay-scrollbar-thumb {
    transition: none;
  }
}
```

In the hiding-rule comment, replace

```css
   This is a deliberate trade. A hidden bar is one less cue that a region
   scrolls, and every region below leans on its own clipped content to say so
   instead. Wheel, trackpad, touch and keyboard scrolling are untouched. */
```

with

```css
   This is a deliberate trade. A hidden bar is one less cue that a region
   scrolls, and every region below leans on its own clipped content to say so
   instead, except the slide list, which draws an overlay thumb that takes no
   width (`overlay-scrollbar.js`). Wheel, trackpad, touch and keyboard
   scrolling are untouched. */
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass, including the unchanged gutter test.

- [ ] **Step 7: Verify in a real browser**

Start `PORT=3061 npm run dev`, open the PPT view at 1440×900, add 15 slides with `#addSlideBtn`, then check with a temporary Playwright script (deleted afterwards):

- track `hidden` with few cards, shown once the list overflows
- `#slideListContainer.clientWidth` identical before and after attaching / scrolling
- wheel over the list → track gets `is-visible`; ~1.2s later it is gone
- drag the thumb down 60px → `scrollTop` grows in proportion
- add one more slide (re-render) → the track is still in the panel and its thumb resizes
- collapse the slide panel → the track is not visible
- 1100×900 compact drawer and 860×900 mobile: aligned / hidden
- light theme: thumb visible against the panel
- screenshots of the thumb in dark and light themes

- [ ] **Step 8: Commit**

```bash
git add public/overlay-scrollbar.js public/app.js public/styles.css test/ppt-workspace-ui.test.js
git commit -m "feat(ppt): float an overlay scrollbar over the slide list"
```
