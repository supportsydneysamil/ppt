// Fields that carry a whole binary payload instead of a value the user types.
// Serializing them verbatim would put megabytes of base64 through every
// keystroke comparison, so they are reduced to a surrogate instead.
const BINARY_DATA_KEYS = new Set(["customImageData", "fileData"]);
// Fields that normally hold a short path but may hold an inline data URL.
const DATA_URL_KEYS = new Set([
  "thumbnail",
  "adBgImageUrl",
  "adBgImagePath",
  "serverFilePath",
  "originalUrl",
]);
const BINARY_MIN_LENGTH = 512;
// Enough of both ends that a replacement of the same byte length still reads
// as a change, while the cost per comparison stays independent of the payload.
const SURROGATE_SAMPLE = 24;

function isDataUrl(value) {
  return value.startsWith("data:");
}

function shouldSurrogate(key, value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (BINARY_DATA_KEYS.has(key)) {
    return isDataUrl(value) || value.length >= BINARY_MIN_LENGTH;
  }
  return DATA_URL_KEYS.has(key) && isDataUrl(value);
}

function toSurrogate(value) {
  return `__binary:${value.length}:${value.slice(
    0,
    SURROGATE_SAMPLE
  )}:${value.slice(-SURROGATE_SAMPLE)}`;
}

function normalize(value, key) {
  if (Array.isArray(value)) return value.map((entry) => normalize(entry, key));
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, childKey) => {
        if (value[childKey] !== undefined) {
          result[childKey] = normalize(value[childKey], childKey);
        }
        return result;
      }, {});
  }
  if (shouldSurrogate(key, value)) return toSurrogate(value);
  return value;
}

// Exposed so tests can inspect the projection the snapshot is built from.
export function projectSnapshotSource(value) {
  return normalize(value);
}

export function createSnapshot(value) {
  return JSON.stringify(normalize(value));
}

export function isSnapshotDirty(value, baselineSnapshot) {
  return createSnapshot(value) !== baselineSnapshot;
}

export function toFileMetadata(file) {
  return file
    ? {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      }
    : null;
}

export function withTransientFiles(draft, { file, backgroundFile }) {
  return {
    ...draft,
    file,
    adBgImageFile: backgroundFile,
  };
}

// Only the plain text and ad slides read their preview from a picked file, so
// a file chosen before switching type must not override a hymn or title
// preview.
const FILE_PREVIEW_TYPES = new Set(["simple", "ad"]);

export function selectTransientPreviewFiles(draft, { file, backgroundFile }) {
  const usesPickedFiles = FILE_PREVIEW_TYPES.has(draft?.type || "simple");
  return {
    file: usesPickedFiles && draft?.sourceType === "upload" ? file : null,
    backgroundFile:
      usesPickedFiles && draft?.adBgSource === "file" ? backgroundFile : null,
  };
}

// The editor's save button is the only pending state in the app. Template
// structure is written by its own commands the moment they are given, so there
// is nothing else that can be waiting to be saved.
export function deriveSaveButtonState({
  hasSlide,
  slideDirty,
  slideSaving,
  structureSaving,
}) {
  return {
    slideDisabled:
      !hasSlide || !slideDirty || isSaveBusy({ slideSaving, structureSaving }),
  };
}

export const UNSAVED_CHANGES_MESSAGE =
  "슬라이드에 저장하지 않은 변경사항이 있습니다.";

// A slide model that never reached the server may carry no `saved` field at
// all, so anything other than an explicit true counts as unsaved.
export function isSlideUnsaved(slide) {
  return Boolean(slide) && slide.saved !== true;
}

// Decided before a discard mutates anything: a draft that never reached the
// server leaves with the slide, an edited one is repopulated from the record.
export function planDiscard({ slideDirty, slideUnsaved }) {
  const dropSlide = Boolean(slideDirty && slideUnsaved);
  return {
    dropSlide,
    repopulateSlide: Boolean(slideDirty && !slideUnsaved),
  };
}

export function isDiscardComplete({ slideDirty }) {
  return !slideDirty;
}

export function shouldWarnBeforeUnload({ slideDirty }) {
  return Boolean(slideDirty);
}

export function isSaveBusy({ slideSaving, structureSaving }) {
  return Boolean(slideSaving || structureSaving);
}

export const SAVE_BUSY_MESSAGE =
  "저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.";

// Every destructive or reordering action shares this check, so none of them
// can run while a write owns the draft or the stored template.
export function getBusyBlockMessage(state) {
  return isSaveBusy(state) ? SAVE_BUSY_MESSAGE : null;
}

export const REORDER_FAILURE_MESSAGE =
  "슬라이드 순서를 저장하지 못했습니다. 순서를 되돌렸습니다.";

// A scripture slide whose book list never arrived would otherwise be saved
// with an empty or wrong book, so the save is refused with a named reason.
export const BOOKS_UNAVAILABLE_MESSAGE =
  "성경 책 목록을 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.";

export function getBooksUnavailableMessage({ booksReady }) {
  return booksReady ? null : BOOKS_UNAVAILABLE_MESSAGE;
}

// Shown when the workspace could not be built at all, which is a different
// failure from a workspace that loaded without its book list.
export const WORKSPACE_INIT_FAILED_MESSAGE =
  "작업 화면을 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.";

export function planReorder({ ids, slideId, targetIndex }) {
  const fromIndex = ids.indexOf(slideId);
  if (fromIndex === -1) {
    return { changed: false, fromIndex: -1, toIndex: -1 };
  }
  const toIndex = Math.max(0, Math.min(targetIndex, ids.length - 1));
  return { changed: fromIndex !== toIndex, fromIndex, toIndex };
}

export function applyReorder(list, fromIndex, toIndex) {
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

// The single decision table behind every internal navigation. Every side
// effect is injected, so the orchestration is testable without a DOM.
export async function runGuardedTransition({
  getState,
  showDialog,
  save,
  discard,
  transition,
  setBusy,
  onBlocked,
  onSaved,
}) {
  // An in-flight save owns the draft and its baseline, so nothing may move
  // until it settles - not even the popup.
  if (isSaveBusy(getState())) {
    if (onBlocked) onBlocked();
    return false;
  }

  if (!getState().slideDirty) {
    await transition();
    return true;
  }

  // Loops so a failed save or a failed discard can be retried on the dialog
  // that is already open.
  for (;;) {
    if (!getState().slideDirty) {
      break;
    }

    const choice = await showDialog();
    if (choice === "cancel") {
      return false;
    }

    if (choice === "discard") {
      if (await discard()) {
        break;
      }
      continue;
    }

    if (setBusy) setBusy(true);
    let saved = false;
    try {
      saved = await save();
    } finally {
      if (setBusy) setBusy(false);
    }

    if (saved) {
      if (onSaved) onSaved();
      break;
    }
  }

  await transition();
  return true;
}
