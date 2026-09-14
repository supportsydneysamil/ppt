// The shared catalog behind the "타이틀 (Custom)" design picker: nine seasonal
// categories, each holding designs that pair a layout family with a palette.
// Renderers read `layoutFamily` to pick a composition and `theme` for colour,
// so adding a design here never means touching the drawing code.
//
// `asset.path` is project-relative and resolves under `public/`, which the
// server exposes at `/assets/...`.

const ASSET_ROOT = "assets/custom-title/";

export const DEFAULT_CUSTOM_TITLE_DESIGN_ID = "aurora";

export const CUSTOM_TITLE_LAYOUT_FAMILIES = [
  "centered-rule",
  "double-frame",
  "ornament-frame",
  "side-band",
  "horizon-split",
  "emblem-crest",
  "veil-panel",
  "corner-mark",
];

export const CUSTOM_TITLE_DESIGN_CATEGORIES = [
  { id: "default", name: "기본" },
  { id: "christmas", name: "성탄절" },
  { id: "easter", name: "부활절" },
  { id: "lent", name: "사순절" },
  { id: "palm-sunday", name: "종려주일" },
  { id: "barley-harvest", name: "맥추감사절" },
  { id: "year-end", name: "송구영신" },
  { id: "new-year", name: "신년" },
  { id: "premium", name: "기타 (고급)" },
];

