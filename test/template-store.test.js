import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTemplateSlideOrder,
  collectOrphanedAssets,
  collectSlideAssetPaths,
  insertTemplateSlide,
  removeTemplateSlides,
  replaceTemplateSlide,
} from "../lib/template-store.js";

function slide(id, overrides = {}) {
  return { id, name: id, type: "simple", ...overrides };
}

function template(slides) {
  return {
    id: "template-1",
    name: "주일 템플릿",
    createdAt: "2026-09-13T00:00:00.000Z",
    slideCount: slides.length,
    slides,
  };
}

function ids(result) {
  return result.template.slides.map((entry) => entry.id);
}

describe("replaceTemplateSlide", () => {
  it("replaces one slide without touching order or the other slides", () => {
    const source = template([slide("a"), slide("b"), slide("c")]);
    const result = replaceTemplateSlide(source, "b", slide("b", { name: "새 이름" }));

    assert.equal(result.ok, true);
    assert.deepEqual(ids(result), ["a", "b", "c"]);
    assert.equal(result.template.slides[1].name, "새 이름");
    assert.equal(result.template.slides[0].name, "a");
    assert.equal(result.template.slides[2].name, "c");
  });

  it("keeps the template name and never renumbers the count", () => {
    const source = template([slide("a"), slide("b")]);
    const result = replaceTemplateSlide(source, "a", slide("a", { name: "x" }));

    assert.equal(result.template.name, "주일 템플릿");
    assert.equal(result.template.slideCount, 2);
  });

  // The URL is the authority, so a payload carrying a different id cannot be
  // used to write over a neighbouring slide.
  it("forces the addressed id onto the incoming slide", () => {
    const source = template([slide("a"), slide("b")]);
    const result = replaceTemplateSlide(source, "a", slide("b", { name: "탈취" }));

    assert.deepEqual(ids(result), ["a", "b"]);
    assert.equal(result.template.slides[0].name, "탈취");
    assert.equal(result.template.slides[1].name, "b");
  });

  it("normalizes the stored record and drops runtime-only fields", () => {
    const source = template([slide("a")]);
    const result = replaceTemplateSlide(
      source,
      "a",
      slide("a", { fileData: "data:...", nonsense: 1 })
    );

    assert.equal("fileData" in result.template.slides[0], false);
    assert.equal("nonsense" in result.template.slides[0], false);
    assert.equal(result.template.slides[0].content, "");
  });

  it("leaves the source template untouched", () => {
    const original = template([slide("a", { name: "원본" })]);
    replaceTemplateSlide(original, "a", slide("a", { name: "수정" }));

    assert.equal(original.slides[0].name, "원본");
  });

  it("reports a missing slide instead of inserting it", () => {
    const source = template([slide("a")]);
    const result = replaceTemplateSlide(source, "zzz", slide("zzz"));

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.match(result.error, /슬라이드/);
  });
});

describe("insertTemplateSlide", () => {
  it("inserts at the requested index and grows the count", () => {
    const source = template([slide("a"), slide("c")]);
    const result = insertTemplateSlide(source, slide("b"), 1);

    assert.equal(result.ok, true);
    assert.deepEqual(ids(result), ["a", "b", "c"]);
    assert.equal(result.template.slideCount, 3);
  });

  it("clamps an out-of-range index to the ends", () => {
    const source = template([slide("a"), slide("b")]);

    assert.deepEqual(ids(insertTemplateSlide(source, slide("x"), 99)), [
      "a",
      "b",
      "x",
    ]);
    assert.deepEqual(ids(insertTemplateSlide(source, slide("x"), -5)), [
      "x",
      "a",
      "b",
    ]);
  });

  it("appends when no index is given", () => {
    const source = template([slide("a")]);

    assert.deepEqual(ids(insertTemplateSlide(source, slide("b"))), ["a", "b"]);
  });

  it("refuses an id the template already holds", () => {
    const source = template([slide("a")]);
    const result = insertTemplateSlide(source, slide("a"), 0);

    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
  });

  it("refuses a slide with no id", () => {
    const source = template([slide("a")]);
    const result = insertTemplateSlide(source, { name: "이름만" }, 0);

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });
});

