import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildResetSlideDraft,
  canApplyResetDraft,
  createSnapshot,
  CUSTOM_RESET_RETRY_MESSAGE,
  isSnapshotDirty,
  isTemplateDirty,
  deriveSaveButtonState,
  getResetDraftBlockMessage,
  getPendingChangeScopes,
  getSaveSequence,
  getUnsavedChangesMessage,
  isDiscardComplete,
  isSaveBusy,
  isSlideAtResetDefaults,
  isSlideUnsaved,
  planDiscard,
  resetValuesMatch,
  resolveAdjacentSlideId,
  resolveCurrentSlideSource,
  runGuardedTransition,
  saveAllPendingScopes,
  selectTransientPreviewFiles,
  shouldRecaptureSlideBaseline,
  shouldWarnBeforeUnload,
  toFileMetadata,
  withTransientFiles,
} from "../lib/save-state.js";
import { createDefaultCustomSlide } from "../public/custom-slide-model.js";

describe("save state snapshots", () => {
  it("compares primitive reset values directly and snapshots object values", () => {
    const largeDataUrl = `data:image/png;base64,${"a".repeat(200_000)}`;

    assert.equal(resetValuesMatch(largeDataUrl, largeDataUrl), true);
    assert.equal(
      resetValuesMatch(largeDataUrl, `${largeDataUrl.slice(0, -1)}b`),
      false
    );
    assert.equal(resetValuesMatch(null, ""), true);
    assert.equal(resetValuesMatch(undefined, null), true);
    assert.equal(resetValuesMatch("40", 40), false);
    assert.equal(
      resetValuesMatch(
        { background: { color: "#ffffff" }, elements: [] },
        { elements: [], background: { color: "#ffffff" } }
      ),
      true
    );
  });

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
  it("names the defensive custom reset retry", () => {
    assert.equal(
      CUSTOM_RESET_RETRY_MESSAGE,
      "커스텀 슬라이드 초기화를 적용하지 못했습니다. 다시 시도해 주세요."
    );
  });

  it("uses the active reset draft as the type-change source", () => {
    const stored = {
      id: "slide-a",
      type: "custom",
      customImageData: "data:image/png;base64,saved",
      customSlide: { elements: [{ id: "saved-image" }] },
    };
    const reset = {
      id: "slide-a",
      type: "custom",
      customImageData: null,
      customSlide: { elements: [] },
    };

    assert.equal(
      resolveCurrentSlideSource({
        currentSlideId: "slide-a",
        slides: [stored],
        resetDraft: { id: "slide-a", draft: reset },
      }),
      reset
    );
    assert.equal(
      resolveCurrentSlideSource({
        currentSlideId: "slide-a",
        slides: [stored],
        resetDraft: { id: "other", draft: reset },
      }),
      stored
    );
  });

  it("refuses to apply a reset when a save starts during an await", () => {
    assert.equal(
      canApplyResetDraft({
        expectedSlideId: "slide-a",
        currentSlideId: "slide-a",
        saveState: { slideSaving: true },
      }),
      false
    );
    assert.equal(
      canApplyResetDraft({
        expectedSlideId: "slide-a",
        currentSlideId: "slide-b",
        saveState: {},
      }),
      false
    );
    assert.equal(
      canApplyResetDraft({
        expectedSlideId: "slide-a",
        currentSlideId: "slide-a",
        saveState: {},
      }),
      true
    );
  });

  it("explains whether an awaited reset was blocked by saving or selection", () => {
    assert.equal(
      getResetDraftBlockMessage({
        expectedSlideId: "slide-a",
        currentSlideId: "slide-a",
        saveState: { slideSaving: true },
      }),
      "저장이 진행 중입니다. 잠시 후 다시 시도해 주세요."
    );
    assert.equal(
      getResetDraftBlockMessage({
        expectedSlideId: "slide-a",
        currentSlideId: "slide-b",
        saveState: {},
      }),
      "선택한 슬라이드가 변경되어 초기화를 적용하지 않았습니다."
    );
    assert.equal(
      getResetDraftBlockMessage({
        expectedSlideId: "slide-a",
        currentSlideId: "slide-a",
        saveState: {},
      }),
      null
    );
  });

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
      {
        slideDisabled: false,
        templateDisabled: true,
        templateDisabledReason: "slide-dirty",
      }
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
      {
        slideDisabled: true,
        templateDisabled: true,
        templateDisabledReason: "busy",
      }
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
      {
        slideDisabled: false,
        templateDisabled: true,
        templateDisabledReason: "slide-dirty",
      }
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
      {
        slideDisabled: true,
        templateDisabled: false,
        templateDisabledReason: null,
      }
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

  it("treats a slide without a saved flag as unsaved", () => {
    assert.equal(isSlideUnsaved({}), true);
    assert.equal(isSlideUnsaved({ saved: false }), true);
    assert.equal(isSlideUnsaved({ saved: undefined }), true);
    assert.equal(isSlideUnsaved({ saved: true }), false);
    assert.equal(isSlideUnsaved(null), false);
    assert.equal(isSlideUnsaved(undefined), false);
  });

  it("warns before unload only for actual dirty state", () => {
    assert.equal(
      shouldWarnBeforeUnload({ slideDirty: false, templateDirty: false }),
      false
    );
    assert.equal(
      shouldWarnBeforeUnload({ slideDirty: true, templateDirty: false }),
      true
    );
    assert.equal(
      shouldWarnBeforeUnload({ slideDirty: false, templateDirty: true }),
      true
    );
    assert.equal(
      shouldWarnBeforeUnload({ slideDirty: true, templateDirty: true }),
      true
    );
  });

  it("reports a save as busy while either scope is in flight", () => {
    assert.equal(isSaveBusy({ slideSaving: false, templateSaving: false }), false);
    assert.equal(isSaveBusy({ slideSaving: true, templateSaving: false }), true);
    assert.equal(isSaveBusy({ slideSaving: false, templateSaving: true }), true);
  });
});

