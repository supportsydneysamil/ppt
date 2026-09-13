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
    templateDisabled: !hasTemplate || !templateDirty || busy,
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
