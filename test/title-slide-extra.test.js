import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import { appendTitleSlide } from "../lib/title-slide.js";

const EMU_PER_INCH = 914400;

function parse(slideXml) {
  return new DOMParser().parseFromString(slideXml, "text/xml");
}

function objectNames(slideXml, prefix) {
  return Array.from(parse(slideXml).getElementsByTagName("p:cNvPr"))
    .map((node) => node.getAttribute("name") || "")
    .filter((name) => name.startsWith(prefix));
}

function objectByName(slideXml, name) {
  const property = Array.from(
    parse(slideXml).getElementsByTagName("p:cNvPr")
  ).find((node) => node.getAttribute("name") === name);
  assert.ok(property, `missing ${name}`);
  return property.parentNode.parentNode;
}

function geometry(shape) {
  const transform = shape.getElementsByTagName("a:xfrm")[0];
  const offset = transform.getElementsByTagName("a:off")[0];
  const extent = transform.getElementsByTagName("a:ext")[0];
  const inches = (value) => Number((Number(value) / EMU_PER_INCH).toFixed(3));
  return {
    x: inches(offset.getAttribute("x")),
    y: inches(offset.getAttribute("y")),
    w: inches(extent.getAttribute("cx")),
    h: inches(extent.getAttribute("cy")),
  };
}

function solidColor(shape) {
  return shape.getElementsByTagName("a:solidFill")[0]
    ?.getElementsByTagName("a:srgbClr")[0]
    ?.getAttribute("val");
}

function rotation(shape) {
  const transform = shape.getElementsByTagName("a:xfrm")[0];
  return Number(transform.getAttribute("rot") || 0) / 60000;
}

function shapeWithText(slideXml, text) {
  return Array.from(parse(slideXml).getElementsByTagName("p:sp")).find(
    (shape) =>
      Array.from(shape.getElementsByTagName("a:t")).some(
        (node) => node.textContent === text
      )
  );
}

function fontSize(shape) {
  const run = shape.getElementsByTagName("a:rPr")[0];
  return run ? Number(run.getAttribute("sz")) / 100 : 0;
}

async function render(slide) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendTitleSlide(pptx, slide);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
}

const content = {
  titleKo: "주일예배",
  titleEn: "SUNDAY WORSHIP",
  churchName: "시드니 삼일교회",
  serviceDate: "2026-09-13",
};

