# Sunday Title Season Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group Sunday-worship title designs into nine chip-filtered categories (three cards each), add sixteen catalog-driven layouts, and keep `thanksgiving` renderable but off the picker.

**Architecture:** Mirror Custom Title’s catalog module for Sunday worship only. Existing chapel/editorial/glow and extra-nine PPTX paths stay `legacy`. New IDs dispatch through `lib/title-slide-catalog-render.js` using seven layout families plus optional shared `assets/custom-title/` images and named motifs. The editor builds chips and cards from the catalog; chip choice is not persisted.

**Tech Stack:** Node.js ES modules, PptxGenJS, vanilla HTML/CSS/JS, Node test runner, Vite.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-14-title-slide-season-categories-design.md`
- Picker: 9 categories × 3 designs = 27 IDs; `thanksgiving` is hidden
- Unknown `titleDesign` → `chapel`; `thanksgiving` still renders via extra
- No new slide fields; do not change Custom Title catalog contents
- Do not change pixels of chapel, editorial, glow, or the existing extra 9
- Motifs `title-motif:…`, rules `title-rule:…`; Advent/Christmas/Easter *new* cards have no motifs
- Assets only under `assets/custom-title/` or `assets/title/`
- Missing image file → solid/gradient background, do not throw
- Chip switch: if current design is not in the category, select that category’s first card
- `suggestSeasonLabel` must not change chips or `titleDesign`
- Implement in an isolated git worktree that contains **both** `feature/title-slide-customization` and current Custom Title catalog work

## File map

- Create: `lib/title-slide-design-catalog.js` — categories, 27 designs, hidden thanksgiving, helpers
- Create: `lib/title-slide-catalog-render.js` — family PPTX dispatch for non-legacy catalog IDs
- Create: `test/title-slide-design-catalog.test.js`
- Create: `test/title-slide-catalog-render.test.js`
- Modify: `lib/title-slide-text.js` — `TITLE_DESIGNS` = 27 picker IDs + `thanksgiving`; `defaultTitleEn` for new IDs
- Modify: `lib/title-slide.js` — dispatch catalog families
- Modify: `public/main.jsx` — `window.TitleSlideDesignCatalog`
- Modify: `public/index.html` — empty chip group + empty grid (no hardcoded 27 cards)
- Modify: `public/app.js` — chip picker, first-card-on-switch, thanksgiving open state, family previews
- Modify: `public/styles.css` — only if Sunday chips need a count label tweak
- Modify: `test/title-slide.test.js`, `test/title-slide-ui.test.js`, `test/title-slide-extra.test.js`
- Do not modify: `lib/custom-title-design-catalog.js`, `lib/title-slide-extra.js` drawing geometry

---

### Task 1: Isolated worktree + design catalog

**Files:**
- Create: `lib/title-slide-design-catalog.js`
- Test: `test/title-slide-design-catalog.test.js`

**Interfaces:**
- Consumes: none (standalone data module)
- Produces:
  - `TITLE_SLIDE_DESIGN_CATEGORIES: { id: string, name: string }[]`
  - `TITLE_SLIDE_LAYOUT_FAMILIES: string[]`
  - `TITLE_SLIDE_DESIGN_CATALOG: TitleSlideDesign[]` (27 picker rows, each with `categoryId`)
  - `TITLE_SLIDE_DESIGN_IDS: string[]`
  - `HIDDEN_TITLE_DESIGN_IDS: ["thanksgiving"]`
  - `DEFAULT_TITLE_DESIGN_ID: "chapel"`
  - `normalizeTitleDesignId(value): string`
  - `findTitleDesign(id): object | null` (picker **or** hidden)
  - `findTitleDesignCategory(designId): { id, name } | null`
  - `listTitleDesignsByCategory(categoryId): object[]`
  - `isSafeTitleAssetPath(value): boolean`

A `TitleSlideDesign` has `id`, `name`, `description`, `categoryId`, `layoutFamily`, `theme`, optional `asset: { path, width, height }`. `theme` has `mood` (`light`|`dark`), `titleFont` (`serif`|`sans`), `background`, `backgroundAccent`, `title`, `accent`, `rule`, `muted` (hex without `#`). Hidden thanksgiving: `{ id: "thanksgiving", name: "추수 감사", description: "저장본 전용", layoutFamily: "legacy", theme: { mood: "light", titleFont: "serif", background: "5C3A1E", backgroundAccent: "C4A35A", title: "F7E7C3", accent: "E2C48A", rule: "C4A35A", muted: "D9C4A0" } }` with **no** `categoryId` (or omit it) so `findTitleDesignCategory` is `null`.

- [ ] **Step 1: Create the worktree and merge both parents**

Follow `superpowers:using-git-worktrees`. From repo root:

```bash
git fetch origin
git worktree add .worktrees/title-slide-season-categories -b feature/title-slide-season-categories HEAD
cd .worktrees/title-slide-season-categories
git merge feature/title-slide-customization
```

