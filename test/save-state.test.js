import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildResetSlideDraft,
  canApplyResetDraft,
  createSnapshot,
  CUSTOM_RESET_RETRY_MESSAGE,
  isSnapshotDirty,
  deriveSaveButtonState,
  getResetDraftBlockMessage,
  isDiscardComplete,
  isSaveBusy,
  isSlideAtResetDefaults,
  isSlideUnsaved,
  planDiscard,
  resetValuesMatch,
  resolveAdjacentSlideId,
  resolveCurrentSlideSource,
  runGuardedTransition,
  selectTransientPreviewFiles,
  shouldWarnBeforeUnload,
  toFileMetadata,
  UNSAVED_CHANGES_MESSAGE,
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
      titleThemeId: "marquee",
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
    assert.equal(reset.titleThemeId, "original");
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
      titleThemeId: "ivory",
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
    assert.equal(reset.titleThemeId, "original");
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
