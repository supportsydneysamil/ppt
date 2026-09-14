import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CUSTOM_TITLE_DESIGN_CATALOG,
  CUSTOM_TITLE_DESIGN_CATEGORIES,
  CUSTOM_TITLE_DESIGN_IDS,
  CUSTOM_TITLE_LAYOUT_FAMILIES,
  findCustomTitleDesign,
  findCustomTitleDesignCategory,
  isSafeCustomTitleAssetPath,
  listCustomTitleDesignsByCategory,
  normalizeCustomTitleDesignId,
} from "../lib/custom-title-design-catalog.js";

const EXPECTED_CATEGORIES = [
  { id: "default", name: "기본", count: 4 },
  { id: "christmas", name: "성탄절", count: 4 },
  { id: "easter", name: "부활절", count: 4 },
  { id: "lent", name: "사순절", count: 3 },
  { id: "palm-sunday", name: "종려주일", count: 3 },
  { id: "barley-harvest", name: "맥추감사절", count: 3 },
  { id: "year-end", name: "송구영신", count: 3 },
  { id: "new-year", name: "신년", count: 3 },
  { id: "premium", name: "기타 (고급)", count: 4 },
];

// The approved Korean names, in the order each category must present them.
const EXPECTED_NAMES = {
  default: ["오로라 그라디언트", "모노리스", "아이보리 클래식", "마키 프레임"],
  christmas: ["베들레헴 별빛", "성야 상록", "골드 캐럴", "설원 성소"],
  easter: ["부활 새벽빛", "빈 무덤의 빛", "백합의 아침", "스테인드 글로리"],
  lent: ["재의 십자가", "광야의 보랏빛", "침묵의 린넨"],
  "palm-sunday": ["종려 그림자", "예루살렘 입성", "호산나 에메랄드"],
  "barley-harvest": ["첫 열매", "보리 이삭", "들녘 감사"],
  "year-end": ["자정의 문", "마지막 빛", "시간의 궤적"],
  "new-year": ["여명 수평선", "새로운 길", "첫 페이지"],
  premium: ["미드나이트 오닉스", "페이퍼 아틀리에", "세리프 갤러리", "코발트 리플"],
};

const EXPECTED_LAYOUT_FAMILIES = [
  "centered-rule",
  "double-frame",
  "ornament-frame",
  "side-band",
  "horizon-split",
  "emblem-crest",
  "veil-panel",
  "corner-mark",
];

const THEME_COLOR_FIELDS = [
  "background",
  "backgroundAccent",
  "title",
  "accent",
  "rule",
  "muted",
  "subtitleText",
  "haloColor",
];

const THEME_FIELDS = [...THEME_COLOR_FIELDS, "haloOpacity", "mood", "titleFont"];

const DESIGN_FIELDS = [
  "id",
  "categoryId",
  "name",
  "description",
  "layoutFamily",
  "theme",
];

function keys(value) {
  return Object.keys(value).sort();
}

describe("custom title design categories", () => {
  it("lists the nine categories in order with their display names", () => {
    assert.deepEqual(
      CUSTOM_TITLE_DESIGN_CATEGORIES.map(({ id, name }) => ({ id, name })),
      EXPECTED_CATEGORIES.map(({ id, name }) => ({ id, name }))
    );
  });

  it("holds the expected design count per category", () => {
    for (const { id, count } of EXPECTED_CATEGORIES) {
      assert.equal(
        listCustomTitleDesignsByCategory(id).length,
        count,
        `${id} must hold ${count} designs`
      );
    }
  });

  it("uses the approved Korean names in category order", () => {
    for (const { id } of EXPECTED_CATEGORIES) {
      assert.deepEqual(
        listCustomTitleDesignsByCategory(id).map((design) => design.name),
        EXPECTED_NAMES[id],
        `${id} names must match the approved list`
      );
    }
  });
});

