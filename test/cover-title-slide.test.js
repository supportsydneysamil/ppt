import assert from "node:assert/strict";
import { describe, it } from "node:test";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  COVER_TITLE_THEMES,
  appendThemedCoverTitleSlide,
  buildCoverTitleContent,
  normalizeTitleThemeId,
} from "../lib/cover-title-slide.js";

async function renderThemedCover(options) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendThemedCoverTitleSlide(pptx, options);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  const zip = new AdmZip(buffer);
  return {
    zip,
    slideXml: zip.readAsText("ppt/slides/slide1.xml"),
  };
}

function slideText(slideXml) {
  return [...slideXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1]);
}

describe("normalizeTitleThemeId", () => {
  it("returns known theme ids unchanged", () => {
    assert.equal(normalizeTitleThemeId("aurora"), "aurora");
    assert.equal(normalizeTitleThemeId("original"), "original");
  });

  it("falls back to original for unknown values", () => {
    assert.equal(normalizeTitleThemeId("unknown"), "original");
    assert.equal(normalizeTitleThemeId(undefined), "original");
  });
});

describe("COVER_TITLE_THEMES", () => {
  it("lists original plus the four custom title designs", () => {
    assert.deepEqual(COVER_TITLE_THEMES, [
      "original",
      "aurora",
      "monolith",
      "ivory",
      "marquee",
    ]);
  });
});

describe("buildCoverTitleContent", () => {
  it("maps hymn cover text with number, Korean title, and English title", () => {
    assert.deepEqual(
      buildCoverTitleContent("hymn", {
        hymnNumber: 1,
        hymnKorTitle: "찬양하라",
        hymnEngTitle: "Praise Him",
      }),
      {
        ko: "찬송",
        en: "HYMN",
        subtitle: "1. 찬양하라\n(Praise Him)",
      }
    );
  });

  it("omits empty hymn subtitle parts", () => {
    assert.deepEqual(
      buildCoverTitleContent("hymn", {
        hymnNumber: 1,
        hymnKorTitle: "찬양하라",
      }),
      {
        ko: "찬송",
        en: "HYMN",
        subtitle: "1. 찬양하라",
      }
    );

    assert.deepEqual(
      buildCoverTitleContent("hymn", {
        hymnEngTitle: "Praise Him",
      }),
      {
        ko: "찬송",
        en: "HYMN",
        subtitle: "(Praise Him)",
      }
    );

    assert.deepEqual(
      buildCoverTitleContent("hymn", {}),
      {
        ko: "찬송",
        en: "HYMN",
        subtitle: "",
      }
    );
  });

  it("maps scripture cover text from reference text", () => {
    assert.deepEqual(
      buildCoverTitleContent("scripture", { referenceText: "창세기 1:1-3" }),
      {
        ko: "성경말씀",
        en: "SCRIPTURES",
        subtitle: "창세기 1:1-3",
      }
    );
  });

  it("maps scripture-reading cover text from reference text", () => {
    assert.deepEqual(
      buildCoverTitleContent("scripture-reading", { referenceText: "창세기 1:1-3" }),
      {
        ko: "성경봉독",
        en: "SCRIPTURE READING",
        subtitle: "창세기 1:1-3",
      }
    );
  });

  it("rejects unsupported cover kinds", () => {
    assert.throws(
      () => buildCoverTitleContent("announcement", {}),
      /unsupported cover title kind: announcement/
    );
  });
});

describe("appendThemedCoverTitleSlide", () => {
  it("adds one aurora slide with mapped headline and subtitle", async () => {
    const { zip, slideXml } = await renderThemedCover({
      titleThemeId: "aurora",
      kind: "hymn",
      data: {
        hymnNumber: 1,
        hymnKorTitle: "찬양하라",
        hymnEngTitle: "Praise Him",
      },
    });

    assert.equal(zip.getEntries().filter((entry) => entry.entryName.startsWith("ppt/slides/slide")).length, 1);
    const texts = slideText(slideXml);
    assert.deepEqual(texts.slice(0, 2), ["찬송", "HYMN"]);
    assert.equal(texts.slice(2).join("\n"), "1. 찬양하라\n(Praise Him)");
  });

  it("rejects original theme rendering at this layer", () => {
    assert.throws(
      () =>
        appendThemedCoverTitleSlide(new PptxGenJS(), {
          titleThemeId: "original",
          kind: "hymn",
          data: {},
        }),
      /original/
    );
  });
});
