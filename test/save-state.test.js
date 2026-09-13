import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSnapshot,
  isSnapshotDirty,
  isTemplateDirty,
  deriveSaveButtonState,
  getPendingChangeScopes,
  getSaveSequence,
  getUnsavedChangesMessage,
  selectTransientPreviewFiles,
  shouldRecaptureSlideBaseline,
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

  it("keeps a picked file in the preview for an upload slide", () => {
    const file = { name: "slides.pptx" };
    const backgroundFile = { name: "background.png" };
    assert.deepEqual(
      selectTransientPreviewFiles(
        { type: "simple", sourceType: "upload", adBgSource: "file" },
        { file, backgroundFile }
      ),
      { file, backgroundFile }
    );
  });

  it("drops a picked file that the current slide type cannot render", () => {
    const file = { name: "slides.pptx" };
    const backgroundFile = { name: "background.png" };
    assert.deepEqual(
      selectTransientPreviewFiles(
        { type: "hymn", sourceType: "upload", adBgSource: "file" },
        { file, backgroundFile }
      ),
      { file: null, backgroundFile: null }
    );
    assert.deepEqual(
      selectTransientPreviewFiles(
        { type: "title", sourceType: "upload", adBgSource: "file" },
        { file, backgroundFile }
      ),
      { file: null, backgroundFile: null }
    );
    assert.deepEqual(
      selectTransientPreviewFiles(
        { type: "scripture", sourceType: "upload", adBgSource: "file" },
        { file, backgroundFile }
      ),
      { file: null, backgroundFile: null }
    );
  });

  it("drops a picked file when the slide no longer reads from that source", () => {
    const file = { name: "slides.pptx" };
    const backgroundFile = { name: "background.png" };
    assert.deepEqual(
      selectTransientPreviewFiles(
        { type: "ad", sourceType: "basic", adBgSource: "url" },
        { file, backgroundFile }
      ),
      { file: null, backgroundFile: null }
    );
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

  it("detects template name and slide order changes", () => {
    const baseline = createSnapshot({
      name: "주일",
      slides: [{ id: "1" }, { id: "2" }],
    });
    assert.equal(
      isTemplateDirty(
        { name: "주일 예배", slides: [{ id: "1" }, { id: "2" }] },
        baseline
      ),
      true
    );
    assert.equal(
      isTemplateDirty(
        { name: "주일", slides: [{ id: "2" }, { id: "1" }] },
        baseline
      ),
      true
    );
    assert.equal(
      isTemplateDirty(
        { name: "주일", slides: [{ id: "1" }, { id: "2" }] },
        baseline
      ),
      false
    );
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

  it("keeps template save inactive while the slide draft is still dirty", () => {
    assert.deepEqual(
      deriveSaveButtonState({
        hasSlide: true,
        hasTemplate: true,
        slideDirty: true,
        templateDirty: true,
        slideSaving: false,
        templateSaving: false,
      }),
      { slideDisabled: false, templateDisabled: true }
    );
    assert.deepEqual(
      deriveSaveButtonState({
        hasSlide: true,
        hasTemplate: true,
        slideDirty: false,
        templateDirty: true,
        slideSaving: false,
        templateSaving: false,
      }),
      { slideDisabled: true, templateDisabled: false }
    );
  });

  it("reports both dirty scopes once and saves slide before template", () => {
    const input = { slideDirty: true, templateDirty: true };
    assert.deepEqual(getPendingChangeScopes(input), ["slide", "template"]);
    assert.deepEqual(getSaveSequence(input), ["slide", "template"]);
  });

  it("does not request a popup or save when nothing is dirty", () => {
    assert.deepEqual(
      getPendingChangeScopes({ slideDirty: false, templateDirty: false }),
      []
    );
    assert.deepEqual(
      getSaveSequence({ slideDirty: false, templateDirty: false }),
      []
    );
  });

  it("requests only template save after the slide draft was committed", () => {
    assert.deepEqual(
      getSaveSequence({ slideDirty: false, templateDirty: true }),
      ["template"]
    );
  });

  it("summarizes both dirty scopes in one popup message", () => {
    assert.equal(
      getUnsavedChangesMessage(["slide", "template"]),
      "슬라이드 편집과 템플릿 변경사항이 있습니다."
    );
  });

  it("names the single dirty scope in the popup message", () => {
    assert.equal(
      getUnsavedChangesMessage(["template"]),
      "템플릿에 저장하지 않은 변경사항이 있습니다."
    );
    assert.equal(
      getUnsavedChangesMessage(["slide"]),
      "슬라이드에 저장하지 않은 변경사항이 있습니다."
    );
  });

  it("recaptures a slide baseline only for a clean selection that survives resync", () => {
    assert.equal(
      shouldRecaptureSlideBaseline({
        slideDirty: false,
        currentSlideId: "slide-1",
        storedSlideIds: ["slide-1"],
      }),
      true
    );
    assert.equal(
      shouldRecaptureSlideBaseline({
        slideDirty: true,
        currentSlideId: "slide-1",
        storedSlideIds: ["slide-1"],
      }),
      false
    );
    assert.equal(
      shouldRecaptureSlideBaseline({
        slideDirty: false,
        currentSlideId: null,
        storedSlideIds: ["slide-1"],
      }),
      false
    );
    assert.equal(
      shouldRecaptureSlideBaseline({
        slideDirty: false,
        currentSlideId: "slide-1",
        storedSlideIds: [],
      }),
      false
    );
  });
});