describe("custom title design catalog", () => {
  it("holds 31 designs with unique ids", () => {
    assert.equal(CUSTOM_TITLE_DESIGN_CATALOG.length, 31);
    assert.equal(new Set(CUSTOM_TITLE_DESIGN_IDS).size, 31);
    assert.deepEqual(
      CUSTOM_TITLE_DESIGN_IDS,
      CUSTOM_TITLE_DESIGN_CATALOG.map((design) => design.id)
    );
  });

  it("keeps the four original designs first and in order", () => {
    assert.deepEqual(CUSTOM_TITLE_DESIGN_IDS.slice(0, 4), [
      "aurora",
      "monolith",
      "ivory",
      "marquee",
    ]);
  });

  it("orders designs by category, grouped without interleaving", () => {
    assert.deepEqual(
      CUSTOM_TITLE_DESIGN_CATALOG.map((design) => design.categoryId),
      EXPECTED_CATEGORIES.flatMap(({ id, count }) => Array(count).fill(id))
    );
  });

  it("references a known category and carries Korean copy on every design", () => {
    const categoryIds = new Set(
      CUSTOM_TITLE_DESIGN_CATEGORIES.map((category) => category.id)
    );

    for (const design of CUSTOM_TITLE_DESIGN_CATALOG) {
      assert.deepEqual(
        keys(design).filter((key) => key !== "asset"),
        [...DESIGN_FIELDS].sort(),
        `${design.id} must expose the catalog fields`
      );
      assert.ok(
        categoryIds.has(design.categoryId),
        `${design.id} must point at a known category`
      );
      assert.match(
        design.id,
        /^[a-z][a-z0-9-]*$/,
        `${design.id} id must be kebab-case`
      );
      assert.ok(design.name.trim().length > 0, `${design.id} needs a name`);
      assert.ok(
        design.description.trim().length > 0 && design.description.length <= 40,
        `${design.id} needs a short description`
      );
    }
  });

  it("uses exactly the eight layout families", () => {
    assert.deepEqual(CUSTOM_TITLE_LAYOUT_FAMILIES, EXPECTED_LAYOUT_FAMILIES);

    const used = CUSTOM_TITLE_DESIGN_CATALOG.map(
      (design) => design.layoutFamily
    );
    assert.deepEqual(
      [...new Set(used)].sort(),
      [...EXPECTED_LAYOUT_FAMILIES].sort(),
      "every layout family must be used and no others"
    );
  });

  it("carries a complete visual theme on every design", () => {
    for (const { id, theme } of CUSTOM_TITLE_DESIGN_CATALOG) {
      assert.deepEqual(
        keys(theme),
        [...THEME_FIELDS].sort(),
        `${id} theme must expose every field`
      );

      for (const field of THEME_COLOR_FIELDS) {
        assert.match(
          theme[field],
          /^[0-9A-F]{6}$/,
          `${id} theme.${field} must be an uppercase hex colour`
        );
      }

      assert.ok(
        theme.haloOpacity > 0 && theme.haloOpacity <= 0.5,
        `${id} theme.haloOpacity must sit within (0, 0.5]`
      );
      assert.ok(
        ["dark", "light"].includes(theme.mood),
        `${id} theme.mood must be dark or light`
      );
      assert.ok(
        ["sans", "serif"].includes(theme.titleFont),
        `${id} theme.titleFont must be sans or serif`
      );
    }
  });
});

describe("custom title catalog helpers", () => {
  it("normalizes unknown design ids to aurora", () => {
    assert.equal(normalizeCustomTitleDesignId("monolith"), "monolith");
    assert.equal(
      normalizeCustomTitleDesignId("bethlehem-star"),
      "bethlehem-star"
    );
    assert.equal(normalizeCustomTitleDesignId("nope"), "aurora");
    assert.equal(normalizeCustomTitleDesignId(""), "aurora");
    assert.equal(normalizeCustomTitleDesignId(undefined), "aurora");
    assert.equal(normalizeCustomTitleDesignId(null), "aurora");
    assert.equal(normalizeCustomTitleDesignId(0), "aurora");
    assert.equal(normalizeCustomTitleDesignId({}), "aurora");
  });

  it("finds a design and its category by id", () => {
    assert.equal(findCustomTitleDesign("ivory").name, "아이보리 클래식");
    assert.equal(findCustomTitleDesign("gold-carol").categoryId, "christmas");
    assert.equal(findCustomTitleDesign("nope"), null);

    assert.deepEqual(findCustomTitleDesignCategory("gold-carol"), {
      id: "christmas",
      name: "성탄절",
    });
    assert.equal(findCustomTitleDesignCategory("nope"), null);
  });

  it("lists designs of a category in catalog order and ignores unknown ids", () => {
    assert.deepEqual(
      listCustomTitleDesignsByCategory("lent").map((design) => design.id),
      CUSTOM_TITLE_DESIGN_CATALOG.filter(
        (design) => design.categoryId === "lent"
      ).map((design) => design.id)
    );
    assert.deepEqual(listCustomTitleDesignsByCategory("nope"), []);
  });
});

describe("custom title asset paths", () => {
  it("accepts only project-relative paths under assets/custom-title/", () => {
    assert.equal(
      isSafeCustomTitleAssetPath("assets/custom-title/christmas/star.png"),
      true
    );
    assert.equal(
      isSafeCustomTitleAssetPath("assets/custom-title/star.png"),
      true
    );

    for (const unsafe of [
      "assets/custom-title/",
      "assets/other/star.png",
      "/assets/custom-title/star.png",
      "./assets/custom-title/star.png",
      "assets/custom-title/../../server.js",
      "assets/custom-title/..\\star.png",
      "assets\\custom-title\\star.png",
      "http://example.com/assets/custom-title/star.png",
      "",
      undefined,
      null,
      42,
    ]) {
      assert.equal(
        isSafeCustomTitleAssetPath(unsafe),
        false,
        `${String(unsafe)} must be rejected`
      );
    }
  });

  it("declares only safe asset metadata in the catalog", () => {
    for (const design of CUSTOM_TITLE_DESIGN_CATALOG) {
      if (!("asset" in design)) {
        continue;
      }
      assert.deepEqual(
        keys(design.asset),
        ["height", "path", "width"],
        `${design.id} asset must describe a path and pixel size`
      );
      assert.equal(
        isSafeCustomTitleAssetPath(design.asset.path),
        true,
        `${design.id} asset path must stay under assets/custom-title/`
      );
      assert.ok(
        Number.isInteger(design.asset.width) && design.asset.width > 0,
        `${design.id} asset width must be a positive integer`
      );
      assert.ok(
        Number.isInteger(design.asset.height) && design.asset.height > 0,
        `${design.id} asset height must be a positive integer`
      );
    }
  });
});
