import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import { appendTitleSlide } from "../lib/title-slide.js";
import {
  findTitleDesign,
} from "../lib/title-slide-design-catalog.js";
import {
  appendCatalogTitleSlide,
} from "../lib/title-slide-catalog-render.js";

const NEW_IDS = [
  "advent-vesper",
  "advent-watch",
  "christmas-ivory",
  "easter-linen",
  "lent-violet",
  "lent-ashes",
  "lent-veil",
  "palm-procession",
  "palm-court",
  "palm-horizon",
  "year-end-watch",
  "year-end-threshold",
  "year-end-ember",
  "new-year-dawn",
  "new-year-first",
  "new-year-blessing",
];

const MOTIFS = {
  "lent-veil": "title-motif:lent-veil",
  "palm-procession": "title-motif:palm",
  "new-year-blessing": "title-motif:year-crest",
};

function objectNames(xml) {
  return Array.from(
    new DOMParser()
      .parseFromString(xml, "text/xml")
      .getElementsByTagName("p:cNvPr")
  ).map((node) => node.getAttribute("name") || "");
}

async function slideXml(pptx) {
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
}

async function renderCatalog(id, overrides = {}) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const rendered = appendCatalogTitleSlide(
    pptx,
    findTitleDesign(id),
    {
      ko: "주일예배",
      en: "TEST ENGLISH",
      church: "시드니 삼일교회",
      subtitle: "",
      koDate: "2026년 9월 13일 주일",
      enDate: "Sunday, September 13, 2026",
      ...overrides,
    }
  );
  assert.equal(rendered, true, id);
  return slideXml(pptx);
}

describe("catalog Sunday title renderer", () => {
  it("declines legacy, unknown, and missing designs", () => {
    const pptx = new PptxGenJS();
    assert.equal(
      appendCatalogTitleSlide(pptx, findTitleDesign("chapel"), {}),
      false
    );
    assert.equal(
      appendCatalogTitleSlide(
        pptx,
        {
          layoutFamily: "ornament-frame",
          theme: findTitleDesign("chapel").theme,
        },
        {}
      ),
      false
    );
    assert.equal(appendCatalogTitleSlide(pptx, null, {}), false);
  });

  it("renders every new design with its declared family and copy", async () => {
    for (const id of NEW_IDS) {
      const xml = await renderCatalog(id);
      const names = objectNames(xml);
      const family = findTitleDesign(id).layoutFamily;
      assert.ok(names.includes(`title-rule:${family}`), id);
      assert.match(xml, /주일예배/);
      assert.match(xml, /TEST ENGLISH/);
      assert.match(xml, /시드니 삼일교회/);
    }
  });

  it("adds motifs to only the three approved designs", async () => {
    for (const id of NEW_IDS) {
      const motifNames = objectNames(await renderCatalog(id)).filter((name) =>
        name.startsWith("title-motif:")
      );
      assert.deepEqual(motifNames, MOTIFS[id] ? [MOTIFS[id]] : [], id);
    }
  });

  it("hides the English divider and omitted date copy", async () => {
    const xml = await renderCatalog("lent-ashes", {
      en: "",
      koDate: "",
      enDate: "",
    });
    assert.equal(objectNames(xml).includes("title-rule:en-divider"), false);
    assert.doesNotMatch(xml, /2026/);
  });

  it("falls back to a gradient when an allowed asset file is missing", async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const design = {
      ...findTitleDesign("new-year-dawn"),
      asset: {
        path: "assets/title/not-installed.png",
        width: 1280,
        height: 720,
      },
    };
    assert.equal(
      appendCatalogTitleSlide(pptx, design, {
        ko: "주일예배",
        en: "NEW YEAR",
        church: "",
        subtitle: "",
        koDate: "",
        enDate: "",
      }),
      true
    );
    const xml = await slideXml(pptx);
    assert.ok(objectNames(xml).includes("title-rule:horizon-split"));
  });

  it("dispatches new ids through appendTitleSlide", async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    appendTitleSlide(pptx, {
      titleDesign: "lent-ashes",
      titleKo: "주일예배",
      titleEn: "LENT",
      churchName: "시드니 삼일교회",
      serviceDate: "2026-09-13",
    });
    const xml = await slideXml(pptx);
    assert.ok(objectNames(xml).includes("title-rule:centered-rule"));
    assert.match(xml, /주일예배/);
  });
});
