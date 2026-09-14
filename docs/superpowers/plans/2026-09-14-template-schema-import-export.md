# Template Schema Import / Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user download one template as a versioned JSON schema and import that file on another machine as a new template, without copying PPTX bytes or local `/uploads` paths.

**Architecture:** A `lib/template-schema.js` module owns the envelope (`kind` / `version`), portable slide stripping, unrestorable-name detection, and parse/migrate. The browser downloads and POSTs through the existing `POST /api/templates` route. No new HTTP endpoints.

**Tech Stack:** Node.js ES modules, vanilla HTML/CSS/JavaScript, Vite `@lib` alias, Node test runner.

## Global Constraints

- Envelope `kind` is exactly `samil-template-schema`.
- Writer `version` is `1`. Reader accepts only integers in `[TEMPLATE_SCHEMA_MIN_VERSION, TEMPLATE_SCHEMA_MAX_VERSION]` (both currently `1`).
- Always create a new template on import. Never overwrite by name or id.
- Do not embed PPTX or image bytes. Strip `/uploads/` paths and all `data:` URLs from every asset field, normalize those fields to safe null/empty canonical values, and record the loss with optional boolean `unrestorable: true`.
- `sanitizeSlideForTemplate` preserves `unrestorable` as a Boolean so warnings survive `POST /api/templates` persistence and re-export. This optional field is backward-compatible in schema v1.
- Do not add import/export HTTP routes. Use `POST /api/templates`.
- Do not add Playwright coverage for this feature.
- Implementation must occur in an isolated git worktree.

## File map

- Create: `lib/template-schema.js` — constants, portable conversion, parse, migrate, error messages, download filename.
- Create: `test/template-schema.test.js` — unit tests for the module.
- Modify: `lib/slide-record.js` — preserve the optional `unrestorable` boolean at persistence boundaries.
- Modify: `public/index.html` — gallery “스키마 가져오기” control and hidden file input.
- Modify: `public/styles.css` — gallery toolbar.
- Modify: `public/app.js` — card Export, gallery Import, confirm/toast.

---

### Task 1: Portable schema module

**Files:**
- Create: `lib/template-schema.js`
- Test: `test/template-schema.test.js`

**Interfaces:**
- Consumes: `sanitizeSlideForTemplate` from `lib/slide-record.js`.
- Produces:
  - `TEMPLATE_SCHEMA_KIND` (`"samil-template-schema"`)
  - `TEMPLATE_SCHEMA_VERSION` (`1`)
  - `TEMPLATE_SCHEMA_MIN_VERSION` (`1`)
  - `TEMPLATE_SCHEMA_MAX_VERSION` (`1`)
  - `TEMPLATE_SCHEMA_ERROR` codes: `invalid_json`, `kind`, `version_invalid`, `version_too_new`, `version_too_old`, `name`, `slides`
  - `toPortableTemplateSchema(template) => { kind, version, exportedAt, template: { name, slides } }`
  - `unrestorableSlideNames(slides) => string[]`
  - `parseTemplateSchema(text) => { ok: true, schema, unrestorableNames } | { ok: false, code, message }`
  - `migrateTemplateSchema(doc) => doc` (identity while min=max=1)
  - `templateSchemaErrorMessage(code) => string`
  - `templateSchemaFilename(name) => string`
  - Portable slide records may include `unrestorable: true`; missing/false remains valid v1.

- [ ] **Step 1: Write the failing tests**