Resolve conflicts so `lib/title-slide-extra.js`, `lib/title-slide-text.js`, and Custom catalog/`public` picker all exist. Run `npm test` after merge; the known macOS `custom-slide-assets` path failure may still exist — do not “fix” it here. Subsequent commands in this plan run inside this worktree.

- [ ] **Step 2: Write the failing catalog tests**

Create `test/title-slide-design-catalog.test.js`:

```js
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
  { id: "default", name: "기본", count: 3 },
  { id: "advent", name: "대림절", count: 3 },
  { id: "christmas", name: "성탄절", count: 3 },
  { id: "easter", name: "부활절", count: 3 },
  { id: "lent", name: "사순절", count: 3 },
  { id: "palm-sunday", name: "종려주일", count: 3 },
  { id: "year-end", name: "송구영신", count: 3 },
  { id: "new-year", name: "신년", count: 3 },
  { id: "premium", name: "기타 (고급)", count: 3 },
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

const NO_ASSET_NEW = [
  "advent-vesper",
  "advent-watch",
  "christmas-ivory",
  "easter-linen",
  "lent-violet",
  "lent-ashes",
  "palm-court",
  "year-end-watch",
  "year-end-threshold",
  "new-year-first",
  "new-year-blessing",
];

describe("title slide design categories", () => {
  it("lists nine categories in order without barley-harvest", () => {
    assert.deepEqual(
      TITLE_SLIDE_DESIGN_CATEGORIES.map(({ id, name }) => ({ id, name })),
      EXPECTED_CATEGORIES.map(({ id, name }) => ({ id, name }))
    );
    assert.equal(
      TITLE_SLIDE_DESIGN_CATEGORIES.some((c) => c.id === "barley-harvest"),
      false
    );
  });

  it("holds three picker designs per category", () => {
    for (const { id, count } of EXPECTED_CATEGORIES) {
      assert.equal(listTitleDesignsByCategory(id).length, count);
    }
  });

  it("uses the approved Korean names in category order", () => {
    for (const { id } of EXPECTED_CATEGORIES) {
      assert.deepEqual(
        listTitleDesignsByCategory(id).map((d) => d.name),
        EXPECTED_NAMES[id]
      );
    }
  });
});

describe("title slide design catalog", () => {
  it("holds 27 picker designs with unique ids and no thanksgiving", () => {
    assert.equal(TITLE_SLIDE_DESIGN_CATALOG.length, 27);
    assert.equal(new Set(TITLE_SLIDE_DESIGN_IDS).size, 27);
    assert.equal(TITLE_SLIDE_DESIGN_IDS.includes("thanksgiving"), false);
    assert.deepEqual(HIDDEN_TITLE_DESIGN_IDS, ["thanksgiving"]);
  });

  it("assigns the approved layout family to every picker id", () => {
    for (const design of TITLE_SLIDE_DESIGN_CATALOG) {
      assert.equal(design.layoutFamily, EXPECTED_FAMILIES[design.id], design.id);
    }
  });

  it("keeps new designs in a category on distinct non-legacy families", () => {
    for (const { id } of EXPECTED_CATEGORIES) {
      const families = listTitleDesignsByCategory(id)
        .filter((d) => d.layoutFamily !== "legacy")
        .map((d) => d.layoutFamily);
      assert.equal(new Set(families).size, families.length, id);
    }
  });

  it("limits assets to three reused custom-title files", () => {
    for (const [id, path] of Object.entries(EXPECTED_ASSETS)) {
      assert.equal(findTitleDesign(id).asset.path, path);
      assert.equal(findTitleDesign(id).asset.width, 1280);
      assert.equal(findTitleDesign(id).asset.height, 720);
      assert.equal(existsSync(fileURLToPath(new URL(`../public/${path}`, import.meta.url))), true);
    }
    for (const id of NO_ASSET_NEW) {
      assert.equal(findTitleDesign(id).asset, undefined, id);
    }
    const assetCountByCategory = {};
    for (const design of TITLE_SLIDE_DESIGN_CATALOG) {
      if (!design.asset) continue;
      assetCountByCategory[design.categoryId] =
        (assetCountByCategory[design.categoryId] || 0) + 1;
    }
    for (const count of Object.values(assetCountByCategory)) {
      assert.ok(count <= 2);
    }
  });

  it("normalizes unknown ids to chapel and keeps thanksgiving", () => {
    assert.equal(DEFAULT_TITLE_DESIGN_ID, "chapel");
    assert.equal(normalizeTitleDesignId("nope"), "chapel");
    assert.equal(normalizeTitleDesignId("thanksgiving"), "thanksgiving");
    assert.equal(normalizeTitleDesignId("lent-ashes"), "lent-ashes");
    assert.equal(findTitleDesignCategory("thanksgiving"), null);
    assert.equal(findTitleDesign("thanksgiving")?.layoutFamily, "legacy");
    assert.equal(findTitleDesignCategory("chapel")?.id, "default");
  });

  it("accepts only custom-title or title asset folders", () => {
    assert.equal(isSafeTitleAssetPath("assets/custom-title/palm-shadow.png"), true);
    assert.equal(isSafeTitleAssetPath("assets/title/demo.png"), true);
    assert.equal(isSafeTitleAssetPath("assets/custom-title/../secret.png"), false);
    assert.equal(isSafeTitleAssetPath("public/logo.png"), false);
  });

  it("exports the seven Sunday families plus legacy, without ornament-frame", () => {
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
});
```

