import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import AdmZip from "adm-zip";

import {
  convertLegacyPptToPptx,
  convertLegacyPptViaImages,
  countPptSlides,
  extractEmbeddedImages,
} from "../lib/legacy-ppt.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixturePath = path.join(fixturesDir, "nhymn25.ppt");
// Hymn 31 repeats its refrain, so three slide pairs reuse earlier score images.
const reusedImageFixturePath = path.join(fixturesDir, "nhymn31.ppt");

function sha(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function slideNames(zip) {
  return zip
    .getEntries()
    .map((entry) => entry.entryName)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(/(\d+)/.exec(a)[1]) - Number(/(\d+)/.exec(b)[1]));
}

function mediaForEachSlide(zip) {
  return slideNames(zip).map((name) => {
    const index = /(\d+)/.exec(name)[1];
    const xml = zip.readAsText(name);
    const embedId = /r:embed="(rId\d+)"/.exec(xml)?.[1];
    const rels = zip.readAsText(`ppt/slides/_rels/slide${index}.xml.rels`);
    const target = new RegExp(`Id="${embedId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
    return path.basename(target ?? "");
  });
}

describe("extractEmbeddedImages", () => {
  it("pulls one 1152x648 PNG per hymn slide", async () => {
    const buffer = await fs.readFile(fixturePath);
    const images = extractEmbeddedImages(buffer);
    const slides = countPptSlides(buffer);

    assert.equal(images.length, slides);
    assert.ok(images.length > 0);
    for (const image of images) {
      assert.equal(image.mime, "image/png");
      assert.equal(image.buffer[0], 0x89);
      assert.equal(image.buffer.toString("ascii", 1, 4), "PNG");
      assert.equal(image.width, 1152);
      assert.equal(image.height, 648);
    }
  });
});

describe("convertLegacyPptToPptx", () => {
  it("emits one pptx slide per .ppt slide", async () => {
    const buffer = await fs.readFile(fixturePath);
    const zip = new AdmZip(await convertLegacyPptToPptx(buffer));

    assert.equal(slideNames(zip).length, countPptSlides(buffer));
  });

  it("repeats reused score images instead of dropping those slides", async () => {
    const buffer = await fs.readFile(reusedImageFixturePath);
    const slides = countPptSlides(buffer);
    const images = extractEmbeddedImages(buffer);
    // Guard the premise: this deck has more slides than distinct images.
    assert.ok(slides > images.length);

    const zip = new AdmZip(await convertLegacyPptToPptx(buffer));
    assert.equal(slideNames(zip).length, slides);

    const perSlide = mediaForEachSlide(zip);
    assert.equal(perSlide.length, slides);
    assert.ok(perSlide.every((name) => name.length > 0));
    // Distinct images stay deduplicated while repeated slides point back at them.
    assert.equal(new Set(perSlide).size, images.length);
  });

  it("keeps embedded score images byte-identical", async () => {
    const buffer = await fs.readFile(reusedImageFixturePath);
    const expected = extractEmbeddedImages(buffer).map((image) => sha(image.buffer));

    const zip = new AdmZip(await convertLegacyPptToPptx(buffer));
    const actual = zip
      .getEntries()
      .filter((entry) => /^ppt\/media\/image\d+\.png$/i.test(entry.entryName))
      .sort(
        (a, b) => Number(/(\d+)/.exec(a.entryName)[1]) - Number(/(\d+)/.exec(b.entryName)[1])
      )
      .map((entry) => sha(entry.getData()));

    assert.deepEqual(actual, expected);
  });

  it("preserves the original 16:9 slide size", async () => {
    const zip = new AdmZip(await convertLegacyPptToPptx(await fs.readFile(fixturePath)));
    const xml = zip.readAsText("ppt/presentation.xml");
    const cx = Number(/<p:sldSz[^>]*cx="(\d+)"/.exec(xml)?.[1]);
    const cy = Number(/<p:sldSz[^>]*cy="(\d+)"/.exec(xml)?.[1]);

    assert.equal(cx, 9144000);
    assert.equal(cy, 5143500);
  });

  it("rejects a file that is neither a readable .ppt nor an image source", async () => {
    await assert.rejects(() => convertLegacyPptToPptx(Buffer.alloc(64)));
  });
});

describe("convertLegacyPptViaImages", () => {
  it("still builds one slide per image as the fallback path", async () => {
    const buffer = await fs.readFile(fixturePath);
    const zip = new AdmZip(await convertLegacyPptViaImages(buffer));

    assert.equal(slideNames(zip).length, extractEmbeddedImages(buffer).length);
  });
});