Create `test/template-schema.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  TEMPLATE_SCHEMA_KIND,
  TEMPLATE_SCHEMA_VERSION,
  TEMPLATE_SCHEMA_ERROR,
  toPortableTemplateSchema,
  unrestorableSlideNames,
  parseTemplateSchema,
  templateSchemaFilename,
} from "../lib/template-schema.js";

function baseSlide(overrides = {}) {
  return {
    id: "slide-local",
    name: "타이틀",
    type: "title",
    sourceType: "basic",
    content: "본문",
    churchName: "Sydney 삼일교회",
    serviceDate: "2026-09-20",
    titleDesign: "glow",
    serverFilePath: null,
    thumbnail: null,
    originalUrl: null,
    hymnNumber: null,
    adBgSource: "none",
    adBgImagePath: null,
    customImageData: null,
    customSlide: null,
    ...overrides,
  };
}

test("toPortableTemplateSchema writes version 1 and drops local paths", () => {
  const doc = toPortableTemplateSchema({
    id: "template-local",
    name: "주일 예배",
    createdAt: "2026-01-01T00:00:00.000Z",
    slides: [
      baseSlide({
        name: "찬송",
        type: "hymn",
        sourceType: "upload",
        fileName: "nhymn25.ppt",
        fileSaved: true,
        serverFilePath: "/uploads/hymn.ppt",
        thumbnail: "/uploads/hymn.ppt-thumb.jpeg",
        hymnNumber: "25",
        originalUrl: "https://example.test/nhymn25.ppt",
      }),
      baseSlide({
        name: "올린 파일",
        type: "simple",
        sourceType: "upload",
        fileName: "wide.pptx",
        serverFilePath: "/uploads/wide.pptx",
        thumbnail: "/uploads/wide-thumb.jpeg",
      }),
      baseSlide({
        name: "광고",
        type: "ad",
        adBgSource: "file",
        adBgImagePath: "/uploads/bg.png",
        adTitle: "주보",
      }),
    ],
  });

  assert.equal(doc.kind, TEMPLATE_SCHEMA_KIND);
  assert.equal(doc.version, TEMPLATE_SCHEMA_VERSION);
  assert.equal(doc.version, 1);
  assert.match(doc.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(doc.template.name, "주일 예배");
  assert.equal("id" in doc.template, false);
  assert.equal("createdAt" in doc.template, false);

  const [hymn, uploaded, ad] = doc.template.slides;
  assert.equal("id" in hymn, false);
  assert.equal(hymn.serverFilePath, null);
  assert.equal(hymn.thumbnail, null);
  assert.equal(hymn.fileSaved, false);
  assert.equal(hymn.hymnNumber, "25");
  assert.equal(hymn.originalUrl, "https://example.test/nhymn25.ppt");
  assert.equal(hymn.fileName, "nhymn25.ppt");
  assert.equal(uploaded.serverFilePath, null);
  assert.equal(ad.adBgImagePath, null);
  assert.equal(ad.adTitle, "주보");
});

test("unrestorableSlideNames skips hymns with originalUrl", () => {
  const names = unrestorableSlideNames([
    baseSlide({
      name: "찬송",
      type: "hymn",
      sourceType: "upload",
      fileName: "nhymn25.ppt",
      serverFilePath: "/uploads/hymn.ppt",
      originalUrl: "https://example.test/nhymn25.ppt",
    }),
    baseSlide({
      name: "올린 파일",
      type: "simple",
      sourceType: "upload",
      fileName: "wide.pptx",
      serverFilePath: "/uploads/wide.pptx",
    }),
    baseSlide({
      name: "광고",
      type: "ad",
      adBgSource: "file",
      adBgImagePath: "/uploads/bg.png",
    }),
    baseSlide({
      name: "커스텀",
      type: "custom",
      customSlide: {
        width: 1280,
        height: 720,
        background: "#ffffff",
        elements: [{ id: "img-1", type: "image", src: "/uploads/pic.png" }],
      },
    }),
  ]);

  assert.deepEqual(names, ["올린 파일", "광고", "커스텀"]);
});

test("parseTemplateSchema rejects bad files and newer versions", () => {
  assert.equal(parseTemplateSchema("{").ok, false);
  assert.equal(parseTemplateSchema("{").code, TEMPLATE_SCHEMA_ERROR.INVALID_JSON);

  const valid = toPortableTemplateSchema({
    name: "주일 예배",
    slides: [baseSlide()],
  });

  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, kind: "nope" })).code,
    TEMPLATE_SCHEMA_ERROR.KIND
  );

  const noVersion = { ...valid };
  delete noVersion.version;
  assert.equal(
    parseTemplateSchema(JSON.stringify(noVersion)).code,
    TEMPLATE_SCHEMA_ERROR.VERSION_INVALID
  );

  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, version: 2 })).code,
    TEMPLATE_SCHEMA_ERROR.VERSION_TOO_NEW
  );
  assert.match(
    parseTemplateSchema(JSON.stringify({ ...valid, version: 2 })).message,
    /업데이트/
  );

  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, template: { name: "", slides: [baseSlide()] } })).code,
    TEMPLATE_SCHEMA_ERROR.NAME
  );
  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, template: { name: "A", slides: [] } })).code,
    TEMPLATE_SCHEMA_ERROR.SLIDES
  );
});

test("parseTemplateSchema accepts v1 and returns portable slides", () => {
  const text = JSON.stringify(
    toPortableTemplateSchema({
      name: "주일 예배",
      slides: [
        baseSlide({
          serverFilePath: "/uploads/stale.pptx",
          customImageData: "/uploads/bg.png",
        }),
      ],
    })
  );
  const result = parseTemplateSchema(text);
  assert.equal(result.ok, true);
  assert.equal(result.schema.version, 1);
  assert.equal(result.schema.template.slides[0].serverFilePath, null);
  assert.equal(result.schema.template.slides[0].customImageData, null);
  assert.equal(result.schema.template.slides[0].unrestorable, true);
  assert.deepEqual(result.unrestorableNames, ["타이틀"]);
});

test("toPortableSlide strips data URLs and local upload paths from asset fields", () => {
  // strips customImageData, adBgImageUrl, originalUrl, canvas src; keeps https adBgImageUrl
});

test("unrestorableSlideNames survives export JSON parse roundtrip", () => {
  // export→JSON→parse returns unrestorableNames for stripped customImageData and adBgImageUrl
});

test("unrestorable marker survives POST sanitization and re-export", () => {
  // export→parse→sanitizeSlideForTemplate→re-export still returns the slide name
});

test("templateSchemaFilename sanitizes the name", () => {
  assert.equal(templateSchemaFilename("주일 예배"), "주일 예배.samil-template.json");
  assert.equal(templateSchemaFilename("a/b:c"), "a_b_c.samil-template.json");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/template-schema.test.js`

