// Shared title design IDs, copy defaults, normalization, and text sizing.
// Kept separate from the renderers so the original and extra slide modules do
// not depend on one another.

export const TITLE_DESIGNS = [
  "chapel",
  "editorial",
  "glow",
  "easter-dawn",
  "easter-stained",
  "christmas-burgundy",
  "christmas-evergreen",
  "thanksgiving",
  "advent",
  "midnight-slab",
  "slate-split",
  "deep-fog",
];

export function normalizeTitleDesign(value) {
  return TITLE_DESIGNS.includes(value) ? value : "chapel";
}

export function defaultTitleKo() {
  return "주일예배";
}

export function defaultTitleEn(design) {
  const id = normalizeTitleDesign(design);
  if (id === "editorial") return "SUNDAY WORSHIP SERVICE";
  if (id === "easter-dawn" || id === "easter-stained") return "EASTER SUNDAY";
  if (id === "christmas-burgundy" || id === "christmas-evergreen") {
    return "CHRISTMAS WORSHIP";
  }
  if (id === "thanksgiving") return "THANKSGIVING";
  if (id === "advent") return "ADVENT SUNDAY";
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
  return Math.min(size, widthLimitedSize);
}

export function worshipEnFontSize(text, base) {
  const length = (text || "").trim().length;
  if (length <= 16) return base;
  if (length <= 28) return Math.max(11, base - 2);
  return Math.max(10, base - 4);
}
