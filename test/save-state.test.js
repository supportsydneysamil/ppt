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
  isDiscardComplete,
  isSaveBusy,
  isSlideUnsaved,
  planDiscard,
  runGuardedTransition,
  saveAllPendingScopes,
  selectTransientPreviewFiles,
  shouldRecaptureSlideBaseline,
  shouldWarnBeforeUnload,
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