Expected: FAIL because `lib/template-schema.js` does not exist.

- [ ] **Step 3: Implement the module**

Create `lib/template-schema.js`:

```js
import { sanitizeSlideForTemplate } from "./slide-record.js";

export const TEMPLATE_SCHEMA_KIND = "samil-template-schema";
export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_SCHEMA_MIN_VERSION = 1;
export const TEMPLATE_SCHEMA_MAX_VERSION = 1;

export const TEMPLATE_SCHEMA_ERROR = {
  INVALID_JSON: "invalid_json",
  KIND: "kind",
  VERSION_INVALID: "version_invalid",
  VERSION_TOO_NEW: "version_too_new",
  VERSION_TOO_OLD: "version_too_old",
  NAME: "name",
  SLIDES: "slides",
};

export function templateSchemaErrorMessage(code) {
  switch (code) {
    case TEMPLATE_SCHEMA_ERROR.INVALID_JSON:
      return "템플릿 스키마 파일을 읽을 수 없습니다.";
    case TEMPLATE_SCHEMA_ERROR.KIND:
      return "이 파일은 템플릿 스키마가 아닙니다.";
    case TEMPLATE_SCHEMA_ERROR.VERSION_INVALID:
      return "스키마 버전이 올바르지 않습니다.";
    case TEMPLATE_SCHEMA_ERROR.VERSION_TOO_NEW:
      return "앱을 업데이트한 뒤 다시 가져와 주세요.";
    case TEMPLATE_SCHEMA_ERROR.VERSION_TOO_OLD:
      return "너무 오래된 스키마 형식이라 가져올 수 없습니다.";
    case TEMPLATE_SCHEMA_ERROR.NAME:
      return "템플릿 이름이 없습니다.";
    case TEMPLATE_SCHEMA_ERROR.SLIDES:
      return "슬라이드가 없는 스키마는 가져올 수 없습니다.";
    default:
      return "템플릿 스키마를 처리할 수 없습니다.";
  }
}

function isOwnedUploadPath(value) {
  return typeof value === "string" && value.startsWith("/uploads/");
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function isEmbeddedAsset(value) {
  return isOwnedUploadPath(value) || isDataUrl(value);
}

function fail(code) {
  return { ok: false, code, message: templateSchemaErrorMessage(code) };
}

function toPortableCustomSlide(customSlide) {
  if (!customSlide || typeof customSlide !== "object") {
    return customSlide ?? null;
  }
  const elements = Array.isArray(customSlide.elements)
    ? customSlide.elements.map((element) => {
        if (element?.type !== "image") {
          return element;
        }
        const src = isEmbeddedAsset(element.src)
          ? ""
          : element.src || "";
        return { ...element, src };
      })
    : [];
  return { ...customSlide, elements };
}

export function toPortableSlide(slide) {
  const source = slide || {};
  const unrestorable = Boolean(
    source.unrestorable || isUnrestorableSlide(source)
  );
  const portable = sanitizeSlideForTemplate(source);
  delete portable.id;
  portable.serverFilePath = null;
  portable.thumbnail = null;
  portable.fileSaved = false;
  portable.adBgImagePath = null;
  if (isEmbeddedAsset(source.originalUrl)) {
    portable.originalUrl = null;
  }
  if (isEmbeddedAsset(source.adBgImageUrl)) {
    portable.adBgImageUrl = null;
  }
  if (isEmbeddedAsset(source.customImageData)) {
    portable.customImageData = null;
  }
  portable.customSlide = toPortableCustomSlide(
    source.customSlide ?? portable.customSlide
  );
  portable.unrestorable = unrestorable;
  return portable;
}

export function toPortableTemplateSchema(template) {
  const slides = Array.isArray(template?.slides)
    ? template.slides.map((slide) => toPortableSlide(slide))
    : [];
  return {
    kind: TEMPLATE_SCHEMA_KIND,
    version: TEMPLATE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    template: {
      name: String(template?.name || "").trim(),
      slides,
    },
  };
}

export function isUnrestorableSlide(slide) {
  if (!slide || typeof slide !== "object") {
    return false;
  }
  if (slide.unrestorable) {
    return true;
  }
  const localPptWithoutSource =
    Boolean(slide.fileName) &&
    !slide.originalUrl &&
    (slide.sourceType === "upload" || isOwnedUploadPath(slide.serverFilePath));
  const fileAdBackground =
    slide.adBgSource === "file" || isOwnedUploadPath(slide.adBgImagePath);
  const localAdUrlBackground =
    slide.adBgSource === "url" && isEmbeddedAsset(slide.adBgImageUrl);
  const localCustomImage = isEmbeddedAsset(slide.customImageData);
  const localCanvasImage = Boolean(
    slide.customSlide?.elements?.some(
      (element) =>
        element?.type === "image" && isEmbeddedAsset(element.src)
    )
  );
  return Boolean(
    localPptWithoutSource ||
      fileAdBackground ||
      localAdUrlBackground ||
      localCustomImage ||
      localCanvasImage
  );
}

export function unrestorableSlideNames(slides) {
  if (!Array.isArray(slides)) {
    return [];
  }
  return slides
    .filter((slide) => isUnrestorableSlide(slide))
    .map((slide) => String(slide.name || "이름 없는 슬라이드"));
}

export function migrateTemplateSchema(doc) {
  // ponytail: identity while MIN === MAX === 1; add N→N+1 branches when version bumps
  let current = doc;
  let version = current.version;
  while (version < TEMPLATE_SCHEMA_VERSION) {
    current = { ...current, version: version + 1 };
    version += 1;
  }
  return current;
}

export function parseTemplateSchema(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail(TEMPLATE_SCHEMA_ERROR.INVALID_JSON);
  }

  if (!parsed || typeof parsed !== "object" || parsed.kind !== TEMPLATE_SCHEMA_KIND) {
    return fail(TEMPLATE_SCHEMA_ERROR.KIND);
  }

  if (!Number.isInteger(parsed.version)) {
    return fail(TEMPLATE_SCHEMA_ERROR.VERSION_INVALID);
  }
  if (parsed.version > TEMPLATE_SCHEMA_MAX_VERSION) {
    return fail(TEMPLATE_SCHEMA_ERROR.VERSION_TOO_NEW);
  }
  if (parsed.version < TEMPLATE_SCHEMA_MIN_VERSION) {
    return fail(TEMPLATE_SCHEMA_ERROR.VERSION_TOO_OLD);
  }

  const migrated = migrateTemplateSchema(parsed);
  const name = String(migrated.template?.name || "").trim();
  const slides = migrated.template?.slides;
  if (!name) {
    return fail(TEMPLATE_SCHEMA_ERROR.NAME);
  }
  if (!Array.isArray(slides) || slides.length === 0) {
    return fail(TEMPLATE_SCHEMA_ERROR.SLIDES);
  }

  const unrestorableNames = unrestorableSlideNames(slides);
  return {
    ok: true,
    schema: {
      kind: TEMPLATE_SCHEMA_KIND,
      version: TEMPLATE_SCHEMA_VERSION,
      exportedAt: migrated.exportedAt,
      template: {
        name,
        slides: slides.map((slide) => toPortableSlide(slide)),
      },
    },
    unrestorableNames,
  };
}

export function templateSchemaFilename(name) {
  const base =
    String(name || "template")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim() || "template";
  return `${base}.samil-template.json`;
}
```

