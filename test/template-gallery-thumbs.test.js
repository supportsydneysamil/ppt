import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import { compileFunction } from "./helpers/app-function.js";

const app = await fs.readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8"
);

const SLIDE_TYPE_LABELS = {
  title: "타이틀",
  "custom-title": "커스텀 타이틀",
  simple: "단순 슬라이드",
};

function buildStrip(template) {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const buildTemplateThumbStrip = compileFunction(
    app,
    "buildTemplateThumbStrip",
    ["template"],
    {
      document: window.document,
      getSlideTypeLabel: (slide) => SLIDE_TYPE_LABELS[slide.type] ?? "슬라이드",
    }
  );
  return { window, strip: buildTemplateThumbStrip(template) };
}

describe("template gallery thumbnails", () => {
  it("labels slides that never had a thumbnail", () => {
    const { strip } = buildStrip({
      slides: [{ type: "title" }, { type: "simple" }],
    });
    const thumbs = [...strip.querySelectorAll(".template-card-thumb")];

    assert.equal(thumbs.length, 2);
    assert.deepEqual(
      thumbs.map((thumb) => thumb.textContent),
      ["타이틀", "단순 슬라이드"]
    );
    assert.ok(thumbs.every((thumb) => thumb.classList.contains("is-placeholder")));
  });

  it("falls back to the label when the thumbnail file is gone", () => {
    const { window, strip } = buildStrip({
      slides: [{ type: "custom-title", thumbnail: "/uploads/deleted.jpeg" }],
    });
    const thumb = strip.querySelector(".template-card-thumb");
    const img = thumb.querySelector("img");

    assert.ok(img, "a thumbnail image should be rendered first");

    img.dispatchEvent(new window.Event("error"));

    assert.equal(thumb.querySelector("img"), null);
    assert.ok(thumb.classList.contains("is-placeholder"));
    assert.equal(thumb.textContent, "커스텀 타이틀");
  });

  it("keeps the image when it loads", () => {
    const { window, strip } = buildStrip({
      slides: [{ type: "custom-title", thumbnail: "/uploads/ok.jpeg" }],
    });
    const thumb = strip.querySelector(".template-card-thumb");

    thumb.querySelector("img").dispatchEvent(new window.Event("load"));

    assert.ok(thumb.querySelector("img"));
    assert.equal(thumb.classList.contains("is-placeholder"), false);
  });
});

describe("template gallery date", () => {
  function formatMeta(template) {
    const formatTemplateGalleryMeta = compileFunction(
      app,
      "formatTemplateGalleryMeta",
      ["template"],
      {
        formatTemplateDate: (value) => {
          if (!value) return "";
          return value.slice(0, 10);
        },
      }
    );
    return formatTemplateGalleryMeta(template);
  }

  it("prefers updatedAt over createdAt", () => {
    assert.equal(
      formatMeta({
        slides: [{}, {}],
        createdAt: "2026-04-19T04:31:14.731Z",
        updatedAt: "2026-09-15T05:00:00.000Z",
      }),
      "2개 슬라이드 · 2026-09-15"
    );
  });

  it("falls back to createdAt when the template has never been updated", () => {
    assert.equal(
      formatMeta({
        slides: [{}],
        createdAt: "2026-04-19T04:31:14.731Z",
      }),
      "1개 슬라이드 · 2026-04-19"
    );
  });
});
