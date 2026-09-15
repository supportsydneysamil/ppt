export const CUSTOM_EDITOR_RIBBON_TABS = Object.freeze([
  Object.freeze({ id: "design", label: "디자인" }),
  Object.freeze({ id: "insert", label: "삽입" }),
  Object.freeze({ id: "align", label: "정렬" }),
  Object.freeze({ id: "arrange", label: "배치" }),
]);

export function ribbonTabIndexForKey(
  key,
  currentIndex,
  count = CUSTOM_EDITOR_RIBBON_TABS.length
) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % count;
  if (key === "ArrowLeft") return (currentIndex - 1 + count) % count;
  return null;
}