// Drives the save sequence and the popup choices without touching the DOM, so
// the orchestration decisions are covered by real assertions.
function createGuardHarness(overrides = {}) {
  const state = {
    slideDirty: false,
    templateDirty: false,
    slideSaving: false,
    templateSaving: false,
    ...(overrides.state || {}),
  };
  const calls = {
    dialog: [],
    saved: [],
    discard: 0,
    transition: 0,
    busy: [],
    blocked: 0,
  };
  const choices = overrides.choices ? [...overrides.choices] : [];

  return {
    state,
    calls,
    options: {
      getState: () => ({ ...state }),
      showDialog: async (scopes) => {
        calls.dialog.push(scopes);
        return choices.length ? choices.shift() : "cancel";
      },
      saveScope: async (scope) => {
        calls.saved.push(scope);
        return overrides.saveScope
          ? overrides.saveScope(scope, state)
          : true;
      },
      discard: async () => {
        calls.discard += 1;
        return overrides.discard ? overrides.discard(state) : true;
      },
      transition: async () => {
        calls.transition += 1;
      },
      setBusy: (busy) => calls.busy.push(busy),
      onBlocked: () => {
        calls.blocked += 1;
      },
    },
  };
}

describe("pending save sequence", () => {
  it("asks for nothing when the workspace is already clean", async () => {
    const attempted = [];
    assert.equal(
      await saveAllPendingScopes({
        getState: () => ({ slideDirty: false, templateDirty: false }),
        saveScope: async (scope) => {
          attempted.push(scope);
          return true;
        },
      }),
      true
    );
    assert.deepEqual(attempted, []);
  });

  it("saves the template that the slide save just made dirty", async () => {
    const state = { slideDirty: true, templateDirty: false };
    const attempted = [];

    assert.equal(
      await saveAllPendingScopes({
        getState: () => ({ ...state }),
        saveScope: async (scope) => {
          attempted.push(scope);
          if (scope === "slide") {
            state.slideDirty = false;
            state.templateDirty = true;
          } else {
            state.templateDirty = false;
          }
          return true;
        },
      }),
      true
    );
    assert.deepEqual(attempted, ["slide", "template"]);
  });

  it("stops at the first failing scope", async () => {
    const attempted = [];
    assert.equal(
      await saveAllPendingScopes({
        getState: () => ({ slideDirty: true, templateDirty: true }),
        saveScope: async (scope) => {
          attempted.push(scope);
          return false;
        },
      }),
      false
    );
    assert.deepEqual(attempted, ["slide"]);
  });

  it("gives up instead of spinning when a save never goes clean", async () => {
    const attempted = [];
    assert.equal(
      await saveAllPendingScopes({
        getState: () => ({ slideDirty: true, templateDirty: false }),
        saveScope: async (scope) => {
          attempted.push(scope);
          return true;
        },
      }),
      false
    );
    assert.deepEqual(attempted, ["slide", "slide", "slide"]);
  });
});

