// Catalog for Sunday-worship title slides. Picker metadata is deliberately
// separate from Custom Title: category ids and assets may overlap, layouts do
// not.

export const DEFAULT_TITLE_DESIGN_ID = "chapel";

export const TITLE_SLIDE_LAYOUT_FAMILIES = [
  "legacy",
  "centered-rule",
  "double-frame",
  "side-band",
  "horizon-split",
  "emblem-crest",
  "veil-panel",
  "corner-mark",
];

export const TITLE_SLIDE_DESIGN_CATEGORIES = [
  { id: "default", name: "기본" },
  { id: "advent", name: "대림절" },
  { id: "christmas", name: "성탄절" },
  { id: "easter", name: "부활절" },
  { id: "lent", name: "사순절" },
  { id: "palm-sunday", name: "종려주일" },
  { id: "year-end", name: "송구영신" },
  { id: "new-year", name: "신년" },
  { id: "premium", name: "기타 (고급)" },
];

const palette = (
  mood,
  titleFont,
  background,
  backgroundAccent,
  title,
  accent,
  rule,
  muted
) => ({
  mood,
  titleFont,
  background,
  backgroundAccent,
  title,
  accent,
  rule,
  muted,
});

const design = (id, name, description, layoutFamily, theme, asset) => ({
  id,
  name,
  description,
  layoutFamily,
  theme,
  ...(asset ? { asset } : {}),
});

const asset = (path) => ({ path, width: 1280, height: 720 });

const THEMES = {
  chapel: palette("dark", "serif", "0E1117", "1C2430", "FFFFFF", "D6B36A", "D6B36A", "DCD6C8"),
  editorial: palette("light", "sans", "F5F0E7", "E5DCCB", "17150F", "8A7659", "8A7659", "6A6257"),
  glow: palette("dark", "serif", "0B1A33", "1C2F52", "FFFFFF", "F2C15B", "F2C15B", "C6D2E8"),
  advent: palette("dark", "serif", "1A2140", "0A0E1A", "F5F0E7", "E4BC73", "A7B8E8", "BCC7DF"),
  christmasBurgundy: palette("dark", "serif", "2A0F16", "4A1823", "F7EBDA", "D9B376", "D9B376", "D7C3B0"),
  christmasEvergreen: palette("dark", "serif", "07140C", "12301C", "F7EBDA", "D9B376", "769475", "C9D7C8"),
  easterDawn: palette("light", "serif", "FFFBF2", "F3DCBD", "4A3617", "D6A44A", "B48C4A", "786343"),
  easterStained: palette("dark", "serif", "0B1A33", "322055", "FFFFFF", "F2C15B", "8A5CC7", "CDC2E8"),
  midnight: palette("dark", "sans", "08090B", "181C23", "F2F4F7", "9AA3AE", "9AA3AE", "B3BAC4"),
  slate: palette("dark", "sans", "0D1117", "1C2431", "F2F4F7", "748094", "748094", "A8B1C0"),
  fog: palette("dark", "sans", "0D1117", "2A3038", "F2F4F7", "98A2AE", "98A2AE", "BBC2CB"),
};

