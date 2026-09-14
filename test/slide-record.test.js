import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeSlideForTemplate } from "../lib/slide-record.js";
import { createDefaultCustomSlide } from "../public/custom-slide-model.js";

// A record shaped the way the browser posts it, including the runtime-only
// fields that must never reach disk.
function uploadedSlide(overrides = {}) {
  return {
    id: "slide-1",
    name: "찬송가 1",
    type: "hymn",
    sourceType: "upload",
    content: "",
    font: "Batang",
    fontSize: "32",
    bg: "white",
    align: "top",
    file: null,
    fileData: null,
    fileName: "nhymn1.ppt",
    fileSaved: true,
    saved: true,
    serverFilePath: "/uploads/hymn.pptx",
    thumbnail: "/uploads/hymn.pptx-thumb.jpeg",
    hymnNumber: "1",
    hymnKorTitle: "만복의 근원 하나님",
    hymnEngTitle: "Praise God",
    originalUrl: "https://example.test/nhymn1.ppt",
    includeTitle: true,
    titleThemeId: "marquee",
    titleSlideType: "봉독",
    testament: "old",
    book: "genesis",
    chapter: "1",
    start: "1",
    end: "3",
    koVersion: "새번역",
    enVersion: "web",
    themeId: "navy",
    customImageData: "data:image/png;base64,AAAA",
    scriptureSignature: "sig",
    customTitleSubtitle: "예배와 성찬",
    ...overrides,
  };
}

test("sanitizeSlideForTemplate", async (t) => {
  await t.test("preserves every field the editor reads back", () => {
    const slide = uploadedSlide();
    const saved = sanitizeSlideForTemplate(slide);

    for (const key of Object.keys(slide)) {
      if (key === "file" || key === "fileData") {
        continue;
      }
      assert.deepEqual(saved[key], slide[key], `lost ${key}`);
    }
    assert.equal(saved.titleThemeId, "marquee");
  });

  await t.test("drops runtime-only and unknown fields", () => {
    const sanitized = sanitizeSlideForTemplate(
      uploadedSlide({
        file: { name: "x" },
        fileData: "data:application/octet-stream;base64,AAAA",
        adBgImageFile: { name: "bg" },
        currentFileName: "stale.pptx",
        __proto: "nope",
      })
    );

    assert.equal("file" in sanitized, false);
    assert.equal("fileData" in sanitized, false);
    assert.equal("adBgImageFile" in sanitized, false);
    assert.equal("currentFileName" in sanitized, false);
    assert.equal("__proto" in sanitized, false);
  });

  await t.test("applies the documented defaults", () => {
    const sanitized = sanitizeSlideForTemplate({ id: "x", name: "새 슬라이드", type: "simple" });

    assert.equal(sanitized.content, "");
    assert.equal(sanitized.font, "Malgun Gothic");
    assert.equal(sanitized.fontSize, "40");
    assert.equal(sanitized.bg, "black");
    assert.equal(sanitized.align, "center");
    assert.equal(sanitized.adBgOpacity, 30);
    assert.equal(sanitized.saved, true);
    assert.equal(sanitized.fileSaved, false);
    assert.equal(sanitized.serverFilePath, null);
    assert.equal(sanitized.customTitleSubtitle, "");
    assert.equal(sanitized.titleThemeId, "original");
    assert.equal(sanitized.customSlide, null);
  });

  await t.test("keeps an explicitly unsaved slide unsaved", () => {
    assert.equal(sanitizeSlideForTemplate({ id: "x", saved: false }).saved, false);
  });

  await t.test("canonicalizes the custom canvas model", () => {
    const sanitized = sanitizeSlideForTemplate({
      id: "x",
      name: "커스텀",
      type: "custom",
      sourceType: "basic",
      customSlide: {
        version: 9,
        width: 5000,
        rogue: "nope",
        background: { color: "#222222", rogue: "nope" },
        elements: [
          { id: "e1", type: "rect", x: 0, y: 0, width: 10, height: 10, rogue: "nope" },
          { id: "e2", type: "unsupported" },
        ],
      },
    });

    assert.equal(sanitized.customSlide.version, 1);
    assert.equal(sanitized.customSlide.width, 1280);
    assert.equal(sanitized.customSlide.height, 720);
    assert.equal(sanitized.customSlide.rogue, undefined);
    assert.deepEqual(sanitized.customSlide.background, { color: "#222222" });
    assert.equal(sanitized.customSlide.elements.length, 1);
    assert.equal(sanitized.customSlide.elements[0].rogue, undefined);
  });

  await t.test("defaults a custom slide with no model to the empty canvas", () => {
    assert.deepEqual(
      sanitizeSlideForTemplate({ id: "x", type: "custom" }).customSlide,
      createDefaultCustomSlide()
    );
  });
});
