import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

const [html, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

describe("Custom title subtitle editor wiring", () => {
  it("provides an optional subtitle input", () => {
    assert.match(html, /id="customTitleSubtitle"/);
  });

  it("collects, initializes, restores, and serializes the subtitle", () => {
    assert.match(
      app,
      /customTitleSubtitle:\s*customTitleSubtitleInput\.value\.trim\(\)/
    );
    assert.match(app, /customTitleSubtitle:\s*["']{2}/);
    assert.match(
      app,
      /customTitleSubtitleInput\.value\s*=\s*slide\.customTitleSubtitle\s*\|\|\s*["']{2}/
    );
    assert.ok(
      (app.match(/customTitleSubtitle:\s*slide\.customTitleSubtitle/g) || [])
        .length >= 2,
      "saved slides must serialize and download the subtitle"
    );
  });

  it("updates the preview and dirty state when the subtitle changes", () => {
    assert.match(
      app,
      /const subtitle\s*=\s*\(data\.customTitleSubtitle\s*\|\|\s*["']{2}\)\.trim\(\)/
    );
    assert.match(
      app,
      /customTitleSubtitleInput\.addEventListener\(["']input["'][\s\S]*?renderPreview\(\)[\s\S]*?refreshSaveState\(\)/
    );
  });
});