- [ ] **Step 3: Run the catalog tests and confirm they fail**

Run: `node --test test/title-slide-design-catalog.test.js`

Expected: FAIL with `Cannot find module` for `../lib/title-slide-design-catalog.js`

- [ ] **Step 4: Implement the catalog**

Create `lib/title-slide-design-catalog.js` modeled on `lib/custom-title-design-catalog.js`:

- `TITLE_SLIDE_DESIGN_CATEGORIES` in the spec order (include `advent`, omit `barley-harvest`).
- `DESIGNS_BY_CATEGORY` with the 27 IDs/names/families from Step 2.
- Legacy rows (`chapel`, `editorial`, `glow`, `advent`, both Christmas, both Easter, three premium): `layoutFamily: "legacy"`, no `asset`. Give them a `theme` anyway (mood/titleFont/hex) so cards can tint; values must not be read by legacy PPTX renderers.
- New-row palettes (hex, no `#`):

| id | mood | titleFont | background | backgroundAccent | title | accent | rule | muted |
|---|---|---|---|---|---|---|---|---|
| advent-vesper | dark | serif | 1A1430 | 3D2A63 | F4E8C8 | C9A227 | 8B6BB0 | B9A8D4 |
| advent-watch | dark | sans | 10182B | 1E3A5F | E8EEF6 | 9EC0E6 | 5C7DA6 | 8AA0B8 |
| christmas-ivory | light | serif | F6F1E6 | E7D9C4 | 7A2230 | A67C52 | C4A574 | 6E5540 |
| easter-linen | light | serif | F7F3EA | E4D7C0 | 3F4A38 | 8A9A6B | B7C49A | 6A7360 |
| lent-violet | dark | serif | 2A1838 | 5C3D6E | F0E6F4 | C4A0D4 | 8E6A9C | B39CB8 |
| lent-ashes | dark | sans | 1C1C1C | 3A3A3A | E8E4DC | A39E93 | 6F6B64 | 9A968C |
| lent-veil | dark | serif | 241C28 | 4A3A52 | EDE4D4 | D2B48C | 8A7060 | B8A898 |
| palm-procession | dark | serif | 10241A | 1F4630 | F0F6EF | A6CE9A | 6FA37A | 8DAE8C |
| palm-court | light | serif | F3F6EF | D5E3C8 | 1E3A24 | 4F7A4A | 8AAD7A | 5C6E52 |
| palm-horizon | dark | serif | 10241A | 1F4630 | F0F6EF | A6CE9A | 6FA37A | 8DAE8C |
| year-end-watch | dark | sans | 0B1020 | 24325C | F2F4FA | C7D2F0 | 7F8EC0 | 9AA6CC |
| year-end-threshold | dark | serif | 14110E | 3A2E24 | F4EDE3 | E0C9A0 | 9A7B55 | B8A080 |
| year-end-ember | dark | serif | 0B1020 | 24325C | F2F4FA | C7D2F0 | 7F8EC0 | 9AA6CC |
| new-year-dawn | light | sans | F2F6F8 | CFE0E8 | 16232B | 5B93AE | 8EB6C9 | 4C6976 |
| new-year-first | light | serif | F7F4EC | E6DCC8 | 2A2418 | 8A6A3C | C4A574 | 6E5A40 |
| new-year-blessing | dark | serif | 1A2230 | 3A4A62 | F5EFE4 | D4B978 | 8A7350 | B8A888 |

- Assets only on `palm-horizon`, `year-end-ember`, `new-year-dawn` as in `EXPECTED_ASSETS` (`width: 1280`, `height: 720`).
- Flatten to `TITLE_SLIDE_DESIGN_CATALOG` with `categoryId`.
- `HIDDEN_TITLE_DESIGNS` array with thanksgiving as specified; `findTitleDesign` searches catalog then hidden.
- `normalizeTitleDesignId`: if catalog or hidden has the id, return it, else `chapel`.
- `isSafeTitleAssetPath`: `value` is a string starting with `assets/custom-title/` **or** `assets/title/`, no `\\`, no `.` / `..` segments.

Korean `description` one-liners are required; keep them short (e.g. 대림 만찬 → `베일 패널의 고요한 만찬`).

- [ ] **Step 5: Re-run catalog tests**

Run: `node --test test/title-slide-design-catalog.test.js`

Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add lib/title-slide-design-catalog.js test/title-slide-design-catalog.test.js
git commit -m "$(cat <<'EOF'
feat: add Sunday title season design catalog

