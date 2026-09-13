import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import { convertLegacyPptToPptx } from "../lib/legacy-ppt.js";
import { WIDE_EMU, fitPptxToWidescreen, mergePptxBuffers } from "../lib/merge-pptx.js";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "nhymn25.ppt"
);

async function simpleDeck(text) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText(text, {
    x: 0.5,
    y: 3,
    w: 12.3,
    h: 1,
    fontSize: 32,
    align: "center",
  });
  return pptx.write({ outputType: "nodebuffer" });
}

function slideCount(buffer) {
  return new AdmZip(buffer)
    .getEntries()
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
    .length;
}

function sldSz(buffer) {
  const xml = new AdmZip(buffer).readAsText("ppt/presentation.xml");
  return {
    cx: Number(/cx="(\d+)"/.exec(xml)?.[1]),
    cy: Number(/cy="(\d+)"/.exec(xml)?.[1]),
  };
}

describe("mergePptxBuffers", () => {
  it("keeps generated text slides and hymn pages in order", async () => {
    const title = await simpleDeck("TITLE");
    const hymn = await convertLegacyPptToPptx(await fs.readFile(fixturePath));
    const verse = await simpleDeck("GENESIS 1");
    const merged = await mergePptxBuffers([title, hymn, verse]);

    assert.equal(slideCount(title), 1);
    assert.equal(slideCount(hymn), 12);
    assert.equal(slideCount(merged), 14);
    const size = sldSz(merged);
    assert.equal(size.cx, WIDE_EMU.cx);
    assert.equal(size.cy, WIDE_EMU.cy);
  });
});

describe("fitPptxToWidescreen", () => {
  it("leaves 16:9 decks unchanged", async () => {
    const original = await simpleDeck("WIDE");
    const fitted = fitPptxToWidescreen(original);
    assert.deepEqual(sldSz(fitted), sldSz(original));
  });

  it("centers a 4:3 deck on 16:9 without scaling height", async () => {
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "LAYOUT_4x3", width: 10, height: 7.5 });
    pptx.layout = "LAYOUT_4x3";
    const slide = pptx.addSlide();
    slide.addText("FOUR THREE", {
      x: 0,
      y: 0,
      w: 10,
      h: 1,
      fontSize: 20,
    });
    const original = await pptx.write({ outputType: "nodebuffer" });
    const sourceSize = sldSz(original);
    const fitted = fitPptxToWidescreen(original);
    assert.deepEqual(sldSz(fitted), WIDE_EMU);
    const xml = new AdmZip(fitted).readAsText("ppt/slides/slide1.xml");
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const sp = doc.getElementsByTagName("p:sp")[0];
    const off = sp.getElementsByTagName("a:off")[0];
    const offX = Number(off.getAttribute("x"));
    const scale = Math.min(WIDE_EMU.cx / sourceSize.cx, WIDE_EMU.cy / sourceSize.cy);
    assert.equal(offX, Math.round((WIDE_EMU.cx - sourceSize.cx * scale) / 2));
  });
});
