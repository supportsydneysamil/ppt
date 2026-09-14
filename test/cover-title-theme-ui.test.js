import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

const [html, css, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

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

function compileFunction(name, parameters, dependencies = {}) {
  const body = functionBody(app, name);
  const dependencyNames = Object.keys(dependencies);
  const factory = new Function(
    ...dependencyNames,
    `return function (${parameters.join(", ")}) ${body};`
  );
  return factory(...Object.values(dependencies));
}

function createDocument() {
  return new JSDOM(html).window.document;
}

describe("cover title theme picker UI", () => {
  it("provides ordered five-card pickers for hymn and scripture covers", () => {
    const document = createDocument();
    for (const gridId of ["hymnTitleThemeGrid", "scriptureTitleThemeGrid"]) {
      const grid = document.getElementById(gridId);
      assert.ok(grid, `${gridId} is missing`);
      assert.equal(grid.getAttribute("role"), "group");
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
    const document = createDocument();
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

  it("normalizes picker values, marks one card, and defaults behaviorally", () => {
    const document = createDocument();
    const grid = document.getElementById("scriptureTitleThemeGrid");
    const normalize = compileFunction("normalizeCoverTitleThemeId", ["value"], {
      COVER_TITLE_THEME_IDS: themeIds,
    });
    const setPicker = compileFunction("setCoverThemePicker", ["grid", "value"], {
      normalizeCoverTitleThemeId: normalize,
    });
    const getPicker = compileFunction("getCoverThemePicker", ["grid"]);

    setPicker(grid, "marquee");
    assert.equal(getPicker(grid), "marquee");
    assert.deepEqual(
      [...grid.querySelectorAll(".is-active")].map(
        (card) => card.dataset.titleTheme
      ),
      ["marquee"]
    );
    assert.equal(
      grid.querySelector('[data-title-theme="marquee"]').getAttribute(
        "aria-pressed"
      ),
      "true"
    );

    setPicker(grid, "unknown");
    assert.equal(getPicker(grid), "original");
  });

  it("hides each picker with its include-title checkbox", () => {
    const document = createDocument();
    const grid = document.getElementById("scriptureTitleThemeGrid");
    const setHidden = compileFunction("setCoverThemeGridHidden", [
      "grid",
      "hidden",
    ]);

    setHidden(grid, true);
    assert.equal(grid.hidden, true);
    setHidden(grid, false);
    assert.equal(grid.hidden, false);
    assert.match(
      app,
      /setCoverThemeGridHidden\(\s*hymnTitleThemeGrid,\s*!hymnIncludeTitle\.checked\s*\)/
    );
    assert.match(
      app,
      /setCoverThemeGridHidden\(\s*scriptureTitleThemeGrid,\s*!scriptureIncludeTitle\.checked\s*\)/
    );
  });

  it("restores missing themes to original in both pickers", () => {
    const document = createDocument();
    const hymnGrid = document.getElementById("hymnTitleThemeGrid");
    const scriptureGrid = document.getElementById("scriptureTitleThemeGrid");
    const normalize = compileFunction("normalizeCoverTitleThemeId", ["value"], {
      COVER_TITLE_THEME_IDS: themeIds,
    });
    const setPicker = compileFunction("setCoverThemePicker", ["grid", "value"], {
      normalizeCoverTitleThemeId: normalize,
    });
    const getPicker = compileFunction("getCoverThemePicker", ["grid"]);
    const restorePickers = compileFunction(
      "restoreCoverThemePickers",
      ["hymnGrid", "scriptureGrid", "value"],
      { setCoverThemePicker: setPicker }
    );

    setPicker(hymnGrid, "aurora");
    setPicker(scriptureGrid, "marquee");
    restorePickers(hymnGrid, scriptureGrid, undefined);

    assert.equal(getPicker(hymnGrid), "original");
    assert.equal(getPicker(scriptureGrid), "original");

    const populate = functionBody(app, "populateEditor");
    assert.match(
      populate,
      /restoreCoverThemePickers\(\s*hymnTitleThemeGrid,\s*scriptureTitleThemeGrid,\s*slide\.titleThemeId\s*\)/
    );
  });

  it("resets stale picker state when a missing-theme slide changes type", () => {
    const document = createDocument();
    const slideTypeSelect = document.getElementById("slideType");
    const hymnGrid = document.getElementById("hymnTitleThemeGrid");
    const scriptureGrid = document.getElementById("scriptureTitleThemeGrid");
    const scriptureIncludeTitle = document.getElementById(
      "scriptureIncludeTitle"
    );
    const normalize = compileFunction("normalizeCoverTitleThemeId", ["value"], {
      COVER_TITLE_THEME_IDS: themeIds,
    });
    const setPicker = compileFunction("setCoverThemePicker", ["grid", "value"], {
      normalizeCoverTitleThemeId: normalize,
    });
    const getPicker = compileFunction("getCoverThemePicker", ["grid"]);
    const typeChangeSource = app.slice(
      app.indexOf("slideTypeSelect.addEventListener('change'"),
      app.indexOf("hymnLoadBtn.addEventListener")
    );
    const slide = { id: "new-slide" };
    const dependencies = {
      slideTypeSelect,
      prepareTitleSlideFields() {},
      maybeAutoNameCustomTitleSlide() {},
      fillScriptureBookSelects() {},
      scriptureIncludeTitle,
      setScriptureTitleSlideType() {},
      syncScriptureTitleTypeUi() {},
      syncScriptureImageUI() {},
      slides: [slide],
      currentSlideId: slide.id,
      updateSettingsVisibility() {},
      showCustomSlideInEditor() {},
      releaseCustomEditorSlide() {},
      renderPreview() {},
      refreshSaveState() {},
      hymnTitleThemeGrid: hymnGrid,
      scriptureTitleThemeGrid: scriptureGrid,
      restoreCoverThemePickers(hymn, scripture, value) {
        setPicker(hymn, value);
        setPicker(scripture, value);
      },
    };

    setPicker(scriptureGrid, "marquee");
    new Function(...Object.keys(dependencies), typeChangeSource)(
      ...Object.values(dependencies)
    );
    slideTypeSelect.value = "scripture";
    slideTypeSelect.dispatchEvent(
      new document.defaultView.Event("change", { bubbles: true })
    );

    assert.equal(getPicker(scriptureGrid), "original");
    assert.equal(getPicker(hymnGrid), "original");
  });

  it("drives preview and dirty callbacks from real picker clicks", () => {
    const document = createDocument();
    const hymnGrid = document.getElementById("hymnTitleThemeGrid");
    const scriptureGrid = document.getElementById("scriptureTitleThemeGrid");
    const normalize = compileFunction("normalizeCoverTitleThemeId", ["value"], {
      COVER_TITLE_THEME_IDS: themeIds,
    });
    const setPicker = compileFunction("setCoverThemePicker", ["grid", "value"], {
      normalizeCoverTitleThemeId: normalize,
    });
    const listenerStart = app.indexOf(
      "[\n  hymnTitleThemeGrid,\n  scriptureTitleThemeGrid,"
    );
    const listenerSource = app.slice(
      listenerStart,
      app.indexOf(
        "// Only replaces names the user has not personalised yet.",
        listenerStart
      )
    );
    let renders = 0;
    let dirtyRefreshes = 0;
    const slidePreview = document.createElement("div");
    const dependencies = {
      hymnTitleThemeGrid: hymnGrid,
      scriptureTitleThemeGrid: scriptureGrid,
      setCoverThemePicker: setPicker,
      slidePreview,
      renderPreview() {
        renders += 1;
      },
      refreshSaveState() {
        dirtyRefreshes += 1;
      },
    };

    new Function(...Object.keys(dependencies), listenerSource)(
      ...Object.values(dependencies)
    );
    scriptureGrid
      .querySelector('[data-title-theme="ivory"]')
      .dispatchEvent(
        new document.defaultView.MouseEvent("click", { bubbles: true })
      );

    assert.equal(
      scriptureGrid.querySelector(".is-active").dataset.titleTheme,
      "ivory"
    );
    assert.equal(renders, 1);
    assert.equal(dirtyRefreshes, 1);
  });

  it("includes cover state in hymn preview cache identity", () => {
    const normalize = compileFunction("normalizeCoverTitleThemeId", ["value"], {
      COVER_TITLE_THEME_IDS: themeIds,
    });
    const cacheKey = compileFunction(
      "buildHymnTitlePreviewCacheKey",
      ["data"],
      { normalizeCoverTitleThemeId: normalize }
    );
    const cacheHit = compileFunction(
      "isPreviewCacheHit",
      ["cachedSource", "nextSource", "cachedHymnTitle", "nextHymnTitle"]
    );
    const source = "/uploads/hymn.pptx";
    const aurora = cacheKey({
      type: "hymn",
      includeTitle: true,
      titleThemeId: "aurora",
      hymnNumber: 1,
      hymnKorTitle: "찬양",
    });
    const original = cacheKey({
      type: "hymn",
      includeTitle: true,
      titleThemeId: "original",
      hymnNumber: 1,
      hymnKorTitle: "찬양",
    });

    assert.notEqual(aurora, original);
    assert.equal(cacheHit(source, source, aurora, original), false);
    assert.equal(cacheHit(source, source, original, original), true);
    assert.match(app, /lastRenderedHymnTitle/);
    assert.match(functionBody(app, "applySlideSelection"), /renderPreview\(slide\)/);
    assert.match(functionBody(app, "resetCurrentSlide"), /renderPreview\(slide\)/);
  });

  it("keeps both picker values in collected dirty-state drafts", () => {
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
