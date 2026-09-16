# Native Image Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable image replacement, segmented Fit/Fill, horizontal/vertical flip, and alternative text to custom-slide image properties.

**Architecture:** Extend the normalized image descriptor with three native fields, map them directly to Fabric and PptxGenJS, and reuse the existing uploader in an explicit add-or-replace mode. Keep crop geometry, filters, and masks out of scope.

**Tech Stack:** JavaScript ES modules, React 19, Fabric 6, PptxGenJS 4, Node test runner, jsdom, Playwright

## Global Constraints

- Preserve all existing image behavior and backward compatibility.
- Use only Fabric `flipX`/`flipY` and PptxGenJS `flipH`/`flipV`/`altText`.
- Do not add crop coordinates, image filters, masks, or background removal.
- Replacement failure or staleness must leave the original image untouched.
- Existing common opacity, rotation, visibility, lock, and shadow controls remain unchanged.

---

### Task 1: Persist and export native image fields

**Files:**
- Modify: `test/custom-slide-model.test.js`
- Modify: `test/custom-slide-editor.test.js`
- Modify: `test/custom-slide-pptx.test.js`
- Modify: `public/custom-slide-model.js`
- Modify: `public/custom-slide-editor.js`
- Modify: `lib/custom-slide-pptx.js`

**Interfaces:**
- Image model fields: `flipH: boolean`, `flipV: boolean`, `altText: string`
- Maximum alternative text length: 500

- [ ] **Step 1: Add failing model normalization tests**

Assert that missing fields become `false`, `false`, and `""`; truthy non-
booleans normalize with `Boolean`; alt text trims whitespace and slices to 500
characters.

- [ ] **Step 2: Add failing Fabric conversion tests**

Extend the existing image build/serialize test:

```js
const element = {
  // existing fields
  flipH: true,
  flipV: true,
  altText: "강단 위의 성경",
};
const image = await buildFabricImage(fakeFabric, element);
assert.equal(image.flipX, true);
assert.equal(image.flipY, true);
assert.equal(image.customAltText, "강단 위의 성경");
assert.deepEqual(
  Object.fromEntries(
    Object.entries(fabricObjectToDescriptor(image)).filter(([key]) =>
      ["flipH", "flipV", "altText"].includes(key)
    )
  ),
  { flipH: true, flipV: true, altText: "강단 위의 성경" }
);
```

- [ ] **Step 3: Add failing PPTX mapping test**

Capture `slide.addImage()` and assert:

```js
assert.equal(imageOptions.flipH, true);
assert.equal(imageOptions.flipV, true);
assert.equal(imageOptions.altText, "강단 위의 성경");
```

Also assert empty alt text omits the option.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
node --test test/custom-slide-model.test.js test/custom-slide-editor.test.js test/custom-slide-pptx.test.js
```

- [ ] **Step 5: Implement normalization and conversion**

In `normalizeImageElement`:

```js
return {
  ...common,
  src: normalizeImageSrc(element.src),
  fit: normalizeImageFit(element.fit),
  flipH: Boolean(element.flipH),
  flipV: Boolean(element.flipV),
  altText:
    typeof element.altText === "string"
      ? element.altText.trim().slice(0, 500)
      : "",
};
```

In `buildFabricImage`, set:

```js
flipX: Boolean(element.flipH),
flipY: Boolean(element.flipV),
customAltText: element.altText ?? "",
```

In `fabricObjectToDescriptor`'s image branch, return:

```js
flipH: Boolean(object.flipX),
flipV: Boolean(object.flipY),
altText: object.customAltText ?? "",
```

In `addImage()` common PPTX options:

```js
flipH: Boolean(element.flipH),
flipV: Boolean(element.flipV),
...(element.altText ? { altText: element.altText } : {}),
```

- [ ] **Step 6: Run tests and commit**

```bash
node --test test/custom-slide-model.test.js test/custom-slide-editor.test.js test/custom-slide-pptx.test.js
git add public/custom-slide-model.js public/custom-slide-editor.js lib/custom-slide-pptx.js \
  test/custom-slide-model.test.js test/custom-slide-editor.test.js test/custom-slide-pptx.test.js
git commit -m "feat: persist native image properties"
```

---

### Task 2: Add intuitive inspector controls

**Files:**
- Modify: `test/custom-slide-editor-controller.test.js`
- Modify: `test/ppt-workspace-ui.test.js`
- Modify: `public/custom-editor-chrome.jsx`
- Modify: `public/styles.css`
- Modify: `public/custom-slide-editor.js`

**Interfaces:**
- Fields: `fit` radios, `flipH` checkbox, `flipV` checkbox, `altText` textarea
- Action: `replace-image`

- [ ] **Step 1: Add failing UI source contracts**

Assert the image panel contains:

```js
data-editor-action="replace-image"
type="radio" value="contain" data-editor-field="fit"
type="radio" value="cover" data-editor-field="fit"
data-editor-field="flipH"
data-editor-field="flipV"
maxlength={500}
data-editor-field="altText"
```

- [ ] **Step 2: Add failing controller tests**

Load an image, select it, and verify:

- the matching Fit radio is checked;
- choosing Cover preserves the authored box;
- flip checkboxes update `flipX`/`flipY` and serialize to `flipH`/`flipV`;
- alt text trims through model serialization;
- changes produce dirty state and undo history.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test test/custom-slide-editor-controller.test.js test/ppt-workspace-ui.test.js
```

