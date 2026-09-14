// A picture only renders if the bytes in ppt/media really are the format the
// part name and [Content_Types].xml promise. Generated decks are merged through
// pptx-automizer, which shares media parts by content checksum, so any part
// whose bytes contradict its extension ends up referenced as the wrong format
// and PowerPoint reports "The picture can't be displayed".
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  appendCustomTitleSlide,
  CUSTOM_TITLE_DESIGNS,
} from "../lib/custom-title-slide.js";
import { appendTitleSlide, TITLE_DESIGNS } from "../lib/title-slide.js";
import { mergePptxBuffers } from "../lib/merge-pptx.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectImageFormat(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("latin1"))) {
    return "gif";
  }
  const head = buffer.subarray(0, 200).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    return "svg";
  }
  if (head.startsWith("<!doctype") || head.startsWith("<html")) {
    return "html";
  }
  return `unknown(${buffer.subarray(0, 8).toString("hex")})`;
}

const normalizeFormat = (value) => (value === "jpg" ? "jpeg" : value);

/** Media parts whose real bytes disagree with their file extension. */
function mediaMismatches(deck) {
  return new AdmZip(deck)
    .getEntries()
    .filter(
      (entry) => entry.entryName.startsWith("ppt/media/") && !entry.entryName.endsWith("/")
    )
    .map((entry) => {
      const declared = normalizeFormat(path.extname(entry.entryName).slice(1).toLowerCase());
      const actual = normalizeFormat(detectImageFormat(entry.getData()));
      return actual === declared
        ? null
        : `${entry.entryName} is declared ${declared} but the bytes are ${actual}`;
    })
    .filter(Boolean);
}

async function generatedDeck(build) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  await build(pptx);
  return pptx.write({ outputType: "nodebuffer" });
}

describe("bundled slide export media integrity", () => {
  it("keeps every custom title design's pictures readable after the merge", async () => {
    const decks = [];
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      decks.push(
        await generatedDeck((pptx) =>
          appendCustomTitleSlide(pptx, {
            customTitleDesign,
            customTitleKo: "성찬 예배",
            customTitleEn: "Holy Communion",
            customTitleSubtitle: "한 몸을 이루는 교회",
          })
        )
      );
    }

    const merged = await mergePptxBuffers(decks);
    assert.deepEqual(mediaMismatches(merged), []);
  });

  it("keeps every title design's pictures readable after the merge", async () => {
    const decks = [];
    for (const titleDesign of TITLE_DESIGNS) {
      decks.push(
        await generatedDeck((pptx) =>
          appendTitleSlide(pptx, {
            titleDesign,
            churchName: "시드니 삼일교회",
            serviceDate: "2026-09-14",
            titleSubtitle: "주일 예배",
          })
        )
      );
    }

    const merged = await mergePptxBuffers(decks);
    assert.deepEqual(mediaMismatches(merged), []);
  });

  it("leaves a single generated deck's pictures readable before any merge", async () => {
    const deck = await generatedDeck((pptx) =>
      appendCustomTitleSlide(pptx, {
        customTitleDesign: "aurora",
        customTitleKo: "성찬 예배",
        customTitleSubtitle: "한 몸을 이루는 교회",
      })
    );

    assert.deepEqual(mediaMismatches(deck), []);
  });
});
