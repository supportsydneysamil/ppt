import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

const [html, css, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

const document = new JSDOM(html).window.document;
const themeIds = ["original", "aurora", "monolith", "ivory", "marquee"];

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;

  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        parametersEnd = index;
        break;
      }
    }
  }

  assert.notEqual(parametersEnd, -1, `${name} parameters are unbalanced`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }

  throw new Error(`${name} body is unbalanced`);
}

describe("cover title theme picker UI", () => {
  it("provides ordered five-card pickers for hymn and scripture covers", () => {
    for (const gridId of ["hymnTitleThemeGrid", "scriptureTitleThemeGrid"]) {
      const grid = document.getElementById(gridId);
      assert.ok(grid, `${gridId} is missing`);
      const cards = [...grid.querySelectorAll("button[data-title-theme]")];

      assert.deepEqual(
        cards.map((card) => card.dataset.titleTheme),
        themeIds
      );
      assert.deepEqual(
        cards.filter((card) => card.classList.contains("is-active")).map(
          (card) => card.dataset.titleTheme
        ),
        ["original"]
      );
      assert.ok(cards.every((card) => card.getAttribute("aria-label")));
    }
  });

  it("reuses custom title thumbnails and adds an original thumbnail", () => {
    for (const themeId of themeIds) {
      assert.equal(
        document.querySelectorAll(
          `.title-preview-${themeId}[data-cover-title-preview="${themeId}"]`
        ).length,
        2
      );
    }
    assert.match(css, /\.title-preview-original\s*\{/);
  });

  it("normalizes picker values, marks one card, and defaults to original", () => {
    const setter = functionBody(app, "setCoverThemePicker");
    const getter = functionBody(app, "getCoverThemePicker");

    assert.match(setter, /normalizeCoverTitleThemeId\(value\)/);
    assert.match(setter, /classList\.toggle\(\s*["']is-active["']/);
    assert.match(setter, /aria-pressed/);
    assert.match(getter, /\|\|\s*["']original["']/);
  });

  it("hides each picker with its include-title checkbox", () => {
    const helper = functionBody(app, "setCoverThemeGridHidden");
    assert.match(helper, /grid\.hidden\s*=\s*hidden/);
    assert.match(
      app,
      /setCoverThemeGridHidden\(\s*hymnTitleThemeGrid,\s*!hymnIncludeTitle\.checked\s*\)/
    );
    assert.match(
      app,
      /setCoverThemeGridHidden\(\s*scriptureTitleThemeGrid,\s*!scriptureIncludeTitle\.checked\s*\)/
    );
  });

  it("restores saved themes into both pickers", () => {
    const populate = functionBody(app, "populateEditor");
    const populateScripture = functionBody(app, "populateScriptureEditor");

    assert.match(
      populate,
      /setCoverThemePicker\(\s*hymnTitleThemeGrid,\s*slide\.titleThemeId\s*\)/
    );
    assert.match(
      populateScripture,
      /setCoverThemePicker\(\s*scriptureTitleThemeGrid,\s*slide\.titleThemeId\s*\)/
    );
  });

  it("makes both pickers participate in preview and dirty-state handling", () => {
    assert.match(
      app,
      /\[\s*hymnTitleThemeGrid,\s*scriptureTitleThemeGrid,?\s*\]\.forEach\([\s\S]*?addEventListener\(["']click["'][\s\S]*?setCoverThemePicker\([\s\S]*?renderPreview\(\)[\s\S]*?refreshSaveState\(\)/
    );
    assert.match(
      app,
      /grid\s*===\s*hymnTitleThemeGrid[\s\S]*?lastRenderedFile\s*=\s*["']{2}/
    );
    assert.match(
      functionBody(app, "collectCurrentSlideDraft"),
      /getCoverThemePicker\(\s*hymnTitleThemeGrid\s*\)/
    );
    assert.match(
      functionBody(app, "collectScriptureSlideFields"),
      /titleThemeId:\s*getCoverThemePicker\(\s*scriptureTitleThemeGrid\s*\)/
    );
  });

  it("keeps original hymn rendering and routes themed previews through the custom builder", () => {
    const original = functionBody(app, "buildHymnTitleSlidePreview");
    const themed = functionBody(app, "buildThemedHymnTitleSlidePreview");
    const render = functionBody(app, "renderPreview");

    assert.match(original, /hymn-title-bg\.png/);
    assert.match(original, /hymn-title-band\.png/);
    assert.match(themed, /customTitleKo:\s*["']찬송["']/);
    assert.match(themed, /customTitleEn:\s*["']HYMN["']/);
    assert.match(themed, /customTitleSubtitle:\s*hymnTitleText/);
    assert.match(themed, /buildCustomTitleSlidePreview\(/);
    assert.match(
      render,
      /buildThemedHymnTitleSlidePreview\(\s*data\.titleThemeId/
    );
  });
});