Give the picker nine categories of three designs and keep thanksgiving off the list.
EOF
)"
```

---

### Task 2: Shared title IDs and English defaults

**Files:**
- Modify: `lib/title-slide-text.js`
- Modify: `test/title-slide.test.js`
- Test: `test/title-slide-text.test.js` (create if missing; otherwise extend `test/title-slide.test.js`)

**Interfaces:**
- Consumes: `TITLE_SLIDE_DESIGN_IDS`, `HIDDEN_TITLE_DESIGN_IDS`, `normalizeTitleDesignId` from Task 1
- Produces: `TITLE_DESIGNS` = `[...TITLE_SLIDE_DESIGN_IDS, ...HIDDEN_TITLE_DESIGN_IDS]`; `normalizeTitleDesign` re-exports `normalizeTitleDesignId`; `defaultTitleEn(design)` as below

- [ ] **Step 1: Write failing defaultTitleEn tests**

In `test/title-slide.test.js` (the existing “knows all twelve designs” test), replace the expected `TITLE_DESIGNS` array with:

```js
assert.equal(TITLE_DESIGNS.length, 28);
assert.equal(TITLE_DESIGNS.includes("thanksgiving"), true);
assert.equal(TITLE_DESIGNS.includes("lent-ashes"), true);
assert.equal(TITLE_DESIGNS.includes("chapel"), true);
assert.equal(normalizeTitleDesign("christmas-ivory"), "christmas-ivory");
```

Add:

```js
it("uses seasonal English defaults for new catalog ids", () => {
  assert.equal(defaultTitleEn("advent-vesper"), "ADVENT SUNDAY");
  assert.equal(defaultTitleEn("advent-watch"), "ADVENT SUNDAY");
  assert.equal(defaultTitleEn("christmas-ivory"), "CHRISTMAS WORSHIP");
  assert.equal(defaultTitleEn("easter-linen"), "EASTER SUNDAY");
  assert.equal(defaultTitleEn("lent-violet"), "LENT");
  assert.equal(defaultTitleEn("palm-court"), "PALM SUNDAY");
  assert.equal(defaultTitleEn("year-end-watch"), "WATCHNIGHT");
  assert.equal(defaultTitleEn("new-year-dawn"), "NEW YEAR");
  assert.equal(defaultTitleEn("thanksgiving"), "THANKSGIVING");
  assert.equal(defaultTitleEn("chapel"), "SUNDAY WORSHIP");
});
```

Import `defaultTitleEn` from `../lib/title-slide-text.js` or from `../lib/title-slide.js` if it re-exports it (current code re-exports from text).

- [ ] **Step 2: Run the title-slide tests and confirm the ID assertion fails**

Run: `node --test test/title-slide.test.js`

Expected: FAIL because `TITLE_DESIGNS` is still length 12

- [ ] **Step 3: Point TITLE_DESIGNS at the catalog**

In `lib/title-slide-text.js`:

```js
import {
  HIDDEN_TITLE_DESIGN_IDS,
  TITLE_SLIDE_DESIGN_IDS,
  normalizeTitleDesignId,
} from "./title-slide-design-catalog.js";

export const TITLE_DESIGNS = [
  ...TITLE_SLIDE_DESIGN_IDS,
  ...HIDDEN_TITLE_DESIGN_IDS,
];

export function normalizeTitleDesign(value) {
  return normalizeTitleDesignId(value);
}

export function defaultTitleEn(design) {
  const id = normalizeTitleDesign(design);
  if (id === "editorial") return "SUNDAY WORSHIP SERVICE";
  if (id === "easter-dawn" || id === "easter-stained" || id === "easter-linen") {
    return "EASTER SUNDAY";
  }
  if (
    id === "christmas-burgundy" ||
    id === "christmas-evergreen" ||
    id === "christmas-ivory"
  ) {
    return "CHRISTMAS WORSHIP";
  }
  if (id === "thanksgiving") return "THANKSGIVING";
  if (id === "advent" || id.startsWith("advent-")) return "ADVENT SUNDAY";
  if (id.startsWith("lent-")) return "LENT";
  if (id.startsWith("palm-")) return "PALM SUNDAY";
  if (id.startsWith("year-end-")) return "WATCHNIGHT";
  if (id.startsWith("new-year-")) return "NEW YEAR";
  return "SUNDAY WORSHIP";
}
```

Keep `defaultTitleKo`, `resolveTitleLine`, and font helpers unchanged.

If `test/export-media-integrity.test.js` loops `TITLE_DESIGNS`, it will now export 28 title slides — that is intended. Fix only if the test hard-codes `length === 12`.

- [ ] **Step 4: Re-run title-slide tests**

Run: `node --test test/title-slide.test.js`

Expected: PASS. If extra tests still assume exactly 12 IDs, update those assertions to 28 / catalog IDs, not the renderer geometry.

- [ ] **Step 5: Commit**

```bash
git add lib/title-slide-text.js test/title-slide.test.js
git commit -m "$(cat <<'EOF'
feat: expand Sunday title IDs to the season catalog

