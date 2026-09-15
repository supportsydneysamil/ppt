import test from "node:test";
import assert from "node:assert/strict";

import {
  isFontAvailable,
  planFontSubstitutes,
} from "../public/pptx-font-availability.js";

/**
 * Stands in for a browser's text measurement. `installed` lists the families
 * the fake machine has; anything else falls through to the generic family, and
 * each generic has its own width so a candidate cannot match all three by luck.
 */
function fakeMeasurer(installed, widths = {}) {
  const genericWidth = { monospace: 100, serif: 110, "sans-serif": 120 };
  return (font) => {
    const [, families] = /^\d+px (.+)$/u.exec(font);
    const list = families.split(",").map((part) => part.trim().replace(/^"|"$/gu, ""));
    for (const family of list) {
      if (installed.includes(family)) return widths[family] ?? 200;
      if (genericWidth[family] !== undefined) return genericWidth[family];
    }
    return genericWidth["sans-serif"];
  };
}

test("font availability detection", async (t) => {
  await t.test("reports an installed family", () => {
    assert.equal(isFontAvailable("Arial", fakeMeasurer(["Arial"])), true);
  });

  await t.test("reports a missing family", () => {
    assert.equal(isFontAvailable("Malgun Gothic", fakeMeasurer(["Arial"])), false);
  });

  await t.test("treats an empty name as missing", () => {
    assert.equal(isFontAvailable("", fakeMeasurer(["Arial"])), false);
  });

  await t.test("does not mistake a generic-width coincidence for a real font", () => {
    // A font that happens to measure exactly like monospace still differs from
    // the other two generics, so probing all three keeps the answer right.
    const measure = fakeMeasurer(["Coincident"], { Coincident: 100 });
    assert.equal(isFontAvailable("Coincident", measure), true);
  });

  await t.test("reports missing when every generic matches", () => {
    // Nothing installed: each probe falls back to its generic and matches it.
    assert.equal(isFontAvailable("Absent", fakeMeasurer([])), false);
  });
});

test("substitute planning", async (t) => {
  const substitutes = [
    { family: "Malgun Gothic", id: "malgun-gothic", localNames: ["Malgun Gothic", "맑은 고딕"] },
    { family: "Arial", id: "arial", localNames: ["Arial", "Liberation Sans", "Arimo"] },
    { family: "HY견고딕", id: "hy-gothic-extra", localNames: ["HY견고딕"] },
  ];

  await t.test("skips substitutes whose genuine font is installed", () => {
    const plan = planFontSubstitutes(substitutes, fakeMeasurer(["Arial", "Malgun Gothic"]));
    assert.deepEqual(plan.available.map((e) => e.id), ["malgun-gothic", "arial"]);
    assert.deepEqual(plan.missing.map((e) => e.id), ["hy-gothic-extra"]);
  });

  await t.test("matches a genuine font under any of its platform names", () => {
    // Korean Windows may expose only the localised name.
    const plan = planFontSubstitutes(substitutes, fakeMeasurer(["맑은 고딕"]));
    assert.equal(plan.available[0].id, "malgun-gothic");
    assert.equal(plan.available[0].resolvedAs, "맑은 고딕");
  });

  await t.test("accepts a metric-compatible clone in place of the original", () => {
    // Linux typically ships Liberation Sans rather than Arial.
    const plan = planFontSubstitutes(substitutes, fakeMeasurer(["Liberation Sans"]));
    assert.equal(plan.available[0].resolvedAs, "Liberation Sans");
  });

  await t.test("needs every substitute on a machine with no Office fonts", () => {
    const plan = planFontSubstitutes(substitutes, fakeMeasurer([]));
    assert.equal(plan.available.length, 0);
    assert.equal(plan.missing.length, 3);
  });

  await t.test("falls back to the family name when no localNames are given", () => {
    const plan = planFontSubstitutes([{ family: "Batang", id: "batang" }], fakeMeasurer(["Batang"]));
    assert.equal(plan.available[0].resolvedAs, "Batang");
  });
});
