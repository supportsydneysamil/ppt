import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import * as titleSlideApi from "../lib/title-slide.js";
import {
  appendTitleSlide,
  TITLE_DESIGNS,
  normalizeTitleDesign,
  buildTitleContent,
  worshipEnFontSize,
  worshipKoFontSize,
} from "../lib/title-slide.js";

function parse(slideXml) {
  return new DOMParser().parseFromString(slideXml, "text/xml");
}

function shapeWithText(slideXml, text) {
  return Array.from(parse(slideXml).getElementsByTagName("p:sp")).find(
    (shape) =>
      Array.from(shape.getElementsByTagName("a:t")).some(
        (node) => node.textContent === text
      )
  );
}

function textMetrics(shape) {
  const transform = shape.getElementsByTagName("a:xfrm")[0];
  const offset = transform.getElementsByTagName("a:off")[0];
  const extent = transform.getElementsByTagName("a:ext")[0];
  const run = shape.getElementsByTagName("a:rPr")[0];
  return {
    fontSize: run ? Number(run.getAttribute("sz")) / 100 : 0,
  };
}

function shapeGeometry(shape) {
  const transform = shape.getElementsByTagName("a:xfrm")[0];
  const offset = transform.getElementsByTagName("a:off")[0];
  const extent = transform.getElementsByTagName("a:ext")[0];
  const inches = (value) => Number((Number(value) / 914400).toFixed(3));
  return {
    x: inches(offset.getAttribute("x")),
    y: inches(offset.getAttribute("y")),
    w: inches(extent.getAttribute("cx")),
    h: inches(extent.getAttribute("cy")),
  };
}

function shapesAt(slideXml, expected) {
  return Array.from(parse(slideXml).getElementsByTagName("p:sp")).filter(
    (shape) => JSON.stringify(shapeGeometry(shape)) === JSON.stringify(expected)
  );
}

function textColor(shape) {
  return shape
    ?.getElementsByTagName("a:rPr")[0]
    ?.getElementsByTagName("a:srgbClr")[0]
    ?.getAttribute("val");
}

function presetShapeCount(slideXml, preset) {
  return Array.from(parse(slideXml).getElementsByTagName("p:sp")).filter(
    (shape) =>
      shape.getElementsByTagName("a:prstGeom")[0]?.getAttribute("prst") ===
      preset
  ).length;
}

function objectNames(slideXml) {
  return Array.from(parse(slideXml).getElementsByTagName("p:cNvPr")).map(
    (node) => node.getAttribute("name") || ""
  );
}

async function render(slide) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendTitleSlide(pptx, slide);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
}

describe("buildTitleContent", () => {
  it("knows all twelve designs and normalizes unknown ids to chapel", () => {
    assert.deepEqual(TITLE_DESIGNS, [
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
    ]);
    assert.equal(normalizeTitleDesign("unknown"), "chapel");
    assert.equal(normalizeTitleDesign("advent"), "advent");
  });

  it("resolves legacy chapel defaults and custom copy", () => {
    const legacyChapel = buildTitleContent({
      titleDesign: "chapel",
      churchName: "시드니 삼일교회",
      serviceDate: "2026-09-13",
      titleSubtitle: "",
    });
    assert.equal(legacyChapel.ko, "주일예배");
    assert.equal(legacyChapel.en, "SUNDAY WORSHIP");
    assert.equal(legacyChapel.koDate, "2026년 9월 13일 주일");

    assert.equal(
      buildTitleContent({ titleDesign: "editorial" }).en,
      "SUNDAY WORSHIP SERVICE"
    );
    assert.equal(
      buildTitleContent({ titleDesign: "easter-dawn" }).en,
      "EASTER SUNDAY"
    );
    assert.equal(buildTitleContent({ titleKo: "", titleEn: "X" }).ko, "");
    assert.equal(
      buildTitleContent({
        titleKo: " 성찬예배 ",
        titleEn: " HOLY COMMUNION ",
        titleDesign: "chapel",
      }).ko,
      "성찬예배"
    );
    assert.equal(
      buildTitleContent({ showDate: false, serviceDate: "2026-09-13" }).koDate,
      ""
    );
    assert.equal(
      buildTitleContent({ showDate: false, serviceDate: "2026-09-13" }).enDate,
      ""
    );
    assert.equal(buildTitleContent({ serviceDate: "nope" }).koDate, "");
  });
});

