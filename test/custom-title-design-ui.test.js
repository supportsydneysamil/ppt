import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import * as catalogApi from "../lib/custom-title-design-catalog.js";

const [html, css, main] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/main.jsx", import.meta.url), "utf8"),
]);

function createDocument() {
  return new JSDOM(html).window.document;
}

function pickerNodes(document) {
  return {
    categoryGroup: document.getElementById("customTitleDesignCategories"),
    designGrid: document.getElementById("customTitleDesignGrid"),
    designSelect: document.getElementById("customTitleDesign"),
  };
}

function visibleDesignIds(grid) {
  return [...grid.querySelectorAll("[data-custom-title-design]")].map(
    (card) => card.dataset.customTitleDesign
  );
}

function designsIn(categoryId) {
  return catalogApi.CUSTOM_TITLE_DESIGN_CATALOG.filter(
    (design) => design.categoryId === categoryId
  ).map((design) => design.id);
}

async function loadPickerModule() {
  return import("../public/custom-title-design-picker.js");
}

async function loadPreviewModule() {
  return import("../public/custom-title-preview.js");
}

describe("catalog-driven custom title design picker", () => {
  it("uses the catalog as the only source for ordered categories and designs", () => {
    assert.equal(catalogApi.CUSTOM_TITLE_DESIGN_CATEGORIES.length, 9);
    assert.equal(catalogApi.CUSTOM_TITLE_DESIGN_CATALOG.length, 31);
    assert.deepEqual(
      catalogApi.CUSTOM_TITLE_DESIGN_CATEGORIES.map((category) => category.name),
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
      catalogApi.CUSTOM_TITLE_DESIGN_CATEGORIES.every((category) => {
        const count = designsIn(category.id).length;
        return count >= 2 && count <= 4;
      })
    );
    assert.match(
      main,
      /import \* as customTitleDesignCatalog from "@lib\/custom-title-design-catalog\.js"/
    );
    assert.match(
      main,
      /window\.CustomTitleDesignCatalog\s*=\s*customTitleDesignCatalog/
    );
  });

  it("keeps runtime hosts empty and grouped accessibly in HTML", () => {
    const document = createDocument();
    const { categoryGroup, designGrid, designSelect } = pickerNodes(document);
    assert.equal(categoryGroup.getAttribute("role"), "group");
    assert.equal(
      categoryGroup.getAttribute("aria-label"),
      "커스텀 타이틀 디자인 카테고리"
    );
    assert.equal(designGrid.getAttribute("role"), "group");
    assert.equal(designGrid.getAttribute("aria-label"), "커스텀 타이틀 디자인");
    assert.equal(categoryGroup.children.length, 0);
    assert.equal(designGrid.children.length, 0);
    assert.equal(designSelect.options.length, 0);
    assert.doesNotMatch(html, /data-custom-title-design=/);
  });

  it("handles delegated category clicks before and after saved-design restore", async () => {
    const document = createDocument();
    const { createCustomTitleDesignPicker } = await loadPickerModule();
    const { buildCustomTitleSlidePreview } = await loadPreviewModule();
    const nodes = pickerNodes(document);
    const picker = createCustomTitleDesignPicker({
      document,
      ...nodes,
      catalogApi,
      buildPreview: (data, width) =>
        buildCustomTitleSlidePreview(data, width, { document, catalogApi }),
    });

    assert.equal(nodes.designSelect.value, "aurora");
    assert.deepEqual(visibleDesignIds(nodes.designGrid), designsIn("default"));

    nodes.categoryGroup
      .querySelector('[data-custom-title-category="christmas"]')
      .dispatchEvent(new document.defaultView.MouseEvent("click", { bubbles: true }));
    assert.deepEqual(visibleDesignIds(nodes.designGrid), designsIn("christmas"));
    assert.equal(nodes.designSelect.value, "aurora");
    assert.equal(
      nodes.categoryGroup
        .querySelector('[data-custom-title-category="christmas"]')
        .getAttribute("aria-pressed"),
      "true"
    );

    picker.restore("wilderness-violet");
    assert.equal(nodes.designSelect.value, "wilderness-violet");
    assert.deepEqual(visibleDesignIds(nodes.designGrid), designsIn("lent"));

    nodes.categoryGroup
      .querySelector('[data-custom-title-category="new-year"]')
      .dispatchEvent(new document.defaultView.MouseEvent("click", { bubbles: true }));
    assert.deepEqual(visibleDesignIds(nodes.designGrid), designsIn("new-year"));
    assert.equal(nodes.designSelect.value, "wilderness-violet");
    assert.equal(
      nodes.categoryGroup
        .querySelector('[data-custom-title-category="new-year"]')
        .getAttribute("aria-pressed"),
      "true"
    );
  });

  it("updates selection, aria state, preview, and dirty state from real card clicks", async () => {
    const document = createDocument();
    const { createCustomTitleDesignPicker } = await loadPickerModule();
    const { buildCustomTitleSlidePreview } = await loadPreviewModule();
    const nodes = pickerNodes(document);
    let renders = 0;
    let dirtyRefreshes = 0;
    createCustomTitleDesignPicker({
      document,
      ...nodes,
      catalogApi,
      buildPreview: (data, width) =>
        buildCustomTitleSlidePreview(data, width, { document, catalogApi }),
      render: () => {
        renders += 1;
      },
      refreshDirty: () => {
        dirtyRefreshes += 1;
      },
    });

    nodes.designGrid
      .querySelector('[data-custom-title-design="ivory"]')
      .dispatchEvent(new document.defaultView.MouseEvent("click", { bubbles: true }));

    assert.equal(nodes.designSelect.value, "ivory");
    assert.equal(
      nodes.designGrid.querySelector(".is-active").dataset.customTitleDesign,
      "ivory"
    );
    assert.ok(
      [...nodes.designGrid.querySelectorAll("[data-custom-title-design]")].every(
        (card) =>
          card.getAttribute("aria-pressed") ===
          String(card.dataset.customTitleDesign === "ivory")
      )
    );
    assert.equal(renders, 1);
    assert.equal(dirtyRefreshes, 1);
  });

  it("restores editor state through the integration seam used by populateEditor", async () => {
    const document = createDocument();
    const {
      createCustomTitleDesignPicker,
      restoreCustomTitleDesignEditor,
    } = await loadPickerModule();
    const { buildCustomTitleSlidePreview } = await loadPreviewModule();
    const nodes = pickerNodes(document);
    const picker = createCustomTitleDesignPicker({
      document,
      ...nodes,
      catalogApi,
      buildPreview: (data, width) =>
        buildCustomTitleSlidePreview(data, width, { document, catalogApi }),
    });

    const restored = restoreCustomTitleDesignEditor(picker, {
      type: "custom-title",
      customTitleDesign: "midnight-gate",
    });
    assert.equal(restored, "midnight-gate");
    assert.equal(nodes.designSelect.value, "midnight-gate");
    assert.deepEqual(visibleDesignIds(nodes.designGrid), designsIn("year-end"));
    assert.equal(
      nodes.categoryGroup.querySelector(".is-active").dataset.customTitleCategory,
      "year-end"
    );

    const normalized = restoreCustomTitleDesignEditor(picker, {
      type: "custom-title",
      customTitleDesign: "missing-design",
    });
    assert.equal(normalized, "aurora");
    assert.equal(nodes.designSelect.value, "aurora");
    assert.deepEqual(visibleDesignIds(nodes.designGrid), designsIn("default"));
  });

  it("renders representative designs from all eight families with real motif geometry", async () => {
    const document = createDocument();
    const { buildCustomTitleSlidePreview } = await loadPreviewModule();
    const representatives = {
      "centered-rule": "silent-linen",
      "double-frame": "snow-sanctuary",
      "ornament-frame": "gold-carol",
      "side-band": "wilderness-violet",
      "horizon-split": "resurrection-dawn",
      "emblem-crest": "ash-cross",
      "veil-panel": "empty-tomb-light",
      "corner-mark": "lily-morning",
    };

    for (const [family, designId] of Object.entries(representatives)) {
      let preview;
      assert.doesNotThrow(() => {
        preview = buildCustomTitleSlidePreview(
          {
            customTitleDesign: designId,
            customTitleKo: "예배",
            customTitleEn: "WORSHIP",
            customTitleSubtitle: "함께 드리는 예배",
          },
          640,
          { document, catalogApi }
        );
      });
      assert.equal(preview.dataset.customTitleFamily, family);
      const motif = preview.querySelector(
        `[data-custom-title-family-motif="${family}"]`
      );
      assert.ok(motif, `${family} motif is missing`);
      assert.ok(motif.style.cssText, `${family} motif has no geometry`);
      assert.ok(preview.querySelector("[data-custom-title-stack]"));
      assert.ok(preview.querySelector("[data-custom-title-subtitle]"));
    }
  });

  it("renders every image-backed design with its exact local background URL", async () => {
    const document = createDocument();
    const { buildCustomTitleSlidePreview } = await loadPreviewModule();
    const imageDesigns = catalogApi.CUSTOM_TITLE_DESIGN_CATALOG.filter(
      (design) => design.asset
    );

    for (const design of imageDesigns) {
      let preview;
      assert.doesNotThrow(() => {
        preview = buildCustomTitleSlidePreview(
          { customTitleDesign: design.id, customTitleKo: "예배" },
          400,
          { document, catalogApi }
        );
      });
      assert.equal(
        preview.dataset.customTitleBackgroundImage,
        `url("/${design.asset.path}")`
      );
      assert.ok(
        preview.style.backgroundImage.includes(`url("/${design.asset.path}")`)
      );
    }
  });

  it("falls back safely when normalized catalog lookup returns no design", async () => {
    const document = createDocument();
    const { buildCustomTitleSlidePreview } = await loadPreviewModule();
    const brokenCatalog = {
      normalizeCustomTitleDesignId: () => "missing",
      findCustomTitleDesign: () => null,
    };
    let preview;
    assert.doesNotThrow(() => {
      preview = buildCustomTitleSlidePreview(
        { customTitleDesign: "missing", customTitleKo: "예배" },
        400,
        { document, catalogApi: brokenCatalog }
      );
    });
    assert.equal(preview.dataset.customTitleDesign, "aurora");
  });

  it("adds compact responsive category and card layouts", () => {
    assert.match(css, /\.custom-title-category-group\s*\{[\s\S]*flex-wrap:\s*wrap/);
    assert.match(css, /\.custom-title-design-grid\s*\{[\s\S]*grid-template-columns/);
    assert.match(
      css,
      /@media\s*\(max-width:\s*800px\)[\s\S]*\.custom-title-category-group/
    );
  });
});
