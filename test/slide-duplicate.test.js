import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createDuplicateSlideName,
  hasOwnedSlideAsset,
  insertSlideAfter,
} from "../lib/slide-duplicate.js";

const html = await fs.readFile(
  new URL("../public/index.html", import.meta.url),
  "utf8"
);

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

describe("current-slide duplicate control", () => {
  it("renders a disabled ghost small button beside Add", () => {
    assert.match(
      html,
      /id="addSlideBtn"[\s\S]*?id="duplicateSlideBtn"[^>]*class="ghost small"[^>]*disabled[^>]*>\s*복제\s*<\/button>/
    );
  });
});