describe("worship title font sizing", () => {
  it("caps long Korean copy to the requested width", () => {
    const text = "부활의소망을기뻐하는온가족예배";
    const characterCount = [...text].length;
    const maxWidthInches = 4.93;
    const uncapped = worshipKoFontSize(text, 64);
    const capped = worshipKoFontSize(text, 64, maxWidthInches);

    assert.equal(characterCount, 15);
    assert.equal(uncapped, 27);
    assert.equal(capped, 21);
    assert.ok(capped < uncapped);
    assert.ok(
      (characterCount * capped) / 72 <= maxWidthInches * 0.92
    );
  });

  it("preserves legacy English sizes while optionally enforcing width", () => {
    const text = "CELEBRATING THE RISEN CHRIST TOGETHER";
    const maxWidthInches = 4.93;

    assert.equal(text.length, 37);
    assert.equal(worshipEnFontSize("SUNDAY WORSHIP", 17), 17);
    assert.equal(worshipEnFontSize("SUNDAY WORSHIP SERVICE", 17), 15);
    assert.equal(worshipEnFontSize(text, 17), 13);

    const capped = worshipEnFontSize(text, 17, maxWidthInches);
    assert.equal(capped, 11);
    assert.ok(capped < worshipEnFontSize(text, 17));
    assert.equal(worshipEnFontSize("X".repeat(39), 17, 1), 10);
  });

  it("keeps pathological width-capped Korean titles legible", () => {
    assert.equal(worshipKoFontSize("가".repeat(100), 64, 1), 12);
    assert.equal(
      worshipKoFontSize("부활의소망을기뻐하는온가족예배", 64, 4.93),
      21
    );
  });
});

