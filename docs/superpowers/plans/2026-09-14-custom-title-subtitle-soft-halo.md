# Custom Title Subtitle Soft Halo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four Custom Title subtitle panels and their ornaments with the approved symbol-free, theme-tinted soft halo in both PPTX output and browser preview.

**Architecture:** Keep the existing subtitle data model, text sizing, geometry, and title-stack offset. The PPTX renderer will place one transparent radial-gradient SVG image behind the subtitle text; the browser renderer will use the equivalent CSS `radial-gradient`. Theme definitions own the exact halo color, center opacity, and subtitle text color.

**Tech Stack:** JavaScript ES modules, PptxGenJS 4, SVG, HTML/CSS DOM preview, Node.js test runner, AdmZip, xmldom, Vite.

## Global Constraints

- Keep `customTitleSubtitle` and its persistence behavior unchanged.
- Keep the title-stack offset at `-0.45` inches when the subtitle is non-empty.
- Keep the subtitle area at `x: 1.07`, `y: 6.1`, `w: 11.19`, `h: 0.85` inches.
- Keep the subtitle font-size thresholds at 28pt, 24pt, and 22pt.
- Render no subtitle border, rectangular color fill, line, dot, diamond, or symbol.
- Use center opacity and text color exactly as follows: Aurora `C4B2FF` at 15% with `FFFFFF`; Monolith `FFFFFF` at 10% with `EEE9DC`; Ivory `C2A87A` at 16% with `5F4B2C`; Marquee `D9B376` at 12% with `F7EBDA`.
- Preserve the user's existing modification to `data/templates.json` and all untracked `.omo/` and `.superpowers/` files.

---

### Task 1: PPTX Soft Halo Renderer

**Files:**
- Modify: `test/custom-title-slide.test.js:14-199`
- Modify: `lib/custom-title-slide.js:34-145, 180-478`

**Interfaces:**
- Consumes: `subtitleFontSize(text)` and the existing `SUBTITLE_PANEL` geometry.
- Produces: `addSubtitleHalo(slide, content, theme)`, where `theme` is `{ haloColor: string, haloOpacity: number, text: string }`.
- Produces in PPTX: one image named `custom-title:subtitle-halo` and one text shape named `custom-title:subtitle-text`.

- [ ] **Step 1: Replace the panel assertions with failing halo assertions**

Add archive and picture helpers while preserving the existing `render(slide)` helper for tests that only need slide XML:

```javascript
async function renderArchive(slide) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendCustomTitleSlide(pptx, slide);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  const zip = new AdmZip(buffer);
  return {
    zip,
    slideXml: zip.readAsText("ppt/slides/slide1.xml"),
  };
}

async function render(slide) {
  return (await renderArchive(slide)).slideXml;
}

function pictureByName(slideXml, name) {
  return Array.from(parse(slideXml).getElementsByTagName("p:pic")).find(
    (picture) =>
      picture.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") === name
  );
}

function haloSvg(zip) {
  const entry = zip
    .getEntries()
    .find(
      ({ entryName }) =>
        entryName.startsWith("ppt/media/") &&
        zip.readAsText(entryName).includes('id="subtitle-halo"')
    );
  return entry ? zip.readAsText(entry.entryName) : "";
}
```

Replace the fixed-panel test with a test that checks the halo picture geometry, text geometry, exact theme values, and unchanged title offset:

```javascript
it("renders one theme-tinted lower halo and shifts the title stack", async () => {
  const themes = {
    aurora: { color: "C4B2FF", opacity: "0.15" },
    monolith: { color: "FFFFFF", opacity: "0.10" },
    ivory: { color: "C2A87A", opacity: "0.16" },
    marquee: { color: "D9B376", opacity: "0.12" },
  };

  for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
    const baselineXml = await render({
      customTitleDesign,
      customTitleKo: "성찬 예배",
      customTitleEn: "Holy Communion",
    });
    const { zip, slideXml } = await renderArchive({
      customTitleDesign,
      customTitleKo: "성찬 예배",
      customTitleEn: "Holy Communion",
      customTitleSubtitle: "한 몸을 이루는 교회",
    });

    const halo = pictureByName(slideXml, "custom-title:subtitle-halo");
    const subtitle = shapeByName(slideXml, "custom-title:subtitle-text");
    assert.ok(halo, `${customTitleDesign} halo image must exist`);
    assert.deepEqual(textMetrics(halo), {
      x: 1.07,
      y: 6.1,
      w: 11.19,
      h: 0.85,
      fontSize: 0,
    });
    assert.deepEqual(textMetrics(subtitle), {
      x: 1.07,
      y: 6.1,
      w: 11.19,
      h: 0.85,
      fontSize: 28,
    });

    const svg = haloSvg(zip);
    assert.match(svg, new RegExp(`stop-color="#${themes[customTitleDesign].color}"`));
    assert.match(
      svg,
      new RegExp(`stop-opacity="${themes[customTitleDesign].opacity}"`)
    );
    assert.doesNotMatch(slideXml, /custom-title:subtitle-(panel|accent|dot|diamond)/);

    const baselineKo = textMetrics(shapeWithText(baselineXml, "성찬 예배"));
    const subtitleKo = textMetrics(shapeWithText(slideXml, "성찬 예배"));
    assert.equal(Number((subtitleKo.y - baselineKo.y).toFixed(2)), -0.45);
  }
});
```