- [ ] **Step 4: Support radio selection synchronization**

Update `setFieldValue`:

```js
if (input.type === "checkbox") {
  input.checked = Boolean(value);
} else if (input.type === "radio") {
  input.checked = input.value === String(value ?? "");
} else {
  input.value = value ?? "";
}
```

In the delegated change listener, ignore unchecked radios.

- [ ] **Step 5: Wire image fields**

When selecting an image:

```js
setFieldValue("fit", target.customFit ?? "contain");
setFieldValue("flipH", Boolean(target.flipX));
setFieldValue("flipV", Boolean(target.flipY));
setFieldValue("altText", target.customAltText ?? "");
```

In `applyFieldChange`:

```js
case "flipH":
  active.set({ flipX: input.checked });
  break;
case "flipV":
  active.set({ flipY: input.checked });
  break;
case "altText":
  active.set({ customAltText: input.value.slice(0, 500) });
  break;
```

- [ ] **Step 6: Implement image inspector markup**

Use native radio inputs styled as a two-option segment, icon chips for both
flips, a Replace button, and a textarea limited to 500 characters. Keep all
accessible names explicit.

- [ ] **Step 7: Add scoped CSS**

Style:

- `.custom-editor-fit-segment`
- `.custom-editor-fit-option`
- `.custom-editor-image-actions`
- `.custom-editor-image-alt`

Use existing control-height, border, brand tint, and focus-ring tokens.

- [ ] **Step 8: Run tests, build, and commit**

```bash
node --test test/custom-slide-editor-controller.test.js test/ppt-workspace-ui.test.js
npm run build
git add public/custom-editor-chrome.jsx public/custom-slide-editor.js public/styles.css \
  test/custom-slide-editor-controller.test.js test/ppt-workspace-ui.test.js
git commit -m "feat: add native image inspector controls"
```

---

### Task 3: Replace a selected image safely

**Files:**
- Modify: `test/custom-slide-editor-controller.test.js`
- Modify: `public/custom-slide-editor.js`

**Interfaces:**
- `insertImageFile(file, replacementId?)`
- `pendingImageReplacementId: string | null`

- [ ] **Step 1: Add failing replacement tests**

Cover:

1. successful replacement preserves all authored fields and selection;
2. upload failure leaves the original object and history unchanged;
3. decode failure leaves the original object unchanged;
4. selection change before completion rejects the replacement;
5. slide change before completion rejects the replacement;
6. Add Image still inserts a new object.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test --test-name-pattern="replace|replacement|adds an uploaded image" \
  test/custom-slide-editor-controller.test.js
```

- [ ] **Step 3: Add explicit picker mode**

Before clicking the file input:

```js
let pendingImageReplacementId = null;

case "replace-image": {
  const selected = selectedFabricObjects(canvas);
  pendingImageReplacementId =
    selected.length === 1 && selected[0].elementType === "image"
      ? selected[0].customElementId
      : null;
  if (pendingImageReplacementId) dom.file?.click();
  break;
}
case "add-image":
  pendingImageReplacementId = null;
  dom.file?.click();
  break;
```

The file change listener snapshots and clears the pending ID before starting
the async operation.

- [ ] **Step 4: Build the replacement off-canvas**

After upload, find the target by stable element ID and verify it is still the
sole selected image. Serialize its descriptor, replace only `src`, then call
`buildFabricImage`.

Do not remove the original until the new Fabric image has decoded
successfully.

- [ ] **Step 5: Swap atomically**

Insert the new image at the original stack index, remove the old image, restore
selection, render, push one history entry, and set the replacement status.

If any guard fails, return without mutating canvas or history.

- [ ] **Step 6: Run tests and commit**

```bash
node --test test/custom-slide-editor-controller.test.js
git add public/custom-slide-editor.js test/custom-slide-editor-controller.test.js
git commit -m "feat: replace custom slide images safely"
```

---

### Task 4: Full regression verification

**Files:**
- Modify: `test/browser/save-flow.playwright.mjs` only if browser coverage needs
  an additional image-control scenario.

- [ ] **Step 1: Add browser coverage**

Verify the image panel exposes Replace, Fit/Fill, Flip, and Alt Text; changing
Flip and Alt Text enables Save; undo restores the prior values.

- [ ] **Step 2: Run all Node tests**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: successful Vite build.

- [ ] **Step 4: Run browser tests**

```bash
npm run test:browser
```

Expected: all scenarios pass.

- [ ] **Step 5: Inspect final branch**

```bash
git diff --check
git status --short
git log --oneline -7
```

Expected: clean feature worktree containing only image-control commits.

## Self-Review

- Every included feature has model, Fabric, controller, UI, and export
  coverage.
- Replacement is atomic and preserves the original on every failure path.
- Radio synchronization does not change checkbox or text field behavior.
- Deferred crop, filter, mask, and background-removal features are absent.