const DESIGNS_BY_CATEGORY = {
  default: [
    design("chapel", "클래식 채플", "검정과 금색 괘선", "legacy", THEMES.chapel),
    design("editorial", "모던 에디토리얼", "아이보리 좌측 조판", "legacy", THEMES.editorial),
    design("glow", "스테인드 글로우", "네이비와 금빛 글로우", "legacy", THEMES.glow),
  ],
  advent: [
    design("advent", "대림 촛불", "촛불과 네 주의 기다림", "legacy", THEMES.advent),
    design("advent-vesper", "대림 만찬", "베일 패널의 고요한 만찬", "veil-panel",
      palette("dark", "serif", "1A1430", "3D2A63", "F4E8C8", "C9A227", "8B6BB0", "B9A8D4")),
    design("advent-watch", "대림 기다림", "감청 코너의 절제된 기다림", "corner-mark",
      palette("dark", "sans", "10182B", "1E3A5F", "E8EEF6", "9EC0E6", "5C7DA6", "8AA0B8")),
  ],
  christmas: [
    design("christmas-burgundy", "성탄 버건디", "버건디와 금색 별", "legacy", THEMES.christmasBurgundy),
    design("christmas-evergreen", "성탄 상록", "상록과 전나무 실루엣", "legacy", THEMES.christmasEvergreen),
    design("christmas-ivory", "성탄 아이보리", "아이보리 이중 프레임", "double-frame",
      palette("light", "serif", "F6F1E6", "E7D9C4", "7A2230", "A67C52", "C4A574", "6E5540")),
  ],
  easter: [
    design("easter-dawn", "부활 새벽빛", "햇살과 밝은 지평선", "legacy", THEMES.easterDawn),
    design("easter-stained", "부활 스테인드", "빛나는 아치 창", "legacy", THEMES.easterStained),
    design("easter-linen", "부활 리넨", "리넨 위 고요한 지평", "horizon-split",
      palette("light", "serif", "F7F3EA", "E4D7C0", "3F4A38", "8A9A6B", "B7C49A", "6A7360")),
  ],
  lent: [
    design("lent-violet", "사순 자주", "자줏빛 측면 띠", "side-band",
      palette("dark", "serif", "2A1838", "5C3D6E", "F0E6F4", "C4A0D4", "8E6A9C", "B39CB8")),
    design("lent-ashes", "사순 재", "잿빛 중앙 괘선", "centered-rule",
      palette("dark", "sans", "1C1C1C", "3A3A3A", "E8E4DC", "A39E93", "6F6B64", "9A968C")),
    design("lent-veil", "사순 베일", "절제된 세로 베일", "veil-panel",
      palette("dark", "serif", "241C28", "4A3A52", "EDE4D4", "D2B48C", "8A7060", "B8A898")),
  ],
  "palm-sunday": [
    design("palm-procession", "종려 행렬", "초록빛 종려 문장", "emblem-crest",
      palette("dark", "serif", "10241A", "1F4630", "F0F6EF", "A6CE9A", "6FA37A", "8DAE8C")),
    design("palm-court", "종려 뜰", "밝은 뜰의 이중 프레임", "double-frame",
      palette("light", "serif", "F3F6EF", "D5E3C8", "1E3A24", "4F7A4A", "8AAD7A", "5C6E52")),
    design("palm-horizon", "종려 지평", "종려 그림자와 지평", "horizon-split",
      palette("dark", "serif", "10241A", "1F4630", "F0F6EF", "A6CE9A", "6FA37A", "8DAE8C"),
      asset("assets/custom-title/palm-shadow.png")),
  ],
  "year-end": [
    design("year-end-watch", "송구 파수", "감청 측면의 파수", "side-band",
      palette("dark", "sans", "0B1020", "24325C", "F2F4FA", "C7D2F0", "7F8EC0", "9AA6CC")),
    design("year-end-threshold", "송구 문턱", "문턱을 닮은 코너 조판", "corner-mark",
      palette("dark", "serif", "14110E", "3A2E24", "F4EDE3", "E0C9A0", "9A7B55", "B8A080")),
    design("year-end-ember", "송구 잔불", "자정 문 뒤의 잔불", "veil-panel",
      palette("dark", "serif", "0B1020", "24325C", "F2F4FA", "C7D2F0", "7F8EC0", "9AA6CC"),
      asset("assets/custom-title/midnight-gate.png")),
  ],
  "new-year": [
    design("new-year-dawn", "신년 새벽", "새 길이 열리는 지평", "horizon-split",
      palette("light", "sans", "F2F6F8", "CFE0E8", "16232B", "5B93AE", "8EB6C9", "4C6976"),
      asset("assets/custom-title/new-path.png")),
    design("new-year-first", "신년 첫날", "첫 장을 여는 코너 조판", "corner-mark",
      palette("light", "serif", "F7F4EC", "E6DCC8", "2A2418", "8A6A3C", "C4A574", "6E5A40")),
    design("new-year-blessing", "신년 축복", "새해 축복의 작은 문장", "emblem-crest",
      palette("dark", "serif", "1A2230", "3A4A62", "F5EFE4", "D4B978", "8A7350", "B8A888")),
  ],
  premium: [
    design("midnight-slab", "미드나잇 슬랩", "차콜 우측 정렬", "legacy", THEMES.midnight),
    design("slate-split", "슬레이트 스플릿", "슬레이트 좌우 분할", "legacy", THEMES.slate),
    design("deep-fog", "딥 포그", "안개 낀 하단 정렬", "legacy", THEMES.fog),
  ],
};

export const TITLE_SLIDE_DESIGN_CATALOG =
  TITLE_SLIDE_DESIGN_CATEGORIES.flatMap((category) =>
    DESIGNS_BY_CATEGORY[category.id].map((entry) => ({
      ...entry,
      categoryId: category.id,
    }))
  );

export const TITLE_SLIDE_DESIGN_IDS = TITLE_SLIDE_DESIGN_CATALOG.map(
  ({ id }) => id
);

export const HIDDEN_TITLE_DESIGNS = [
  design(
    "thanksgiving",
    "추수 감사",
    "저장본 전용",
    "legacy",
    palette("light", "serif", "5C3A1E", "C4A35A", "F7E7C3", "E2C48A", "C4A35A", "D9C4A0")
  ),
];

export const HIDDEN_TITLE_DESIGN_IDS = HIDDEN_TITLE_DESIGNS.map(
  ({ id }) => id
);

const DESIGN_BY_ID = new Map(
  [...TITLE_SLIDE_DESIGN_CATALOG, ...HIDDEN_TITLE_DESIGNS].map((entry) => [
    entry.id,
    entry,
  ])
);

const CATEGORY_BY_ID = new Map(
  TITLE_SLIDE_DESIGN_CATEGORIES.map((category) => [category.id, category])
);

export function normalizeTitleDesignId(value) {
  return DESIGN_BY_ID.has(value) ? value : DEFAULT_TITLE_DESIGN_ID;
}

export function findTitleDesign(id) {
  return DESIGN_BY_ID.get(id) || null;
}

export function findTitleDesignCategory(designId) {
  const entry = findTitleDesign(designId);
  return entry?.categoryId
    ? CATEGORY_BY_ID.get(entry.categoryId) || null
    : null;
}

export function listTitleDesignsByCategory(categoryId) {
  return TITLE_SLIDE_DESIGN_CATALOG.filter(
    (entry) => entry.categoryId === categoryId
  );
}

export function isSafeTitleAssetPath(value) {
  if (
    typeof value !== "string" ||
    !["assets/custom-title/", "assets/title/"].some((root) =>
      value.startsWith(root)
    )
  ) {
    return false;
  }
  if (value.includes("\\")) return false;
  return value
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== "..");
}
