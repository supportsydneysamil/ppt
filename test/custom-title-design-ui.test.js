import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import {
  CUSTOM_TITLE_DESIGN_CATALOG,
  CUSTOM_TITLE_DESIGN_CATEGORIES,
  DEFAULT_CUSTOM_TITLE_DESIGN_ID,
} from "../lib/custom-title-design-catalog.js";
import {
  compileFunction as compileAppFunction,
  functionBody,
} from "./helpers/app-function.js";

const [html, css, app, main] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/main.jsx", import.meta.url), "utf8"),
]);

const catalogApi = {
  CUSTOM_TITLE_DESIGN_CATALOG,
  CUSTOM_TITLE_DESIGN_CATEGORIES,
  DEFAULT_CUSTOM_TITLE_DESIGN_ID,
  normalizeCustomTitleDesignId(value) {
    return CUSTOM_TITLE_DESIGN_CATALOG.some((design) => design.id === value)
      ? value
      : DEFAULT_CUSTOM_TITLE_DESIGN_ID;
  },
  findCustomTitleDesign(id) {
    return CUSTOM_TITLE_DESIGN_CATALOG.find((design) => design.id === id) || null;
  },
  findCustomTitleDesignCategory(id) {
    const design = this.findCustomTitleDesign(id);
    return (
      CUSTOM_TITLE_DESIGN_CATEGORIES.find(
        (category) => category.id === design?.categoryId
      ) || null
    );
  },
  listCustomTitleDesignsByCategory(categoryId) {
    return CUSTOM_TITLE_DESIGN_CATALOG.filter(
      (design) => design.categoryId === categoryId
    );
  },
};

function createDocument() {
  return new JSDOM(html).window.document;
}

function compileFunction(name, parameters, dependencies = {}) {
  const shared = {
    ...dependencies,
    customTitleCatalogApi: () => catalogApi,
  };
  if (
    dependencies.document &&
    dependencies.buildCustomTitleSlidePreview
  ) {
    shared.createCustomTitleDesignCard = compileAppFunction(
      app,
      "createCustomTitleDesignCard",
      ["design", "selectedId"],
      shared
    );
    shared.filterCustomTitleDesignCategory = compileAppFunction(
      app,
      "filterCustomTitleDesignCategory",
      ["categoryGroup", "designGrid", "designSelect", "categoryId"],
      shared
    );
  }
  shared.normalizeCustomTitleDesign = (value) =>
    catalogApi.normalizeCustomTitleDesignId(value);
  return compileAppFunction(app, name, parameters, shared);
}

function pickerNodes(document) {
  return {
    categories: document.getElementById("customTitleDesignCategories"),
    grid: document.getElementById("customTitleDesignGrid"),
    select: document.getElementById("customTitleDesign"),
  };
}

