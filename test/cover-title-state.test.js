import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import {
  compileAsyncFunction,
  compileFunction as compileAppFunction,
  functionBody,
} from "./helpers/app-function.js";

const app = await fs.readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8"
);

function compileFunction(name, parameters, dependencies = {}) {
  return compileAppFunction(app, name, parameters, dependencies);
}

describe("cover title theme browser state", () => {
  it("defaults hymn draft themes at the picker boundary", () => {
    const getCoverThemePicker = compileFunction("getCoverThemePicker", ["grid"]);
    const collectDraft = compileFunction("collectCurrentSlideDraft", [], {
      slides: [{ id: "slide-1", type: "hymn", titleThemeId: "marquee" }],
      currentSlideId: "slide-1",
      cloneSlide: (slide) => ({ ...slide }),
      slideRuntimeDraft: { titleThemeId: "ivory" },
      slideResetDraft: null,
      slideNameInput: { value: "찬송" },
      slideTypeSelect: { value: "hymn" },
      collectScriptureSlideFields() {
        throw new Error("scripture fields crossed into hymn state");
      },
      hymnNumberInput: { value: "1" },
      hymnIncludeTitle: { checked: true },
      getCoverThemePicker,
      hymnTitleThemeGrid: { querySelector: () => null },
      hymnKorTitleInput: { value: "찬양하라" },
      hymnEngTitleInput: { value: "Praise Him" },
      userPptxFile: null,
      adBgImageFile: null,
      scripturePptxImageInput: null,
      toFileMetadata: () => null,
    });

    assert.deepEqual(
      {
        type: collectDraft().type,
        titleThemeId: collectDraft().titleThemeId,
        hymnNumber: collectDraft().hymnNumber,
      },
      { type: "hymn", titleThemeId: "original", hymnNumber: "1" }
    );
  });

  it("defaults scripture draft themes independently at its picker boundary", () => {
    const getCoverThemePicker = compileFunction("getCoverThemePicker", ["grid"]);
    const collectScriptureSlideFields = compileFunction(
      "collectScriptureSlideFields",
      [],
      {
        scriptureTestamentSelect: { value: "old" },
        scriptureBookSelect: { value: "genesis" },
        scriptureChapterInput: { value: "1" },
        scriptureStartInput: { value: "1" },
        scriptureEndInput: { value: "3" },
        scriptureKoVersionSelect: { value: "새번역" },
        scriptureEnVersionSelect: { value: "" },
        scripturePptxThemeSelect: { value: "dark" },
        scriptureIncludeTitle: { checked: true },
        getCoverThemePicker,
        scriptureTitleThemeGrid: { querySelector: () => null },
        getScriptureTitleSlideType: () => "말씀",
      }
    );
    const collectDraft = compileFunction("collectCurrentSlideDraft", [], {
      slides: [{ id: "slide-1", type: "scripture", titleThemeId: "marquee" }],
      currentSlideId: "slide-1",
      cloneSlide: (slide) => ({ ...slide }),
      slideRuntimeDraft: { titleThemeId: "ivory" },
      slideResetDraft: null,
      slideNameInput: { value: "성경 말씀" },
      slideTypeSelect: { value: "scripture" },
      collectScriptureSlideFields,
      userPptxFile: null,
      adBgImageFile: null,
      scripturePptxImageInput: null,
      toFileMetadata: () => null,
    });

    const draft = collectDraft();
    assert.equal(collectScriptureSlideFields().titleThemeId, "original");
    assert.equal(draft.type, "scripture");
    assert.equal(draft.titleThemeId, "original");
    assert.equal(draft.sourceType, "upload");
  });

  it("includes the theme in serialized slide payloads", () => {
    const serialize = compileFunction("buildSerializableSlide", ["slide"], {
      copyCustomSlideModel: (value) => value,
    });

    assert.equal(serialize({}).titleThemeId, "original");
    assert.equal(
      serialize({ titleThemeId: "aurora" }).titleThemeId,
      "aurora"
    );
  });

  it("preserves unrestorable through serialization and clone boundaries", () => {
    const serialize = compileFunction("buildSerializableSlide", ["slide"], {
      copyCustomSlideModel: (value) => value,
    });
    const clone = compileFunction(
      "cloneSlide",
      ["slide", "options = {}"],
      {
        buildSerializableSlide: serialize,
        generateClientId: () => "generated-slide",
      }
    );

    assert.equal(serialize({ unrestorable: true }).unrestorable, true);
    assert.equal(serialize({}).unrestorable, false);
    assert.equal(
      clone({ id: "slide-1", unrestorable: true }).unrestorable,
      true
    );
  });

  it("routes clone boundaries through the canonical serializer", () => {
    assert.match(
      functionBody(app, "cloneSlide"),
      /buildSerializableSlide\(slide\)/
    );
    assert.match(
      functionBody(app, "cloneTemplate"),
      /template\.slides\.map\(\(slide\)\s*=>\s*cloneSlide\(slide\)\)/
    );
    assert.match(
      functionBody(app, "duplicateCurrentSlide"),
      /slide:\s*buildSerializableSlide\(draft\)/
    );
  });

  it("routes template persistence through the canonical serializer", () => {
    const commitBody = functionBody(app, "commitSlideCandidate");
    assert.match(
      commitBody,
      /slide:\s*buildSerializableSlide\(candidate\)/
    );
    assert.match(
      commitBody,
      /nextSlides\.map\(buildSerializableSlide\)/
    );
    assert.match(
      functionBody(app, "createTemplateFromSelection"),
      /slides:\s*selectedSlides\.map\(buildSerializableSlide\)/
    );
  });

  it("routes individual and bulk cover exports through the canonical serializer", () => {
    const individualExport = functionBody(app, "downloadSlide");
    assert.match(individualExport, /["']\/api\/slides\/export-pptx["']/);
    assert.match(
      individualExport,
      /slides:\s*\[buildSerializableSlide\(slide\)\]/
    );

    const bulkExport = functionBody(app, "downloadSelectedSlidesBundle");
    assert.match(bulkExport, /["']\/api\/slides\/export-pptx["']/);
    assert.match(
      bulkExport,
      /slides:\s*selectedSlides\.map\(buildSerializableSlide\)/
    );
  });

  it("includes the theme in scripture regeneration signatures", () => {
    const signature = compileFunction("buildScriptureSignature", ["slide"]);
    const base = {
      testament: "old",
      book: "genesis",
      chapter: "1",
      includeTitle: true,
    };

    assert.equal(JSON.parse(signature(base)).titleThemeId, "original");
    assert.notEqual(
      signature(base),
      signature({ ...base, titleThemeId: "aurora" })
    );
  });

  it("sends defaulted and selected themes when generating scripture slides", async () => {
    const requests = [];
    const generate = compileAsyncFunction(
      app,
      "generateScriptureSlideFile",
      ["slideName", "slide"],
      {
        fetch: async (url, options) => {
          requests.push({ url, body: JSON.parse(options.body) });
          return {
            ok: true,
            json: async () => ({ success: true }),
          };
        },
      }
    );
    const slide = {
      testament: "old",
      book: "genesis",
      chapter: "1",
      koVersion: "새번역",
      enVersion: "",
      themeId: "dark",
      includeTitle: true,
      titleSlideType: "말씀",
    };

    await generate("성경 말씀", slide);
    await generate("성경 말씀", { ...slide, titleThemeId: "ivory" });

    assert.deepEqual(
      requests.map((request) => [
        request.url,
        request.body.titleThemeId,
      ]),
      [
        ["/api/scripture/generate-slide", "original"],
        ["/api/scripture/generate-slide", "ivory"],
      ]
    );
  });
});
