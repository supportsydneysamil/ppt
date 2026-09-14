# Sunday Worship Title Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Sunday-worship title slides edit Korean/English headlines and date (manual default = today), keep the original three looks at default values, and add nine extra designs.

**Architecture:** Resolve title text, date mode, and visibility in small helpers. Existing chapel/editorial/glow renderers stay in `lib/title-slide.js` and read resolved `ko`/`en`/`koDate` instead of literals. Nine new designs live in `lib/title-slide-extra.js` with named motif/rule shapes. The editor persists the new fields through drafts, templates, preview, and PPTX.

**Tech Stack:** Node.js ES modules, PptxGenJS, vanilla HTML/CSS/JavaScript, Node test runner, Vite.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-14-title-slide-customize-design.md`
- Allowed `titleDesign` IDs in this order: `chapel`, `editorial`, `glow`, `easter-dawn`, `easter-stained`, `christmas-burgundy`, `christmas-evergreen`, `thanksgiving`, `advent`, `midnight-slab`, `slate-split`, `deep-fog`
- Unknown `titleDesign` → `chapel`
- `dateMode` allowed: `custom`, `today`, `next-sunday`; unknown or missing → `custom`
- `showDate` missing → `true`; only `false` hides date
- `titleKo`/`titleEn`: non-string/`null`/missing → theme original; `""` after trim → hide that line; other strings → draw as-is
- New slide defaults: `titleKo: "주일예배"`, `titleEn: "SUNDAY WORSHIP"`, `dateMode: "custom"`, `showDate: true`, `serviceDate: todayIsoDate()`
- Original three palettes, coordinates, typefaces, and chapel/glow default copy must match current output for legacy records (no title keys)
- Seasonal motifs use independent shapes named `title-motif:…`; dark themes have no `title-motif:` shapes; composition lines use `title-rule:…`
- Out of scope: `custom-title`, hymn/scripture `titleThemeId`, scripture body themes
- Implementation must occur in an isolated git worktree

## File map

- `lib/title-slide-date.js` — date mode normalize/resolve
- `lib/title-slide.js` — design list, title-line resolve, original three renderers, `appendTitleSlide` dispatch
- `lib/title-slide-extra.js` — nine new PPTX designs
- `lib/slide-record.js` — persist new fields without collapsing missing titles to `""`
- `public/index.html`, `public/styles.css`, `public/app.js` — editor, preview
- `server.js` — fill missing `serviceDate` with `todayIsoDate()` before render
- Tests beside each unit

---

### Task 1: Date mode helpers

**Files:**
- Modify: `lib/title-slide-date.js`
- Test: `test/title-slide-date.test.js`

**Interfaces:**
- Consumes: existing `todayIsoDate`, `upcomingSundays`
- Produces: `DATE_MODES = ["custom", "today", "next-sunday"]`, `normalizeDateMode(value)`, `resolveServiceDate(mode, storedIso, todayIso)`

- [ ] **Step 1: Write failing tests**

Append to `test/title-slide-date.test.js`:

```js
import {
  normalizeDateMode,
  resolveServiceDate,
} from "../lib/title-slide-date.js";

describe("normalizeDateMode", () => {
  it("keeps known modes and falls back to custom", () => {
    assert.equal(normalizeDateMode("today"), "today");
    assert.equal(normalizeDateMode("next-sunday"), "next-sunday");
    assert.equal(normalizeDateMode("custom"), "custom");
    assert.equal(normalizeDateMode("nope"), "custom");
    assert.equal(normalizeDateMode(undefined), "custom");
  });
});

