import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import AdmZip from "adm-zip";
import { JSDOM } from "jsdom";
import PptxGenJS from "pptxgenjs";

import {
  COVER_TITLE_THEMES,
  normalizeTitleThemeId,
} from "../lib/cover-title-content.js";
import * as catalogApi from "../lib/custom-title-design-catalog.js";
import {
  appendCustomTitleSlide,
  normalizeCustomTitleDesign,
} from "../lib/custom-title-slide.js";
import { sanitizeSlideForTemplate } from "../lib/slide-record.js";
import { buildResetSlideDraft, createSnapshot } from "../lib/save-state.js";
import {
  createCustomTitleDesignPicker,
  restoreCustomTitleDesignEditor,
} from "../public/custom-title-design-picker.js";
import { buildCustomTitleSlidePreview } from "../public/custom-title-preview.js";
import { compileFunction } from "./helpers/app-function.js";

const [html, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

const COVER_IDS = ["original", "aurora", "monolith", "ivory", "marquee"];
const LEGACY_CUSTOM_IDS = COVER_IDS.slice(1);
const SEASONAL_DESIGNS = catalogApi.CUSTOM_TITLE_DESIGN_CATALOG.filter(
  ({ categoryId }) => categoryId !== "default"
);
const CATEGORY_REPRESENTATIVES = [
  "bethlehem-star",
  "resurrection-dawn",
  "ash-cross",
  "palm-shadow",
  "first-fruits",
  "midnight-gate",
  "dawn-horizon",
  "midnight-onyx",
];

function createPicker() {
  const document = new JSDOM(
    "<div id='categories'></div><div id='designs'></div><select id='selected'></select>"
  ).window.document;
  const picker = createCustomTitleDesignPicker({
    document,
    categoryGroup: document.getElementById("categories"),
    designGrid: document.getElementById("designs"),
    designSelect: document.getElementById("selected"),
    catalogApi,
    buildPreview: (data, width) =>
      buildCustomTitleSlidePreview(data, width, {
        document,
        catalogApi,
      }),
  });
  return { document, picker };
}

function serializeInClient(designId) {
  const collect = compileFunction(
    app,
    "collectCustomTitleSlideData",
    [],
    {
      customTitleDesignSelect: { value: designId },
      customTitleKoInput: { value: "  예배  " },
      customTitleEnInput: { value: "  Worship  " },
      customTitleSubtitleInput: { value: "  함께  " },
      normalizeCustomTitleDesign: catalogApi.normalizeCustomTitleDesignId,
    }
  );
  return collect();
}

async function renderDesign(designId) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendCustomTitleSlide(pptx, {
    customTitleDesign: designId,
    customTitleKo: "예배",
  });
  const zip = new AdmZip(await pptx.write({ outputType: "nodebuffer" }));
  return zip.readAsText("ppt/slides/slide1.xml");
}

const LEGACY_RENDER_SIGNALS = {
  aurora: { family: "centered-rule", background: "170E33" },
  monolith: { family: "centered-rule", background: "0A0B0D" },
  ivory: { family: "double-frame", background: "FAF6EF" },
  marquee: { family: "ornament-frame", background: "2A0F16" },
};

function assertRendererIdentity(slideXml, design) {
  assert.match(
    slideXml,
    new RegExp(`name="custom-title:family:${design.layoutFamily}"`)
  );
  assert.match(
    slideXml,
    new RegExp(`<a:srgbClr val="${design.theme.background}"`)
  );
}

function savedSlide(designId) {
  return {
    id: `custom-${designId}`,
    name: "호환성",
    type: "custom-title",
    sourceType: "basic",
    saved: true,
    customTitleDesign: designId,
    customTitleKo: "예배",
    customTitleEn: "Worship",
    customTitleSubtitle: "함께",
  };
}

describe("cover theme isolation", () => {
  it("keeps the five cover ids ordered and rejects every seasonal custom-only id", () => {
    assert.deepEqual(COVER_TITLE_THEMES, COVER_IDS);
    assert.equal(SEASONAL_DESIGNS.length, 27);
    for (const { id } of SEASONAL_DESIGNS) {
      assert.equal(normalizeTitleThemeId(id), "original", id);
    }

    const document = new JSDOM(html).window.document;
    for (const gridId of ["hymnTitleThemeGrid", "scriptureTitleThemeGrid"]) {
      assert.deepEqual(
        [
          ...document.querySelectorAll(
            `#${gridId} [data-title-theme]`
          ),
        ].map((card) => card.dataset.titleTheme),
        COVER_IDS
      );
    }
  });
});

