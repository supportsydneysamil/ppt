import {
  createDefaultCustomSlide,
  normalizeCustomSlide,
} from "../public/custom-slide-model.js";

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

// Primitive reset values can include very large data URLs. Compare them
// directly so routine button refreshes do not serialize those strings.
export function resetValuesMatch(value, defaultValue) {
  const valueIsObject = value !== null && typeof value === "object";
  const defaultIsObject =
    defaultValue !== null && typeof defaultValue === "object";

  if (!valueIsObject && !defaultIsObject) {
    const valueIsEmpty = value === null || value === undefined || value === "";
    const defaultIsEmpty =
      defaultValue === null || defaultValue === undefined || defaultValue === "";
    return (valueIsEmpty && defaultIsEmpty) || Object.is(value, defaultValue);
  }
  if (valueIsObject !== defaultIsObject) {
    return false;
  }
  return createSnapshot(value) === createSnapshot(defaultValue);
}

export function isSlideAtResetDefaults(slide, { customSlide } = {}) {
  if (!slide) return true;
  const defaults = buildResetSlideDraft(slide);
  const current =
    customSlide === undefined ? slide : { ...slide, customSlide };
  return (
    !current.pendingFile &&
    !current.pendingBackgroundFile &&
    !current.pendingScriptureImage &&
    Object.keys(defaults).every((key) =>
      resetValuesMatch(current[key], defaults[key])
    )
  );
}

export function isSnapshotDirty(value, baselineSnapshot) {
  return createSnapshot(value) !== baselineSnapshot;
}

