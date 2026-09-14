export const COVER_TITLE_THEMES = [
  "original",
  "aurora",
  "monolith",
  "ivory",
  "marquee",
];

export function normalizeTitleThemeId(value) {
  return COVER_TITLE_THEMES.includes(value) ? value : "original";
}

export function buildHymnSubtitle(data) {
  const hymnNumber = data?.hymnNumber;
  const korTitle = (data?.hymnKorTitle || "").trim();
  const engTitle = (data?.hymnEngTitle || "").trim();
  const parts = [];

  let line = "";
  if (hymnNumber) {
    line = `${hymnNumber}.`;
    if (korTitle) {
      line += ` ${korTitle}`;
    }
  } else if (korTitle) {
    line = korTitle;
  }

  if (line.trim()) {
    parts.push(line.trim());
  }
  if (engTitle) {
    parts.push(`(${engTitle})`);
  }

  return parts.join("\n");
}

export function buildCoverTitleContent(kind, data) {
  if (kind === "hymn") {
    return {
      ko: "찬송",
      en: "HYMN",
      subtitle: buildHymnSubtitle(data),
    };
  }

  if (kind === "scripture-reading") {
    return {
      ko: "성경봉독",
      en: "SCRIPTURE READING",
      subtitle: (data?.referenceText || "").trim(),
    };
  }

  if (kind === "scripture") {
    return {
      ko: "성경말씀",
      en: "SCRIPTURES",
      subtitle: (data?.referenceText || "").trim(),
    };
  }

  throw new Error(`unsupported cover title kind: ${String(kind)}`);
}