Normalize picker designs plus hidden thanksgiving through the shared text module.
EOF
)"
```

---

### Task 3: Catalog family PPTX renderer

**Files:**
- Create: `lib/title-slide-catalog-render.js`
- Test: `test/title-slide-catalog-render.test.js`
- Modify: `lib/title-slide.js` (dispatch only; keep legacy functions)

**Interfaces:**
- Consumes: `findTitleDesign`, `isSafeTitleAssetPath`; `content` from `buildTitleContent` (`ko`, `en`, `church`, `subtitle`, `koDate`, `enDate`)
- Produces: `appendCatalogTitleSlide(pptx, design, content): boolean` — `true` if it added a slide; `false` for `legacy`, missing family, or missing `design`

- [ ] **Step 1: Write failing renderer tests**

Create `test/title-slide-catalog-render.test.js` using the same zip/XML helpers as `test/title-slide-extra.test.js` (`AdmZip`, `p:cNvPr` names). Import `appendTitleSlide` from `../lib/title-slide.js` so dispatch is covered once Task 3 Step 4 is done. Until dispatch exists, call `appendCatalogTitleSlide` directly **and** also assert `appendTitleSlide` once dispatch is wired in the same task.

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import { findTitleDesign } from "../lib/title-slide-design-catalog.js";
import { appendCatalogTitleSlide } from "../lib/title-slide-catalog-render.js";
import { appendTitleSlide } from "../lib/title-slide.js";

const NEW_IDS = [
  "advent-vesper",
  "advent-watch",
  "christmas-ivory",
  "easter-linen",
  "lent-violet",
  "lent-ashes",
  "lent-veil",
  "palm-procession",
  "palm-court",
  "palm-horizon",
  "year-end-watch",
  "year-end-threshold",
  "year-end-ember",
  "new-year-dawn",
  "new-year-first",
  "new-year-blessing",
];

const FAMILY_RULE = {
  "centered-rule": "title-rule:centered-rule",
  "double-frame": "title-rule:double-frame",
  "side-band": "title-rule:side-band",
  "horizon-split": "title-rule:horizon-split",
  "emblem-crest": "title-rule:emblem-crest",
  "veil-panel": "title-rule:veil-panel",
  "corner-mark": "title-rule:corner-mark",
};

const MOTIF_IDS = {
  "lent-veil": "title-motif:lent-veil",
  "palm-procession": "title-motif:palm",
  "new-year-blessing": "title-motif:year-crest",
};

function names(slideXml) {
  return Array.from(
    new DOMParser()
      .parseFromString(slideXml, "text/xml")
      .getElementsByTagName("p:cNvPr")
  ).map((n) => n.getAttribute("name") || "");
}

async function xmlFromCatalog(id) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const ok = appendCatalogTitleSlide(pptx, findTitleDesign(id), {
    ko: "주일예배",
    en: "TEST ENGLISH",
    church: "시드니 삼일교회",
    subtitle: "",
    koDate: "2026년 9월 13일 주일",
    enDate: "Sunday, September 13, 2026",
  });
  assert.equal(ok, true, id);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
}

describe("appendCatalogTitleSlide", () => {
  it("returns false for legacy and unknown families", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    assert.equal(appendCatalogTitleSlide(pptx, findTitleDesign("chapel"), { ko: "A" }), false);
    assert.equal(appendCatalogTitleSlide(pptx, { layoutFamily: "ornament-frame", theme: findTitleDesign("chapel").theme }, { ko: "A" }), false);
    assert.equal(appendCatalogTitleSlide(pptx, null, { ko: "A" }), false);
  });

  it("draws each new design with its family rule and copy", async () => {
    for (const id of NEW_IDS) {
      const xml = await xmlFromCatalog(id);
      const family = findTitleDesign(id).layoutFamily;
      assert.ok(names(xml).includes(FAMILY_RULE[family]), id);
      assert.match(xml, /주일예배/);
      assert.match(xml, /TEST ENGLISH/);
      assert.match(xml, /시드니 삼일교회/);
    }
  });

  it("puts motifs only on lent-veil, palm-procession, and new-year-blessing", async () => {
    for (const id of NEW_IDS) {
      const xml = await xmlFromCatalog(id);
      const motifNames = names(xml).filter((n) => n.startsWith("title-motif:"));
      if (MOTIF_IDS[id]) {
        assert.deepEqual(motifNames, [MOTIF_IDS[id]], id);
      } else {
        assert.deepEqual(motifNames, [], id);
      }
    }
  });

  it("hides the English-associated divider when en is empty", async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    appendCatalogTitleSlide(pptx, findTitleDesign("lent-ashes"), {
      ko: "주일예배",
      en: "",
      church: "교회",
      subtitle: "",
      koDate: "날짜",
      enDate: "",
    });
    const buffer = await pptx.write({ outputType: "nodebuffer" });
    const xml = new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
    assert.equal(names(xml).includes("title-rule:en-divider"), false);
  });

  it("omits date text when koDate is empty", async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    appendCatalogTitleSlide(pptx, findTitleDesign("advent-vesper"), {
      ko: "주일예배",
      en: "EN",
      church: "교회",
      subtitle: "",
      koDate: "",
      enDate: "",
    });
    const buffer = await pptx.write({ outputType: "nodebuffer" });
    const xml = new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
    assert.doesNotMatch(xml, /2026/);
  });
});
```