describe("appendTitleSlide", () => {
  it("renders chapel defaults and custom Korean-only copy", async () => {
    const xml = await render({
      titleDesign: "chapel",
      churchName: "시드니 삼일교회",
      serviceDate: "2026-09-13",
    });
    assert.match(xml, /주일예배/);
    assert.match(xml, /SUNDAY WORSHIP/);
    assert.doesNotMatch(xml, /성찬예배/);

    const custom = await render({
      titleDesign: "chapel",
      titleKo: "성찬예배",
      titleEn: "",
      churchName: "시드니 삼일교회",
      serviceDate: "2026-09-13",
    });
    assert.match(custom, /성찬예배/);
    assert.doesNotMatch(custom, /주일예배/);
    assert.doesNotMatch(custom, /SUNDAY WORSHIP/);
  });

  it("uses staggered glyphs for glow default and single block for custom ko", async () => {
    const glowDefault = await render({
      titleDesign: "glow",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    assert.equal((glowDefault.match(/<a:t>주<\/a:t>/g) || []).length, 1);
    assert.equal((glowDefault.match(/<a:t>배<\/a:t>/g) || []).length, 1);

    const glowCustom = await render({
      titleDesign: "glow",
      titleKo: "성찬",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    assert.match(glowCustom, /<a:t>성찬<\/a:t>/);
    assert.doesNotMatch(glowCustom, /<a:t>주<\/a:t>/);
  });

  it("keeps editorial legacy English and omits SERVICE for custom English", async () => {
    const legacy = await render({
      titleDesign: "editorial",
      churchName: "시드니 삼일교회",
      serviceDate: "2026-09-13",
    });
    assert.match(legacy, /SUNDAY WORSHIP SERVICE/);

    const custom = await render({
      titleDesign: "editorial",
      titleEn: "SUNDAY WORSHIP",
      churchName: "시드니 삼일교회",
      serviceDate: "2026-09-13",
    });
    assert.match(custom, /SUNDAY WORSHIP/);
    assert.doesNotMatch(custom, /SERVICE/);
  });

  it("hides English-associated editorial and glow rules when English is empty", async () => {
    const editorialRule = { x: 1.05, y: 4.52, w: 4.4, h: 0 };
    const glowRule = { x: 4.367, y: 4.3, w: 4.6, h: 0 };

    const editorialDefault = await render({
      titleDesign: "editorial",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    const editorialEmpty = await render({
      titleDesign: "editorial",
      titleEn: "",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    assert.equal(shapesAt(editorialDefault, editorialRule).length, 1);
    assert.equal(shapesAt(editorialEmpty, editorialRule).length, 0);

    const glowDefault = await render({
      titleDesign: "glow",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    const glowEmpty = await render({
      titleDesign: "glow",
      titleEn: "",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    assert.equal(shapesAt(glowDefault, glowRule).length, 1);
    assert.equal(presetShapeCount(glowDefault, "ellipse"), 2);
    assert.equal(shapesAt(glowEmpty, glowRule).length, 0);
    assert.equal(presetShapeCount(glowEmpty, "ellipse"), 0);
  });

  it("hides editorial DATE content and empty glow Korean copy", async () => {
    const editorial = await render({
      titleDesign: "editorial",
      showDate: false,
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    assert.doesNotMatch(editorial, /<a:t>DATE<\/a:t>/);
    assert.doesNotMatch(editorial, /2026년/);
    assert.doesNotMatch(editorial, /SEPTEMBER/);

    const glow = await render({
      titleDesign: "glow",
      titleKo: "",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    assert.doesNotMatch(glow, /<a:t>주<\/a:t>/);
    assert.doesNotMatch(glow, /<a:t>주일예배<\/a:t>/);
  });

  it("preserves key original design geometry and colors", async () => {
    const editorial = await render({
      titleDesign: "editorial",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    const editorialTitle = shapeWithText(editorial, "주일예배");
    assert.deepEqual(shapeGeometry(editorialTitle), {
      x: 0.95,
      y: 2.45,
      w: 10.5,
      h: 1.75,
    });
    assert.equal(textMetrics(editorialTitle).fontSize, 112);
    assert.equal(textColor(editorialTitle), "17150F");

    const glow = await render({
      titleDesign: "glow",
      titleKo: "성찬",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    const glowTitle = shapeWithText(glow, "성찬");
    assert.deepEqual(shapeGeometry(glowTitle), {
      x: 0,
      y: 1.95,
      w: 13.333,
      h: 1.79,
    });
    assert.equal(textMetrics(glowTitle).fontSize, 88);
    assert.equal(textColor(glowTitle), "FFFFFF");
  });

  it("keeps chapel default Korean at 96pt and scales long copy", async () => {
    const defaultXml = await render({
      titleDesign: "chapel",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    const defaultShape = shapeWithText(defaultXml, "주일예배");
    assert.ok(defaultShape);
    assert.equal(textMetrics(defaultShape).fontSize, 96);

    const longKo = "1234567890";
    const longXml = await render({
      titleDesign: "chapel",
      titleKo: longKo,
      titleEn: "",
      churchName: "A",
      serviceDate: "2026-09-13",
    });
    const longShape = shapeWithText(longXml, longKo);
    assert.ok(longShape);
    assert.equal(textMetrics(longShape).fontSize, 52);
  });

  it("dispatches every extra id to its own renderer instead of chapel", async () => {
    const markers = {
      "easter-dawn": "title-motif:sun",
      "easter-stained": "title-motif:arch-outer",
      "christmas-burgundy": "title-motif:star-large",
      "christmas-evergreen": "title-motif:tree-0",
      thanksgiving: "title-motif:wheat-left",
      advent: "title-motif:candle",
      "midnight-slab": "title-rule:spine",
      "slate-split": "title-rule:split",
      "deep-fog": "title-rule:underline",
    };

    for (const [titleDesign, marker] of Object.entries(markers)) {
      const xml = await render({
        titleDesign,
        churchName: "A",
        serviceDate: "2026-09-13",
      });
      assert.ok(objectNames(xml).includes(marker), titleDesign);
    }
  });

  it("falls back to chapel when an accepted extra design has no renderer", async () => {
    assert.equal(
      typeof titleSlideApi.appendTitleSlideWithExtraRenderer,
      "function"
    );
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    let calls = 0;
    titleSlideApi.appendTitleSlideWithExtraRenderer(
      pptx,
      {
        titleDesign: "advent",
        churchName: "A",
        serviceDate: "2026-09-13",
      },
      () => {
        calls += 1;
        return false;
      }
    );
    const buffer = await pptx.write({ outputType: "nodebuffer" });
    const zip = new AdmZip(buffer);
    const xml = zip.readAsText("ppt/slides/slide1.xml");
    assert.equal(calls, 1);
    assert.match(xml, /주일예배/);
    assert.equal(objectNames(xml).some((name) => name.startsWith("title-")), false);
    assert.equal(
      zip
        .getEntries()
        .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName))
        .length,
      1
    );
  });
});