describe("discard plan", () => {
  it("never syncs the local slide list into a template being restored", () => {
    assert.deepEqual(
      planDiscard({
        slideDirty: true,
        slideUnsaved: true,
        templateMode: true,
        templateDirty: true,
      }),
      {
        restoringTemplate: true,
        dropSlide: true,
        repopulateSlide: false,
        syncLocalSlides: false,
      }
    );
  });

  it("syncs the dropped draft out of a clean template", () => {
    assert.deepEqual(
      planDiscard({
        slideDirty: true,
        slideUnsaved: true,
        templateMode: true,
        templateDirty: false,
      }),
      {
        restoringTemplate: false,
        dropSlide: true,
        repopulateSlide: false,
        syncLocalSlides: true,
      }
    );
  });

  it("syncs the dropped draft out of the main slide list", () => {
    assert.deepEqual(
      planDiscard({
        slideDirty: true,
        slideUnsaved: true,
        templateMode: false,
        templateDirty: false,
      }),
      {
        restoringTemplate: false,
        dropSlide: true,
        repopulateSlide: false,
        syncLocalSlides: true,
      }
    );
  });

  it("repopulates an edited slide instead of dropping or syncing it", () => {
    assert.deepEqual(
      planDiscard({
        slideDirty: true,
        slideUnsaved: false,
        templateMode: true,
        templateDirty: true,
      }),
      {
        restoringTemplate: true,
        dropSlide: false,
        repopulateSlide: true,
        syncLocalSlides: false,
      }
    );
  });

  it("touches no slide state when only the template is dirty", () => {
    assert.deepEqual(
      planDiscard({
        slideDirty: false,
        slideUnsaved: false,
        templateMode: true,
        templateDirty: true,
      }),
      {
        restoringTemplate: true,
        dropSlide: false,
        repopulateSlide: false,
        syncLocalSlides: false,
      }
    );
  });

  it("counts a discard as complete only once no scope is dirty", () => {
    assert.equal(
      isDiscardComplete({ slideDirty: false, templateDirty: false }),
      true
    );
    assert.equal(
      isDiscardComplete({ slideDirty: true, templateDirty: false }),
      false
    );
    assert.equal(
      isDiscardComplete({ slideDirty: false, templateDirty: true }),
      false
    );
  });
});

