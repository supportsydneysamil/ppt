import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  appendTitleSlide,
  TITLE_DESIGNS,
  normalizeTitleDesign,
  buildTitleContent,
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
    assert.equal(buildTitleContent({ serviceDate: "nope" }).koDate, "");
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
});
