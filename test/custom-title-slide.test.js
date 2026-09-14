import assert from "node:assert/strict";
import { describe, it } from "node:test";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  appendCustomTitleSlide,
  CUSTOM_TITLE_DESIGNS,
} from "../lib/custom-title-slide.js";

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

describe("appendCustomTitleSlide", () => {
  it("renders the subtitle below the English title in every design", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const slideXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      assert.match(slideXml, /<a:t>한 몸을 이루는 교회<\/a:t>/);
      assert.ok(
        slideXml.indexOf("HOLY COMMUNION") <
          slideXml.indexOf("한 몸을 이루는 교회"),
        `${customTitleDesign} subtitle must follow the English title`
      );
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
});