Note: `isUnrestorableSlide` honors `unrestorable: true` and otherwise infers loss from local assets that have not yet been stripped. Empty asset values are canonical values, not metadata markers. Hymns with portable `originalUrl` values remain restorable even when `sourceType` is `upload`.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test test/template-schema.test.js`

Expected: PASS.

If a custom-slide fixture fails `sanitizeSlideForTemplate` because `customSlide` is a stub, expand the fixture with `createDefaultCustomSlide()` from `public/custom-slide-model.js` and one image element, matching `test/slide-record.test.js`.

- [ ] **Step 5: Commit**

```bash
git add lib/template-schema.js test/template-schema.test.js
git commit -m "$(cat <<'EOF'
feat: add portable template schema parse and export

EOF
)"
```

---

### Task 2: Gallery export and import UI

**Files:**
- Modify: `public/index.html` (template gallery section, around the `#templateGallery` block)
- Modify: `public/styles.css` (`.template-gallery` block)
- Modify: `public/app.js` (`@lib` imports, `buildTemplateCard`, gallery actions)

**Interfaces:**
- Consumes: `toPortableTemplateSchema`, `unrestorableSlideNames`, `parseTemplateSchema`, `templateSchemaFilename` from `@lib/template-schema.js`.
- Produces: card menu item `스키마 내보내기`; gallery button `스키마 가져오기` that POSTs `{ name, slides }` to `/api/templates` and `templates.push`es the response. Duplicate names stay as two cards because the existing create route does not uniquify names.

