import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  DEFAULT_TITLE_DESIGN_ID,
  HIDDEN_TITLE_DESIGN_IDS,
  TITLE_SLIDE_DESIGN_CATALOG,
  TITLE_SLIDE_DESIGN_CATEGORIES,
  TITLE_SLIDE_DESIGN_IDS,
  TITLE_SLIDE_LAYOUT_FAMILIES,
  findTitleDesign,
  findTitleDesignCategory,
  isSafeTitleAssetPath,
  listTitleDesignsByCategory,
  normalizeTitleDesignId,
} from "../lib/title-slide-design-catalog.js";

const EXPECTED_CATEGORIES = [
  ["default", "기본"],
  ["advent", "대림절"],
  ["christmas", "성탄절"],
  ["easter", "부활절"],
  ["lent", "사순절"],
  ["palm-sunday", "종려주일"],
  ["year-end", "송구영신"],
  ["new-year", "신년"],
  ["premium", "기타"],
];

const EXPECTED_NAMES = {
  default: [
    "클래식 채플",
    "모던 에디토리얼",
    "스테인드 글로우",
    "린넨 프레스",
    "성소 아치",
    "새벽 컬럼",
  ],
  advent: ["대림 촛불", "대림 만찬", "대림 기다림", "대림 촛불빛", "대림 화환"],
  christmas: [
    "성탄 버건디",
    "성탄 상록",
    "성탄 아이보리",
    "성탄 크림슨",
    "성탄 설원",
  ],
  easter: ["부활 새벽빛", "부활 스테인드", "부활 리넨", "부활 백합", "부활 영광"],
  lent: ["사순 자주", "사순 재", "사순 베일", "사순 린넨", "사순 광야"],
  "palm-sunday": ["종려 행렬", "종려 뜰", "종려 지평", "종려 배너", "종려 아치"],
  "year-end": ["송구 파수", "송구 문턱", "송구 잔불", "송구 결산", "송구 종소리"],
  "new-year": ["신년 새벽", "신년 첫날", "신년 축복", "신년 기둥", "신년 아치"],
  premium: [
    "미드나잇 슬랩",
    "슬레이트 스플릿",
    "딥 포그",
    "페이퍼 화이트",
    "세이지 코트",
    "앰버 아치",
    "블랙 리저브",
    "코발트 포털",
    "테라코타 에디션",
  ],
};

const EXPECTED_FAMILIES = {
  chapel: "legacy",
  editorial: "legacy",
  glow: "legacy",
  "linen-press": "duo-rule",
  "sanctuary-arch": "arch-window",
  "dawn-column": "column-split",
  advent: "legacy",
  "advent-vesper": "veil-panel",
  "advent-watch": "corner-mark",
  "advent-candlelight": "duo-rule",
  "advent-wreath": "arch-window",
  "christmas-burgundy": "legacy",
  "christmas-evergreen": "legacy",
  "christmas-ivory": "double-frame",
  "christmas-crimson": "banner-block",
  "christmas-snow": "column-split",
  "easter-dawn": "legacy",
  "easter-stained": "legacy",
  "easter-linen": "horizon-split",
  "easter-lily": "arch-window",
  "easter-glory": "banner-block",
  "lent-violet": "side-band",
  "lent-ashes": "centered-rule",
  "lent-veil": "veil-panel",
  "lent-linen": "duo-rule",
  "lent-desert": "column-split",
  "palm-procession": "emblem-crest",
  "palm-court": "double-frame",
  "palm-horizon": "horizon-split",
  "palm-banner": "banner-block",
  "palm-arch": "arch-window",
  "year-end-watch": "side-band",
  "year-end-threshold": "corner-mark",
  "year-end-ember": "veil-panel",
  "year-end-ledger": "duo-rule",
  "year-end-bell": "banner-block",
  "new-year-dawn": "horizon-split",
  "new-year-first": "corner-mark",
  "new-year-blessing": "emblem-crest",
  "new-year-column": "column-split",
  "new-year-arch": "arch-window",
  "midnight-slab": "open-margin",
  "slate-split": "column-split",
  "deep-fog": "veil-panel",
  "paper-white": "duo-rule",
  "sage-court": "double-frame",
  "amber-arch": "arch-window",
  "black-reserve": "gallery-rail",
  "cobalt-portal": "portal-offset",
  "terracotta-edition": "editorial-index",
};