describe("guarded transition orchestration", () => {
  it("proceeds straight through a clean workspace", async () => {
    const harness = createGuardHarness();

    assert.equal(await runGuardedTransition(harness.options), true);
    assert.equal(harness.calls.transition, 1);
    assert.deepEqual(harness.calls.dialog, []);
    assert.deepEqual(harness.calls.saved, []);
  });

  it("blocks the dialog and the transition while a save is in flight", async () => {
    const slideBusy = createGuardHarness({
      state: { slideDirty: true, slideSaving: true },
    });
    assert.equal(await runGuardedTransition(slideBusy.options), false);
    assert.equal(slideBusy.calls.transition, 0);
    assert.deepEqual(slideBusy.calls.dialog, []);
    assert.equal(slideBusy.calls.blocked, 1);

    const templateBusy = createGuardHarness({
      state: { templateDirty: true, templateSaving: true },
    });
    assert.equal(await runGuardedTransition(templateBusy.options), false);
    assert.equal(templateBusy.calls.transition, 0);
    assert.deepEqual(templateBusy.calls.dialog, []);
    assert.equal(templateBusy.calls.blocked, 1);
  });

  it("transitions only after every required save succeeds", async () => {
    const harness = createGuardHarness({
      state: { slideDirty: true },
      choices: ["save"],
      saveScope: (scope, state) => {
        if (scope === "slide") {
          state.slideDirty = false;
          state.templateDirty = true;
        } else {
          state.templateDirty = false;
        }
        return true;
      },
    });

    assert.equal(await runGuardedTransition(harness.options), true);
    assert.deepEqual(harness.calls.dialog, [["slide"]]);
    assert.deepEqual(harness.calls.saved, ["slide", "template"]);
    assert.deepEqual(harness.calls.busy, [true, false]);
    assert.equal(harness.calls.transition, 1);
  });

  it("does not transition when a required save fails, and stays retryable", async () => {
    const harness = createGuardHarness({
      state: { slideDirty: true, templateDirty: true },
      choices: ["save", "cancel"],
      saveScope: () => false,
    });

    assert.equal(await runGuardedTransition(harness.options), false);
    assert.equal(harness.calls.transition, 0);
    assert.deepEqual(harness.calls.saved, ["slide"]);
    // The popup was offered again instead of closing on the failure.
    assert.deepEqual(harness.calls.dialog, [
      ["slide", "template"],
      ["slide", "template"],
    ]);
    assert.deepEqual(harness.calls.busy, [true, false]);
  });

  it("does not transition when the discard cannot restore saved state", async () => {
    const harness = createGuardHarness({
      state: { templateDirty: true },
      choices: ["discard", "cancel"],
      discard: () => false,
    });

    assert.equal(await runGuardedTransition(harness.options), false);
    assert.equal(harness.calls.discard, 1);
    assert.equal(harness.calls.transition, 0);
    assert.deepEqual(harness.calls.dialog, [["template"], ["template"]]);
  });

  it("transitions after a successful discard", async () => {
    const harness = createGuardHarness({
      state: { slideDirty: true },
      choices: ["discard"],
      discard: (state) => {
        state.slideDirty = false;
        return true;
      },
    });

    assert.equal(await runGuardedTransition(harness.options), true);
    assert.equal(harness.calls.discard, 1);
    assert.equal(harness.calls.transition, 1);
  });

  it("keeps the workspace put when the user chooses to keep editing", async () => {
    const harness = createGuardHarness({
      state: { slideDirty: true },
      choices: ["cancel"],
    });

    assert.equal(await runGuardedTransition(harness.options), false);
    assert.equal(harness.calls.transition, 0);
    assert.deepEqual(harness.calls.saved, []);
    assert.equal(harness.calls.discard, 0);
  });
});

describe("resolveAdjacentSlideId", () => {
  const slides = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("prefers the next slide when one exists", () => {
    assert.equal(resolveAdjacentSlideId(slides, "b"), "c");
  });

  it("falls back to the previous slide at the end of the list", () => {
    assert.equal(resolveAdjacentSlideId(slides, "c"), "b");
  });

  it("returns null when the removed slide is the only one", () => {
    assert.equal(resolveAdjacentSlideId([{ id: "solo" }], "solo"), null);
  });

  it("returns null when the id is not in the list", () => {
    assert.equal(resolveAdjacentSlideId(slides, "missing"), null);
  });
});

