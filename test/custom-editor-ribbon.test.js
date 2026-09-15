import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_EDITOR_RIBBON_TABS,
  ribbonTabIndexForKey,
} from "../public/custom-editor-ribbon.js";

test("custom editor ribbon exposes the approved tab order", () => {
  assert.deepEqual(
    CUSTOM_EDITOR_RIBBON_TABS.map(({ id, label }) => [id, label]),
    [
      ["design", "디자인"],
      ["insert", "삽입"],
      ["align", "정렬"],
      ["arrange", "배치"],
    ]
  );
});

test("ribbon arrow keys wrap and Home/End reach the boundaries", () => {
  assert.equal(ribbonTabIndexForKey("ArrowRight", 3), 0);
  assert.equal(ribbonTabIndexForKey("ArrowLeft", 0), 3);
  assert.equal(ribbonTabIndexForKey("Home", 2), 0);
  assert.equal(ribbonTabIndexForKey("End", 1), 3);
  assert.equal(ribbonTabIndexForKey("Enter", 1), null);
});
