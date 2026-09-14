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
  ["premium", "기타 (고급)"],
];

const EXPECTED_NAMES = {
  default: ["클래식 채플", "모던 에디토리얼", "스테인드 글로우"],
  advent: ["대림 촛불", "대림 만찬", "대림 기다림"],
  christmas: ["성탄 버건디", "성탄 상록", "성탄 아이보리"],
  easter: ["부활 새벽빛", "부활 스테인드", "부활 리넨"],
  lent: ["사순 자주", "사순 재", "사순 베일"],
  "palm-sunday": ["종려 행렬", "종려 뜰", "종려 지평"],
  "year-end": ["송구 파수", "송구 문턱", "송구 잔불"],
  "new-year": ["신년 새벽", "신년 첫날", "신년 축복"],
  premium: ["미드나잇 슬랩", "슬레이트 스플릿", "딥 포그"],
};

const EXPECTED_FAMILIES = {
  chapel: "legacy",
  editorial: "legacy",
  glow: "legacy",
  advent: "legacy",
  "advent-vesper": "veil-panel",
  "advent-watch": "corner-mark",
  "christmas-burgundy": "legacy",
  "christmas-evergreen": "legacy",
  "christmas-ivory": "double-frame",
  "easter-dawn": "legacy",
  "easter-stained": "legacy",
  "easter-linen": "horizon-split",
  "lent-violet": "side-band",
  "lent-ashes": "centered-rule",
  "lent-veil": "veil-panel",
  "palm-procession": "emblem-crest",
  "palm-court": "double-frame",
  "palm-horizon": "horizon-split",
  "year-end-watch": "side-band",
  "year-end-threshold": "corner-mark",
  "year-end-ember": "veil-panel",
  "new-year-dawn": "horizon-split",
  "new-year-first": "corner-mark",
  "new-year-blessing": "emblem-crest",
  "midnight-slab": "legacy",
  "slate-split": "legacy",
  "deep-fog": "legacy",
};

const EXPECTED_ASSETS = {
  "palm-horizon": "assets/custom-title/palm-shadow.png",
  "year-end-ember": "assets/custom-title/midnight-gate.png",
  "new-year-dawn": "assets/custom-title/new-path.png",
};

describe("Sunday title design catalog", () => {
  it("lists nine approved categories with three designs each", () => {
    assert.deepEqual(
      TITLE_SLIDE_DESIGN_CATEGORIES.map(({ id, name }) => [id, name]),
      EXPECTED_CATEGORIES
    );
    for (const [id] of EXPECTED_CATEGORIES) {
      const designs = listTitleDesignsByCategory(id);
      assert.equal(designs.length, 3, id);
      assert.deepEqual(
        designs.map(({ name }) => name),
        EXPECTED_NAMES[id]
      );
    }
  });

  it("holds 27 unique picker ids and hides thanksgiving", () => {
    assert.equal(TITLE_SLIDE_DESIGN_CATALOG.length, 27);
    assert.equal(new Set(TITLE_SLIDE_DESIGN_IDS).size, 27);
    assert.equal(TITLE_SLIDE_DESIGN_IDS.includes("thanksgiving"), false);
    assert.deepEqual(HIDDEN_TITLE_DESIGN_IDS, ["thanksgiving"]);
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
