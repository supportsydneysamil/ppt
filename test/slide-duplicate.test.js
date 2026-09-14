import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createDuplicateSlideName,
  hasOwnedSlideAsset,
  insertSlideAfter,
} from "../lib/slide-duplicate.js";

const [html, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

// Reads one top-level function body out of app.js so a guard can be asserted
// against the function that owns it rather than the whole file.
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`${name} body is unbalanced`);
}

describe("current-slide duplicate helpers", () => {
  it("creates the first available Korean copy name", () => {
    assert.equal(
      createDuplicateSlideName("광고", ["광고", "다른 슬라이드"]),
      "광고 복사"
    );
    assert.equal(
      createDuplicateSlideName("광고", ["광고", "광고 복사", "광고 복사 2"]),
      "광고 복사 3"
    );
  });

  it("continues the root sequence for an already suffixed copy", () => {
    assert.equal(
      createDuplicateSlideName("광고 복사 7", [
        "광고",
        "광고 복사",
        "광고 복사 2",
      ]),
      "광고 복사 3"
    );
  });

  it("inserts a clone immediately after its source without mutation", () => {
    const source = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const clone = { id: "copy" };

    assert.deepEqual(insertSlideAfter(source, "b", clone), [
      { id: "a" },
      { id: "b" },
      clone,
      { id: "c" },
    ]);
    assert.deepEqual(source, [{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("detects every owned upload asset location", () => {
    for (const slide of [
      { serverFilePath: "/uploads/deck.pptx" },
      { thumbnail: "/uploads/thumb.jpeg" },
      { adBgImagePath: "/uploads/background.png" },
      {
        customSlide: {
          elements: [{ type: "image", src: "/uploads/picture.png" }],
        },
      },
    ]) {
      assert.equal(hasOwnedSlideAsset(slide), true);
    }

    assert.equal(
      hasOwnedSlideAsset({
        thumbnail: "https://example.test/thumb.jpeg",
        customSlide: {
          elements: [{ type: "image", src: "data:image/png;base64,AAAA" }],
        },
      }),
      false
    );
  });
});

// A duplicate that awaits the server from inside a guarded transition leaves
// guardedTransitionDepth above zero, and every nested guardTransition caller
// then runs its mutation immediately instead of being refused. The staged
// duplicate list is assigned after those awaits, so whatever the nested
// mutation added to `slides` is silently dropped.
describe("slide list mutations while a duplicate is in flight", () => {
  it("refuses to add a slide while a save or duplicate owns the list", () => {
    const body = functionBody(app, "createSlide");

    assert.match(body, /blockedBySaveInProgress\(\)/);
    assert.ok(
      body.indexOf("blockedBySaveInProgress()") < body.indexOf("guardTransition("),
      "the busy check has to run before the guarded transition"
    );
  });

  it("keeps duplicate network work out of a nested guarded transition", () => {
    const body = functionBody(app, "duplicateCurrentSlide");

    assert.match(body, /ensureNoPendingChanges\(\)/);
    assert.ok(
      !body.includes("guardTransition("),
      "awaiting the server inside the guard lets nested mutations through"
    );
  });
});

describe("current-slide duplicate control", () => {
  it("renders a disabled ghost small button beside Add", () => {
    assert.match(
      html,
      /id="addSlideBtn"[\s\S]*?id="duplicateSlideBtn"[^>]*class="ghost small"[^>]*disabled[^>]*>\s*복제\s*<\/button>/
    );
  });
});