// Keyed by category id; the four original designs stay first so saved decks
// keep rendering the design they were built with.
const DESIGNS_BY_CATEGORY = {
  default: [
    {
      id: "aurora",
      name: "오로라 그라디언트",
      description: "보랏빛 오로라가 번지는 심야 하늘",
      layoutFamily: "centered-rule",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "170E33",
        backgroundAccent: "8B5CF6",
        title: "FFFFFF",
        accent: "C4B2FF",
        rule: "8B6BFF",
        muted: "9A8FC7",
        subtitleText: "FFFFFF",
        haloColor: "C4B2FF",
        haloOpacity: 0.15,
      },
    },
    {
      id: "monolith",
      name: "모노리스",
      description: "검은 비석 같은 절제된 조판",
      layoutFamily: "centered-rule",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "0A0B0D",
        backgroundAccent: "2C2E33",
        title: "F4F1EA",
        accent: "9A9689",
        rule: "9A9689",
        muted: "9A9689",
        subtitleText: "EEE9DC",
        haloColor: "FFFFFF",
        haloOpacity: 0.1,
      },
    },
    {
      id: "ivory",
      name: "아이보리 클래식",
      description: "금빛 이중 액자의 상아색 바탕",
      layoutFamily: "double-frame",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "FAF6EF",
        backgroundAccent: "EFE4CE",
        title: "1F1B16",
        accent: "C2A87A",
        rule: "C2A87A",
        muted: "907A52",
        subtitleText: "5F4B2C",
        haloColor: "C2A87A",
        haloOpacity: 0.16,
      },
    },
    {
      id: "marquee",
      name: "마키 프레임",
      description: "버건디 위 금빛 마키 장식",
      layoutFamily: "ornament-frame",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "2A0F16",
        backgroundAccent: "6B2230",
        title: "F7EBDA",
        accent: "D9B376",
        rule: "D9B376",
        muted: "C9A26B",
        subtitleText: "F7EBDA",
        haloColor: "D9B376",
        haloOpacity: 0.12,
      },
    },
  ],
  christmas: [
    {
      id: "bethlehem-star",
      name: "베들레헴 별빛",
      description: "남청 하늘에 번지는 별빛",
      layoutFamily: "centered-rule",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "0B1430",
        backgroundAccent: "2A3E7A",
        title: "FFFFFF",
        accent: "F2D98B",
        rule: "E8D48A",
        muted: "A9B7DF",
        subtitleText: "F3E6C8",
        haloColor: "F2D98B",
        haloOpacity: 0.16,
      },
    },
    {
      id: "silent-evergreen",
      name: "성야 상록",
      description: "상록의 밤과 금빛 촛불 하나",
      layoutFamily: "emblem-crest",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "07140C",
        backgroundAccent: "12301C",
        title: "F4EFE2",
        accent: "E8C56A",
        rule: "E8C56A",
        muted: "A8BFA6",
        subtitleText: "D7E8D4",
        haloColor: "E8C56A",
        haloOpacity: 0.14,
      },
    },
    {
      id: "gold-carol",
      name: "골드 캐럴",
      description: "붉은 바탕에 흐르는 금빛 캐럴",
      layoutFamily: "ornament-frame",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "2A0F16",
        backgroundAccent: "8C2733",
        title: "F9EEDD",
        accent: "E3BE7C",
        rule: "E3BE7C",
        muted: "C69A62",
        subtitleText: "F3DEC2",
        haloColor: "E3BE7C",
        haloOpacity: 0.14,
      },
    },
    {
      id: "snow-sanctuary",
      name: "설원 성소",
      description: "설원처럼 밝은 성소의 아침",
      layoutFamily: "double-frame",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "F6F8FB",
        backgroundAccent: "D8E3F0",
        title: "16213A",
        accent: "8CA9CE",
        rule: "A9C0DC",
        muted: "5E6E8C",
        subtitleText: "2B3A57",
        haloColor: "8CA9CE",
        haloOpacity: 0.18,
      },
    },
  ],
  easter: [
    {
      id: "resurrection-dawn",
      name: "부활 새벽빛",
      description: "동트는 새벽의 금빛 수평선",
      layoutFamily: "horizon-split",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "0E1117",
        backgroundAccent: "F0B860",
        title: "FFFFFF",
        accent: "FFE9A8",
        rule: "E8D48A",
        muted: "C9B36A",
        subtitleText: "F3E6C8",
        haloColor: "FFE9A8",
        haloOpacity: 0.16,
      },
    },
    {
      id: "empty-tomb-light",
      name: "빈 무덤의 빛",
      description: "열린 무덤에서 쏟아지는 빛",
      layoutFamily: "veil-panel",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "111A22",
        backgroundAccent: "F5F0E1",
        title: "FFFFFF",
        accent: "F7E7BD",
        rule: "D9CBA3",
        muted: "9FB0BD",
        subtitleText: "F1EADA",
        haloColor: "F7E7BD",
        haloOpacity: 0.2,
      },
    },
    {
      id: "lily-morning",
      name: "백합의 아침",
      description: "백합처럼 맑은 흰 아침",
      layoutFamily: "corner-mark",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "FBFAF6",
        backgroundAccent: "E7EFE4",
        title: "1B2A20",
        accent: "8FAE93",
        rule: "B7CBB7",
        muted: "5E7263",
        subtitleText: "27402F",
        haloColor: "8FAE93",
        haloOpacity: 0.16,
      },
    },
    {
      id: "stained-glory",
      name: "스테인드 글로리",
      description: "스테인드글라스를 통과한 색빛",
      layoutFamily: "veil-panel",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "1A1238",
        backgroundAccent: "2A1F63",
        title: "FFFFFF",
        accent: "F2C15B",
        rule: "F2C15B",
        muted: "E4D4FF",
        subtitleText: "F3E6C8",
        haloColor: "F2C15B",
        haloOpacity: 0.18,
      },
    },
  ],
  lent: [
    {
      id: "ash-cross",
      name: "재의 십자가",
      description: "재빛 바탕에 새긴 십자가",
      layoutFamily: "emblem-crest",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "1C1C1E",
        backgroundAccent: "3A3A3D",
        title: "EDEAE4",
        accent: "9C9691",
        rule: "6F6A66",
        muted: "8D8781",
        subtitleText: "DAD5CD",
        haloColor: "BFB8B0",
        haloOpacity: 0.12,
      },
    },
    {
      id: "wilderness-violet",
      name: "광야의 보랏빛",
      description: "광야를 덮은 절제된 보랏빛",
      layoutFamily: "side-band",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "241A34",
        backgroundAccent: "4A3468",
        title: "F1ECF7",
        accent: "B39DDB",
        rule: "8E77B8",
        muted: "A292BD",
        subtitleText: "E3D9F0",
        haloColor: "B39DDB",
        haloOpacity: 0.14,
      },
    },
    {
      id: "silent-linen",
      name: "침묵의 린넨",
      description: "침묵을 닮은 린넨 질감",
      layoutFamily: "centered-rule",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "F4F1EA",
        backgroundAccent: "E2DCCD",
        title: "2A2620",
        accent: "9C8F76",
        rule: "BDB199",
        muted: "6F6552",
        subtitleText: "3B3529",
        haloColor: "9C8F76",
        haloOpacity: 0.16,
      },
    },
  ],
  "palm-sunday": [
    {
      id: "palm-shadow",
      name: "종려 그림자",
      description: "종려 잎이 드리운 짙은 그림자",
      layoutFamily: "corner-mark",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "10241A",
        backgroundAccent: "1F4630",
        title: "F0F6EF",
        accent: "A6CE9A",
        rule: "6FA37A",
        muted: "8DAE8C",
        subtitleText: "DCEBD8",
        haloColor: "A6CE9A",
        haloOpacity: 0.14,
      },
    },
    {
      id: "jerusalem-entry",
      name: "예루살렘 입성",
      description: "성문으로 향하는 길의 빛",
      layoutFamily: "emblem-crest",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "F3EEE2",
        backgroundAccent: "DCCFB4",
        title: "2B2517",
        accent: "A88C4E",
        rule: "C2A868",
        muted: "7A6739",
        subtitleText: "3D3520",
        haloColor: "A88C4E",
        haloOpacity: 0.16,
      },
    },
    {
      id: "hosanna-emerald",
      name: "호산나 에메랄드",
      description: "호산나 함성의 에메랄드빛",
      layoutFamily: "corner-mark",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "06211C",
        backgroundAccent: "0E4A3C",
        title: "EFFAF5",
        accent: "4FD1A5",
        rule: "2FA382",
        muted: "8FC9B6",
        subtitleText: "D6F2E6",
        haloColor: "4FD1A5",
        haloOpacity: 0.14,
      },
    },
  ],
  "barley-harvest": [
    {
      id: "first-fruits",
      name: "첫 열매",
      description: "첫 열매를 올리는 금빛 감사",
      layoutFamily: "ornament-frame",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "2A1A0E",
        backgroundAccent: "6B4420",
        title: "F4E4C4",
        accent: "D4A05A",
        rule: "D4A05A",
        muted: "B8873F",
        subtitleText: "EBD6AE",
        haloColor: "D4A05A",
        haloOpacity: 0.14,
      },
    },
    {
      id: "barley-ears",
      name: "보리 이삭",
      description: "익은 보리 이삭의 결",
      layoutFamily: "side-band",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "F7F0DE",
        backgroundAccent: "E3D2A6",
        title: "32280F",
        accent: "BE9B44",
        rule: "D2B769",
        muted: "7E6A2B",
        subtitleText: "47391A",
        haloColor: "BE9B44",
        haloOpacity: 0.16,
      },
    },
    {
      id: "field-thanks",
      name: "들녘 감사",
      description: "해 기운 들녘의 감사",
      layoutFamily: "horizon-split",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "2C2412",
        backgroundAccent: "E0B457",
        title: "FBF3E0",
        accent: "E8C87C",
        rule: "C3A254",
        muted: "BBA778",
        subtitleText: "F2E4C4",
        haloColor: "E8C87C",
        haloOpacity: 0.14,
      },
    },
  ],
  "year-end": [
    {
      id: "midnight-gate",
      name: "자정의 문",
      description: "자정에 열리는 감청빛 문",
      layoutFamily: "veil-panel",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "0B1020",
        backgroundAccent: "24325C",
        title: "F2F4FA",
        accent: "C7D2F0",
        rule: "7F8EC0",
        muted: "9AA6CC",
        subtitleText: "E3E8F5",
        haloColor: "C7D2F0",
        haloOpacity: 0.16,
      },
    },
    {
      id: "last-light",
      name: "마지막 빛",
      description: "한 해의 마지막 노을빛",
      layoutFamily: "horizon-split",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "1A1620",
        backgroundAccent: "6E4A55",
        title: "F6EFE9",
        accent: "E0A98B",
        rule: "B9826A",
        muted: "C0A79C",
        subtitleText: "EEDFD3",
        haloColor: "E0A98B",
        haloOpacity: 0.14,
      },
    },
    {
      id: "time-trace",
      name: "시간의 궤적",
      description: "지나온 시간이 남긴 궤적",
      layoutFamily: "corner-mark",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "141619",
        backgroundAccent: "32363C",
        title: "F0F1F3",
        accent: "A8B0BA",
        rule: "6E757F",
        muted: "9299A2",
        subtitleText: "DDE0E4",
        haloColor: "A8B0BA",
        haloOpacity: 0.12,
      },
    },
  ],
  "new-year": [
    {
      id: "dawn-horizon",
      name: "여명 수평선",
      description: "여명이 걷히는 수평선",
      layoutFamily: "horizon-split",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "0E1A2B",
        backgroundAccent: "F2C590",
        title: "FFFFFF",
        accent: "FFD9A8",
        rule: "D9A86C",
        muted: "A8BACE",
        subtitleText: "F5E7D3",
        haloColor: "FFD9A8",
        haloOpacity: 0.16,
      },
    },
    {
      id: "new-path",
      name: "새로운 길",
      description: "새로 난 길의 첫 걸음",
      layoutFamily: "side-band",
      theme: {
        mood: "light",
        titleFont: "sans",
        background: "F2F6F8",
        backgroundAccent: "CFE0E8",
        title: "16232B",
        accent: "5B93AE",
        rule: "8EB6C9",
        muted: "4C6976",
        subtitleText: "243947",
        haloColor: "5B93AE",
        haloOpacity: 0.16,
      },
    },
    {
      id: "first-page",
      name: "첫 페이지",
      description: "빈 노트를 펼친 첫 페이지",
      layoutFamily: "corner-mark",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "FDFCF9",
        backgroundAccent: "EAE6DC",
        title: "1F1D1A",
        accent: "8C867A",
        rule: "C3BCAE",
        muted: "6B655B",
        subtitleText: "2E2B26",
        haloColor: "8C867A",
        haloOpacity: 0.14,
      },
    },
  ],
  premium: [
    {
      id: "midnight-onyx",
      name: "미드나이트 오닉스",
      description: "오닉스처럼 깊은 검정 바탕",
      layoutFamily: "corner-mark",
      theme: {
        mood: "dark",
        titleFont: "serif",
        background: "08090B",
        backgroundAccent: "1E2126",
        title: "F5F5F7",
        accent: "C8CBD2",
        rule: "51565E",
        muted: "9A9EA6",
        subtitleText: "E7E8EC",
        haloColor: "C8CBD2",
        haloOpacity: 0.12,
      },
    },
    {
      id: "paper-atelier",
      name: "페이퍼 아틀리에",
      description: "종이 결이 살아있는 작업실",
      layoutFamily: "double-frame",
      theme: {
        mood: "light",
        titleFont: "sans",
        background: "FAF9F6",
        backgroundAccent: "E8E5DC",
        title: "1B1B1A",
        accent: "8A8778",
        rule: "C6C2B6",
        muted: "6A6862",
        subtitleText: "2C2C29",
        haloColor: "8A8778",
        haloOpacity: 0.14,
      },
    },
    {
      id: "serif-gallery",
      name: "세리프 갤러리",
      description: "갤러리 벽면의 세리프 조판",
      layoutFamily: "emblem-crest",
      theme: {
        mood: "light",
        titleFont: "serif",
        background: "F7F5F2",
        backgroundAccent: "E1DCD4",
        title: "191714",
        accent: "9B6C4A",
        rule: "C39D7C",
        muted: "6E5540",
        subtitleText: "2A241D",
        haloColor: "9B6C4A",
        haloOpacity: 0.16,
      },
    },
    {
      id: "cobalt-ripple",
      name: "코발트 리플",
      description: "코발트빛 물결의 파장",
      layoutFamily: "veil-panel",
      theme: {
        mood: "dark",
        titleFont: "sans",
        background: "071B3A",
        backgroundAccent: "1B48A0",
        title: "FFFFFF",
        accent: "8FB6FF",
        rule: "4C7BE0",
        muted: "9FB3D9",
        subtitleText: "E6EEFF",
        haloColor: "8FB6FF",
        haloOpacity: 0.16,
      },
    },
  ],
};