The templates tab hides `#pptTabbarActions` while the gallery is showing, so Import must live inside `#templateGallery`, not the slide bulk menu. The gallery section stays visible when empty, so the button still works with zero templates. The workspace hides the whole gallery, which hides Import as specified.

- [ ] **Step 1: Add the gallery import control**

In `public/index.html`, change the gallery section to:

```html
<section id="templateGallery" class="template-gallery" hidden>
  <div class="template-gallery-toolbar">
    <input
      id="templateSchemaFileInput"
      type="file"
      accept=".json,.samil-template.json"
      hidden
    />
    <button id="templateSchemaImportBtn" type="button" class="ghost small">
      스키마 가져오기
    </button>
  </div>
  <div id="templateGalleryGrid" class="template-gallery-grid">
    <!-- Template cards will be injected here -->
  </div>
  <div id="templateGalleryEmpty" class="template-gallery-empty" hidden>
    <h3>저장된 템플릿이 없습니다</h3>
    <p>슬라이드 탭에서 슬라이드를 선택해 &lsquo;선택 작업 &rarr; 템플릿 만들기&rsquo;로 만들어 보세요. 스키마 JSON이 있으면 위에서 가져올 수 있습니다.</p>
    <button id="templateGalleryGoSlidesBtn" type="button" class="ghost small">슬라이드 탭으로 이동</button>
  </div>
</section>
```

Add CSS after `.template-gallery[hidden]`:

```css
.template-gallery-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
```

- [ ] **Step 2: Wire export and import in `public/app.js`**

Add to the existing `@lib` imports:

```js
import {
  TEMPLATE_SCHEMA_ERROR,
  parseTemplateSchema,
  templateSchemaErrorMessage,
  templateSchemaFilename,
  toPortableTemplateSchema,
  unrestorableSlideNames,
} from "@lib/template-schema.js";
```

After the other template DOM lookups (`templateGalleryGoSlidesBtn`):

