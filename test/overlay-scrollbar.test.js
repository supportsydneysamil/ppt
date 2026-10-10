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
