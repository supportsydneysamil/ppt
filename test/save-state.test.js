import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSnapshot,
  isSnapshotDirty,
  deriveSaveButtonState,
  isDiscardComplete,
  isSaveBusy,
  isSlideUnsaved,
  planDiscard,
  runGuardedTransition,
  selectTransientPreviewFiles,
  shouldWarnBeforeUnload,
  toFileMetadata,
  UNSAVED_CHANGES_MESSAGE,
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

  it("stays sensitive to list order and nested values", () => {
    const baseline = createSnapshot({
      name: "주일",
      slides: [{ id: "1" }, { id: "2" }],
    });
    assert.equal(
      isSnapshotDirty(
        { name: "주일 예배", slides: [{ id: "1" }, { id: "2" }] },
        baseline
      ),
      true
    );
    assert.equal(
      isSnapshotDirty(
        { name: "주일", slides: [{ id: "2" }, { id: "1" }] },
        baseline
      ),
      true
    );
    assert.equal(
      isSnapshotDirty(
        { name: "주일", slides: [{ id: "1" }, { id: "2" }] },
        baseline
      ),
      false
    );
  });
});

describe("save state decisions", () => {
  // The editor draft is the only thing that can be pending. Template structure
  // is written by its own commands, so it never reaches this decision.
  it("enables the editor save only for a dirty draft", () => {
    assert.deepEqual(
      deriveSaveButtonState({ hasSlide: true, slideDirty: true }),
      { slideDisabled: false }
    );
    assert.deepEqual(
      deriveSaveButtonState({ hasSlide: true, slideDirty: false }),
      { slideDisabled: true }
    );
    assert.deepEqual(
      deriveSaveButtonState({ hasSlide: false, slideDirty: true }),
      { slideDisabled: true }
    );
  });

  it("disables the editor save while any write is in flight", () => {
    assert.deepEqual(
      deriveSaveButtonState({
        hasSlide: true,
        slideDirty: true,
        slideSaving: true,
      }),
      { slideDisabled: true }
    );
    assert.deepEqual(
      deriveSaveButtonState({
        hasSlide: true,
        slideDirty: true,
        structureSaving: true,
      }),
      { slideDisabled: true }
    );
  });

  it("names the one thing the popup can be about", () => {
    assert.match(UNSAVED_CHANGES_MESSAGE, /슬라이드/);
  });

  it("treats a slide without a saved flag as unsaved", () => {
    assert.equal(isSlideUnsaved({}), true);
    assert.equal(isSlideUnsaved({ saved: false }), true);
    assert.equal(isSlideUnsaved({ saved: undefined }), true);
    assert.equal(isSlideUnsaved({ saved: true }), false);
    assert.equal(isSlideUnsaved(null), false);
    assert.equal(isSlideUnsaved(undefined), false);
  });

  it("warns before unload only for a dirty draft", () => {
    assert.equal(shouldWarnBeforeUnload({ slideDirty: false }), false);
    assert.equal(shouldWarnBeforeUnload({ slideDirty: true }), true);
  });

  it("reports a save as busy while either kind of write runs", () => {
    assert.equal(
      isSaveBusy({ slideSaving: false, structureSaving: false }),
      false
    );
    assert.equal(isSaveBusy({ slideSaving: true }), true);
    assert.equal(isSaveBusy({ structureSaving: true }), true);
  });
});

// Drives the popup choices without touching the DOM, so the orchestration
// decisions are covered by real assertions.
function createGuardHarness(overrides = {}) {
  const state = {
    slideDirty: false,
    slideSaving: false,
    structureSaving: false,
    ...(overrides.state || {}),
  };
  const calls = {
    dialog: 0,
    saved: 0,
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
      showDialog: async () => {
        calls.dialog += 1;
        return choices.length ? choices.shift() : "cancel";
      },
      save: async () => {
        calls.saved += 1;
        return overrides.save ? overrides.save(state) : true;
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

describe("discard plan", () => {
  it("drops a draft that never reached the server", () => {
    assert.deepEqual(planDiscard({ slideDirty: true, slideUnsaved: true }), {
      dropSlide: true,
      repopulateSlide: false,
    });
  });

  it("repopulates an edited slide from its stored record", () => {
    assert.deepEqual(planDiscard({ slideDirty: true, slideUnsaved: false }), {
      dropSlide: false,
      repopulateSlide: true,
    });
  });

  it("touches nothing when the draft is clean", () => {
    assert.deepEqual(planDiscard({ slideDirty: false, slideUnsaved: false }), {
      dropSlide: false,
      repopulateSlide: false,
    });
  });

  it("counts a discard as complete only once the draft is clean", () => {
    assert.equal(isDiscardComplete({ slideDirty: false }), true);
    assert.equal(isDiscardComplete({ slideDirty: true }), false);
  });
});

describe("guarded transition orchestration", () => {
  it("proceeds straight through a clean workspace", async () => {
    const harness = createGuardHarness();

    assert.equal(await runGuardedTransition(harness.options), true);
    assert.equal(harness.calls.transition, 1);
    assert.equal(harness.calls.dialog, 0);
    assert.equal(harness.calls.saved, 0);
  });

  it("blocks the dialog and the transition while a write is in flight", async () => {
    const slideBusy = createGuardHarness({
      state: { slideDirty: true, slideSaving: true },
    });
    assert.equal(await runGuardedTransition(slideBusy.options), false);
    assert.equal(slideBusy.calls.transition, 0);
    assert.equal(slideBusy.calls.dialog, 0);
    assert.equal(slideBusy.calls.blocked, 1);

    const structureBusy = createGuardHarness({
      state: { slideDirty: true, structureSaving: true },
    });
    assert.equal(await runGuardedTransition(structureBusy.options), false);
    assert.equal(structureBusy.calls.transition, 0);
    assert.equal(structureBusy.calls.blocked, 1);
  });

  it("transitions once the save succeeds", async () => {
    const harness = createGuardHarness({
      state: { slideDirty: true },
      choices: ["save"],
      save: (state) => {
        state.slideDirty = false;
        return true;
      },
    });

    assert.equal(await runGuardedTransition(harness.options), true);
    assert.equal(harness.calls.dialog, 1);
    assert.equal(harness.calls.saved, 1);
    assert.deepEqual(harness.calls.busy, [true, false]);
    assert.equal(harness.calls.transition, 1);
  });

  it("does not transition when the save fails, and stays retryable", async () => {
    const harness = createGuardHarness({
      state: { slideDirty: true },
      choices: ["save", "cancel"],
      save: () => false,
    });

    assert.equal(await runGuardedTransition(harness.options), false);
    assert.equal(harness.calls.transition, 0);
    assert.equal(harness.calls.saved, 1);
    // The popup was offered again instead of closing on the failure.
    assert.equal(harness.calls.dialog, 2);
    assert.deepEqual(harness.calls.busy, [true, false]);
  });

  it("does not transition when the discard cannot restore saved state", async () => {
    const harness = createGuardHarness({
      state: { slideDirty: true },
      choices: ["discard", "cancel"],
      discard: () => false,
    });

    assert.equal(await runGuardedTransition(harness.options), false);
    assert.equal(harness.calls.discard, 1);
    assert.equal(harness.calls.transition, 0);
    assert.equal(harness.calls.dialog, 2);
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
    assert.equal(harness.calls.saved, 0);
    assert.equal(harness.calls.discard, 0);
  });
});
