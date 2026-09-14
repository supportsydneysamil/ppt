import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SLIDE,
  TITLE_SLIDE_FAMILIES,
  titleSlideComposition,
  titleSlideStack,
  titleSlideZoneStack,
} from "../lib/title-slide-layout.js";

const full = {
  church: "시드니 삼일교회",
  ko: "주일예배",
  subtitle: "성령강림 후 제16주",
  en: "SUNDAY WORSHIP",
  koDate: "2026년 9월 13일 주일",
};

describe("premium title slide geometry", () => {
  it("registers three distinct premium compositions", () => {
    assert.equal(titleSlideComposition("gallery-rail").zone, "rail");
    assert.equal(titleSlideComposition("portal-offset").zone, "portal");
    assert.equal(titleSlideComposition("editorial-index").zone, "index");
    for (const family of [
      "gallery-rail",
      "portal-offset",
      "editorial-index",
    ]) {
      assert.ok(TITLE_SLIDE_FAMILIES.includes(family));
    }
  });

  it("places church and date in each composition's own zone", () => {
    for (const family of [
      "gallery-rail",
      "portal-offset",
      "editorial-index",
    ]) {
      const blocks = titleSlideZoneStack(family, full);
      assert.deepEqual(
        blocks.map(({ kind }) => kind),
        ["church", "date"],
        family
      );
      for (const block of blocks) {
        assert.ok(block.x >= 0, `${family}:${block.kind}:x`);
        assert.ok(block.x + block.w <= SLIDE.width, `${family}:${block.kind}:w`);
        assert.ok(block.y >= 0, `${family}:${block.kind}:y`);
        assert.ok(block.y + block.h <= SLIDE.height, `${family}:${block.kind}:h`);
      }
    }
  });

  it("keeps full, long, and minimal title stacks inside their copy bands", () => {
    const variants = [
      full,
      { ...full, ko: "성령강림후열여섯번째주일예배", en: "SIXTEENTH SUNDAY AFTER PENTECOST" },
      { church: "", ko: "주일예배", subtitle: "", en: "", koDate: "" },
    ];
    for (const family of [
      "gallery-rail",
      "portal-offset",
      "editorial-index",
    ]) {
      const box = titleSlideComposition(family);
      for (const content of variants) {
        const stack = titleSlideStack(family, content, 52);
        assert.ok(stack.length > 0, family);
        assert.ok(stack[0].y >= box.top, `${family}:top`);
        assert.ok(
          stack.at(-1).y + stack.at(-1).h <= box.bottom,
          `${family}:bottom`
        );
      }
    }
  });
});
