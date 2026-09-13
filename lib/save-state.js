function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = normalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

export function createSnapshot(value) {
  return JSON.stringify(normalize(value));
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

export function deriveSaveButtonState({
  hasSlide,
  hasTemplate,
  slideDirty,
  templateDirty,
  slideSaving,
  templateSaving,
}) {
  const busy = slideSaving || templateSaving;
  return {
    slideDisabled: !hasSlide || !slideDirty || busy,
    // Template editing stays a two-stage flow: the slide draft has to be
    // committed before the template itself can be saved.
    templateDisabled: !hasTemplate || !templateDirty || busy || slideDirty,
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

export function isSaveBusy({ slideSaving, templateSaving }) {
  return Boolean(slideSaving || templateSaving);
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