```js
const templateSchemaImportBtn = document.getElementById("templateSchemaImportBtn");
const templateSchemaFileInput = document.getElementById("templateSchemaFileInput");
```

Insert the export menu item in `buildTemplateCard` between rename and delete:

```js
const exportItem = document.createElement("button");
exportItem.type = "button";
exportItem.className = "bulk-dropdown-item";
exportItem.textContent = "스키마 내보내기";
exportItem.addEventListener("click", (event) => {
  event.stopPropagation();
  closeTemplateCardMenus();
  exportTemplateSchemaById(template.id);
});

menuDropdown.appendChild(renameItem);
menuDropdown.appendChild(exportItem);
menuDropdown.appendChild(deleteItem);
```

Add these functions near the other template helpers (`createTemplateFromSelection` is the POST pattern to copy):

```js
function formatUnrestorableSchemaMessage(names, { forExport }) {
  const list = names.map((name) => `- ${name}`).join("\n");
  if (forExport) {
    return `다음 슬라이드는 파일이 없어 다른 컴퓨터에서 다시 만들 수 없습니다:\n\n${list}\n\n스키마만 내보낼까요?`;
  }
  return `템플릿을 가져왔습니다. 다음 슬라이드는 파일이 없어 다시 만들 수 없습니다:\n\n${list}`;
}

function downloadTemplateSchema(schema) {
  const blob = new Blob([JSON.stringify(schema, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = templateSchemaFilename(schema.template.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportTemplateSchemaById(templateId) {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    return;
  }
  const unrestorable = unrestorableSlideNames(template.slides || []);
  if (
    unrestorable.length > 0 &&
    !confirm(formatUnrestorableSchemaMessage(unrestorable, { forExport: true }))
  ) {
    return;
  }
  downloadTemplateSchema(toPortableTemplateSchema(template));
  showToast(`스키마를 내보냈습니다: ${template.name}`);
}

async function importTemplateSchemaFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    alert(templateSchemaErrorMessage(TEMPLATE_SCHEMA_ERROR.INVALID_JSON));
    return;
  }

  const parsed = parseTemplateSchema(text);
  if (!parsed.ok) {
    alert(parsed.message);
    return;
  }

  try {
    const resp = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: parsed.schema.template.name,
        slides: parsed.schema.template.slides,
      }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.error || "템플릿 가져오기에 실패했습니다.");
    }

    templates.push(cloneTemplate(payload.template));
    renderTemplateGallery();
    showToast(`템플릿을 가져왔습니다: ${payload.template.name}`);
    if (parsed.unrestorableNames.length > 0) {
      alert(
        formatUnrestorableSchemaMessage(parsed.unrestorableNames, {
          forExport: false,
        })
      );
    }
  } catch (err) {
    alert(err.message || "템플릿 가져오기 중 오류가 발생했습니다.");
  }
}

templateSchemaImportBtn?.addEventListener("click", () => {
  templateSchemaFileInput?.click();
});

templateSchemaFileInput?.addEventListener("change", async () => {
  const file = templateSchemaFileInput.files?.[0];
  templateSchemaFileInput.value = "";
  if (!file) {
    return;
  }
  await importTemplateSchemaFile(file);
});
```

Do not open the new template’s workspace after import. Stay on the gallery so the new card is visible. (`createTemplateFromSelection` still opens the workspace; leave that path alone.)

- [ ] **Step 3: Run unit tests**

Run: `node --test test/template-schema.test.js test/template-store.test.js test/slide-record.test.js`

Expected: PASS.

Manually smoke (dev server): export a title-only template, import the JSON, confirm a second card with the same name; export a template that has an uploaded PPT, cancel the confirm (no download), then confirm and import and see the unrestorable alert.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "$(cat <<'EOF'
feat: import and export template schema files

EOF
)"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| `{name}.samil-template.json` envelope | 1, 2 |
| `kind` / `version` constants and migrate identity | 1 |
| Reject missing version and version > MAX | 1 |
| Strip `/uploads`, keep hymn URL and title fields | 1 |
| Unrestorable names; hymns with URL excluded | 1 |
| Card Export, gallery Import, workspace hides Import | 2 |
| Always new template via existing POST | 2 |
| Duplicate names allowed | 2 (existing create route) |
| Confirm on export, alert after import | 2 |
| No new endpoints, no E2E | both |
