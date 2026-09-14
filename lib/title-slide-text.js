// Shared title design IDs, copy defaults, normalization, and text sizing.
// Kept separate from the renderers so the original and extra slide modules do
// not depend on one another.

import {
  HIDDEN_TITLE_DESIGN_IDS,
  TITLE_SLIDE_DESIGN_IDS,
  normalizeTitleDesignId,
} from "./title-slide-design-catalog.js";

export const TITLE_DESIGNS = [
  ...TITLE_SLIDE_DESIGN_IDS,
  ...HIDDEN_TITLE_DESIGN_IDS,
];

export function normalizeTitleDesign(value) {
  return normalizeTitleDesignId(value);
}

export function defaultTitleKo() {
  return "주일예배";
}

export function defaultTitleEn(design) {
  const id = normalizeTitleDesign(design);
  if (id === "editorial") return "SUNDAY WORSHIP SERVICE";
  if (id.startsWith("easter-")) return "EASTER SUNDAY";
  if (id.startsWith("christmas-")) return "CHRISTMAS WORSHIP";
  if (id === "thanksgiving") return "THANKSGIVING";
  if (id === "advent" || id.startsWith("advent-")) return "ADVENT SUNDAY";
  if (id.startsWith("lent-")) return "LENT";
  if (id.startsWith("palm-")) return "PALM SUNDAY";
  if (id.startsWith("year-end-")) return "WATCHNIGHT";
  if (id.startsWith("new-year-")) return "NEW YEAR";
  return "SUNDAY WORSHIP";
}

export function resolveTitleLine(value, fallback) {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export function worshipKoFontSize(text, base, maxWidthInches) {
  const length = [...(text || "").trim()].length;
  let size;
  if (length <= 4) size = base;
  else if (length <= 6) size = Math.round(base * 0.82);
  else if (length <= 9) size = Math.round(base * 0.68);
  else if (length <= 13) size = Math.round(base * 0.54);
  else size = Math.round(base * 0.42);

  if (!maxWidthInches || length === 0) return size;
  const widthLimitedSize = Math.floor((maxWidthInches * 72 * 0.92) / length);
  return Math.max(12, Math.min(size, widthLimitedSize));
}

export function worshipEnFontSize(text, base, maxWidthInches) {
  const length = (text || "").trim().length;
  let size;
  if (length <= 16) size = base;
  else if (length <= 28) size = Math.max(11, base - 2);
  else size = Math.max(10, base - 4);

  if (!maxWidthInches || length === 0) return size;
  const widthLimitedSize = Math.floor((maxWidthInches * 72 * 0.92) / length);
  const legibilityFloor = length <= 38 ? 11 : 10;
  return Math.max(legibilityFloor, Math.min(size, widthLimitedSize));
}