- [ ] **Step 2: Run renderer tests and confirm they fail**

Run: `node --test test/title-slide-catalog-render.test.js`

Expected: FAIL (`Cannot find module` `title-slide-catalog-render.js`)

- [ ] **Step 3: Implement family drawing**

Create `lib/title-slide-catalog-render.js`. Do **not** import from `lib/custom-title-slide.js`. Reuse `LAYOUT`, `SANS`, `SERIF`, `LATIN`, `addGradientBackground` from `./slide-layout.js`, font helpers from `./title-slide-text.js`, `existsSync` + `fileURLToPath` for images.

`appendCatalogTitleSlide(pptx, design, content)`:

1. If `!design` or `design.layoutFamily === "legacy"` or family not in the seven non-legacy names, return `false`.
2. `pptx.addSlide()`, `slide.background = { color: design.theme.background }`.
3. Background: if `design.asset` and `isSafeTitleAssetPath(asset.path)` and `existsSync(public file)`, `slide.addImage({ path, x:0, y:0, w: LAYOUT.width, h: LAYOUT.height, objectName: "title-asset:background" })` then a full-slide rect fill `theme.background` with transparency `mood === "dark" ? 38 : 52`, `objectName: "title-rule:asset-veil"`. If the file is missing, skip the image (no throw) and draw a two-stop linear gradient from `background` to `backgroundAccent`.
4. Call the family decorator (below) which **must** create a shape named `title-rule:<family>`.
5. Motifs (independent shapes, not grouped with text):
   - `lent-veil`: tall rounded rect at `x: 0.55, y: 0.9, w: 0.22, h: 5.4`, fill `theme.accent`, name `title-motif:lent-veil`
   - `palm-procession`: chevron/triangle at `x: 11.55, y: 0.55, w: 1.1, h: 1.1`, fill `theme.accent`, name `title-motif:palm`
   - `new-year-blessing`: diamond at `x: 6.45, y: 0.42, w: 0.42, h: 0.42`, fill `theme.accent`, name `title-motif:year-crest`
6. Text (skip empty strings):
   - Church: sans 16–18pt, `theme.muted`, top band
   - Korean: `theme.titleFont` face, `worshipKoFontSize(ko, 72, textWidthInches)`, `theme.title`
   - English: LATIN, `worshipEnFontSize(en, 16, textWidthInches)`, `theme.accent`. If `content.en` is non-empty, draw `title-rule:en-divider` (short line). If `en` is empty, do not draw that divider.
   - Date: `content.koDate` only, sans, `theme.muted`, bottom
   - Subtitle if present, between ko and en
7. Return `true`.

Family geometry (inches, 13.333 × 7.5). Each decorator draws **different** structure so categories do not look cloned:

- `centered-rule`: horizontal line `x: 3.4, y: 1.15, w: 6.5` named `title-rule:centered-rule`. Text centered, `x: 1, w: 11.3`. Title stack vertically centered (~y 2.4).
- `double-frame`: two rect outlines inset 0.38 and 0.52, outer named `title-rule:double-frame`. Text centered inside.
- `side-band`: left rect `x:0,y:0,w:0.42,h:7.5` named `title-rule:side-band`. Text left-aligned `x: 0.95, w: 11.2`, `align: "left"`.
- `horizon-split`: bottom band rect `x:0,y:5.55,w:13.333,h:1.95` named `title-rule:horizon-split`. Title in upper 5.55; church+date in the band.
- `emblem-crest`: top-center short line `x: 5.4, y: 1.05, w: 2.5` named `title-rule:emblem-crest` plus optional diamond already listed for blessing. Text centered below.
- `veil-panel`: full-height rect `x: 2.4, y: 0, w: 8.5, h: 7.5`, fill `theme.background` transparency 30, name `title-rule:veil-panel`. Text centered in the panel (`x: 2.7, w: 7.9`).
- `corner-mark`: two L-strokes (lines) at top-left and bottom-right; the first line objectName `title-rule:corner-mark`. Text centered.

Use `objectName` on every decorative shape. Do not group with text.

- [ ] **Step 4: Dispatch from appendTitleSlide**

In `lib/title-slide.js` `appendTitleSlideWithExtraRenderer`, after resolving `design = normalizeTitleDesign(...)` and `content = buildTitleContent(...)`:

