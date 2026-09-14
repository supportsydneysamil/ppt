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
import { decodePng, pixelAt } from "./helpers/png-decode.js";

async function renderArchive(slide) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendCustomTitleSlide(pptx, slide);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  const zip = new AdmZip(buffer);
  return {
    zip,
    slideXml: zip.readAsText("ppt/slides/slide1.xml"),
  };
}

async function render(slide) {
  return (await renderArchive(slide)).slideXml;
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

function pictureByName(slideXml, name) {
  return Array.from(parse(slideXml).getElementsByTagName("p:pic")).find(
    (picture) =>
      picture.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") === name
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
    fontSize: run ? Number(run.getAttribute("sz")) / 100 : 0,
  };
}

/** The decoded picture the halo shape actually points at. */
function haloRaster(zip, slideXml) {
  const halo = pictureByName(slideXml, "custom-title:subtitle-halo");
  const embed = halo.getElementsByTagName("a:blip")[0].getAttribute("r:embed");
  const rels = zip.readAsText("ppt/slides/_rels/slide1.xml.rels");
  const target = new RegExp(`Id="${embed}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  assert.ok(target, `halo relationship ${embed} must resolve`);
  return decodePng(zip.getEntry(`ppt/${target.replace(/^\.\.\//, "")}`).getData());
}

function rgb(hex) {
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
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
  it("renders one theme-tinted lower halo and shifts the title stack", async () => {
    const themes = {
      aurora: { color: "C4B2FF", opacity: 0.15 },
      monolith: { color: "FFFFFF", opacity: 0.1 },
      ivory: { color: "C2A87A", opacity: 0.16 },
      marquee: { color: "D9B376", opacity: 0.12 },
    };

    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const baselineXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
      });
      const { zip, slideXml } = await renderArchive({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      const halo = pictureByName(slideXml, "custom-title:subtitle-halo");
      const subtitle = shapeByName(slideXml, "custom-title:subtitle-text");
      assert.ok(halo, `${customTitleDesign} halo image must exist`);
      assert.deepEqual(textMetrics(halo), {
        x: 1.07,
        y: 6.1,
        w: 11.19,
        h: 0.85,
        fontSize: 0,
      });
      assert.ok(subtitle, `${customTitleDesign} subtitle text must exist`);
      assert.deepEqual(textMetrics(subtitle), {
        x: 1.07,
        y: 6.1,
        w: 11.19,
        h: 0.85,
        fontSize: 28,
      });

      const baselineKo = textMetrics(shapeWithText(baselineXml, "성찬 예배"));
      const subtitleKo = textMetrics(shapeWithText(slideXml, "성찬 예배"));
      assert.equal(
        Number((subtitleKo.y - baselineKo.y).toFixed(2)),
        -0.45,
        `${customTitleDesign} title stack must move up`
      );

      // The glow is brightest dead centre and has faded out entirely by the
      // corners, which sit outside the gradient's radius.
      const raster = haloRaster(zip, slideXml);
      const centre = pixelAt(raster, raster.width >> 1, raster.height >> 1);
      assert.deepEqual(
        centre.slice(0, 3),
        rgb(themes[customTitleDesign].color),
        `${customTitleDesign} halo must be tinted with its theme colour`
      );
      assert.equal(
        centre[3],
        Math.round(themes[customTitleDesign].opacity * 255),
        `${customTitleDesign} halo must use its theme opacity`
      );
      assert.equal(pixelAt(raster, 0, 0)[3], 0);
      assert.doesNotMatch(
        slideXml,
        /custom-title:subtitle-(panel|accent|dot|diamond)/
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
        pictureByName(emptySubtitleXml, "custom-title:subtitle-halo"),
        undefined
      );
      assert.equal(
        shapeByName(emptySubtitleXml, "custom-title:subtitle-text"),
        undefined
      );
    }
  });
});