const EXPECTED_ASSETS = {
  "palm-horizon": "assets/custom-title/palm-shadow.png",
  "year-end-ember": "assets/custom-title/midnight-gate.png",
  "new-year-dawn": "assets/custom-title/new-path.png",
};

describe("Sunday title design catalog", () => {
  it("lists nine approved categories with at least five designs each", () => {
    assert.deepEqual(
      TITLE_SLIDE_DESIGN_CATEGORIES.map(({ id, name }) => [id, name]),
      EXPECTED_CATEGORIES
    );
    for (const [id] of EXPECTED_CATEGORIES) {
      const designs = listTitleDesignsByCategory(id);
      assert.ok(designs.length >= 5, id);
      assert.deepEqual(
        designs.map(({ name }) => name),
        EXPECTED_NAMES[id]
      );
    }
  });

  it("holds 50 unique picker ids and hides thanksgiving", () => {
    assert.equal(TITLE_SLIDE_DESIGN_CATALOG.length, 50);
    assert.equal(new Set(TITLE_SLIDE_DESIGN_IDS).size, 50);
    assert.equal(TITLE_SLIDE_DESIGN_IDS.includes("thanksgiving"), false);
    assert.deepEqual(HIDDEN_TITLE_DESIGN_IDS, ["thanksgiving"]);
  });

  it("mixes light and dark moods inside every category", () => {
    for (const [id] of EXPECTED_CATEGORIES) {
      const moods = new Set(
        listTitleDesignsByCategory(id).map(({ theme }) => theme.mood)
      );
      assert.deepEqual([...moods].sort(), ["dark", "light"], id);
    }
  });

  it("uses the approved layout families", () => {
    for (const design of TITLE_SLIDE_DESIGN_CATALOG) {
      assert.equal(design.layoutFamily, EXPECTED_FAMILIES[design.id], design.id);
    }
    assert.deepEqual(TITLE_SLIDE_LAYOUT_FAMILIES, [
      "legacy",
      "centered-rule",
      "double-frame",
      "side-band",
      "horizon-split",
      "emblem-crest",
      "veil-panel",
      "corner-mark",
      "banner-block",
      "column-split",
      "arch-window",
      "duo-rule",
      "open-margin",
      "gallery-rail",
      "portal-offset",
      "editorial-index",
    ]);
  });

  it("reuses only safe, existing approved assets", () => {
    const actualAssets = TITLE_SLIDE_DESIGN_CATALOG.filter(
      ({ asset }) => asset
    );
    assert.equal(actualAssets.length, 3);
    for (const [id, path] of Object.entries(EXPECTED_ASSETS)) {
      const design = findTitleDesign(id);
      assert.equal(design.asset.path, path);
      assert.equal(isSafeTitleAssetPath(path), true);
      assert.equal(
        existsSync(
          fileURLToPath(new URL(`../public/${path}`, import.meta.url))
        ),
        true
      );
    }
  });

  it("normalizes picker and hidden ids while rejecting unsafe paths", () => {
    assert.equal(DEFAULT_TITLE_DESIGN_ID, "chapel");
    assert.equal(normalizeTitleDesignId("lent-ashes"), "lent-ashes");
    assert.equal(normalizeTitleDesignId("thanksgiving"), "thanksgiving");
    assert.equal(normalizeTitleDesignId("unknown"), "chapel");
    assert.equal(findTitleDesign("thanksgiving")?.layoutFamily, "legacy");
    assert.equal(findTitleDesignCategory("thanksgiving"), null);
    assert.equal(findTitleDesignCategory("chapel")?.id, "default");
    assert.equal(
      isSafeTitleAssetPath("assets/title/season/background.png"),
      true
    );
    assert.equal(
      isSafeTitleAssetPath("assets/custom-title/../secret.png"),
      false
    );
    assert.equal(isSafeTitleAssetPath("public/logo.png"), false);
  });
});
