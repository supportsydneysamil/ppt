// Decides which Office fonts the machine viewing a preview already has, so the
// genuine font is used whenever possible and a substitute is loaded only for
// what is missing.
//
// Platform independence is the point: the same deck names "Malgun Gothic" on
// Windows, where it exists under two names, and on macOS and Linux, where it
// does not exist at all. Nothing here hardcodes a platform; it asks the browser
// what it can actually render.

// Rendered against several generic families because a candidate can coincide
// with one of them by accident. Mixed scripts and widths make a collision
// across all three vanishingly unlikely.
const PROBE_TEXT = "가나다힣ABCWMiI123";
const PROBE_SIZE = 72;
const GENERIC_FAMILIES = ["monospace", "serif", "sans-serif"];
const WIDTH_EPSILON = 0.5;

/**
 * True when text set in `family` renders differently from every generic family,
 * which means the browser resolved the name to a real font.
 */
export function isFontAvailable(family, measureText) {
  if (!family) return false;
  for (const generic of GENERIC_FAMILIES) {
    const baseline = measureText(`${PROBE_SIZE}px ${generic}`);
    const candidate = measureText(`${PROBE_SIZE}px "${cssEscapeFamily(family)}", ${generic}`);
    if (Math.abs(candidate - baseline) > WIDTH_EPSILON) return true;
  }
  return false;
}

/** Family names reach CSS through a quoted string, so quotes must not break out. */
function cssEscapeFamily(family) {
  return family.replace(/["\\]/gu, "\\$&");
}

/** Measures with a detached canvas; no layout and no DOM insertion. */
export function createCanvasMeasurer(documentRef = document) {
  const context = documentRef.createElement("canvas").getContext("2d");
  return (font) => {
    context.font = font;
    return context.measureText(PROBE_TEXT).width;
  };
}

/**
 * Splits substitute entries into the ones already covered by an installed font
 * and the ones that need a stylesheet.
 *
 * An entry counts as covered when any of its `localNames` resolves, since those
 * are names of the genuine font or of a metric-compatible clone.
 */
export function planFontSubstitutes(substitutes, measureText) {
  const available = [];
  const missing = [];
  const resolved = new Map();

  for (const entry of substitutes) {
    const hit = (entry.localNames ?? [entry.family]).find((name) => {
      if (!resolved.has(name)) resolved.set(name, isFontAvailable(name, measureText));
      return resolved.get(name);
    });
    if (hit) available.push({ ...entry, resolvedAs: hit });
    else missing.push(entry);
  }

  return { available, missing };
}
