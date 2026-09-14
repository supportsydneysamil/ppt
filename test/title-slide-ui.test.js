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

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, end === -1 ? app.length : end);
}

describe("Sunday worship title editor", () => {
  it("shows all twelve design cards and options in the approved order", () => {
    const cardIds = Array.from(
      html.matchAll(/data-title-design="([^"]+)"/g),
      (match) => match[1]
    );
    assert.deepEqual(cardIds, designIds);

    const select = html.match(
      /<select id="titleDesign"[\s\S]*?<\/select>/
    )?.[0];
    assert.ok(select, "missing title design select");
    const optionIds = Array.from(
      select.matchAll(/<option value="([^"]+)"/g),
      (match) => match[1]
    );
    assert.deepEqual(optionIds, designIds);

    for (const design of designIds.slice(3)) {
      assert.match(css, new RegExp(`\\.title-preview-${design}`));
    }
  });

  it("provides title, date visibility, mode, and free date controls", () => {
    assert.match(html, /<label[^>]+for="titleKo"/);
    assert.match(html, /<label[^>]+for="titleEn"/);
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
      /titleDesignSelect\.value\s*=\s*normalizeTitleDesign\(slide\?\.titleDesign\)/
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
  });

  it("uses browser today for a blank preview date", () => {
    const preview = functionSource("buildTitleSlidePreview");
    assert.match(
      preview,
      /dateApi\.resolveServiceDate\(\s*"custom",\s*data\.serviceDate,\s*dateApi\.todayIsoDate\(\)\s*\)/
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
