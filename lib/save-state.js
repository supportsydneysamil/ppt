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