describe("resolveServiceDate", () => {
  it("uses stored date for custom, or today when stored is empty", () => {
    assert.equal(resolveServiceDate("custom", "2026-09-10", "2026-09-14"), "2026-09-10");
    assert.equal(resolveServiceDate("custom", "", "2026-09-14"), "2026-09-14");
  });

  it("uses the provided today for today mode", () => {
    assert.equal(resolveServiceDate("today", "2026-01-01", "2026-09-14"), "2026-09-14");
  });

  it("uses today when it is Sunday, otherwise the next Sunday", () => {
    assert.equal(resolveServiceDate("next-sunday", "", "2026-09-13"), "2026-09-13");
    assert.equal(resolveServiceDate("next-sunday", "", "2026-09-16"), "2026-09-20");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/title-slide-date.test.js`

Expected: FAIL because `normalizeDateMode` / `resolveServiceDate` are not exported.

- [ ] **Step 3: Implement**

In `lib/title-slide-date.js`:

```js
export const DATE_MODES = ["custom", "today", "next-sunday"];

export function normalizeDateMode(value) {
  return DATE_MODES.includes(value) ? value : "custom";
}

export function resolveServiceDate(mode, storedIso, todayIso) {
  const today = todayIso || todayIsoDate();
  const normalized = normalizeDateMode(mode);
  if (normalized === "today") {
    return today;
  }
  if (normalized === "next-sunday") {
    return upcomingSundays(1, today)[0] || today;
  }
  const stored = typeof storedIso === "string" ? storedIso.trim() : "";
  return parseIsoDate(stored) ? stored : today;
}
```

Export `parseIsoDate` is currently file-private; either keep using `formatServiceDateKo(stored)` emptiness or export a tiny `isIsoDate` that wraps `parseIsoDate`. Prefer calling `parseIsoDate` from `resolveServiceDate` in the same file (no export needed).

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test test/title-slide-date.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/title-slide-date.js test/title-slide-date.test.js
git commit -m "feat: resolve title slide date modes"
```

---

### Task 2: Title line resolution and original three renderers

**Files:**
- Modify: `lib/title-slide.js`
- Test: `test/title-slide.test.js`

**Interfaces:**
- Consumes: `formatServiceDateKo`, `formatServiceDateEn`, `todayIsoDate` from `lib/title-slide-date.js`
- Produces: `TITLE_DESIGNS` (12 ids), `normalizeTitleDesign(value)`, `defaultTitleKo()`, `defaultTitleEn(design)`, `resolveTitleLine(value, fallback)`, `buildTitleContent(slide)`, `appendTitleSlide(pptx, slide)` still public. Extra designs may no-op until Task 4, but `normalizeTitleDesign("advent")` must return `"advent"`.

- [ ] **Step 1: Write failing tests**

Create `test/title-slide.test.js` using the same XML helpers as `test/custom-title-slide.test.js` (`AdmZip`, `shapeWithText`, `textMetrics`).

```js
import { appendTitleSlide, TITLE_DESIGNS, normalizeTitleDesign, buildTitleContent } from "../lib/title-slide.js";

assert.deepEqual(TITLE_DESIGNS, [
  "chapel", "editorial", "glow",
  "easter-dawn", "easter-stained",
  "christmas-burgundy", "christmas-evergreen",
  "thanksgiving", "advent",
  "midnight-slab", "slate-split", "deep-fog",
]);
assert.equal(normalizeTitleDesign("unknown"), "chapel");
assert.equal(normalizeTitleDesign("advent"), "advent");

const legacyChapel = buildTitleContent({
  titleDesign: "chapel",
  churchName: "시드니 삼일교회",
  serviceDate: "2026-09-13",
  titleSubtitle: "",
});
assert.equal(legacyChapel.ko, "주일예배");
assert.equal(legacyChapel.en, "SUNDAY WORSHIP");
assert.equal(legacyChapel.koDate, "2026년 9월 13일 주일");

assert.equal(
  buildTitleContent({ titleDesign: "editorial" }).en,
  "SUNDAY WORSHIP SERVICE"
);
assert.equal(
  buildTitleContent({ titleDesign: "easter-dawn" }).en,
  "EASTER SUNDAY"
);
assert.equal(buildTitleContent({ titleKo: "", titleEn: "X" }).ko, "");
assert.equal(
  buildTitleContent({
    titleKo: " 성찬예배 ",
    titleEn: " HOLY COMMUNION ",
    titleDesign: "chapel",
  }).ko,
  "성찬예배"
);
assert.equal(buildTitleContent({ showDate: false, serviceDate: "2026-09-13" }).koDate, "");
assert.equal(buildTitleContent({ serviceDate: "nope" }).koDate, "");
```

Render tests:

```js
async function render(slide) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendTitleSlide(pptx, slide);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return new AdmZip(buffer).readAsText("ppt/slides/slide1.xml");
}

const xml = await render({
  titleDesign: "chapel",
  churchName: "시드니 삼일교회",
  serviceDate: "2026-09-13",
});
assert.match(xml, /주일예배/);
assert.match(xml, /SUNDAY WORSHIP/);
assert.doesNotMatch(xml, /성찬예배/);

const custom = await render({
  titleDesign: "chapel",
  titleKo: "성찬예배",
  titleEn: "",
  churchName: "시드니 삼일교회",
  serviceDate: "2026-09-13",
});
assert.match(custom, /성찬예배/);
assert.doesNotMatch(custom, /주일예배/);
assert.doesNotMatch(custom, /SUNDAY WORSHIP/);

const glowDefault = await render({
  titleDesign: "glow",
  churchName: "A",
  serviceDate: "2026-09-13",
});
assert.equal((glowDefault.match(/<a:t>주<\/a:t>/g) || []).length, 1);
assert.equal((glowDefault.match(/<a:t>배<\/a:t>/g) || []).length, 1);

const glowCustom = await render({
  titleDesign: "glow",
  titleKo: "성찬",
  churchName: "A",
  serviceDate: "2026-09-13",
});
assert.match(glowCustom, /<a:t>성찬<\/a:t>/);
assert.doesNotMatch(glowCustom, /<a:t>주<\/a:t>/);
```

Editorial legacy must contain `SUNDAY WORSHIP SERVICE`. Editorial with `titleEn: "SUNDAY WORSHIP"` must not contain `SERVICE`.

Chapel default Korean box stays 96pt (`sz="9600"`). A 10-character `titleKo` must use a smaller `sz`.

Missing `serviceDate` on render: `buildTitleContent({})` uses `todayIsoDate()` for dates when `showDate` is true.

Until Task 4, `appendTitleSlide` for extra IDs may still draw chapel; tests in this task only cover chapel/editorial/glow. `normalizeTitleDesign` and `buildTitleContent` must still know extra IDs for default English.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/title-slide.test.js`

Expected: FAIL (file missing `buildTitleContent` / 12 designs / custom copy).

- [ ] **Step 3: Implement resolution and wire original renderers**

In `lib/title-slide.js`:

```js
export const TITLE_DESIGNS = [
  "chapel",
  "editorial",
  "glow",
  "easter-dawn",
  "easter-stained",
  "christmas-burgundy",
  "christmas-evergreen",
  "thanksgiving",
  "advent",
  "midnight-slab",
  "slate-split",
  "deep-fog",
];

export function normalizeTitleDesign(value) {
  return TITLE_DESIGNS.includes(value) ? value : "chapel";
}

export function defaultTitleKo() {
  return "주일예배";
}

export function defaultTitleEn(design) {
  const id = normalizeTitleDesign(design);
  if (id === "editorial") return "SUNDAY WORSHIP SERVICE";
  if (id === "easter-dawn" || id === "easter-stained") return "EASTER SUNDAY";
  if (id === "christmas-burgundy" || id === "christmas-evergreen") {
    return "CHRISTMAS WORSHIP";
  }
  if (id === "thanksgiving") return "THANKSGIVING";
  if (id === "advent") return "ADVENT SUNDAY";
  return "SUNDAY WORSHIP";
}

export function resolveTitleLine(value, fallback) {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export function worshipKoFontSize(text, base) {
  const length = [...(text || "").trim()].length;
  if (length <= 4) return base;
  if (length <= 6) return Math.round(base * 0.82);
  if (length <= 9) return Math.round(base * 0.68);
  if (length <= 13) return Math.round(base * 0.54);
  return Math.round(base * 0.42);
}

export function worshipEnFontSize(text, base) {
  const length = (text || "").trim().length;
  if (length <= 16) return base;
  if (length <= 28) return Math.max(11, base - 2);
  return Math.max(10, base - 4);
}

export function buildTitleContent(slide) {
  const design = normalizeTitleDesign(slide?.titleDesign);
  const iso =
    typeof slide?.serviceDate === "string" && slide.serviceDate.trim()
      ? slide.serviceDate.trim()
      : todayIsoDate();
  const showDate = slide?.showDate !== false;
  const ko = resolveTitleLine(slide?.titleKo, defaultTitleKo());
  const en = resolveTitleLine(slide?.titleEn, defaultTitleEn(design));
  return {
    church: (slide?.churchName || "").trim(),
    subtitle: (slide?.titleSubtitle || "").trim(),
    ko,
    en,
    koDate: showDate ? formatServiceDateKo(iso) : "",
    enDate: showDate ? formatServiceDateEn(iso) : "",
  };
}
```

Replace hardcoded `"주일예배"` / `"SUNDAY WORSHIP"` / `"SUNDAY WORSHIP SERVICE"` with `content.ko` / `content.en`. Skip those `addText` calls when the string is empty. Chapel `stackCentered` already drops falsy blocks — wrap the Korean and English items in `content.ko && {…}` and `content.en && {…}`. Editorial/glow keep other coordinates; omit only the missing text (and editorial `DATE`/`koDate`/`enDate` when `!content.koDate`).

Chapel Korean size: `worshipKoFontSize(content.ko, 96)`. Editorial: `worshipKoFontSize(content.ko, 112)`. Glow staggered glyphs only when `content.ko === "주일예배"`. Otherwise if `content.ko`, one `centeredText` at `y: 1.95`, `h: 1.79`, size `worshipKoFontSize(content.ko, 88)`.

Do not change gold colors, inch coordinates, fonts, or chapel corner geometry.

`appendTitleSlide` still only calls the three original adders; extra IDs fall through to chapel until Task 4.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test test/title-slide.test.js test/title-slide-date.test.js test/export-media-integrity.test.js`

Expected: PASS. Integrity test loops `TITLE_DESIGNS` (now 12). Extra IDs currently render as chapel, which still produces a valid slide.

- [ ] **Step 5: Commit**

```bash
git add lib/title-slide.js test/title-slide.test.js
git commit -m "feat: customize original worship title copy"
```

---

### Task 3: Persist title fields without erasing legacy copy

**Files:**
- Modify: `lib/slide-record.js`
- Test: `test/slide-record.test.js`

**Interfaces:**
- Consumes: none from title modules (avoid pulling PPTX into sanitize)
- Produces: sanitized fields `titleKo`, `titleEn` (`string | null`), `dateMode`, `showDate`, plus existing `titleDesign`, `churchName`, `serviceDate`, `titleSubtitle`

- [ ] **Step 1: Write failing tests**

In `test/slide-record.test.js`:

```js
await t.test("keeps missing worship titles unset instead of empty", () => {
  const sanitized = sanitizeSlideForTemplate({
    id: "x",
    type: "title",
    titleDesign: "chapel",
    churchName: "삼일",
    serviceDate: "2026-09-20",
  });
  assert.equal(sanitized.titleKo, null);
  assert.equal(sanitized.titleEn, null);
  assert.equal(sanitized.dateMode, "custom");
  assert.equal(sanitized.showDate, true);
});

await t.test("preserves blank worship titles as hide sentinels", () => {
  const sanitized = sanitizeSlideForTemplate({
    id: "x",
    type: "title",
    titleKo: "",
    titleEn: "  ",
    dateMode: "today",
    showDate: false,
  });
  assert.equal(sanitized.titleKo, "");
  assert.equal(sanitized.titleEn, "");
  assert.equal(sanitized.dateMode, "today");
  assert.equal(sanitized.showDate, false);
});

await t.test("keeps explicit worship titles", () => {
  const sanitized = sanitizeSlideForTemplate({
    id: "x",
    titleKo: " 성찬예배 ",
    titleEn: "HOLY COMMUNION",
    dateMode: "nope",
  });
  assert.equal(sanitized.titleKo, "성찬예배");
  assert.equal(sanitized.titleEn, "HOLY COMMUNION");
  assert.equal(sanitized.dateMode, "custom");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/slide-record.test.js`

Expected: FAIL (fields missing or `""` for unset).

- [ ] **Step 3: Implement sanitize**

```js
function optionalTitleLine(value) {
  if (typeof value !== "string") return null;
  return value.trim();
}

function normalizeStoredDateMode(value) {
  return value === "today" || value === "next-sunday" || value === "custom"
    ? value
    : "custom";
}
```

In `sanitizeSlideForTemplate`:

```js
titleKo: optionalTitleLine(slide.titleKo),
titleEn: optionalTitleLine(slide.titleEn),
dateMode: normalizeStoredDateMode(slide.dateMode),
showDate: slide.showDate !== false,
```

Do not use `slide.titleKo || ""`.

- [ ] **Step 4: Run tests GREEN**

Run: `node --test test/slide-record.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/slide-record.js test/slide-record.test.js
git commit -m "feat: persist worship title and date fields"
```

---

### Task 4: Nine extra PPTX designs

**Files:**
- Create: `lib/title-slide-extra.js`
- Modify: `lib/title-slide.js` (`appendTitleSlide` dispatch)
- Test: `test/title-slide-extra.test.js`
- Test: `test/title-slide.test.js` (dispatch extra IDs away from chapel)

**Interfaces:**
- Consumes: `buildTitleContent` result `{ church, subtitle, ko, en, koDate, enDate }`, `worshipKoFontSize`, `worshipEnFontSize`, layout helpers from `lib/slide-layout.js`
- Produces: `appendExtraTitleSlide(pptx, design, content)` — no-op/false if `design` is chapel/editorial/glow; otherwise adds one slide and returns true

- [ ] **Step 1: Write failing tests**

```js
import { appendTitleSlide } from "../lib/title-slide.js";

function motifNames(slideXml) {
  return Array.from(parse(slideXml).getElementsByTagName("p:cNvPr"))
    .map((node) => node.getAttribute("name") || "")
    .filter((name) => name.startsWith("title-motif:"));
}

const seasonal = [
  "easter-dawn", "easter-stained",
  "christmas-burgundy", "christmas-evergreen",
  "thanksgiving", "advent",
];
for (const titleDesign of seasonal) {
  const xml = await render({
    titleDesign,
    titleKo: "주일예배",
    titleEn: "EASTER SUNDAY",
    churchName: "시드니 삼일교회",
    serviceDate: "2026-09-13",
  });
  assert.match(xml, /주일예배/);
  assert.ok(motifNames(xml).length > 0, titleDesign);
  assert.equal((xml.match(/<p:grpSp>/g) || []).length, 0);
}

for (const titleDesign of ["midnight-slab", "slate-split", "deep-fog"]) {
  const xml = await render({
    titleDesign,
    titleKo: "주일예배",
    titleEn: "SUNDAY WORSHIP",
    churchName: "시드니 삼일교회",
    serviceDate: "2026-09-13",
  });
  assert.match(xml, /주일예배/);
  assert.equal(motifNames(xml).length, 0, titleDesign);
  assert.match(xml, /title-rule:/);
}

const hidden = await render({
  titleDesign: "midnight-slab",
  titleKo: "",
  titleEn: "",
  showDate: false,
  churchName: "시드니 삼일교회",
  serviceDate: "2026-09-13",
});
assert.doesNotMatch(hidden, /주일예배/);
assert.doesNotMatch(hidden, /SUNDAY WORSHIP/);
assert.doesNotMatch(hidden, /2026년/);
```

Assert specific motif names exist:

- `easter-dawn`: `title-motif:sun`, at least one `title-motif:ray-`
- `easter-stained`: `title-motif:arch-outer`, `title-motif:arch-inner`
- `christmas-burgundy`: `title-motif:star-large`
- `christmas-evergreen`: `title-motif:tree-` (at least three), `title-motif:star-small-`
- `thanksgiving`: `title-motif:wheat-left`, `title-motif:wheat-right`
- `advent`: `title-motif:flame`, `title-motif:candle`, `title-motif:week-1` through `week-4`

Dark rules:

- `midnight-slab`: `title-rule:spine`
- `slate-split`: `title-rule:split`
- `deep-fog`: `title-rule:underline`

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/title-slide-extra.test.js`

Expected: FAIL (extra IDs still chapel, no motif names).

- [ ] **Step 3: Implement extra designs and dispatch**

`lib/title-slide-extra.js` exports `appendExtraTitleSlide(pptx, design, content)`.

Every `addShape` / `addText` that is a motif or rule must set `name`. Never `addShape` motifs into a group.

Layout (inches, 13.333×7.5). Skip a text call when its string is empty.

**easter-dawn** — bg `#FFFBF2` → `#F3DCBD` via `addGradientBackground`. `title-motif:sun` ellipse `x:5.55,y:-0.35,w:2.2,h:2.2` fill `#FFF0CD` line none. Seven thin triangles `title-motif:ray-0`… pointing down from the sun, fill `#D6A44A` transparency 82. Church `y:0.58` gold `#9A7B45` 18pt. `ko` `y:1.15,h:1.45` serif 72pt `#4A3617`. Rule `title-rule:divider` width 4.0 y 2.75 color `#B48C4A`. `en` y 2.9 latin 16pt. Horizon `title-rule:horizon` x 1.1 y 6.05 w 11.1. Date y 6.35.

**easter-stained** — glow-like navy/violet gradient. `round2SameRect` outlines `title-motif:arch-outer` `x:3.55,y:0.45,w:6.23,h:6.15` line `#F2C15B` width 1.5 transparency 50 fill none; inner inset 0.42 named `arch-inner`. `ko` centered y 2.35. `en` y 3.95 `#E4D4FF`. Date y 4.55. Church y 6.55 `#C9B8F0`.

**christmas-burgundy** — bg `#2A0F16`. Left bar `title-rule:spine` x 0 y 0 w 0.12 h 7.5 fill `#D9B376`. Star `title-motif:star-large` `pptx.ShapeType.star5` x 8.7 y 1.85 w 3.4 h 3.4 fill `#D9B376` transparency 78. Left stack x 1.15: church, `ko` 72pt `#F7EBDA`, rule width 3.2, `en`, date.

**christmas-evergreen** — bg `#07140C`→`#12301C`. Three small `star4` `title-motif:star-small-0..2`. Five `triangle` trees along the bottom `title-motif:tree-0..4` fill `#07180D` / `#0A2012`. Title stack y 1.4. Date y 5.55 above trees.

**thanksgiving** — bg `#3A2410`→`#1B1108`. Left/right wheat: vertical line `title-motif:wheat-left` / `wheat-right` plus 4 `teardrop` grains each (`title-motif:grain-left-0` …). Center stack.

**advent** — bg `#1A2140`→`#0A0E1A` with radial gold haze image. `title-motif:halo` ellipse. `title-motif:flame` teardrop. `title-motif:candle` roundRect. `ko` y 3.2. Four ellipses y 6.85, x 5.7 + 0.45i, names `title-motif:week-1`…`week-4`, week-1 fill `#A7B8E8`, others transparency 60. Church y 6.35.

**midnight-slab** — bg `#08090B`→`#181C23`. `title-rule:spine` x 1.45 y 1.2 w 0 h 5.1 line `#9AA3AE`. Right-aligned texts x 4.6 w 7.8: church top-left of content area, `ko` 52pt `#F2F4F7`, `en`, date bottom-right.

**slate-split** — left panel rect `title-rule:panel` x 0 y 0 w 4.93 h 7.5 fill `#1C2431`. Split line `title-rule:split` x 4.93. Left column church/`en`/date. Right `ko` x 5.55 y 2.7 w 7.2 50pt.

**deep-fog** — radial grey haze + `#0D1117`. Bottom stack: `en`, `ko`, `title-rule:underline` width 3.4, church and date on one line.

Use `worshipKoFontSize` / `worshipEnFontSize` with each theme’s base size (dawn 72, stained 64, burgundy 68, evergreen 64, thanks 64, advent 64, slab 52, split 50, fog 46).

In `appendTitleSlide`:

```js
export function appendTitleSlide(pptx, slide) {
  const content = buildTitleContent(slide);
  const design = normalizeTitleDesign(slide?.titleDesign);
  if (design === "editorial") {
    addEditorialSlide(pptx, content);
    return;
  }
  if (design === "glow") {
    addGlowSlide(pptx, content);
    return;
  }
  if (design === "chapel") {
    addChapelSlide(pptx, content);
    return;
  }
  appendExtraTitleSlide(pptx, design, content);
}
```

- [ ] **Step 4: Run tests GREEN**

Run: `node --test test/title-slide-extra.test.js test/title-slide.test.js test/export-media-integrity.test.js`

Expected: PASS. Integrity still readable pictures for every `TITLE_DESIGNS` entry (gradients on extra themes).

- [ ] **Step 5: Commit**

```bash
git add lib/title-slide-extra.js lib/title-slide.js test/title-slide-extra.test.js test/title-slide.test.js
git commit -m "feat: add seasonal and dark worship title designs"
```

---

### Task 5: Editor fields, cards, and preview

**Files:**
- Modify: `public/index.html` (titleSlideSettings)
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Modify: `public/main.jsx` only if a new helper must be on `window` (prefer existing `window.TitleSlideDate`)
- Test: `test/title-slide-ui.test.js`

**Interfaces:**
- Consumes: `window.TitleSlideDate.normalizeDateMode`, `resolveServiceDate`, `todayIsoDate`, `upcomingSundays`, `formatServiceDateKo`; title design list duplicated as `TITLE_DESIGNS` in `app.js` matching lib
- Produces: form ids `titleKo`, `titleEn`, `titleShowDate`, `titleDateMode`, date input `titleServiceDate` (`input type="date"` replacing the Sunday-only select)

- [ ] **Step 1: Write failing UI tests** (source-level, like `test/custom-title-subtitle-ui.test.js`)

```js
assert.match(html, /id="titleKo"/);
assert.match(html, /id="titleEn"/);
assert.match(html, /id="titleShowDate"/);
assert.match(html, /id="titleDateMode"/);
assert.match(html, /data-title-design="easter-dawn"/);
assert.match(html, /data-title-design="deep-fog"/);
assert.match(app, /titleKo: "주일예배"/);
assert.match(app, /titleEn: "SUNDAY WORSHIP"/);
assert.match(app, /dateMode: "custom"/);
assert.match(app, /showDate: true/);
assert.match(app, /resolveServiceDate/);
assert.match(app, /titleKoInput\.value/);
assert.match(app, /content\.ko/);
assert.match(app, /function buildEasterDawnPreview/);
assert.match(app, /titleShowDate\.checked/);
```

Assert `ensureTitleServiceDateOptions` is gone or no longer the only date UI; `type="date"` exists.

- [ ] **Step 2: Run RED**

Run: `node --test test/title-slide-ui.test.js`

Expected: FAIL.

- [ ] **Step 3: HTML**

In `public/index.html` inside `#titleSlideSettings`:

Keep the three existing cards. After glow, add nine buttons with `data-title-design` and thumbnail classes:

`title-preview-easter-dawn`, `title-preview-easter-stained`, `title-preview-christmas-burgundy`, `title-preview-christmas-evergreen`, `title-preview-thanksgiving`, `title-preview-advent`, `title-preview-midnight-slab`, `title-preview-slate-split`, `title-preview-deep-fog`.

Hidden select `#titleDesign` gets matching `<option>`s.

예배 정보 rows in spec order. Replace `#titleServiceDate` `<select>` with:

```html
<input id="titleServiceDate" type="date" class="rte-url-input" />
```

Date mode:

```html
<div class="rte-panel-row" id="titleDateMode" role="radiogroup" aria-label="날짜 모드">
  <label><input type="radio" name="titleDateMode" value="next-sunday" /> 다음 주일</label>
  <label><input type="radio" name="titleDateMode" value="today" /> 오늘</label>
  <label><input type="radio" name="titleDateMode" value="custom" checked /> 수동</label>
</div>
```

```html
<label class="rte-panel-row"><span class="rte-row-label">날짜 표시</span>
  <input id="titleShowDate" type="checkbox" checked />
</label>
<input id="titleKo" … placeholder="주일예배" />
<input id="titleEn" … placeholder="SUNDAY WORSHIP" />
```

Hint text: 날짜 기본은 오늘이며 수동으로 바꿀 수 있습니다.

- [ ] **Step 4: CSS**

Add thumbnail styles for the nine new `title-preview-*` classes, distinct enough to match each design (dawn cream, stained violet, burgundy, evergreen, harvest brown, advent navy, slab charcoal, split panel, fog). Do not restyle chapel/editorial/glow thumbnails.

- [ ] **Step 5: app.js wiring**

Expose date helpers already on `window.TitleSlideDate`. Duplicate `TITLE_DESIGNS` and `normalizeTitleDesign` to the 12 ids.

Add `defaultTitleEn(design)` copy of lib (keep in sync).

```js
function resolveTitlePreviewKo(data) {
  const api = /* inline same as lib */;
}
```

Do not import from `lib/title-slide.js` into the browser bundle unless Vite already aliases `@lib` (it does for date). Prefer adding `resolveTitleLine` / `defaultTitleEn` to a tiny `lib/title-slide-text.js` used by both `title-slide.js` and `main.jsx` → `window.TitleSlideText`. If that split is smaller than duplicating, do the split in this task and re-export from `lib/title-slide.js`.

**Preferred split** if duplication starts: move `TITLE_DESIGNS`, `normalizeTitleDesign`, `defaultTitleKo`, `defaultTitleEn`, `resolveTitleLine`, `worshipKoFontSize`, `worshipEnFontSize` into `lib/title-slide-text.js`. Update `main.jsx`:

```js
import * as titleSlideText from "@lib/title-slide-text.js";
window.TitleSlideText = titleSlideText;
```

Then `title-slide.js` imports from there. This is in-scope for this task.

`collectTitleSlideData`:

```js
function selectedDateMode() {
  const checked = document.querySelector('input[name="titleDateMode"]:checked');
  return titleDateApi().normalizeDateMode(checked && checked.value);
}

function collectTitleSlideData() {
  const api = titleDateApi();
  const dateMode = selectedDateMode();
  const typed = titleServiceDateInput.value;
  const serviceDate = api.resolveServiceDate(dateMode, typed, api.todayIsoDate());
  return {
    titleDesign: normalizeTitleDesign(titleDesignSelect.value),
    churchName: titleChurchNameInput.value.trim(),
    titleKo: titleKoInput.value,
    titleEn: titleEnInput.value,
    titleSubtitle: titleSubtitleInput.value.trim(),
    dateMode,
    showDate: titleShowDate.checked,
    serviceDate,
  };
}
```

Do not `.trim()` in collect if that would turn a field the user is mid-editing into hide on save of another field — trim on save is OK; collect should `titleKoInput.value` and let sanitize trim. Use `.trim()` on save path only; collect may trim for preview consistency. Spec: trim empty means hide — trimming in collect is correct.

Populate editor: if `slide.titleKo == null` show `주일예배`; if `""` show empty. Same for En using `defaultTitleEn(design)` when null.

New slide defaults in `appendNewSlide` and any `titleKo: ""` seed: set the five new fields.

When date mode radio changes, set `titleServiceDateInput.value` from `resolveServiceDate`. When date input changes, set radio to `custom`.

`buildTitleSlidePreview` uses resolved ko/en/dates; chapel/editorial/glow builders take `content.ko`/`content.en` not literals. Add preview builders for the nine extras approximating PPTX (motifs as CSS shapes, not images).

Season suggest still uses the date input value.

Download JSON already spreads `collectTitleSlideData` via slide fields; add `titleKo`, `titleEn`, `dateMode`, `showDate` to `serializeSlide`/`clone` object around `titleSubtitle`.

- [ ] **Step 6: Server missing date**

In `server.js` `create-title-slide-pptx` and bundled title export, if `!req.body.serviceDate` set `serviceDate: todayIsoDate()`.

- [ ] **Step 7: Tests + build**

Run: `node --test test/title-slide-ui.test.js test/title-slide.test.js test/slide-record.test.js && npm run build`

Expected: PASS, Vite 0.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/styles.css public/app.js public/main.jsx lib/title-slide-text.js lib/title-slide.js server.js test/title-slide-ui.test.js
git commit -m "feat: add worship title editor fields and extra previews"
```

Only add `lib/title-slide-text.js` and `main.jsx` if the split was used.

---

### Task 6: Full regression

**Files:** verify only

- [ ] **Step 1: Targeted tests**

```bash
node --test \
  test/title-slide-date.test.js \
  test/title-slide.test.js \
  test/title-slide-extra.test.js \
  test/title-slide-ui.test.js \
  test/slide-record.test.js \
  test/export-media-integrity.test.js
```

Expected: PASS, zero failures.

- [ ] **Step 2: Full suite and build**

Run: `npm test && npm run build`

Expected: exit 0.

- [ ] **Step 3: Diff hygiene**

```bash
git status --short
git diff --check
git log --oneline --decorate -8
```

Expected: no leftover debug, no accidental `data/templates.json` unless the user asked.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Editable ko/en, empty hides, null = original | 2, 3, 5 |
| dateMode custom default, today initial | 1, 5 |
| next-sunday includes today if Sunday | 1 |
| showDate toggle | 2, 5 |
| Original 3 look at defaults / legacy | 2 |
| Glow stagger only for 주일예배 | 2 |
| 12 design IDs and cards | 2, 4, 5 |
| Extra 9 layouts + named motifs/rules | 4, 5 |
| Persist without `\|\| ""` on titles | 3 |
| Preview + PPTX + template | 3, 4, 5 |
| API missing date → today | 5 |
| Integrity / full test / build | 6 |