Adjust `textMetrics` so it returns `fontSize: 0` when an image has no `a:rPr`, and update the empty-subtitle test to assert that both `custom-title:subtitle-halo` and `custom-title:subtitle-text` are absent.

- [ ] **Step 2: Run the PPTX test and verify RED**

Run:

```bash
node --test test/custom-title-slide.test.js
```

Expected: FAIL because `custom-title:subtitle-halo` is absent and the old `custom-title:subtitle-panel` and ornament shapes still exist.

- [ ] **Step 3: Implement the transparent SVG halo**

Replace `addSubtitlePanel` with these focused helpers:

```javascript
function buildSubtitleHaloSvg({ haloColor, haloOpacity }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1119 85">
  <defs>
    <radialGradient id="subtitle-halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#${haloColor}" stop-opacity="${haloOpacity.toFixed(2)}"/>
      <stop offset="68%" stop-color="#${haloColor}" stop-opacity="0"/>
      <stop offset="100%" stop-color="#${haloColor}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1119" height="85" fill="url(#subtitle-halo)"/>
</svg>`;
}

function addSubtitleHalo(slide, content, theme) {
  const svg = buildSubtitleHaloSvg(theme);
  slide.addImage({
    ...SUBTITLE_PANEL,
    objectName: "custom-title:subtitle-halo",
    data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  });

  slide.addText(content.subtitle, {
    ...SUBTITLE_PANEL,
    objectName: "custom-title:subtitle-text",
    fontFace: SANS,
    fontSize: subtitleFontSize(content.subtitle),
    bold: true,
    color: theme.text,
    align: "center",
    valign: "mid",
    margin: 0,
  });
}
```

Rename each design callback to `drawSubtitleHalo` and pass these exact themes:

```javascript
{ haloColor: "C4B2FF", haloOpacity: 0.15, text: "FFFFFF" }
{ haloColor: "FFFFFF", haloOpacity: 0.10, text: "EEE9DC" }
{ haloColor: "C2A87A", haloOpacity: 0.16, text: "5F4B2C" }
{ haloColor: "D9B376", haloOpacity: 0.12, text: "F7EBDA" }
```

Update `stackTitleBlocks` to call `design.drawSubtitleHalo()` for a non-empty subtitle. Delete all panel rectangle and accent-shape branches.

- [ ] **Step 4: Run the PPTX test and verify GREEN**

Run:

```bash
node --test test/custom-title-slide.test.js
```

Expected: all tests in `test/custom-title-slide.test.js` PASS.

- [ ] **Step 5: Commit the PPTX renderer**

```bash
git add lib/custom-title-slide.js test/custom-title-slide.test.js
git commit -m "feat: render custom subtitle soft halo"
```

---

### Task 2: Browser Preview Soft Halo

**Files:**
- Modify: `test/custom-title-subtitle-ui.test.js:42-59`
- Modify: `public/app.js:3943-4029, 4085-4145, 4228-4231`

**Interfaces:**
- Consumes: `customTitleSubtitleSize(subtitle)`, title preview utilities, and theme definitions.
- Produces: `addCustomTitleSubtitleHalo(container, subtitle, theme, unit)`.
- Theme keys: `subtitleHalo`, a complete CSS radial-gradient string, and `subtitleText`, a CSS color.

- [ ] **Step 1: Write failing preview source assertions**

Replace the old panel test with:

```javascript
it("renders the approved symbol-free soft halo with the shared size rule", () => {
  assert.match(app, /api\.subtitleFontSize\(text\)/);
  assert.match(app, /function addCustomTitleSubtitleHalo\(/);
  assert.match(app, /font-size:\$\{pt\(customTitleSubtitleSize\(subtitle\)\)\}px/);
  assert.match(app, /transform:translateY\(\$\{inch\(-0\.45\)\}px\)/);
  assert.match(app, /bottom:\$\{inch\(0\.55\)\}px/);
  assert.match(app, /height:\$\{inch\(0\.85\)\}px/);
  assert.match(app, /background:\$\{theme\.subtitleHalo\};border:none;/);
  assert.match(app, /rgba\(196,178,255,0\.15\)/);
  assert.match(app, /rgba\(255,255,255,0\.10\)/);
  assert.match(app, /rgba\(194,168,122,0\.16\)/);
  assert.match(app, /rgba\(217,179,118,0\.12\)/);
  assert.doesNotMatch(app, /subtitlePanel/);
  assert.doesNotMatch(app, /subtitleHaloAccent/);
});
```

- [ ] **Step 2: Run the preview test and verify RED**

Run:

```bash
node --test test/custom-title-subtitle-ui.test.js
```

Expected: FAIL because `addCustomTitleSubtitleHalo` and the theme halo gradients do not exist.

- [ ] **Step 3: Replace panel themes and DOM ornaments with the soft halo**

For each entry in `CUSTOM_TITLE_THEMES`, replace all `subtitlePanel*` fields with:

```javascript
subtitleHalo:
  "radial-gradient(ellipse at center, rgba(196,178,255,0.15), rgba(196,178,255,0) 68%)",
subtitleText: "#FFFFFF",
```

Use `rgba(255,255,255,0.10)` / `#EEE9DC` for Monolith, `rgba(194,168,122,0.16)` / `#5F4B2C` for Ivory, and `rgba(217,179,118,0.12)` / `#F7EBDA` for Marquee.

Replace `addCustomTitleSubtitlePanel` with:

```javascript
function addCustomTitleSubtitleHalo(container, subtitle, theme, unit) {
  const { inch, pt } = unit;
  const halo = titlePreviewNode(
    `position:absolute;left:8%;right:8%;bottom:${inch(0.55)}px;` +
      `height:${inch(0.85)}px;display:flex;align-items:center;justify-content:center;` +
      `box-sizing:border-box;background:${theme.subtitleHalo};border:none;z-index:2;`
  );

  halo.appendChild(
    titlePreviewNode(
      `position:relative;font-family:${TITLE_SANS};font-weight:700;` +
        `font-size:${pt(customTitleSubtitleSize(subtitle))}px;line-height:1.2;` +
        `color:${theme.subtitleText};white-space:nowrap;letter-spacing:0.08em;`,
      subtitle
    )
  );
  container.appendChild(halo);
}
```

Update `buildCustomTitleSlidePreview` to call `addCustomTitleSubtitleHalo`. Delete all subtitle line, dot, and diamond branches; keep frame diamonds and title-divider diamonds unchanged.

- [ ] **Step 4: Run preview and PPTX regression tests**

Run:

```bash
node --test test/custom-title-subtitle-ui.test.js test/custom-title-slide.test.js
```

Expected: all tests in both files PASS.

- [ ] **Step 5: Check diagnostics and build**

Run:

```bash
npm run build
```

Expected: Vite exits with code 0.

Use IDE diagnostics on `public/app.js`, `lib/custom-title-slide.js`, `test/custom-title-slide.test.js`, and `test/custom-title-subtitle-ui.test.js`. Expected: no newly introduced errors.

- [ ] **Step 6: Commit the browser preview**

```bash
git add public/app.js test/custom-title-subtitle-ui.test.js
git commit -m "feat: preview custom subtitle soft halo"
```

---

### Task 3: Integration Verification

**Files:**
- Verify only: `lib/custom-title-slide.js`
- Verify only: `public/app.js`
- Verify only: `test/custom-title-slide.test.js`
- Verify only: `test/custom-title-subtitle-ui.test.js`

**Interfaces:**
- Consumes: completed PPTX and browser renderers.
- Produces: fresh test, build, and repository-diff evidence; no source changes.

- [ ] **Step 1: Run focused subtitle tests**

```bash
node --test test/custom-title-slide.test.js test/custom-title-subtitle-ui.test.js test/slide-record.test.js
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run the full suite while preserving template data**

```bash
backup="$(mktemp)"
cp data/templates.json "$backup"
trap 'cp "$backup" data/templates.json; rm -f "$backup"' EXIT
npm test
```

Expected: report the actual result. Two pre-existing `resolveUploadsChildPath` platform-path failures in `test/custom-slide-assets.test.js` may remain; do not change that unrelated code in this task.

- [ ] **Step 3: Run a production build**

```bash
npm run build
```

Expected: Vite exits with code 0.

- [ ] **Step 4: Verify scope and whitespace**

```bash
git diff --check HEAD~2..HEAD
git status --short
```

Expected: no whitespace errors; only the planned source/test commits plus the user's pre-existing `data/templates.json`, `.omo/`, and `.superpowers/` working-tree entries.
