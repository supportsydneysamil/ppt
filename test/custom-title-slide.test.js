import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  appendCustomTitleSlide,
  CUSTOM_TITLE_DESIGNS,
} from "../lib/custom-title-slide.js";
import {
  CUSTOM_TITLE_DESIGN_CATALOG,
  CUSTOM_TITLE_DESIGN_IDS,
  findCustomTitleDesign,
} from "../lib/custom-title-design-catalog.js";
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

function objectByName(slideXml, name) {
  return Array.from(parse(slideXml).getElementsByTagName("p:cNvPr")).find(
    (node) => node.getAttribute("name") === name
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
  it("exports all 31 catalog designs in catalog order", () => {
    assert.deepEqual(CUSTOM_TITLE_DESIGNS, CUSTOM_TITLE_DESIGN_IDS);
  });

  it("renders every design as a valid one-slide deck with all supplied text", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const { zip, slideXml } = await renderArchive({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      assert.ok(zip.getEntry("ppt/slides/slide1.xml"));
      assert.equal(zip.getEntry("ppt/slides/slide2.xml"), null);
      assert.match(slideXml, /<a:t>성찬 예배<\/a:t>/);
      assert.match(slideXml, /<a:t>HOLY COMMUNION<\/a:t>/);
      assert.match(slideXml, /<a:t>한 몸을 이루는 교회<\/a:t>/);
    }
  });

  it("dispatches every design through its declared layout family", async () => {
    for (const design of CUSTOM_TITLE_DESIGN_CATALOG) {
      const slideXml = await render({
        customTitleDesign: design.id,
        customTitleKo: "성찬 예배",
      });
      assert.ok(
        objectByName(slideXml, `custom-title:family:${design.layoutFamily}`),
        `${design.id} must use ${design.layoutFamily}`
      );
    }
  });

  it("embeds only declared local image backgrounds with resolvable media", async () => {
    for (const design of CUSTOM_TITLE_DESIGN_CATALOG) {
      const { zip, slideXml } = await renderArchive({
        customTitleDesign: design.id,
        customTitleKo: "성찬 예배",
      });
      const background = pictureByName(
        slideXml,
        "custom-title:background-asset"
      );

      if (!design.asset) {
        assert.equal(
          background,
          undefined,
          `${design.id} must not depend on a catalog image`
        );
        continue;
      }

      assert.ok(background, `${design.id} must embed its local image`);
      const embed = background
        .getElementsByTagName("a:blip")[0]
        .getAttribute("r:embed");
      const rels = zip.readAsText("ppt/slides/_rels/slide1.xml.rels");
      const target = new RegExp(
        `Id="${embed}"[^>]*Target="([^"]+)"`
      ).exec(rels)?.[1];
      assert.ok(target, `${design.id} image relationship must resolve`);
      assert.ok(
        zip.getEntry(`ppt/${target.replace(/^\.\.\//, "")}`),
        `${design.id} image media must exist`
      );
    }
  });

  it("renders one theme-tinted lower halo and shifts the title stack", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const { theme } = findCustomTitleDesign(customTitleDesign);
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
        rgb(theme.haloColor),
        `${customTitleDesign} halo must be tinted with its theme colour`
      );
      assert.equal(
        centre[3],
        Math.round(theme.haloOpacity * 255),
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
