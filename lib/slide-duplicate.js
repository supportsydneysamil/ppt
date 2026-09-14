function isOwnedUploadPath(value) {
  return typeof value === "string" && value.startsWith("/uploads/");
}

export function createDuplicateSlideName(sourceName, existingNames) {
  const rootName = String(sourceName || "")
    .replace(/\s+복사(?:\s+\d+)?$/, "")
    .trim();
  const names = new Set(existingNames);
  let candidate = `${rootName} 복사`;
  let suffix = 2;

  while (names.has(candidate)) {
    candidate = `${rootName} 복사 ${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function insertSlideAfter(slides, sourceId, clone) {
  const sourceIndex = slides.findIndex((slide) => slide.id === sourceId);
  if (sourceIndex === -1) {
    return [...slides];
  }
  return [
    ...slides.slice(0, sourceIndex + 1),
    clone,
    ...slides.slice(sourceIndex + 1),
  ];
}

export function hasOwnedSlideAsset(slide) {
  if (
    ["serverFilePath", "thumbnail", "adBgImagePath"].some((key) =>
      isOwnedUploadPath(slide?.[key])
    )
  ) {
    return true;
  }

  return Boolean(
    slide?.customSlide?.elements?.some(
      (element) =>
        element?.type === "image" && isOwnedUploadPath(element.src)
    )
  );
}