describe("removeTemplateSlides", () => {
  it("removes the listed slides and keeps the rest in order", () => {
    const source = template([slide("a"), slide("b"), slide("c")]);
    const result = removeTemplateSlides(source, ["b"]);

    assert.equal(result.ok, true);
    assert.deepEqual(ids(result), ["a", "c"]);
    assert.equal(result.template.slideCount, 2);
  });

  it("ignores unknown ids mixed in with known ones", () => {
    const source = template([slide("a"), slide("b")]);
    const result = removeTemplateSlides(source, ["b", "nope"]);

    assert.equal(result.ok, true);
    assert.deepEqual(ids(result), ["a"]);
  });

  it("reports when nothing matched", () => {
    const source = template([slide("a")]);
    const result = removeTemplateSlides(source, ["nope"]);

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  });

  it("refuses an empty id list", () => {
    const source = template([slide("a")]);
    const result = removeTemplateSlides(source, []);

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });
});

describe("applyTemplateSlideOrder", () => {
  it("reorders without touching any slide content", () => {
    const source = template([
      slide("a", { name: "가" }),
      slide("b", { name: "나" }),
    ]);
    const result = applyTemplateSlideOrder(source, ["b", "a"]);

    assert.equal(result.ok, true);
    assert.deepEqual(ids(result), ["b", "a"]);
    assert.equal(result.template.slides[0].name, "나");
  });

  // Anything other than a permutation would silently add or drop slides, so
  // the order endpoint must never be able to change membership.
  it("refuses an order that is not a permutation of the current ids", () => {
    const source = template([slide("a"), slide("b")]);

    assert.equal(applyTemplateSlideOrder(source, ["a"]).status, 400);
    assert.equal(applyTemplateSlideOrder(source, ["a", "b", "c"]).status, 400);
    assert.equal(applyTemplateSlideOrder(source, ["a", "a"]).status, 400);
    assert.equal(applyTemplateSlideOrder(source, "nope").status, 400);
  });
});

describe("collectSlideAssetPaths", () => {
  it("gathers every upload a slide owns, including canvas pictures", () => {
    const paths = collectSlideAssetPaths(
      slide("a", {
        serverFilePath: "/uploads/deck.pptx",
        thumbnail: "/uploads/thumb.png",
        adBgImagePath: "/uploads/bg.png",
        customSlide: {
          elements: [
            { type: "image", src: "/uploads/pic.png" },
            { type: "text", text: "무시" },
          ],
        },
      })
    );

    assert.deepEqual(paths.sort(), [
      "/uploads/bg.png",
      "/uploads/deck.pptx",
      "/uploads/pic.png",
      "/uploads/thumb.png",
    ]);
  });

  it("returns nothing for a slide that owns no upload", () => {
    assert.deepEqual(collectSlideAssetPaths(slide("a")), []);
  });
});

describe("collectOrphanedAssets", () => {
  it("returns the uploads a removed slide leaves behind", () => {
    const previous = [
      slide("a", { serverFilePath: "/uploads/a.pptx" }),
      slide("b", { serverFilePath: "/uploads/b.pptx" }),
    ];
    const next = [previous[0]];

    assert.deepEqual(collectOrphanedAssets(previous, next), ["/uploads/b.pptx"]);
  });

  // Two records may point at the same upload, so a removal must never delete a
  // file the surviving slides still render.
  it("keeps a path another surviving slide still references", () => {
    const shared = "/uploads/shared.png";
    const previous = [
      slide("a", { thumbnail: shared }),
      slide("b", { thumbnail: shared }),
    ];
    const next = [slide("b", { thumbnail: shared })];

    assert.deepEqual(collectOrphanedAssets(previous, next), []);
  });

  it("catches an upload that a surviving slide replaced in place", () => {
    const previous = [slide("a", { serverFilePath: "/uploads/old.pptx" })];
    const next = [slide("a", { serverFilePath: "/uploads/new.pptx" })];

    assert.deepEqual(collectOrphanedAssets(previous, next), [
      "/uploads/old.pptx",
    ]);
  });

  it("catches canvas pictures dropped from a surviving slide", () => {
    const previous = [
      slide("a", {
        customSlide: { elements: [{ type: "image", src: "/uploads/gone.png" }] },
      }),
    ];
    const next = [slide("a", { customSlide: { elements: [] } })];

    assert.deepEqual(collectOrphanedAssets(previous, next), [
      "/uploads/gone.png",
    ]);
  });

  it("reports each orphaned path once", () => {
    const previous = [
      slide("a", {
        serverFilePath: "/uploads/dup.png",
        thumbnail: "/uploads/dup.png",
      }),
    ];

    assert.deepEqual(collectOrphanedAssets(previous, []), ["/uploads/dup.png"]);
  });

  it("returns nothing when the slides are unchanged", () => {
    const slides = [slide("a", { serverFilePath: "/uploads/a.pptx" })];

    assert.deepEqual(collectOrphanedAssets(slides, slides), []);
  });
});
