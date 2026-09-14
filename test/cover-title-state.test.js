import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

const app = await fs.readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8"
);

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;

  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        parametersEnd = index;
        break;
      }
    }
  }

  assert.notEqual(parametersEnd, -1, `${name} parameters are unbalanced`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`${name} body is unbalanced`);
}

describe("cover title theme browser state", () => {
  it("keeps the theme in hymn and scripture drafts", () => {
    const body = functionBody(app, "collectCurrentSlideDraft");
    const scriptureBranch = body.slice(
      body.indexOf('if (draft.type === "scripture")'),
      body.indexOf('} else if (draft.type === "title")')
    );
    const hymnBranch = body.slice(
      body.indexOf('} else if (draft.type === "hymn")'),
      body.indexOf("} else {", body.indexOf('} else if (draft.type === "hymn")'))
    );

    assert.match(
      scriptureBranch,
      /draft\.titleThemeId\s*=\s*draft\.titleThemeId\s*\|\|\s*["']original["']/
    );
    assert.match(
      hymnBranch,
      /draft\.titleThemeId\s*=\s*draft\.titleThemeId\s*\|\|\s*["']original["']/
    );
  });

  it("defaults the theme while populating and saving the editor", () => {
    assert.match(
      functionBody(app, "populateEditor"),
      /slide\.titleThemeId\s*=\s*slide\.titleThemeId\s*\|\|\s*["']original["']/
    );

    const saveBody = functionBody(app, "saveCurrentSlide");
    const hymnBranch = saveBody.slice(
      saveBody.indexOf("} else if (slide.type === 'hymn')"),
      saveBody.indexOf("} else if (slide.type === 'scripture')")
    );
    const scriptureBranch = saveBody.slice(
      saveBody.indexOf("} else if (slide.type === 'scripture')"),
      saveBody.indexOf("} else if (slide.type === 'ad')")
    );

    assert.match(
      hymnBranch,
      /slide\.titleThemeId\s*=\s*slide\.titleThemeId\s*\|\|\s*["']original["']/
    );
    assert.match(
      scriptureBranch,
      /slide\.titleThemeId\s*=\s*slide\.titleThemeId\s*\|\|\s*["']original["']/
    );
  });

  it("includes the theme in serialized slide payloads", () => {
    assert.match(
      functionBody(app, "buildSerializableSlide"),
      /titleThemeId:\s*slide\.titleThemeId\s*\|\|\s*["']original["']/
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
    assert.match(
      functionBody(app, "buildScriptureSignature"),
      /titleThemeId:\s*slide\.titleThemeId\s*\|\|\s*["']original["']/
    );
  });

  it("sends the theme when generating scripture slides", () => {
    assert.match(
      functionBody(app, "generateScriptureSlideFile"),
      /titleThemeId:\s*slide\.titleThemeId\s*\|\|\s*["']original["']/
    );
  });
});
