import { normalizeTitleThemeId } from "./cover-title-content.js";
import { normalizeCustomSlide } from "../public/custom-slide-model.js";

/** The `customSlide` field a slide record should carry, or null when unused. */
export function customSlideFieldForTemplate(slide) {
  if (slide?.type !== "custom") {
    return null;
  }
  return normalizeCustomSlide(slide.customSlide);
}

function optionalTitleLine(value) {
  if (typeof value !== "string") return null;
  return value.trim();
}

function normalizeStoredDateMode(value) {
  return value === "today" || value === "next-sunday" || value === "custom"
    ? value
    : "custom";
}

/**
 * The canonical on-disk shape of a slide record. Runtime-only fields (`file`,
 * `fileData`) and anything unknown are dropped, so both templates and the
 * slide list store exactly the same schema.
 */
export function sanitizeSlideForTemplate(slide) {
  return {
    id: slide.id,
    name: slide.name,
    type: slide.type,
    sourceType: slide.sourceType,
    content: slide.content || "",
    font: slide.font || "Malgun Gothic",
    fontSize: slide.fontSize || "40",
    bg: slide.bg || "black",
    align: slide.align || "center",
    fileName: slide.fileName || null,
    fileSaved: Boolean(slide.fileSaved),
    saved: slide.saved !== false,
    unrestorable: Boolean(slide.unrestorable),
    serverFilePath: slide.serverFilePath || null,
    thumbnail: slide.thumbnail || null,
    hymnNumber: slide.hymnNumber || null,
    hymnKorTitle: slide.hymnKorTitle || "",
    hymnEngTitle: slide.hymnEngTitle || "",
    originalUrl: slide.originalUrl || null,
    adTitle: slide.adTitle || "",
    adTitleSize: slide.adTitleSize || "medium",
    adTitleAlign: slide.adTitleAlign || "center",
    adBgSource: slide.adBgSource || "none",
    adBgImagePath: slide.adBgImagePath || null,
    adBgImageUrl: slide.adBgImageUrl || null,
    adBgOpacity:
      typeof slide.adBgOpacity === "number" ? slide.adBgOpacity : 30,
    titleDesign: slide.titleDesign || null,
    titleKo: optionalTitleLine(slide.titleKo),
    titleEn: optionalTitleLine(slide.titleEn),
    dateMode: normalizeStoredDateMode(slide.dateMode),
    showDate: slide.showDate !== false,
    churchName: slide.churchName || "",
    serviceDate: slide.serviceDate || "",
    titleSubtitle: slide.titleSubtitle || "",
    customTitleDesign: slide.customTitleDesign || null,
    customTitleKo: slide.customTitleKo || "",
    customTitleEn: slide.customTitleEn || "",
    customTitleSubtitle: slide.customTitleSubtitle || "",
    includeTitle: Boolean(slide.includeTitle),
    titleThemeId: normalizeTitleThemeId(slide.titleThemeId),
    titleSlideType: slide.titleSlideType || "말씀",
    testament: slide.testament || "",
    book: slide.book || "",
    chapter: slide.chapter || "",
    start: slide.start || "",
    end: slide.end || "",
    koVersion: slide.koVersion || "",
    enVersion: slide.enVersion || "",
    themeId: slide.themeId || "dark",
    customImageData: slide.customImageData || null,
    scriptureSignature: slide.scriptureSignature || "",
    // Only custom slides carry a canvas model; everything unsupported in it is
    // dropped by the shared normalizer.
    customSlide: customSlideFieldForTemplate(slide),
  };
}
