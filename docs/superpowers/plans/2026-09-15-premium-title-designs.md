# Premium Title Designs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three balanced, high-end Sunday-worship title designs to the `기타` category using deep black, cobalt, and terracotta palettes with three new layouts.

**Architecture:** Extend the browser-safe shared geometry module with three composition families, then consume those definitions from both the PPTX renderer and browser preview. Keep catalog metadata declarative and avoid new image assets.

**Tech Stack:** JavaScript ES modules, Node test runner, PptxGenJS, Vite

## Global Constraints

- Add exactly three designs to the Sunday-worship `premium` category.
- Use the approved names `블랙 리저브`, `코발트 포털`, and `테라코타 에디션`.
- Use the new layout IDs `gallery-rail`, `portal-offset`, and `editorial-index`.
- Keep PPT and browser-preview geometry in `lib/title-slide-layout.js`.
- Add no image assets or dependencies.
- Preserve balanced rendering when subtitle, English title, church name, or date is absent.

---

### Task 1: Catalog Metadata

**Files:**
- Modify: `test/title-slide-design-catalog.test.js`
- Modify: `test/title-slide.test.js`
- Modify: `lib/title-slide-design-catalog.js`

**Interfaces:**
- Produces: catalog IDs `black-reserve`, `cobalt-portal`, `terracotta-edition`
- Produces: layout family strings consumed by the shared renderer

- [ ] **Step 1: Write the failing catalog test**

Extend `EXPECTED_NAMES.premium`, `EXPECTED_FAMILIES`, and the expected picker count:

```javascript
premium: [
  "미드나잇 슬랩", "슬레이트 스플릿", "딥 포그",
  "페이퍼 화이트", "세이지 코트", "앰버 아치",
  "블랙 리저브", "코발트 포털", "테라코타 에디션",
]

"black-reserve": "gallery-rail",
"cobalt-portal": "portal-offset",
"terracotta-edition": "editorial-index",
```

Assert 50 picker designs and 51 accepted designs including hidden Thanksgiving.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/title-slide-design-catalog.test.js test/title-slide.test.js
```

Expected: FAIL because the three catalog entries and families do not exist.

- [ ] **Step 3: Add minimal catalog entries**

Append three `design(...)` calls to `DESIGNS_BY_CATEGORY.premium` with the approved palettes:

```javascript
design("black-reserve", "블랙 리저브", "딥블랙 여백과 하단 정보 레일", "gallery-rail",
  palette("dark", "serif", "030303", "111214", "F6F1E8", "B69A68", "45484D", "AAA49A"))
design("cobalt-portal", "코발트 포털", "코발트 문과 균형 잡힌 비대칭", "portal-offset",
  palette("dark", "sans", "102A68", "2457C5", "FFF8E8", "83B8FF", "AFCBFF", "D9E4F5"))
design("terracotta-edition", "테라코타 에디션", "크림 지면과 테라코타 인덱스", "editorial-index",
  palette("light", "serif", "F5EBDD", "D77A5B", "7D3025", "A65A3F", "B88768", "71584B"))
```

Add the three family IDs to `TITLE_SLIDE_LAYOUT_FAMILIES`.

- [ ] **Step 4: Verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 2: Shared Geometry and Content Zones

**Files:**
- Create: `test/title-slide-layout.test.js`
- Modify: `lib/title-slide-layout.js`

**Interfaces:**
- Produces: `GALLERY_RAIL`, `PORTAL`, and `EDITORIAL_INDEX` geometry constants
- Produces: compositions and zone blocks returned by `titleSlideComposition`, `titleSlideStack`, and `titleSlideZoneStack`

- [ ] **Step 1: Write failing geometry tests**

Import the shared APIs and assert:

```javascript
assert.equal(titleSlideComposition("gallery-rail").zone, "rail");
assert.equal(titleSlideComposition("portal-offset").zone, "portal");
assert.equal(titleSlideComposition("editorial-index").zone, "index");
assert.deepEqual(
  titleSlideZoneStack("gallery-rail", content).map(({ kind }) => kind),
  ["church", "date"]
);
```

Also assert every stack block fits inside its composition bounds for full, long-title, and minimal content.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/title-slide-layout.test.js
```

Expected: FAIL because the new compositions and zones are absent.

- [ ] **Step 3: Implement shared geometry**

Add exact geometry constants and compositions. `gallery-rail` centers title copy in the upper-middle with edge church/date slots; `portal-offset` centers copy between unequal side portals and places church/date in opposite side slots; `editorial-index` left-aligns copy in a broad content column and places church/date in the narrow index.

Update `titleSlideZoneStack` to return placed `church` and `date` blocks for `rail`, `portal`, and `index`. Keep all returned coordinates within the 13.333 × 7.5 slide.

- [ ] **Step 4: Verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 3: PPT and Browser Rendering

**Files:**
- Modify: `test/title-slide-extra.test.js`
- Modify: `test/title-slide-ui.test.js`
- Modify: `lib/title-slide-catalog-render.js`
- Modify: `public/app.js`

**Interfaces:**
- Consumes: shared geometry and zone IDs from Task 2
- Produces: named PPT shapes and equivalent HTML/CSS preview decorations

- [ ] **Step 1: Write failing renderer tests**

Render all three design IDs and assert their named rules exist:

```javascript
const expected = {
  "black-reserve": "title-rule:gallery-rail",
  "cobalt-portal": "title-rule:portal-offset",
  "terracotta-edition": "title-rule:editorial-index",
};
```

Assert each slide contains all five text objects when full content is supplied and omits optional text when absent. Extend the UI source test to require the new geometry constants and zone identifiers.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/title-slide-extra.test.js test/title-slide-ui.test.js
```

Expected: FAIL because decorations and zone routing are not implemented.

- [ ] **Step 3: Implement PPT decorations and zones**

In `addFamilyDecoration`, draw:

- `gallery-rail`: one short bronze lower rail plus a subtle endpoint.
- `portal-offset`: two unequal translucent vertical portal planes without enclosing the title in a box.
- `editorial-index`: a terracotta side index plane and one short divider.

Update `addZoneCopy` to position church/date using each zone block’s own `x`, `w`, and `align` values.

- [ ] **Step 4: Implement matching browser preview**

Mirror the three decorations in `buildCatalogFamilyDecoration`. Route `rail`, `portal`, and `index` through `titleSlideZoneStack`, preserving each block’s own placement options.

- [ ] **Step 5: Verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 4: Visual and Full Verification

**Files:**
- Modify only if visual inspection reveals a concrete imbalance

**Interfaces:**
- Consumes: completed catalog, geometry, PPT renderer, and preview renderer
- Produces: verified implementation ready to push

- [ ] **Step 1: Render visual variants**

Generate PPT and preview screenshots for all three designs with full content, a long Korean/English title, and minimal content. Convert PPT through LibreOffice and `pdftoppm`.

- [ ] **Step 2: Inspect balance**

Confirm no clipping, title overlap, excessive one-sided whitespace, accidental text boxes, or mismatch between PPT and picker preview. If a defect is found, add a failing regression test before changing production code.

- [ ] **Step 3: Run full verification**

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, Vite exits 0, and `git diff --check` prints nothing.

- [ ] **Step 4: Commit and push**

```bash
git add lib public test docs/superpowers/plans/2026-09-15-premium-title-designs.md
git commit -m "feat: expand Sunday title design catalog"
git push origin main
```

Expected: `origin/main` advances to the new implementation commit.
