import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import * as titleSlideDate from "../lib/title-slide-date.js";

const [html, css, app, main, server] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/main.jsx", import.meta.url), "utf8"),
  fs.readFile(new URL("../server.js", import.meta.url), "utf8"),
]);

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, end === -1 ? app.length : end);
}

describe("Sunday worship title editor", () => {
  it("hosts empty category and card containers for catalog rendering", () => {
    assert.match(html, /id="titleDesignCategoryGroup"/);
    assert.match(html, /id="titleDesignGrid"/);
    assert.equal([...html.matchAll(/data-title-design="/g)].length, 0);
    const select = html.match(
      /<select id="titleDesign"[\s\S]*?<\/select>/
    )?.[0];
    assert.ok(select, "missing title design select");
    assert.equal([...select.matchAll(/<option /g)].length, 0);
  });

  it("exposes the Sunday title catalog on window", () => {
    assert.match(main, /window\.TitleSlideDesignCatalog\s*=/);
    assert.match(app, /window\.TitleSlideDesignCatalog/);
  });

  it("switches categories to their first card and keeps thanksgiving hidden", () => {
    const filter = functionSource("filterTitleDesignCategory");
    assert.match(filter, /listTitleDesignsByCategory/);
    assert.match(filter, /designs\[0\]\.id/);
    assert.match(filter, /render\(\)/);
    assert.match(filter, /refreshDirty\(\)/);

    const initialize = functionSource("initializeTitleDesignPicker");
    assert.match(initialize, /value\s*===\s*["']thanksgiving["']/);
    assert.match(initialize, /DEFAULT_TITLE_DESIGN_ID/);
    assert.doesNotMatch(initialize, /TITLE_SLIDE_DESIGN_IDS.*thanksgiving/);
  });

  it("provides title, date visibility, mode, and free date controls", () => {
    assert.match(html, /<label[^>]+for="titleChurchName"/);
    assert.match(html, /<label[^>]+for="titleKo"/);
    assert.match(html, /<label[^>]+for="titleEn"/);
    assert.match(html, /<label[^>]+for="titleSubtitle"/);
    assert.match(html, /<label[^>]+for="titleServiceDate"/);
    assert.match(html, /id="titleShowDate"/);
    assert.match(html, /id="titleDateModeLabel"/);
    assert.match(
      html,
      /class="rte-seg-group"\s+id="titleDateMode"\s+role="radiogroup"\s+aria-labelledby="titleDateModeLabel"/
    );
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

  it("keeps the editorial English preview at the PPTX fixed 14pt size", () => {
    const editorial = functionSource("buildEditorialPreview");
    assert.match(
      editorial,
      /font-size:\$\{pt\(14\)\}px;[\s\S]*?content\.en/
    );
    assert.doesNotMatch(editorial, /titleEnFontSize/);
  });

  it("hides original-design English rules only when English is empty", () => {
    const editorial = functionSource("buildEditorialPreview");
    assert.match(
      editorial,
      /if \(content\.en\) \{[\s\S]*?middle\.appendChild\(rule\)[\s\S]*?content\.en/
    );

    const glow = functionSource("buildGlowPreview");
    assert.match(
      glow,
      /if \(content\.en\) \{[\s\S]*?upper\.appendChild\(rule\)[\s\S]*?content\.en/
    );
    assert.match(glow, /if \(content\.en\) \{[\s\S]*?forEach/);
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

  it("hydrates null legacy titles from the current design and preserves empty strings", () => {
    const prepare = functionSource("prepareTitleSlideFields");
    assert.match(
      prepare,
      /initializeTitleDesignPicker\([\s\S]*?slide\?\.titleDesign/
    );
    assert.match(
      prepare,
      /slide\?\.titleKo\s*==\s*null\s*\?\s*textApi\.defaultTitleKo\(\)\s*:\s*slide\.titleKo/
    );
    assert.match(
      prepare,
      /slide\?\.titleEn\s*==\s*null\s*\?\s*textApi\.defaultTitleEn\(titleDesignSelect\.value\)\s*:\s*slide\.titleEn/
    );
    assert.match(
      prepare,
      /titleSubtitleInput\.value\s*=\s*slide\?\.titleSubtitle\s*\|\|\s*""/
    );
    assert.match(
      prepare,
      /titleServiceDateInput\.value\s*=\s*api[\s\S]*?api\.resolveServiceDate/
    );
  });

  it("synchronizes automatic dates onto the opened slide record", () => {
    const populate = functionSource("populateEditor");
    assert.match(
      populate,
      /api\.syncAutomaticServiceDate\(slide,\s*api\.todayIsoDate\(\)\)/
    );
    assert.match(populate, /canonical slide record/);
  });

  it("uses browser today only for blank preview dates", () => {
    assert.equal(typeof titleSlideDate.previewServiceDate, "function");
    const today = "2026-09-14";
    assert.equal(
      titleSlideDate.formatServiceDateKo(
        titleSlideDate.previewServiceDate("", today)
      ),
      "2026년 9월 14일 주일"
    );
    assert.equal(
      titleSlideDate.formatServiceDateKo(
        titleSlideDate.previewServiceDate("nope", today)
      ),
      ""
    );

    const preview = functionSource("buildTitleSlidePreview");
    assert.match(
      preview,
      /dateApi\.previewServiceDate\(\s*data\.serviceDate,\s*dateApi\.todayIsoDate\(\)\s*\)/
    );
    assert.match(preview, /formatTitleDateKo\(serviceDate\)/);
    assert.match(preview, /formatTitleDateEn\(serviceDate\)/);
  });

  it("creates motifs only in seasonal preview builders", () => {
    const seasonal = [
      "EasterDawn",
      "EasterStained",
      "ChristmasBurgundy",
      "ChristmasEvergreen",
      "Thanksgiving",
      "Advent",
    ];
    const dark = [
      "MidnightSlab",
      "SlateSplit",
      "DeepFog",
    ];

    for (const name of seasonal) {
      const builder = functionSource(`build${name}Preview`);
      assert.match(builder, /titlePreviewMotif\(/, `${name} needs a motif`);
    }
    for (const name of dark) {
      const builder = functionSource(`build${name}Preview`);
      assert.match(builder, /titlePreviewRule\(/, `${name} needs layout rules`);
      assert.doesNotMatch(
        builder,
        /titlePreviewMotif\(/,
        `${name} must remain symbol-free`
      );
    }
  });

  it("uses catalog themes and families for new previews", () => {
    const preview = functionSource("buildCatalogFamilyPreview");
    assert.match(preview, /design\.asset/);
    assert.match(preview, /layoutFamily:\s*family/);
    assert.match(preview, /titleKoFontSize/);
    assert.match(preview, /titleEnFontSize/);
    assert.match(preview, /lent-veil/);
    assert.match(preview, /palm-procession/);
    assert.match(preview, /new-year-blessing/);
  });

  it("keeps the season suggestion limited to subtitle copy", () => {
    const start = app.indexOf("titleSeasonSuggestBtn.addEventListener");
    const end = app.indexOf("// --- Title (Custom) slide listeners ---", start);
    const handler = app.slice(start, end);
    assert.match(handler, /titleSubtitleInput\.value/);
    assert.doesNotMatch(handler, /titleDesign/);
  });

  it("has visible keyboard focus for hidden date-mode radios", () => {
    assert.match(
      css,
      /\.rte-seg-item input:focus-visible\s*\+\s*span\s*\{[\s\S]*?(?:outline|box-shadow):/
    );
  });

  it("delegates title design and defaults without local copy fallbacks", () => {
    const helpers = app.slice(
      app.indexOf("// --- Title slide (Sunday worship cover) helpers ---"),
      app.indexOf("function formatTitleDateKo")
    );
    assert.doesNotMatch(helpers, /const TITLE_DESIGNS/);
    assert.doesNotMatch(helpers, /return "SUNDAY WORSHIP"/);
    assert.doesNotMatch(helpers, /\? api\.[\s\S]*?\s:\s/);
    assert.match(helpers, /return window\.TitleSlideText;/);
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