describe("saved custom title compatibility", () => {
  it("preserves every legacy design through persistence, UI, preview, and rendering", async () => {
    for (const designId of LEGACY_CUSTOM_IDS) {
      const sanitized = sanitizeSlideForTemplate(savedSlide(designId));
      assert.equal(sanitized.customTitleDesign, designId);
      assert.equal(serializeInClient(designId).customTitleDesign, designId);
      assert.equal(
        JSON.parse(createSnapshot(sanitized)).customTitleDesign,
        designId
      );

      const { document, picker } = createPicker();
      assert.equal(
        restoreCustomTitleDesignEditor(picker, sanitized),
        designId
      );
      assert.equal(document.getElementById("selected").value, designId);
      assert.equal(
        buildCustomTitleSlidePreview(sanitized, 400, {
          document,
          catalogApi,
        }).dataset.customTitleDesign,
        designId
      );
      assert.equal(normalizeCustomTitleDesign(designId), designId);
      const signal = LEGACY_RENDER_SIGNALS[designId];
      assertRendererIdentity(await renderDesign(designId), {
        layoutFamily: signal.family,
        theme: { background: signal.background },
      });
    }
  });

  it("preserves one new design from every seasonal category across boundaries", async () => {
    assert.deepEqual(
      CATEGORY_REPRESENTATIVES.map(
        (id) =>
          catalogApi.CUSTOM_TITLE_DESIGN_CATALOG.find(
            (design) => design.id === id
          )
            ?.categoryId
      ),
      [
        "christmas",
        "easter",
        "lent",
        "palm-sunday",
        "barley-harvest",
        "year-end",
        "new-year",
        "premium",
      ]
    );

    for (const designId of CATEGORY_REPRESENTATIVES) {
      const sanitized = sanitizeSlideForTemplate(savedSlide(designId));
      assert.equal(sanitized.customTitleDesign, designId);
      assert.equal(serializeInClient(designId).customTitleDesign, designId);
      assert.equal(
        JSON.parse(createSnapshot(sanitized)).customTitleDesign,
        designId
      );
      assert.equal(normalizeCustomTitleDesign(designId), designId);
      const design = catalogApi.findCustomTitleDesign(designId);
      assert.equal(
        catalogApi.CUSTOM_TITLE_DESIGN_CATALOG.filter(
          (entry) => entry.theme.background === design.theme.background
        ).length,
        1,
        `${designId} needs a catalog-unique background signal`
      );
      assertRendererIdentity(await renderDesign(designId), design);
    }
  });

  it("preserves unknown persistence while UI and rendering fall back to aurora", async () => {
    for (const [customTitleDesign, persistedDesign] of [
      ["future-design", "future-design"],
      [undefined, null],
    ]) {
      const source = {
        ...savedSlide(customTitleDesign),
        name: "그대로",
        customTitleKo: "원문",
      };
      const before = structuredClone(source);
      const sanitized = sanitizeSlideForTemplate(source);
      const { document, picker } = createPicker();

      assert.equal(sanitized.customTitleDesign, persistedDesign);
      assert.equal(restoreCustomTitleDesignEditor(picker, sanitized), "aurora");
      assert.equal(
        buildCustomTitleSlidePreview(sanitized, 400, {
          document,
          catalogApi,
        }).dataset.customTitleDesign,
        "aurora"
      );
      assert.equal(normalizeCustomTitleDesign(customTitleDesign), "aurora");
      assert.deepEqual(source, before);
      assert.equal(sanitized.name, "그대로");
      assert.equal(sanitized.customTitleKo, "원문");
    }

    assertRendererIdentity(await renderDesign("future-design"), {
      layoutFamily: LEGACY_RENDER_SIGNALS.aurora.family,
      theme: { background: LEGACY_RENDER_SIGNALS.aurora.background },
    });
  });

  it("keeps new and reset custom-title defaults at aurora", () => {
    assert.equal(catalogApi.normalizeCustomTitleDesignId(undefined), "aurora");
    assert.equal(
      buildResetSlideDraft(savedSlide("midnight-gate")).customTitleDesign,
      "aurora"
    );
    assert.match(app, /customTitleDesign:\s*"aurora"/);
  });
});