describe("seasonal worship title designs", () => {
  const expectedNames = {
    "easter-dawn": ["title-motif:sun", "title-motif:ray-0"],
    "easter-stained": [
      "title-motif:arch-outer",
      "title-motif:arch-inner",
    ],
    "christmas-burgundy": ["title-motif:star-large"],
    "christmas-evergreen": [
      "title-motif:tree-0",
      "title-motif:tree-1",
      "title-motif:tree-2",
      "title-motif:star-small-0",
    ],
    thanksgiving: [
      "title-motif:wheat-left",
      "title-motif:wheat-right",
      "title-motif:grain-left-0",
      "title-motif:grain-right-0",
    ],
    advent: [
      "title-motif:flame",
      "title-motif:candle",
      "title-motif:week-1",
      "title-motif:week-2",
      "title-motif:week-3",
      "title-motif:week-4",
    ],
  };

  for (const [titleDesign, names] of Object.entries(expectedNames)) {
    it(`renders independent named motifs for ${titleDesign}`, async () => {
      const xml = await render({ ...content, titleDesign });
      assert.match(xml, /주일예배/);
      assert.ok(objectNames(xml, "title-motif:").length > 0);
      names.forEach((name) => assert.ok(objectNames(xml, "").includes(name)));
      assert.equal((xml.match(/<p:grpSp>/g) || []).length, 0);
    });
  }

  it("uses the specified Easter dawn sun and horizon geometry", async () => {
    const xml = await render({ ...content, titleDesign: "easter-dawn" });
    const sun = objectByName(xml, "title-motif:sun");
    assert.deepEqual(geometry(sun), {
      x: 5.55,
      y: -0.35,
      w: 2.2,
      h: 2.2,
    });
    assert.equal(solidColor(sun), "FFF0CD");
    assert.equal(
      objectNames(xml, "title-motif:ray-").length,
      7,
      "seven rays"
    );
    const rays = Array.from({ length: 7 }, (_, index) =>
      objectByName(xml, `title-motif:ray-${index}`)
    );
    const rayGeometry = rays.map(geometry);
    assert.ok(Math.min(...rayGeometry.map(({ x }) => x)) < 4.6);
    assert.ok(Math.max(...rayGeometry.map(({ x, w }) => x + w)) > 8.7);
    assert.ok(new Set(rays.map(rotation)).size >= 5, "rays form a visible fan");
    assert.deepEqual(geometry(objectByName(xml, "title-rule:horizon")), {
      x: 1.1,
      y: 6.05,
      w: 11.1,
      h: 0,
    });
  });

  it("uses the specified stained-glass arches", async () => {
    const xml = await render({ ...content, titleDesign: "easter-stained" });
    assert.deepEqual(geometry(objectByName(xml, "title-motif:arch-outer")), {
      x: 3.55,
      y: 0.45,
      w: 6.23,
      h: 6.15,
    });
    assert.deepEqual(geometry(objectByName(xml, "title-motif:arch-inner")), {
      x: 3.97,
      y: 0.87,
      w: 5.39,
      h: 5.31,
    });
  });

  it("keeps a long editable Easter title inside the inner arch", async () => {
    const titleKo = "부활의소망을기뻐하는온가족예배";
    const xml = await render({
      ...content,
      titleDesign: "easter-stained",
      titleKo,
    });
    const title = shapeWithText(xml, titleKo);
    assert.ok(title);
    const { x, w } = geometry(title);
    assert.ok(x >= 4.2);
    assert.ok(x + w <= 9.13);
    assert.equal(fontSize(title), 21);
  });

  it("keeps a long editable English title inside the inner arch", async () => {
    const titleEn = "CELEBRATING THE RISEN CHRIST TOGETHER";
    const xml = await render({
      ...content,
      titleDesign: "easter-stained",
      titleEn,
    });
    const title = shapeWithText(xml, titleEn);
    assert.ok(title);
    const { x, w } = geometry(title);
    assert.ok(x >= 4.2);
    assert.ok(x + w <= 9.13);
    assert.equal(fontSize(title), 11);
  });

  it("uses the specified burgundy spine and large star", async () => {
    const xml = await render({
      ...content,
      titleDesign: "christmas-burgundy",
    });
    assert.deepEqual(geometry(objectByName(xml, "title-rule:spine")), {
      x: 0,
      y: 0,
      w: 0.12,
      h: 7.5,
    });
    const star = objectByName(xml, "title-motif:star-large");
    assert.deepEqual(geometry(star), {
      x: 8.7,
      y: 1.85,
      w: 3.4,
      h: 3.4,
    });
    assert.equal(solidColor(star), "D9B376");
  });

  it("renders five named evergreen trees and three named stars", async () => {
    const xml = await render({
      ...content,
      titleDesign: "christmas-evergreen",
    });
    assert.equal(objectNames(xml, "title-motif:tree-").length, 5);
    assert.equal(objectNames(xml, "title-motif:star-small-").length, 3);
  });

  it("renders four grains on each named Thanksgiving wheat stem", async () => {
    const xml = await render({ ...content, titleDesign: "thanksgiving" });
    assert.equal(objectNames(xml, "title-motif:grain-left-").length, 4);
    assert.equal(objectNames(xml, "title-motif:grain-right-").length, 4);
  });

  it("places the four Advent week markers at the specified positions", async () => {
    const xml = await render({ ...content, titleDesign: "advent" });
    for (let index = 0; index < 4; index += 1) {
      assert.deepEqual(
        geometry(objectByName(xml, `title-motif:week-${index + 1}`)),
        {
          x: Number((5.7 + 0.45 * index).toFixed(2)),
          y: 6.85,
          w: 0.16,
          h: 0.16,
        }
      );
    }
  });
});

describe("dark worship title designs", () => {
  const ruleNames = {
    "midnight-slab": "title-rule:spine",
    "slate-split": "title-rule:split",
    "deep-fog": "title-rule:underline",
  };

  for (const [titleDesign, ruleName] of Object.entries(ruleNames)) {
    it(`renders ${titleDesign} with rules but no motifs`, async () => {
      const xml = await render({ ...content, titleDesign });
      assert.match(xml, /주일예배/);
      assert.equal(objectNames(xml, "title-motif:").length, 0);
      assert.ok(objectNames(xml, "title-rule:").includes(ruleName));
    });
  }

  it("uses the specified midnight spine geometry", async () => {
    const xml = await render({ ...content, titleDesign: "midnight-slab" });
    assert.deepEqual(geometry(objectByName(xml, "title-rule:spine")), {
      x: 1.45,
      y: 1.2,
      w: 0,
      h: 5.1,
    });
  });

  it("uses the specified slate panel and split geometry", async () => {
    const xml = await render({ ...content, titleDesign: "slate-split" });
    assert.deepEqual(geometry(objectByName(xml, "title-rule:panel")), {
      x: 0,
      y: 0,
      w: 4.93,
      h: 7.5,
    });
    assert.deepEqual(geometry(objectByName(xml, "title-rule:split")), {
      x: 4.93,
      y: 0,
      w: 0,
      h: 7.5,
    });
  });

  it("omits independently hidden title lines and dates", async () => {
    const xml = await render({
      titleDesign: "midnight-slab",
      titleKo: "",
      titleEn: "",
      showDate: false,
      churchName: "시드니 삼일교회",
      serviceDate: "2026-09-13",
    });
    assert.doesNotMatch(xml, /주일예배/);
    assert.doesNotMatch(xml, /SUNDAY WORSHIP/);
    assert.doesNotMatch(xml, /2026년/);
    assert.doesNotMatch(xml, /SEPTEMBER/);
  });
});
