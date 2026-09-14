import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  appendCustomTitleSlide,
  CUSTOM_TITLE_DESIGNS,
} from "../lib/custom-title-slide.js";
import * as customTitleText from "../lib/custom-title-text.js";

async function render(slide) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendCustomTitleSlide(pptx, slide);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
}

function dividerCount(slideXml) {
  return (slideXml.match(/<p:cxnSp>/g) || []).length;
}

function parse(slideXml) {
  return new DOMParser().parseFromString(slideXml, "text/xml");
}

function shapeByName(slideXml, name) {
  return Array.from(parse(slideXml).getElementsByTagName("p:sp")).find(
    (shape) =>
      shape.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") === name
  );
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
    x: Number((Number(offset.getAttribute("x")) / 914400).toFixed(2)),
    y: Number((Number(offset.getAttribute("y")) / 914400).toFixed(2)),
    w: Number((Number(extent.getAttribute("cx")) / 914400).toFixed(2)),
    h: Number((Number(extent.getAttribute("cy")) / 914400).toFixed(2)),
    fontSize: Number(run.getAttribute("sz")) / 100,
  };
}

describe("subtitleFontSize", () => {
  it("uses exact non-space character thresholds", () => {
    assert.equal(typeof customTitleText.subtitleFontSize, "function");
    assert.equal(customTitleText.subtitleFontSize("1234567890123456"), 28);
    assert.equal(customTitleText.subtitleFontSize("12345678901234567"), 24);
    assert.equal(customTitleText.subtitleFontSize("123456789012345678901234"), 24);
    assert.equal(customTitleText.subtitleFontSize("1234567890123456789012345"), 22);
    assert.equal(customTitleText.subtitleFontSize("1234 5678 9012 3456"), 28);
  });
});

describe("appendCustomTitleSlide", () => {
  it("renders a fixed lower panel and shifts the title stack in every design", async () => {
    const fills = {
      aurora: "170E33",
      monolith: "111216",
      ivory: "F2EADC",
      marquee: "34131C",
    };

    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const baselineXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
      });
      const subtitleXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      const subtitle = shapeByName(
        subtitleXml,
        "custom-title:subtitle-text"
      );
      assert.ok(subtitle, `${customTitleDesign} subtitle text must exist`);
      assert.deepEqual(textMetrics(subtitle), {
        x: 1.07,
        y: 6.1,
        w: 11.19,
        h: 0.85,
        fontSize: 28,
      });

      const baselineKo = textMetrics(shapeWithText(baselineXml, "성찬 예배"));
      const subtitleKo = textMetrics(shapeWithText(subtitleXml, "성찬 예배"));
      assert.equal(
        Number((subtitleKo.y - baselineKo.y).toFixed(2)),
        -0.45,
        `${customTitleDesign} title stack must move up`
      );

      const panel = shapeByName(subtitleXml, "custom-title:subtitle-panel");
      assert.ok(panel, `${customTitleDesign} subtitle panel must exist`);
      assert.match(panel.toString(), new RegExp(`val="${fills[customTitleDesign]}"`));
      assert.match(
        panel.getElementsByTagName("a:ln")[0].toString(),
        /<a:alpha val="0"\/>/,
        `${customTitleDesign} panel outline must be invisible`
      );
    }
  });

  it("uses only minimal theme accents on borderless panels", async () => {
    const expectedAccents = {
      aurora: [],
      monolith: ["custom-title:subtitle-accent"],
      ivory: [
        "custom-title:subtitle-dot-1",
        "custom-title:subtitle-dot-2",
      ],
      marquee: [
        "custom-title:subtitle-diamond-1",
        "custom-title:subtitle-diamond-2",
      ],
    };

    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const slideXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      assert.equal(
        slideXml.includes("custom-title:subtitle-inner-line"),
        false
      );
      for (const name of expectedAccents[customTitleDesign]) {
        assert.match(slideXml, new RegExp(`name="${name}"`));
      }
    }
  });

  it("renders a subtitle without adding an English divider when English is empty", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const baselineXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
      });
      const subtitleXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      assert.match(subtitleXml, /<a:t>한 몸을 이루는 교회<\/a:t>/);
      assert.equal(
        dividerCount(subtitleXml),
        dividerCount(baselineXml),
        `${customTitleDesign} must not add a divider without an English title`
      );
    }
  });

  it("preserves the original title position and omits the panel for an empty subtitle", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const baselineXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
      });
      const emptySubtitleXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "",
      });

      assert.deepEqual(
        textMetrics(shapeWithText(emptySubtitleXml, "성찬 예배")),
        textMetrics(shapeWithText(baselineXml, "성찬 예배"))
      );
      assert.equal(
        shapeByName(emptySubtitleXml, "custom-title:subtitle-panel"),
        undefined
      );
    }
  });
});
