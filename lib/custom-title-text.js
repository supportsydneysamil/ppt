// Type scale for the "타이틀 (Custom)" slide type. Shared by the PPTX renderer
// and the browser preview so the two stay in step.

/**
 * Point size for the Korean headline. Titles have to stay on one line, so the
 * size steps down as the title gets longer.
 */
export function koTitleFontSize(text) {
  const length = [...(text || "").trim()].length;
  if (length <= 4) return 104;
  if (length <= 6) return 86;
  if (length <= 9) return 70;
  if (length <= 13) return 54;
  if (length <= 18) return 42;
  return 32;
}

/** Point size for the English line, which sits under the headline. */
export function enTitleFontSize(text) {
  const length = (text || "").trim().length;
  if (length <= 14) return 22;
  if (length <= 24) return 19;
  if (length <= 38) return 16;
  return 13;
}

/** Point size for the lower signature-panel subtitle. */
export function subtitleFontSize(text) {
  const length = [...(text || "").replace(/\s/g, "")].length;
  if (length <= 16) return 28;
  if (length <= 24) return 24;
  return 22;
}
