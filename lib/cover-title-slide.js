import { appendCustomTitleContentSlide } from "./custom-title-slide.js";
import {
  buildCoverTitleContent,
  normalizeTitleThemeId,
} from "./cover-title-content.js";

export {
  COVER_TITLE_THEMES,
  buildCoverTitleContent,
  normalizeTitleThemeId,
} from "./cover-title-content.js";

export function appendThemedCoverTitleSlide(pptx, options) {
  const titleThemeId = normalizeTitleThemeId(options?.titleThemeId);
  if (titleThemeId === "original") {
    throw new Error(
      "original cover title rendering is handled outside appendThemedCoverTitleSlide"
    );
  }

  const content = buildCoverTitleContent(options?.kind, options?.data);
  appendCustomTitleContentSlide(pptx, titleThemeId, content);
}
