import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReorder,
  BOOKS_UNAVAILABLE_MESSAGE,
  createSnapshot,
  deriveSaveButtonState,
  getBooksUnavailableMessage,
  getBusyBlockMessage,
  isSaveBusy,
  isSnapshotDirty,
  planReorder,
  projectSnapshotSource,
  REORDER_FAILURE_MESSAGE,
  SAVE_BUSY_MESSAGE,
  toFileMetadata,
  WORKSPACE_INIT_FAILED_MESSAGE,
} from "../lib/save-state.js";

describe("save busy guard for destructive actions", () => {
  it("counts a structural command in flight as busy", () => {
    assert.equal(isSaveBusy({ structureSaving: true }), true);
    assert.equal(
      isSaveBusy({ slideSaving: false, structureSaving: false }),
      false
    );
  });

  it("names the Korean block reason only while a write is in flight", () => {
    assert.equal(getBusyBlockMessage({ slideSaving: true }), SAVE_BUSY_MESSAGE);
    assert.equal(
      getBusyBlockMessage({ structureSaving: true }),
      SAVE_BUSY_MESSAGE
    );
    assert.equal(getBusyBlockMessage({}), null);
    assert.match(SAVE_BUSY_MESSAGE, /저장이 진행 중입니다/);
  });

  // Reorder, duplicate, delete and rename all reach the server on their own,
  // so any of them holds the editor's save button shut while it is running.
  it("disables the editor save while a structural command persists", () => {
    assert.equal(
      deriveSaveButtonState({
        hasSlide: true,
        slideDirty: true,
        structureSaving: true,
      }).slideDisabled,
      true
    );
  });
});

describe("slide reorder planning", () => {
  const ids = ["a", "b", "c"];

  it("clamps the target index and reports whether anything moves", () => {
    assert.deepEqual(planReorder({ ids, slideId: "a", targetIndex: 2 }), {
      changed: true,
      fromIndex: 0,
      toIndex: 2,
    });
    assert.deepEqual(planReorder({ ids, slideId: "c", targetIndex: 99 }), {
      changed: false,
      fromIndex: 2,
      toIndex: 2,
    });
    assert.deepEqual(planReorder({ ids, slideId: "a", targetIndex: -5 }), {
      changed: false,
      fromIndex: 0,
      toIndex: 0,
    });
    assert.deepEqual(planReorder({ ids, slideId: "zz", targetIndex: 1 }), {
      changed: false,
      fromIndex: -1,
      toIndex: -1,
    });
  });

  it("moves one item without mutating the source order", () => {
    const list = ["a", "b", "c"];
    assert.deepEqual(applyReorder(list, 0, 2), ["b", "c", "a"]);
    assert.deepEqual(list, ["a", "b", "c"]);
  });

  it("names the Korean rollback message for a failed reorder", () => {
    assert.match(REORDER_FAILURE_MESSAGE, /순서/);
  });
});

describe("scripture books readiness", () => {
  it("blocks a scripture save until the book list is available", () => {
    assert.equal(getBooksUnavailableMessage({ booksReady: true }), null);
    assert.match(
      getBooksUnavailableMessage({ booksReady: false }),
      /성경 책 목록/
    );
  });

  it("names a workspace that failed to initialize", () => {
    assert.match(WORKSPACE_INIT_FAILED_MESSAGE, /불러오지 못했습니다/);
    assert.notEqual(WORKSPACE_INIT_FAILED_MESSAGE, BOOKS_UNAVAILABLE_MESSAGE);
  });
});

describe("snapshot projection for heavy binary fields", () => {
  const hugeImage = `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`;
  const otherHugeImage = `data:image/png;base64,${"B".repeat(3 * 1024 * 1024)}`;

  function scriptureSlide(overrides = {}) {
    return {
      id: "s-1",
      name: "말씀",
      type: "scripture",
      book: "genesis",
      customImageData: hugeImage,
      thumbnail: null,
      pendingFile: null,
      ...overrides,
    };
  }

  it("keeps the snapshot bounded for multi-megabyte image data", () => {
    const snapshot = createSnapshot(scriptureSlide());
    assert.equal(hugeImage.length > 3 * 1024 * 1024, true);
    assert.equal(
      snapshot.length < 2048,
      true,
      `snapshot stayed ${snapshot.length} chars`
    );
  });

  it("keeps a template snapshot bounded through the same projection", () => {
    const template = {
      id: "t-1",
      name: "주일 템플릿",
      slides: [scriptureSlide(), scriptureSlide({ id: "s-2" })],
    };
    const snapshot = createSnapshot(template);
    assert.equal(snapshot.length < 4096, true);
    assert.equal(isSnapshotDirty(template, snapshot), false);
    assert.equal(
      isSnapshotDirty(
        { ...template, slides: [scriptureSlide(), scriptureSlide({ id: "s-2", customImageData: otherHugeImage })] },
        snapshot
      ),
      true
    );
  });

  it("detects replacement, clearing and exact revert of image data", () => {
    const baseline = createSnapshot(scriptureSlide());
    assert.equal(isSnapshotDirty(scriptureSlide(), baseline), false);
    assert.equal(
      isSnapshotDirty(scriptureSlide({ customImageData: otherHugeImage }), baseline),
      true
    );
    assert.equal(
      isSnapshotDirty(scriptureSlide({ customImageData: null }), baseline),
      true
    );
    assert.equal(
      isSnapshotDirty(
        scriptureSlide({ customImageData: `${hugeImage}` }),
        baseline
      ),
      false
    );
  });

  it("still detects a pending file replacement through metadata", () => {
    const baseline = createSnapshot(
      scriptureSlide({
        pendingScriptureImage: toFileMetadata({
          name: "one.png",
          size: 10,
          lastModified: 1,
        }),
      })
    );
    assert.equal(
      isSnapshotDirty(
        scriptureSlide({
          pendingScriptureImage: toFileMetadata({
            name: "two.png",
            size: 10,
            lastModified: 1,
          }),
        }),
        baseline
      ),
      true
    );
  });

  it("surrogates data-url thumbnails and backgrounds but not their paths", () => {
    const projected = projectSnapshotSource({
      thumbnail: `data:image/png;base64,${"C".repeat(4096)}`,
      adBgImageUrl: `data:image/png;base64,${"D".repeat(4096)}`,
      adBgImagePath: "/uploads/background.png",
      serverFilePath: "/uploads/deck.pptx",
    });
    assert.equal(projected.thumbnail.length < 128, true);
    assert.equal(projected.adBgImageUrl.length < 128, true);
    assert.equal(projected.adBgImagePath, "/uploads/background.png");
    assert.equal(projected.serverFilePath, "/uploads/deck.pptx");
  });

  it("never surrogates long slide text, so mid-text edits stay dirty", () => {
    const content = "가".repeat(4000);
    const baseline = createSnapshot({ content });
    const edited = `${content.slice(0, 2000)}나${content.slice(2001)}`;
    assert.equal(edited.length, content.length);
    assert.equal(isSnapshotDirty({ content: edited }, baseline), true);
  });
});
