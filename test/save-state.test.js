import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSnapshot,
  isSnapshotDirty,
  deriveSaveButtonState,
  getPendingChangeScopes,
  getSaveSequence,
  toFileMetadata,
  withTransientFiles,
} from "../lib/save-state.js";

describe("save state snapshots", () => {
  it("keeps transient file metadata stable for dirty comparison", () => {
    assert.deepEqual(
      toFileMetadata({
        name: "wide.pptx",
        size: 10,
        lastModified: 1,
        path: "ignored browser detail",
      }),
      {
        name: "wide.pptx",
        size: 10,
        lastModified: 1,
      }
    );
    assert.equal(toFileMetadata(null), null);
  });

  it("attaches live files for preview without mutating the snapshot draft", () => {
    const draft = {
      name: "업로드",
      pendingFile: { name: "slides.pptx", size: 10, lastModified: 1 },
      pendingBackgroundFile: { name: "background.png", size: 20, lastModified: 2 },
    };
    const file = { name: "slides.pptx", live: true };
    const backgroundFile = { name: "background.png", live: true };

    assert.deepEqual(
      withTransientFiles(draft, { file, backgroundFile }),
      {
        ...draft,
        file,
        adBgImageFile: backgroundFile,
      }
    );
    assert.equal("file" in draft, false);
    assert.equal("adBgImageFile" in draft, false);
  });

  it("ignores object key insertion order", () => {
    assert.equal(
      createSnapshot({ name: "예배", settings: { size: 40, align: "center" } }),
      createSnapshot({ settings: { align: "center", size: 40 }, name: "예배" })
    );
  });

  it("becomes clean when a changed value returns to the baseline", () => {
    const baseline = createSnapshot({ name: "원본", size: 40 });
    assert.equal(isSnapshotDirty({ name: "수정", size: 40 }, baseline), true);
    assert.equal(isSnapshotDirty({ name: "원본", size: 40 }, baseline), false);
  });
});

describe("save state decisions", () => {
  it("enables only the button that has pending work", () => {
    assert.deepEqual(
      deriveSaveButtonState({
        hasSlide: true,
        hasTemplate: true,
        slideDirty: true,
        templateDirty: false,
        slideSaving: false,
        templateSaving: false,
      }),
      { slideDisabled: false, templateDisabled: true }
    );
  });

  it("disables both buttons while either save is running", () => {
    assert.deepEqual(
      deriveSaveButtonState({
        hasSlide: true,
        hasTemplate: true,
        slideDirty: true,
        templateDirty: true,
        slideSaving: true,
        templateSaving: false,
      }),
      { slideDisabled: true, templateDisabled: true }
    );
  });

  it("reports both dirty scopes once and saves slide before template", () => {
    const input = { slideDirty: true, templateDirty: true };
    assert.deepEqual(getPendingChangeScopes(input), ["slide", "template"]);
    assert.deepEqual(getSaveSequence(input), ["slide", "template"]);
  });
});