```js
import { findTitleDesign } from "./title-slide-design-catalog.js";
import { appendCatalogTitleSlide } from "./title-slide-catalog-render.js";

const catalogDesign = findTitleDesign(design);
if (catalogDesign && catalogDesign.layoutFamily !== "legacy") {
  if (!appendCatalogTitleSlide(pptx, catalogDesign, content)) {
    addChapelSlide(pptx, content);
  }
  return;
}
```

Keep the existing editorial/glow/chapel/extraRenderer fallback **after** this, so thanksgiving and other legacy extras still hit `title-slide-extra.js`.

Add a test in `test/title-slide-catalog-render.test.js`:

```js
it("appendTitleSlide uses the catalog path for new ids", async () => {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendTitleSlide(pptx, {
    titleDesign: "lent-ashes",
    titleKo: "주일예배",
    titleEn: "LENT",
    churchName: "시드니 삼일교회",
    serviceDate: "2026-09-13",
  });
  const xml = new AdmZip(await pptx.write({ outputType: "nodebuffer" })).readAsText(
    "ppt/slides/slide1.xml"
  );
  assert.ok(names(xml).includes("title-rule:centered-rule"));
  assert.match(xml, /주일예배/);
});
```

- [ ] **Step 5: Run renderer + extra + original title tests**

Run:

```bash
node --test test/title-slide-catalog-render.test.js test/title-slide-extra.test.js test/title-slide.test.js
```

Expected: PASS. Extra tests still cover thanksgiving motifs. Original three geometry tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/title-slide-catalog-render.js lib/title-slide.js test/title-slide-catalog-render.test.js
git commit -m "$(cat <<'EOF'
feat: render new Sunday title catalog families

Dispatch non-legacy catalog designs through dedicated layout families with named rules.
EOF
)"
```

---

### Task 4: Chip picker and family previews

**Files:**
- Modify: `public/index.html` — `#titleSlideSettings` design panel
- Modify: `public/app.js`
- Modify: `public/main.jsx`
- Modify: `public/styles.css` (chip count is just text; reuse `.custom-title-category-group` / `.custom-title-category-button`)
- Modify: `test/title-slide-ui.test.js`

**Interfaces:**
- Consumes: `window.TitleSlideDesignCatalog` (same exports as Task 1)
- Produces: `initializeTitleDesignPicker`, `filterTitleDesignCategory` (auto-select first card when current id is not in category), thanksgiving open state

- [ ] **Step 1: Rewrite UI source tests**

In `test/title-slide-ui.test.js` replace “shows all twelve design cards…” with:

```js
it("hosts an empty category chip group and design grid for catalog rendering", () => {
  assert.match(html, /id="titleDesignCategoryGroup"/);
  assert.match(html, /id="titleDesignGrid"/);
  assert.equal([...html.matchAll(/data-title-design="/g)].length, 0);
  const select = html.match(/<select id="titleDesign"[\s\S]*?<\/select>/)?.[0];
  assert.ok(select);
  assert.equal([...select.matchAll(/<option /g)].length, 0);
});

it("exposes the title design catalog on window", () => {
  assert.match(main, /window\.TitleSlideDesignCatalog\s*=/);
});

it("does not render a thanksgiving card", () => {
  assert.doesNotMatch(app, /data-title-design="thanksgiving"/);
  assert.doesNotMatch(html, /thanksgiving/);
});
```

Keep the title/date field tests. Add:

```js
it("selects the first card when switching to a category that does not contain the current design", () => {
  const src = functionSource("filterTitleDesignCategory");
  assert.match(src, /listTitleDesignsByCategory/);
  assert.match(src, /first/);
});
```

If `functionSource` cannot see inner helpers, assert on `setupTitleDesignPicker` / `filterTitleDesignCategory` names present in `app.js` and that `filterTitleDesignCategory` assigns `designSelect.value` from `designs[0].id` when `!designs.some(d => d.id === designSelect.value)`.

```js
it("opens thanksgiving records on the default chip with no selected card", () => {
  const src = functionSource("initializeTitleDesignPicker");
  assert.match(src, /thanksgiving/);
  assert.match(src, /default/);
});
```

- [ ] **Step 2: Run UI tests and confirm they fail**

Run: `node --test test/title-slide-ui.test.js`

Expected: FAIL (still has hardcoded `data-title-design` cards including thanksgiving)

- [ ] **Step 3: Wire HTML, main.jsx, and picker JS**

`public/main.jsx`:

```js
import * as titleSlideDesignCatalog from "@lib/title-slide-design-catalog.js";
window.TitleSlideDesignCatalog = titleSlideDesignCatalog;
```

Keep `window.TitleSlideText`.

`public/index.html` inside `#titleSlideSettings` design panel: remove every hardcoded `theme-option-card` and every `<option>` under `#titleDesign`. Structure:

```html
<div class="rte-panel-label">디자인</div>
<div class="rte-panel-body">
  <div id="titleDesignCategoryGroup" class="custom-title-category-group" role="toolbar" aria-label="타이틀 디자인 카테고리"></div>
  <div class="theme-option-grid" id="titleDesignGrid" role="list" aria-label="타이틀 디자인 목록"></div>
  <select id="titleDesign" class="hidden-select"></select>
</div>
```

In `public/app.js`, add `titleSlideCatalogApi()` reading `window.TitleSlideDesignCatalog`.

`createTitleDesignCard(design, selectedId)`: `button.theme-option-card` with `data-title-design`, preview node from `buildTitleSlidePreview` (or a compact thumbnail using family CSS), `strong` name + `small` description.

`initializeTitleDesignPicker(categoryGroup, designGrid, designSelect, value)`:

- `const api = titleSlideCatalogApi()`
- If `value === "thanksgiving"` (before normalize-to-chapel): fill chips with all categories, mark **default** chip `is-active`, leave `designSelect.value = "thanksgiving"`, render default category cards with **no** `is-active`, return `"thanksgiving"`.
- Else `selectedId = api.normalizeTitleDesignId(value)`, category = `findTitleDesignCategory(selectedId)` or default.
- Chip label: `` `${category.name} ${list.length}` `` e.g. `기본 3`.
- Populate `#titleDesign` options from **full** `TITLE_SLIDE_DESIGN_IDS` plus a thanksgiving option **only if** current value is thanksgiving (so the select can hold it). Do not add thanksgiving otherwise.
- Render cards for the active category.

`filterTitleDesignCategory(...)`:

```js
const designs = api.listTitleDesignsByCategory(categoryId);
// update chip is-active
designGrid.replaceChildren(...designs.map((d) => createTitleDesignCard(d, designSelect.value)));
const current = designSelect.value;
if (!designs.some((d) => d.id === current)) {
  designSelect.value = designs[0].id;
  // re-sync is-active on cards
  render();
  refreshDirty();
} else {
  // only replace grid
}
```

Call `render`/`refreshDirty` from the chip click handler when the selected design changes.

`populateEditor` for title slides: pass `slide.titleDesign` into `initializeTitleDesignPicker` (including raw `thanksgiving`).

Do **not** change `suggestSeasonLabel` handlers to touch chips.

Preview: extend `buildTitleSlidePreview` with a `buildCatalogFamilyPreview(design, content, width)` that positions church/ko/en/date using the same family alignment (center vs left vs bottom band). Use `design.theme` colors as CSS. If `design.asset`, set `background-image: url(/${asset.path})`. Neutral fallback: `#222` background + `theme.title` text.

- [ ] **Step 4: Re-run UI tests**

Run: `node --test test/title-slide-ui.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/main.jsx public/styles.css test/title-slide-ui.test.js
git commit -m "$(cat <<'EOF'
feat: filter Sunday title designs with category chips

Render catalog cards per category and keep thanksgiving off the picker.
EOF
)"
```

---

### Task 5: Full suite and regressions

**Files:**
- Modify: only test assertions that still hard-code 12 title designs (`test/export-media-integrity.test.js` or similar)

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: green `npm test` aside from the pre-existing macOS `custom-slide-assets` failure; `npm run build` succeeds

- [ ] **Step 1: Hunt remaining length-12 assertions**

```bash
rg -n "TITLE_DESIGNS|data-title-design|thanksgiving|twelve|12종" test public/index.html lib/title-slide-text.js
```

Update export loops to use `TITLE_DESIGNS` (28) or picker IDs (27) as appropriate. Thanksgiving must still be in extra tests.

- [ ] **Step 2: Run the full test command**

Run: `npm test`

Expected: same baseline as this branch after merge, plus all new tests PASS. Do not treat the known `custom-slide-assets` Windows-path failure as this feature’s bug.

- [ ] **Step 3: Production build**

Run: `npm run build`

Expected: exit 0

- [ ] **Step 4: Commit any test-only fixes**

If Step 1 changed files:

```bash
git add test
git commit -m "$(cat <<'EOF'
test: cover all Sunday catalog title designs in export loops

Keep hidden thanksgiving in renderer coverage without putting it on the picker.
EOF
)"
```

If nothing changed, skip the commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| 9 categories, no barley-harvest, advent present | 1 |
| 3 cards each, 27 picker IDs, names/families | 1 |
| Hidden thanksgiving normalize/render, no picker card | 1, 2, 3 extra path, 4 |
| Shared some custom-title assets, safe paths | 1, 3 |
| Legacy pixels untouched | 3 dispatch; extra.js unmodified |
| Family renderer, named rules/motifs, motif limits | 3 |
| Missing asset does not throw | 3 |
| Empty en hides en divider; empty date omits date | 3 |
| No new slide fields | (none added) |
| Chip UI, count label, first-card-on-switch | 4 |
| Thanksgiving opens default chip, no card selected | 4 |
| Season suggest does not change design | 4 (handlers unchanged) |
| TITLE_DESIGNS 27+thanksgiving, defaultTitleEn | 2 |
| npm test / build | 5 |