export const CUSTOM_TITLE_DESIGN_CATALOG =
  CUSTOM_TITLE_DESIGN_CATEGORIES.flatMap((category) =>
    DESIGNS_BY_CATEGORY[category.id].map((design) => ({
      ...design,
      categoryId: category.id,
    }))
  );

export const CUSTOM_TITLE_DESIGN_IDS = CUSTOM_TITLE_DESIGN_CATALOG.map(
  (design) => design.id
);

const DESIGN_BY_ID = new Map(
  CUSTOM_TITLE_DESIGN_CATALOG.map((design) => [design.id, design])
);

const CATEGORY_BY_ID = new Map(
  CUSTOM_TITLE_DESIGN_CATEGORIES.map((category) => [category.id, category])
);

/** Falls back to the original design so unknown ids still render. */
export function normalizeCustomTitleDesignId(value) {
  return DESIGN_BY_ID.has(value) ? value : DEFAULT_CUSTOM_TITLE_DESIGN_ID;
}

export function findCustomTitleDesign(id) {
  return DESIGN_BY_ID.get(id) || null;
}

export function findCustomTitleDesignCategory(designId) {
  const design = findCustomTitleDesign(designId);
  return design ? CATEGORY_BY_ID.get(design.categoryId) || null : null;
}

export function listCustomTitleDesignsByCategory(categoryId) {
  return CUSTOM_TITLE_DESIGN_CATALOG.filter(
    (design) => design.categoryId === categoryId
  );
}

/**
 * Asset paths must stay inside `assets/custom-title/` so a catalog entry can
 * never reach outside the bundled asset folder.
 */
export function isSafeCustomTitleAssetPath(value) {
  if (typeof value !== "string" || !value.startsWith(ASSET_ROOT)) {
    return false;
  }

  const relative = value.slice(ASSET_ROOT.length);
  if (!relative || relative.includes("\\")) {
    return false;
  }

  return relative
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== "..");
}
