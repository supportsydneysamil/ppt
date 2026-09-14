import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

const [html, css, app, main, server] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/main.jsx", import.meta.url), "utf8"),
  fs.readFile(new URL("../server.js", import.meta.url), "utf8"),
]);

const designIds = [
  "chapel",
  "editorial",
  "glow",
  "easter-dawn",
  "easter-stained",
  "christmas-burgundy",
  "christmas-evergreen",
  "thanksgiving",
  "advent",
  "midnight-slab",
  "slate-split",
  "deep-fog",
];

describe("Sunday worship title editor", () => {
  it("shows all twelve design cards in the approved order", () => {
    const cardIds = Array.from(
      html.matchAll(/data-title-design="([^"]+)"/g),
      (match) => match[1]
    );
    assert.deepEqual(cardIds, designIds);
    for (const design of designIds.slice(3)) {
      assert.match(css, new RegExp(`\\.title-preview-${design}`));
    }
  });

  it("provides title, date visibility, mode, and free date controls", () => {
    assert.match(html, /id="titleKo"/);
    assert.match(html, /id="titleEn"/);
    assert.match(html, /id="titleShowDate"/);
    assert.match(html, /id="titleDateMode"/);
    assert.match(html, /id="titleServiceDate"\s+type="date"/);
    assert.match(
      html,
      /name="titleDateMode"\s+value="custom"\s+checked/
    );
  });

  it("uses the shared text API and preserves explicit blank titles", () => {
    assert.match(main, /window\.TitleSlideText\s*=/);
    assert.match(app, /window\.TitleSlideText/);
    assert.match(app, /titleKo:\s*"주일예배"/);
    assert.match(app, /titleEn:\s*"SUNDAY WORSHIP"/);
    assert.match(app, /dateMode:\s*"custom"/);
    assert.match(app, /showDate:\s*true/);
    assert.match(app, /titleKoInput\.value/);
    assert.match(app, /titleEnInput\.value/);
    assert.match(app, /content\.ko/);
    assert.match(app, /content\.en/);
  });

  it("resolves date modes and switches typed dates to custom", () => {
    assert.match(app, /function selectedDateMode\(/);
    assert.match(app, /resolveServiceDate/);
    assert.match(app, /titleShowDate\.checked/);
    assert.match(
      app,
      /titleServiceDateInput\.addEventListener\(["'](?:input|change)["'][\s\S]*?setSelectedDateMode\(["']custom["']\)/
    );
    assert.doesNotMatch(app, /function ensureTitleServiceDateOptions\(/);
  });

  it("resets mounted title controls when a non-title slide becomes a title", () => {
    assert.match(
      app,
      /if \(slide\?\.type !== "title"\)[\s\S]*?titleDesignSelect\.value\s*=\s*normalizeTitleDesign\(slide\?\.titleDesign\)/
    );
    assert.match(
      app,
      /if \(slide\?\.type !== "title"\)[\s\S]*?titleSubtitleInput\.value\s*=\s*slide\?\.titleSubtitle\s*\|\|\s*""/
    );
    assert.match(
      app,
      /if \(slide\?\.type !== "title"\)[\s\S]*?titleServiceDateInput\.value\s*=\s*api[\s\S]*?api\.resolveServiceDate/
    );
  });

  it("builds each added composition and keeps dark previews motif-free", () => {
    for (const name of [
      "EasterDawn",
      "EasterStained",
      "ChristmasBurgundy",
      "ChristmasEvergreen",
      "Thanksgiving",
      "Advent",
      "MidnightSlab",
      "SlateSplit",
      "DeepFog",
    ]) {
      assert.match(app, new RegExp(`function build${name}Preview\\(`));
    }
    assert.match(app, /title-preview-motif/);
    assert.match(app, /title-preview-rule/);
  });

  it("serializes the new fields and posts them for individual download", () => {
    for (const field of ["titleKo", "titleEn", "dateMode", "showDate"]) {
      const occurrences = app.match(new RegExp(`${field}:\\s*slide\\.${field}`, "g")) || [];
      assert.ok(occurrences.length >= 2, `${field} must be cloned and downloaded`);
    }
  });

  it("fills a missing service date on both server export paths", () => {
    assert.match(server, /import\s*\{\s*todayIsoDate\s*\}/);
    assert.ok(
      (server.match(/serviceDate:\s*slideData\.serviceDate\s*\|\|\s*todayIsoDate\(\)/g) || [])
        .length >= 1
    );
    assert.match(
      server,
      /serviceDate:\s*req\.body\.serviceDate\s*\|\|\s*todayIsoDate\(\)/
    );
  });
});