export function isTemplateDirty(templateDraft, baselineSnapshot) {
  return isSnapshotDirty(templateDraft, baselineSnapshot);
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

// Shown next to a template save button that is only disabled because the
// dirty slide draft has not been staged yet.
export const TEMPLATE_SAVE_BLOCKED_HINT =
  "슬라이드 변경사항을 먼저 저장하면 템플릿을 저장할 수 있습니다.";

export function deriveSaveButtonState({
  hasSlide,
  hasTemplate,
  slideDirty,
  templateDirty,
  slideSaving,
  templateSaving,
  reorderSaving,
  duplicateSaving,
}) {
  const busy = isSaveBusy({
    slideSaving,
    templateSaving,
    reorderSaving,
    duplicateSaving,
  });
  // Template editing stays a two-stage flow: the slide draft has to be
  // committed before the template itself can be saved.
  const templateDisabled =
    !hasTemplate || !templateDirty || busy || Boolean(slideDirty);
  let templateDisabledReason = null;
  if (templateDisabled) {
    if (busy) templateDisabledReason = "busy";
    else if (!hasTemplate) templateDisabledReason = "missing";
    else if (slideDirty) templateDisabledReason = "slide-dirty";
    else templateDisabledReason = "clean";
  }

  return {
    slideDisabled: !hasSlide || !slideDirty || busy,
    templateDisabled,
    templateDisabledReason,
  };
}

export function getPendingChangeScopes({ slideDirty, templateDirty }) {
  return [
    ...(slideDirty ? ["slide"] : []),
    ...(templateDirty ? ["template"] : []),
  ];
}

export function getSaveSequence(input) {
  return getPendingChangeScopes(input);
}

export function getUnsavedChangesMessage(scopes) {
  if (scopes.includes("slide") && scopes.includes("template")) {
    return "슬라이드 편집과 템플릿 변경사항이 있습니다.";
  }
  return scopes.includes("template")
    ? "템플릿에 저장하지 않은 변경사항이 있습니다."
    : "슬라이드에 저장하지 않은 변경사항이 있습니다.";
}

// A slide model that never reached the server may carry no `saved` field at
// all, so anything other than an explicit true counts as unsaved.
export function isSlideUnsaved(slide) {
  return Boolean(slide) && slide.saved !== true;
}

// Decided before a discard mutates anything. A server template restore
// replaces the whole working copy, so the local dirty slides must never be
// written back into the template cache on the way there: that would clobber
// the entry that was just fetched.
export function planDiscard({
  slideDirty,
  slideUnsaved,
  templateMode,
  templateDirty,
}) {
  const restoringTemplate = Boolean(templateMode && templateDirty);
  const dropSlide = Boolean(slideDirty && slideUnsaved);
  return {
    restoringTemplate,
    dropSlide,
    repopulateSlide: Boolean(slideDirty && !slideUnsaved),
    syncLocalSlides: dropSlide && !restoringTemplate,
  };
}

export function isDiscardComplete({ slideDirty, templateDirty }) {
  return getPendingChangeScopes({ slideDirty, templateDirty }).length === 0;
}

export function shouldWarnBeforeUnload({ slideDirty, templateDirty }) {
  return getPendingChangeScopes({ slideDirty, templateDirty }).length > 0;
}

export function isSaveBusy({
  slideSaving,
  templateSaving,
  reorderSaving,
  duplicateSaving,
}) {
  return Boolean(
    slideSaving || templateSaving || reorderSaving || duplicateSaving
  );
}

// Evaluated after asynchronous reset preparation so a save or selection
// change that happened during an await prevents the prepared draft landing.
export function canApplyResetDraft({
  expectedSlideId,
  currentSlideId,
  saveState = {},
}) {
  return !getResetDraftBlockMessage({
    expectedSlideId,
    currentSlideId,
    saveState,
  });
}

export function resolveCurrentSlideSource({
  currentSlideId,
  slides = [],
  resetDraft = null,
}) {
  if (resetDraft?.id === currentSlideId && resetDraft.draft) {
    return resetDraft.draft;
  }
  return slides.find((slide) => slide.id === currentSlideId) ?? null;
}

export const CUSTOM_RESET_RETRY_MESSAGE =
  "커스텀 슬라이드 초기화를 적용하지 못했습니다. 다시 시도해 주세요.";

export const SAVE_BUSY_MESSAGE =
  "저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.";

export const RESET_SELECTION_CHANGED_MESSAGE =
  "선택한 슬라이드가 변경되어 초기화를 적용하지 않았습니다.";

export function getResetDraftBlockMessage({
  expectedSlideId,
  currentSlideId,
  saveState = {},
}) {
  if (isSaveBusy(saveState)) {
    return SAVE_BUSY_MESSAGE;
  }
  return expectedSlideId && expectedSlideId === currentSlideId
    ? null
    : RESET_SELECTION_CHANGED_MESSAGE;
}

// Every destructive or reordering action shares this check, so none of them
// can run while a save owns the drafts and the baselines.
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

// Walks the save sequence one scope at a time, recomputing it after every
// step: committing the slide draft is what makes the template dirty, so the
// sequence cannot be decided up front.
export async function saveAllPendingScopes({
  getState,
  saveScope,
  maxRounds = 3,
}) {
  // Two scopes need at most two rounds plus one confirming round. The bound
  // only exists so a scope that reports success without going clean ends the
  // loop instead of spinning.
  for (let round = 0; round < maxRounds; round += 1) {
    const [scope] = getSaveSequence(getState());
    if (!scope) {
      return true;
    }
    if (!(await saveScope(scope))) {
      return false;
    }
  }

  return getPendingChangeScopes(getState()).length === 0;
}

// The single decision table behind every internal navigation. Every side
// effect is injected, so the orchestration is testable without a DOM.
export async function runGuardedTransition({
  getState,
  showDialog,
  saveScope,
  discard,
  transition,
  setBusy,
  onBlocked,
  onSaved,
  maxSaveRounds,
}) {
  // An in-flight save owns the draft and the baselines, so nothing may move
  // until it settles - not even the popup.
  if (isSaveBusy(getState())) {
    if (onBlocked) onBlocked();
    return false;
  }

  if (getPendingChangeScopes(getState()).length === 0) {
    await transition();
    return true;
  }

  // Loops so a failed save or a failed discard can be retried on the dialog
  // that is already open.
  for (;;) {
    const scopes = getPendingChangeScopes(getState());
    if (scopes.length === 0) {
      break;
    }

    const choice = await showDialog(scopes);
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
      saved = await saveAllPendingScopes({
        getState,
        saveScope,
        ...(maxSaveRounds ? { maxRounds: maxSaveRounds } : {}),
      });
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

export function shouldRecaptureSlideBaseline({
  slideDirty,
  currentSlideId,
  storedSlideIds,
}) {
  return Boolean(
    !slideDirty &&
      currentSlideId &&
      storedSlideIds.includes(currentSlideId)
  );
}

const CLEARED_MEDIA = {
  fileName: null,
  fileSaved: false,
  serverFilePath: null,
  thumbnail: null,
  originalUrl: null,
  fileData: null,
  customImageData: null,
  adBgImagePath: null,
  adBgImageUrl: null,
};

const SIMPLE_FAMILY_DEFAULTS = {
  sourceType: "basic",
  content: "",
  font: "Malgun Gothic",
  fontSize: "40",
  bg: "black",
  align: "center",
};

const AD_DEFAULTS = {
  ...SIMPLE_FAMILY_DEFAULTS,
  adTitle: "",
  adTitleSize: "medium",
  adTitleAlign: "center",
  adBgSource: "none",
  adBgOpacity: 30,
};

const HYMN_DEFAULTS = {
  sourceType: "upload",
  hymnNumber: null,
  hymnKorTitle: "",
  hymnEngTitle: "",
  includeTitle: false,
};

const SCRIPTURE_DEFAULTS = {
  sourceType: "upload",
  testament: "",
  book: "",
  chapter: "",
  start: "",
  end: "",
  koVersion: "새번역",
  enVersion: "web",
  themeId: "dark",
  includeTitle: true,
  titleSlideType: "말씀",
  scriptureSignature: "",
};

const TITLE_DEFAULTS = {
  sourceType: "basic",
  titleDesign: "chapel",
  churchName: "",
  serviceDate: "",
  titleSubtitle: "",
};

const CUSTOM_TITLE_DEFAULTS = {
  sourceType: "basic",
  customTitleDesign: "aurora",
  customTitleKo: "",
  customTitleEn: "",
  customTitleSubtitle: "",
};

const CUSTOM_DEFAULTS = {
  sourceType: "basic",
};

const RESET_DEFAULTS_BY_TYPE = {
  simple: SIMPLE_FAMILY_DEFAULTS,
  ad: AD_DEFAULTS,
  hymn: HYMN_DEFAULTS,
  scripture: SCRIPTURE_DEFAULTS,
  title: TITLE_DEFAULTS,
  "custom-title": CUSTOM_TITLE_DEFAULTS,
  custom: CUSTOM_DEFAULTS,
};

// Builds a fresh draft for the current slide type while keeping identity
// metadata intact. Uploaded media references are cleared so reset never
// leaves stale file paths behind in the draft.
export function buildResetSlideDraft(slide) {
  if (!slide || typeof slide !== "object") {
    return slide;
  }

  const typeDefaults =
    RESET_DEFAULTS_BY_TYPE[slide.type] || SIMPLE_FAMILY_DEFAULTS;

  return {
    ...CLEARED_MEDIA,
    ...typeDefaults,
    ...(slide.type === "custom"
      ? { customSlide: normalizeCustomSlide(createDefaultCustomSlide()) }
      : {}),
    id: slide.id,
    name: slide.name,
    type: slide.type,
    saved: slide.saved,
  };
}

// When a new slide is cancelled, pick the neighbor that should stay selected.
// Prefer the next slide; otherwise fall back to the previous one.
export function resolveAdjacentSlideId(slides, removedId) {
  if (!Array.isArray(slides)) {
    return null;
  }

  const index = slides.findIndex((slide) => slide?.id === removedId);
  if (index === -1) {
    return null;
  }

  const next = slides[index + 1];
  if (next?.id) {
    return next.id;
  }

  const previous = slides[index - 1];
  if (previous?.id) {
    return previous.id;
  }

  return null;
}