describe("buildResetSlideDraft", () => {
  const emptyCustomSlide = createDefaultCustomSlide();

  it("recognizes a saved slide already at its type defaults", () => {
    assert.equal(
      isSlideAtResetDefaults({
        id: "default",
        name: "기본",
        type: "simple",
        saved: true,
        sourceType: "basic",
        content: "",
        font: "Malgun Gothic",
        fontSize: "40",
        bg: "black",
        align: "center",
        fileSaved: false,
      }),
      true
    );
    assert.equal(
      isSlideAtResetDefaults({
        id: "media",
        name: "미디어",
        type: "simple",
        saved: true,
        sourceType: "upload",
        fileName: "saved.pptx",
      }),
      false
    );
  });

  it("checks custom reset defaults with an optional live canvas model", () => {
    const slide = {
      id: "custom",
      name: "커스텀",
      type: "custom",
      saved: true,
      sourceType: "basic",
      fileSaved: false,
      customSlide: {
        ...emptyCustomSlide,
        background: { color: "#112233" },
      },
    };

    assert.equal(isSlideAtResetDefaults(slide), false);
    assert.equal(
      isSlideAtResetDefaults(slide, { customSlide: emptyCustomSlide }),
      true
    );
    assert.equal(
      isSlideAtResetDefaults(
        { ...slide, pendingFile: { name: "pending.pptx" } },
        { customSlide: emptyCustomSlide }
      ),
      false
    );
  });

  it("does not mutate the source slide", () => {
    const source = {
      id: "slide-1",
      name: "광고",
      type: "ad",
      content: "본문",
      saved: true,
    };
    const snapshot = structuredClone(source);

    buildResetSlideDraft(source);

    assert.deepEqual(source, snapshot);
  });

  it("preserves id, name, type, and saved for a simple slide", () => {
    const reset = buildResetSlideDraft({
      id: "slide-simple",
      name: "텍스트 슬라이드",
      type: "simple",
      saved: true,
      sourceType: "upload",
      content: "편집된 내용",
      font: "Arial",
      fontSize: "24",
      bg: "white",
      align: "left",
      fileName: "deck.pptx",
      fileSaved: true,
      serverFilePath: "/uploads/deck.pptx",
      thumbnail: "/uploads/deck-thumb.jpeg",
    });

    assert.equal(reset.id, "slide-simple");
    assert.equal(reset.name, "텍스트 슬라이드");
    assert.equal(reset.type, "simple");
    assert.equal(reset.saved, true);
    assert.equal(reset.sourceType, "basic");
    assert.equal(reset.content, "");
    assert.equal(reset.font, "Malgun Gothic");
    assert.equal(reset.fontSize, "40");
    assert.equal(reset.bg, "black");
    assert.equal(reset.align, "center");
    assert.deepEqual(
      {
        fileName: reset.fileName,
        fileSaved: reset.fileSaved,
        serverFilePath: reset.serverFilePath,
        thumbnail: reset.thumbnail,
      },
      {
        fileName: null,
        fileSaved: false,
        serverFilePath: null,
        thumbnail: null,
      }
    );
  });

  it("resets ad design fields and clears uploaded background media", () => {
    const reset = buildResetSlideDraft({
      id: "slide-ad",
      name: "광고",
      type: "ad",
      saved: true,
      sourceType: "upload",
      content: "본문",
      adTitle: "제목",
      adTitleSize: "large",
      adTitleAlign: "left",
      adBgSource: "file",
      adBgImagePath: "/uploads/bg.png",
      adBgImageUrl: "https://example.com/bg.png",
      adBgOpacity: 80,
      fileName: "ad.pptx",
      serverFilePath: "/uploads/ad.pptx",
    });

    assert.equal(reset.type, "ad");
    assert.equal(reset.name, "광고");
    assert.equal(reset.sourceType, "basic");
    assert.equal(reset.content, "");
    assert.equal(reset.adTitle, "");
    assert.equal(reset.adTitleSize, "medium");
    assert.equal(reset.adTitleAlign, "center");
    assert.equal(reset.adBgSource, "none");
    assert.equal(reset.adBgOpacity, 30);
    assert.deepEqual(
      {
        adBgImagePath: reset.adBgImagePath,
        adBgImageUrl: reset.adBgImageUrl,
        serverFilePath: reset.serverFilePath,
        fileName: reset.fileName,
      },
      {
        adBgImagePath: null,
        adBgImageUrl: null,
        serverFilePath: null,
        fileName: null,
      }
    );
  });

  it("resets hymn metadata and clears downloaded file references", () => {
    const reset = buildResetSlideDraft({
      id: "slide-hymn",
      name: "찬송가 25장",
      type: "hymn",
      saved: true,
      hymnNumber: "25",
      hymnKorTitle: "내 영혼아",
      hymnEngTitle: "Blessed Assurance",
      includeTitle: true,
      originalUrl: "https://example.com/hymn.ppt",
      serverFilePath: "/uploads/hymn.ppt",
      fileName: "hymn.ppt",
      fileSaved: true,
    });

    assert.equal(reset.type, "hymn");
    assert.equal(reset.name, "찬송가 25장");
    assert.equal(reset.sourceType, "upload");
    assert.equal(reset.hymnNumber, null);
    assert.equal(reset.hymnKorTitle, "");
    assert.equal(reset.hymnEngTitle, "");
    assert.equal(reset.includeTitle, false);
    assert.deepEqual(
      {
        originalUrl: reset.originalUrl,
        serverFilePath: reset.serverFilePath,
        fileName: reset.fileName,
        fileSaved: reset.fileSaved,
      },
      {
        originalUrl: null,
        serverFilePath: null,
        fileName: null,
        fileSaved: false,
      }
    );
  });

  it("resets scripture verse fields and clears generated uploads", () => {
    const reset = buildResetSlideDraft({
      id: "slide-scripture",
      name: "출애굽기 1:1-2",
      type: "scripture",
      saved: true,
      testament: "old",
      book: "exodus",
      chapter: "1",
      start: "1",
      end: "2",
      koVersion: "개역개정",
      enVersion: "kjv",
      themeId: "light",
      includeTitle: false,
      titleSlideType: "설교",
      scriptureSignature: "sig",
      customImageData: "data:image/png;base64,abc",
      serverFilePath: "/uploads/scripture.pptx",
      thumbnail: "/uploads/scripture-thumb.jpeg",
    });

    assert.equal(reset.type, "scripture");
    assert.equal(reset.name, "출애굽기 1:1-2");
    assert.equal(reset.sourceType, "upload");
    assert.equal(reset.testament, "");
    assert.equal(reset.book, "");
    assert.equal(reset.chapter, "");
    assert.equal(reset.start, "");
    assert.equal(reset.end, "");
    assert.equal(reset.koVersion, "새번역");
    assert.equal(reset.enVersion, "web");
    assert.equal(reset.themeId, "dark");
    assert.equal(reset.includeTitle, true);
    assert.equal(reset.titleSlideType, "말씀");
    assert.equal(reset.scriptureSignature, "");
    assert.deepEqual(
      {
        customImageData: reset.customImageData,
        serverFilePath: reset.serverFilePath,
        thumbnail: reset.thumbnail,
      },
      {
        customImageData: null,
        serverFilePath: null,
        thumbnail: null,
      }
    );
  });

  it("resets title slide design fields", () => {
    const reset = buildResetSlideDraft({
      id: "slide-title",
      name: "주일예배",
      type: "title",
      saved: true,
      titleDesign: "gothic",
      churchName: "삼일교회",
      serviceDate: "2026-09-14",
      titleSubtitle: "추석 감사",
    });

    assert.equal(reset.type, "title");
    assert.equal(reset.name, "주일예배");
    assert.equal(reset.sourceType, "basic");
    assert.equal(reset.titleDesign, "chapel");
    assert.equal(reset.churchName, "");
    assert.equal(reset.serviceDate, "");
    assert.equal(reset.titleSubtitle, "");
  });

  it("resets custom-title slide design fields", () => {
    const reset = buildResetSlideDraft({
      id: "slide-custom-title",
      name: "타이틀+",
      type: "custom-title",
      saved: true,
      customTitleDesign: "monolith",
      customTitleKo: "주일예배",
      customTitleEn: "Sunday Worship",
      customTitleSubtitle: "2026",
    });

    assert.equal(reset.type, "custom-title");
    assert.equal(reset.name, "타이틀+");
    assert.equal(reset.sourceType, "basic");
    assert.equal(reset.customTitleDesign, "aurora");
    assert.equal(reset.customTitleKo, "");
    assert.equal(reset.customTitleEn, "");
    assert.equal(reset.customTitleSubtitle, "");
  });

  it("replaces a custom slide canvas with a normalized empty model", () => {
    const reset = buildResetSlideDraft({
      id: "slide-custom",
      name: "커스텀",
      type: "custom",
      saved: true,
      customSlide: {
        version: 1,
        width: 1280,
        height: 720,
        background: { color: "#112233" },
        elements: [
          {
            id: "rect-1",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            fill: "#ff0000",
            zIndex: 0,
          },
        ],
      },
    });

    assert.equal(reset.type, "custom");
    assert.equal(reset.name, "커스텀");
    assert.equal(reset.sourceType, "basic");
    assert.deepEqual(reset.customSlide, emptyCustomSlide);
    assert.notEqual(reset.customSlide, emptyCustomSlide);
  });
});
