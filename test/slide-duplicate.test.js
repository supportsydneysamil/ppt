import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createDuplicateSlideName,
  hasOwnedSlideAsset,
  insertSlideAfter,
} from "../lib/slide-duplicate.js";
import { functionBody } from "./helpers/app-function.js";

const [html, app] = await Promise.all([
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

describe("current-slide duplicate helpers", () => {
  it("creates the first available Korean copy name", () => {
    assert.equal(
      createDuplicateSlideName("광고", ["광고", "다른 슬라이드"]),
      "광고 복사"
    );
    assert.equal(
      createDuplicateSlideName("광고", ["광고", "광고 복사", "광고 복사 2"]),
      "광고 복사 3"
    );
  });

  it("continues the root sequence for an already suffixed copy", () => {
    assert.equal(
      createDuplicateSlideName("광고 복사 7", [
        "광고",
        "광고 복사",
        "광고 복사 2",
      ]),
      "광고 복사 3"
    );
  });

  it("inserts a clone immediately after its source without mutation", () => {
    const source = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const clone = { id: "copy" };

    assert.deepEqual(insertSlideAfter(source, "b", clone), [
      { id: "a" },
      { id: "b" },
      clone,
      { id: "c" },
    ]);
    assert.deepEqual(source, [{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("detects every owned upload asset location", () => {
    for (const slide of [
      { serverFilePath: "/uploads/deck.pptx" },
      { thumbnail: "/uploads/thumb.jpeg" },
      { adBgImagePath: "/uploads/background.png" },
      {
        customSlide: {
          elements: [{ type: "image", src: "/uploads/picture.png" }],
        },
      },
    ]) {
      assert.equal(hasOwnedSlideAsset(slide), true);
    }

    assert.equal(
      hasOwnedSlideAsset({
        thumbnail: "https://example.test/thumb.jpeg",
        customSlide: {
          elements: [{ type: "image", src: "data:image/png;base64,AAAA" }],
        },
      }),
      false
    );
  });
});

// A duplicate that awaits the server from inside a guarded transition leaves
// guardedTransitionDepth above zero, and every nested guardTransition caller
// then runs its mutation immediately instead of being refused. The staged
// duplicate list is assigned after those awaits, so whatever the nested
// mutation added to `slides` is silently dropped.
describe("slide list mutations while a duplicate is in flight", () => {
  it("refuses to add a slide while a save or duplicate owns the list", () => {
    const body = functionBody(app, "createSlide");

    assert.match(body, /blockedBySaveInProgress\(\)/);
    assert.ok(
      body.indexOf("blockedBySaveInProgress()") < body.indexOf("guardTransition("),
      "the busy check has to run before the guarded transition"
    );
  });

  it("keeps duplicate network work out of a nested guarded transition", () => {
    const body = functionBody(app, "duplicateCurrentSlide");

    assert.match(body, /ensureNoPendingChanges\(\)/);
    assert.ok(
      !body.includes("guardTransition("),
      "awaiting the server inside the guard lets nested mutations through"
    );
  });
});

// `structureSaving` cannot cover the preflight: it feeds isSaveBusy, so
// ensureNoPendingChanges would refuse the duplicate's own guard. Without a
// separate lock claimed before that first await, two rapid clicks both clear
// the entry checks, stage from the same list, and the later persistence drops
// the earlier clone.
describe("duplicate re-entry during the preflight window", () => {
  it("claims the re-entry lock on entry, before the first await", () => {
    const body = functionBody(app, "duplicateCurrentSlide");
    const firstAwait = body.indexOf("await");

    assert.match(body, /duplicateInProgress/);
    assert.ok(
      body.indexOf("duplicateInProgress") < firstAwait,
      "a second call has to be refused before anything is awaited"
    );
    assert.ok(
      body.indexOf("duplicateInProgress = true") < firstAwait,
      "the lock has to be claimed synchronously"
    );
    assert.match(
      body,
      /finally\s*\{[\s\S]*duplicateInProgress = false/,
      "every exit and error has to release the lock"
    );
  });

  it("keeps the lock out of the shared busy state", () => {
    assert.ok(
      !functionBody(app, "getSaveState").includes("duplicateInProgress"),
      "a lock in isSaveBusy would make the preflight refuse its own guard"
    );
    assert.match(
      functionBody(app, "refreshSaveState"),
      /duplicateSlideBtn\.disabled =[\s\S]*duplicateInProgress/,
      "the duplicate control has to stay disabled through the preflight"
    );
  });

  it("does not activate or announce a clone that was never inserted", () => {
    const body = functionBody(app, "duplicateCurrentSlide");
    const insertionCheck = body.indexOf("nextSlides.length === slides.length");

    assert.notEqual(insertionCheck, -1, "a vanished source has to be detected");
    assert.ok(
      body.lastIndexOf("announceDuplicate(") > insertionCheck,
      "the main list must clear the insertion check before announcing"
    );
    // The template path has no local list to check: it announces the slide the
    // server reported as inserted, and a refused request throws instead.
    assert.match(
      body.slice(body.indexOf("isTemplateMode()"), insertionCheck),
      /announceDuplicate\(cloneSlide\(payload\.slide\)\)/,
      "the template path may only announce what the server inserted"
    );
    // Both paths reach the success announcement through the same helper, so
    // neither can select a slide without also reporting it.
    assert.match(
      functionBody(app, "announceDuplicate"),
      /applySlideSelection\([\s\S]*showToast\(/,
      "selection and the toast belong to the shared success path"
    );
  });
});

describe("current-slide duplicate control", () => {
  it("renders a disabled ghost small button beside Add", () => {
    assert.match(
      html,
      /id="addSlideBtn"[\s\S]*?id="duplicateSlideBtn"[^>]*class="ghost small"[^>]*disabled[^>]*>\s*복제\s*<\/button>/
    );
  });
});
