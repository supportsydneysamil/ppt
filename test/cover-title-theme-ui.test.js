import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import { buildCoverTitleContent } from "../lib/cover-title-slide.js";
import {
  compileFunction as compileAppFunction,
  functionBody,
} from "./helpers/app-function.js";

const [html, css, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

const themeIds = ["original", "aurora", "monolith", "ivory", "marquee"];

function compileFunction(name, parameters, dependencies = {}) {
  return compileAppFunction(app, name, parameters, dependencies);
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

  it("uses grid-scoped theme classes and scripture artwork for its original card", () => {
    const document = createDocument();
    for (const gridId of ["hymnTitleThemeGrid", "scriptureTitleThemeGrid"]) {
      const grid = document.getElementById(gridId);
      for (const themeId of themeIds) {
        assert.ok(
          grid
            .querySelector(`[data-title-theme="${themeId}"]`)
            .querySelector(`.title-preview-${themeId}`)
        );
      }
    }
    assert.equal(document.querySelectorAll("[data-cover-title-preview]").length, 0);
    assert.ok(
      document
        .querySelector("#scriptureTitleThemeGrid [data-title-theme='original']")
        .querySelector(".title-preview-original-scripture")
    );
    assert.match(
      css,
      /\.title-preview-original-scripture\s*\{[\s\S]*scriptures\/title-top\.png/
    );
    assert.match(
      css,
      /\.title-preview-original-scripture::before\s*\{[\s\S]*scriptures\/title-bottom\.png/
    );
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
    let currentSource = slide;
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
      getCurrentTypeChangeSource: () => currentSource,
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

    currentSource = { ...slide, titleThemeId: "ivory" };
    setPicker(scriptureGrid, "marquee");
    slideTypeSelect.dispatchEvent(
      new document.defaultView.Event("change", { bubbles: true })
    );

    assert.equal(getPicker(scriptureGrid), "ivory");
    assert.equal(getPicker(hymnGrid), "ivory");
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

    slidePreview.dataset.lastRenderedUrl = "cached-url";
    slidePreview.dataset.lastRenderedFile = "cached-file";
    slidePreview.dataset.lastRenderedPath = "cached-path";
    new Function(...Object.keys(dependencies), listenerSource)(
      ...Object.values(dependencies)
    );
    hymnGrid
      .querySelector('[data-title-theme="ivory"]')
      .dispatchEvent(
        new document.defaultView.MouseEvent("click", { bubbles: true })
      );

    assert.equal(
      hymnGrid.querySelector(".is-active").dataset.titleTheme,
      "ivory"
    );
    assert.equal(renders, 1);
    assert.equal(dirtyRefreshes, 1);
    assert.equal(slidePreview.dataset.lastRenderedUrl, "cached-url");
    assert.equal(slidePreview.dataset.lastRenderedFile, "cached-file");
    assert.equal(slidePreview.dataset.lastRenderedPath, "cached-path");
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
    assert.match(functionBody(app, "confirmCurrentSlideReset"), /renderPreview\(\)/);
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

  it("formats original and themed hymn subtitles identically without cropping", () => {
    const document = createDocument();
    const buildHymnSubtitle = (data) =>
      buildCoverTitleContent("hymn", data).subtitle;
    const original = compileFunction(
      "buildHymnTitleSlidePreview",
      ["hymnNumber", "korTitle", "engTitle"],
      { document, buildHymnSubtitle }
    );
    const themed = compileFunction(
      "buildThemedHymnTitleSlidePreview",
      ["titleThemeId", "hymnNumber", "korTitle", "engTitle", "previewWidth"],
      {
        buildHymnSubtitle,
        normalizeCoverTitleThemeId: (value) => value,
        buildCustomTitleSlidePreview(data, width) {
          const node = document.createElement("div");
          node.style.width = `${width}px`;
          node.style.height = `${width * 0.5625}px`;
          node.previewData = data;
          return node;
        },
      }
    );

    const originalNode = original(1, "  찬양하라  ", "  Praise Him  ");
    const themedNode = themed(
      "aurora",
      1,
      "  찬양하라  ",
      "  Praise Him  ",
      640
    );

    assert.equal(originalNode.children[1].textContent, "1. 찬양하라\n(Praise Him)");
    assert.equal(
      themedNode.previewData.customTitleSubtitle,
      "1. 찬양하라\n(Praise Him)"
    );
    assert.equal(themedNode.style.width, "100%");
    assert.equal(themedNode.style.aspectRatio, "16 / 9");
    assert.equal(themedNode.style.marginBottom, "8px");
    assert.equal(themedNode.style.borderRadius, "4px");
  });
});