describe("catalog-driven custom title design picker", () => {
  it("uses the catalog as the only source for 9 ordered categories and 31 designs", () => {
    assert.equal(CUSTOM_TITLE_DESIGN_CATEGORIES.length, 9);
    assert.equal(CUSTOM_TITLE_DESIGN_CATALOG.length, 31);
    assert.deepEqual(
      CUSTOM_TITLE_DESIGN_CATEGORIES.map((category) => category.name),
      [
        "기본",
        "성탄절",
        "부활절",
        "사순절",
        "종려주일",
        "맥추감사절",
        "송구영신",
        "신년",
        "기타 (고급)",
      ]
    );
    assert.ok(
      CUSTOM_TITLE_DESIGN_CATEGORIES.every((category) => {
        const count = CUSTOM_TITLE_DESIGN_CATALOG.filter(
          (design) => design.categoryId === category.id
        ).length;
        return count >= 2 && count <= 4;
      })
    );
    assert.match(main, /import \* as customTitleDesignCatalog from "@lib\/custom-title-design-catalog\.js"/);
    assert.match(main, /window\.CustomTitleDesignCatalog\s*=\s*customTitleDesignCatalog/);
  });

  it("keeps empty runtime hosts and does not hardcode catalog cards or options in HTML", () => {
    const document = createDocument();
    const { categories, grid, select } = pickerNodes(document);
    assert.equal(categories.getAttribute("role"), "group");
    assert.equal(categories.getAttribute("aria-label"), "커스텀 타이틀 디자인 카테고리");
    assert.equal(grid.getAttribute("role"), "group");
    assert.equal(grid.getAttribute("aria-label"), "커스텀 타이틀 디자인");
    assert.equal(categories.children.length, 0);
    assert.equal(grid.children.length, 0);
    assert.equal(select.options.length, 0);
    assert.doesNotMatch(html, /data-custom-title-design=/);
  });

  it("initializes 기본/aurora, all select options, and accessible pressed states", () => {
    const document = createDocument();
    const { categories, grid, select } = pickerNodes(document);
    const initialize = compileFunction(
      "initializeCustomTitleDesignPicker",
      ["categoryGroup", "designGrid", "designSelect", "value"],
      {
        document,
        buildCustomTitleSlidePreview() {
          return document.createElement("span");
        },
      }
    );

    const selected = initialize(categories, grid, select);

    assert.equal(selected, DEFAULT_CUSTOM_TITLE_DESIGN_ID);
    assert.equal(select.value, "aurora");
    assert.deepEqual(
      [...select.options].map((option) => option.value),
      CUSTOM_TITLE_DESIGN_CATALOG.map((design) => design.id)
    );
    assert.deepEqual(
      [...categories.querySelectorAll("button")].map((button) => button.textContent),
      CUSTOM_TITLE_DESIGN_CATEGORIES.map((category) => category.name)
    );
    assert.equal(categories.querySelectorAll("button").length, 9);
    assert.equal(grid.querySelectorAll("button").length, 4);
    assert.ok(
      [...categories.querySelectorAll("button")].every(
        (button) =>
          button.getAttribute("aria-label") &&
          ["true", "false"].includes(button.getAttribute("aria-pressed"))
      )
    );
    assert.ok(
      [...grid.querySelectorAll("button")].every(
        (button) =>
          button.getAttribute("aria-label") &&
          ["true", "false"].includes(button.getAttribute("aria-pressed"))
      )
    );
  });

  it("filters categories without mutating the selected form design", () => {
    const document = createDocument();
    const { categories, grid, select } = pickerNodes(document);
    const initialize = compileFunction(
      "initializeCustomTitleDesignPicker",
      ["categoryGroup", "designGrid", "designSelect", "value"],
      {
        document,
        buildCustomTitleSlidePreview() {
          return document.createElement("span");
        },
      }
    );
    const filter = compileFunction(
      "filterCustomTitleDesignCategory",
      ["categoryGroup", "designGrid", "designSelect", "categoryId"],
      {
        document,
        buildCustomTitleSlidePreview() {
          return document.createElement("span");
        },
      }
    );
    initialize(categories, grid, select, "aurora");

    for (const category of CUSTOM_TITLE_DESIGN_CATEGORIES) {
      filter(categories, grid, select, category.id);
      assert.equal(select.value, "aurora");
      assert.deepEqual(
        [...grid.querySelectorAll("[data-custom-title-design]")].map(
          (card) => card.dataset.customTitleDesign
        ),
        CUSTOM_TITLE_DESIGN_CATALOG.filter(
          (design) => design.categoryId === category.id
        ).map((design) => design.id)
      );
      assert.equal(
        categories
          .querySelector(`[data-custom-title-category="${category.id}"]`)
          .getAttribute("aria-pressed"),
        "true"
      );
    }
    assert.equal(grid.querySelectorAll(".is-active").length, 0);
  });

  it("design clicks update form state, cards, preview, and dirty state", () => {
    const document = createDocument();
    const { categories, grid, select } = pickerNodes(document);
    let renders = 0;
    let dirtyRefreshes = 0;
    const initialize = compileFunction(
      "initializeCustomTitleDesignPicker",
      ["categoryGroup", "designGrid", "designSelect", "value"],
      {
        document,
        buildCustomTitleSlidePreview() {
          return document.createElement("span");
        },
      }
    );
    const setup = compileFunction(
      "setupCustomTitleDesignPicker",
      [
        "categoryGroup",
        "designGrid",
        "designSelect",
        "render",
        "refreshDirty",
      ],
      {
        document,
        buildCustomTitleSlidePreview() {
          return document.createElement("span");
        },
      }
    );
    initialize(categories, grid, select, "aurora");
    setup(
      categories,
      grid,
      select,
      () => {
        renders += 1;
      },
      () => {
        dirtyRefreshes += 1;
      }
    );

    grid
      .querySelector('[data-custom-title-design="ivory"]')
      .dispatchEvent(new document.defaultView.MouseEvent("click", { bubbles: true }));

    assert.equal(select.value, "ivory");
    assert.equal(grid.querySelector(".is-active").dataset.customTitleDesign, "ivory");
    assert.equal(
      grid
        .querySelector('[data-custom-title-design="ivory"]')
        .getAttribute("aria-pressed"),
      "true"
    );
    assert.equal(renders, 1);
    assert.equal(dirtyRefreshes, 1);
  });

  it("restores saved designs to their category and normalizes unknown ids", () => {
    const document = createDocument();
    const { categories, grid, select } = pickerNodes(document);
    const initialize = compileFunction(
      "initializeCustomTitleDesignPicker",
      ["categoryGroup", "designGrid", "designSelect", "value"],
      {
        document,
        buildCustomTitleSlidePreview() {
          return document.createElement("span");
        },
      }
    );

    initialize(categories, grid, select, "wilderness-violet");
    assert.equal(select.value, "wilderness-violet");
    assert.equal(
      categories.querySelector(".is-active").dataset.customTitleCategory,
      "lent"
    );
    assert.equal(
      grid.querySelector(".is-active").dataset.customTitleDesign,
      "wilderness-violet"
    );

    initialize(categories, grid, select, "not-a-design");
    assert.equal(select.value, "aurora");
    assert.equal(
      categories.querySelector(".is-active").dataset.customTitleCategory,
      "default"
    );
    assert.equal(grid.querySelector(".is-active").dataset.customTitleDesign, "aurora");
    assert.match(
      functionBody(app, "populateEditor"),
      /initializeCustomTitleDesignPicker\([\s\S]*?slide\.customTitleDesign/
    );
  });

  it("builds every thumbnail and slide preview from all eight families and local assets", () => {
    const previewBody = functionBody(app, "buildCustomTitleSlidePreview");
    const thumbnailBody = functionBody(app, "createCustomTitleDesignCard");
    for (const family of [
      "centered-rule",
      "double-frame",
      "ornament-frame",
      "side-band",
      "horizon-split",
      "emblem-crest",
      "veil-panel",
      "corner-mark",
    ]) {
      assert.match(app, new RegExp(`["']${family}["']`));
    }
    assert.match(previewBody, /design\.layoutFamily/);
    assert.match(previewBody, /design\.theme/);
    assert.match(previewBody, /design\.asset/);
    assert.match(previewBody, /url\(["']?\/\$\{design\.asset\.path\}/);
    assert.match(thumbnailBody, /buildCustomTitleSlidePreview/);
    assert.match(thumbnailBody, /customTitleKo:/);
    assert.doesNotMatch(app, /https?:\/\/[^"'`]*custom-title/);
  });

  it("adds compact responsive category and card layouts", () => {
    assert.match(css, /\.custom-title-category-group\s*\{[\s\S]*flex-wrap:\s*wrap/);
    assert.match(css, /\.custom-title-design-grid\s*\{[\s\S]*grid-template-columns/);
    assert.match(css, /@media\s*\(max-width:\s*800px\)[\s\S]*\.custom-title-category-group/);
  });
});
