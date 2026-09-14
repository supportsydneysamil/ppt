import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import { subtitleFontSize } from "../lib/custom-title-text.js";

const [html, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

describe("Custom title subtitle editor wiring", () => {
  it("provides an optional subtitle input", () => {
    assert.match(html, /id="customTitleSubtitle"/);
  });

  it("collects, initializes, restores, and serializes the subtitle", () => {
    assert.match(
      app,
      /customTitleSubtitle:\s*customTitleSubtitleInput\.value\.trim\(\)/
    );
    assert.match(app, /customTitleSubtitle:\s*["']{2}/);
    assert.match(
      app,
      /customTitleSubtitleInput\.value\s*=\s*slide\.customTitleSubtitle\s*\|\|\s*["']{2}/
    );
    assert.ok(
      (app.match(/customTitleSubtitle:\s*slide\.customTitleSubtitle/g) || [])
        .length >= 2,
      "saved slides must serialize and download the subtitle"
    );
  });

  it("updates the preview and dirty state when the subtitle changes", () => {
    assert.match(
      app,
      /customTitleSubtitleInput\.addEventListener\(["']input["'][\s\S]*?renderPreview\(\)[\s\S]*?refreshSaveState\(\)/
    );
  });

  it("renders the approved symbol-free soft halo with shared sizing", async () => {
    const { buildCustomTitleSlidePreview } = await import(
      "../public/custom-title-preview.js"
    );
    const document = new JSDOM("<!doctype html><body></body>").window.document;
    const subtitle = "한 몸을 이루는 교회";
    const expectedHalos = {
      aurora: /rgba\(196,\s*178,\s*255,\s*0\.15\)/,
      monolith: /rgba\(255,\s*255,\s*255,\s*0\.1\)/,
      ivory: /rgba\(194,\s*168,\s*122,\s*0\.16\)/,
      marquee: /rgba\(217,\s*179,\s*118,\s*0\.12\)/,
    };

    for (const [designId, expectedHalo] of Object.entries(expectedHalos)) {
      const preview = buildCustomTitleSlidePreview(
        {
          customTitleDesign: designId,
          customTitleKo: "성찬 예배",
          customTitleSubtitle: subtitle,
        },
        640,
        { document, catalogApi: null }
      );
      const halo = preview.querySelector("[data-custom-title-subtitle]");
      const stack = preview.querySelector("[data-custom-title-stack]");
      assert.ok(halo);
      assert.match(halo.getAttribute("style"), expectedHalo);
      assert.equal(halo.style.borderWidth, "0px");
      assert.ok(
        Math.abs(Number.parseFloat(halo.style.bottom) - (0.55 * 640) / 13.333) <
          1e-10
      );
      assert.ok(
        Math.abs(Number.parseFloat(halo.style.height) - (0.85 * 640) / 13.333) <
          1e-10
      );
      const translations = [
        ...stack.style.transform.matchAll(/translateY\(([-\d.]+)px\)/g),
      ];
      assert.ok(
        Math.abs(
          Number.parseFloat(translations.at(-1)[1]) -
            (-0.45 * 640) / 13.333
        ) < 1e-10
      );
      assert.ok(
        Math.abs(
          Number.parseFloat(halo.firstElementChild.style.fontSize) -
            (subtitleFontSize(subtitle) / 72) * (640 / 13.333)
        ) < 1e-10
      );
      assert.equal(halo.querySelectorAll("[data-subtitle-panel]").length, 0);
      assert.equal(halo.querySelectorAll("[data-subtitle-accent]").length, 0);
    }
  });
});
