# Custom Slide Templates and Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the custom slide editor 15 church layouts and 21 recolor themes that change colors without touching copy or geometry.

**Architecture:** A dedicated theme module owns palettes and `applyTheme`. Template definitions gain `themeRole` / `themeStrokeRole`. The model keeps those fields plus `themeId` and `templateId` through Fabric serialize. The editor chrome exposes a theme select next to the template select.

**Tech Stack:** JavaScript ES modules, Node test runner, Fabric 6, existing custom-slide editor/controller tests.

## Global Constraints

- 15 templates with the spec ids and Korean labels; canvas 1280×720; no image assets.
- 21 themes with the spec ids, labels, and hex values.
- Recolor by role only; images and unroled elements stay; manual fill/color/stroke clears that element's matching role.
- `index.html` must not hardcode template or theme options.
- Do not change Sunday-worship title catalog or `data/templates.json`.
- Do not commit unless the user asks.

---

### Task 1: Theme module and model persistence

**Files:**
- Create: `public/custom-slide-themes.js`
- Create: `test/custom-slide-themes.test.js`
- Modify: `public/custom-slide-model.js`
- Modify: `test/custom-slide-model.test.js`

**Interfaces:**
- Produces: `THEME_ROLES`, `CUSTOM_SLIDE_THEMES`, `nativePaletteFromDefinition(definition)`, `resolvePalette(themeId, nativePalette)`, `applyTheme(model, palette)`, `clearThemeRoleForColorField(element, field)`
- Produces: `normalizeCustomSlide` keeps `themeId`, `templateId`, `themeRole`, `themeStrokeRole`

- [ ] **Step 1: Write failing theme tests** in `test/custom-slide-themes.test.js` covering 21 theme ids, `applyTheme` recolor vs geometry, skip unroled/image, native fallback, `clearThemeRoleForColorField`.
- [ ] **Step 2: Run tests — expect FAIL** (`node --test test/custom-slide-themes.test.js`)
- [ ] **Step 3: Implement `public/custom-slide-themes.js` and persist roles on the model + Fabric round-trip**
- [ ] **Step 4: Run tests — expect PASS** (`node --test test/custom-slide-themes.test.js test/custom-slide-model.test.js`)

### Task 2: Fifteen templates and instantiateTemplate(themeId)

**Files:**
- Modify: `public/custom-slide-editor.js` (`TEMPLATE_DEFINITIONS`, `instantiateTemplate`)
- Modify: `test/custom-slide-editor.test.js`

**Interfaces:**
- Consumes: `applyTheme`, `resolvePalette`, `nativePaletteFromDefinition`
- Produces: `instantiateTemplate(templateId, idFactory, themeId)` returning a cloned model painted with that theme; `CUSTOM_SLIDE_TEMPLATES[].nativePalette`

- [ ] **Step 1: Extend template tests** — 15 ids, every non-blank design has roles, instantiate with `plain` paints `#ffffff` background, native keeps original title-hero `#0f172a`
- [ ] **Step 2: Run tests — expect FAIL**
- [ ] **Step 3: Add roles to existing designs, add 10 church layouts, thread theme into instantiateTemplate**
- [ ] **Step 4: Run tests — expect PASS** (`node --test test/custom-slide-editor.test.js`)

### Task 3: Editor chrome and live theme apply

**Files:**
- Modify: `public/custom-editor-chrome.jsx`
- Modify: `public/custom-slide-editor.js` (populate theme select, `applyTemplate` reads theme, theme change handler, strip roles on color/fill/stroke)
- Modify: `test/custom-slide-editor-controller.test.js`

**Interfaces:**
- Consumes: `CUSTOM_SLIDE_THEMES`, `applyTheme`, `instantiateTemplate`
- Produces: `[data-custom-editor="theme"]` options from the module; changing it recolors the current slide

- [ ] **Step 1: Write failing controller tests** for theme options and applying a theme without rewriting text
- [ ] **Step 2: Run tests — expect FAIL**
- [ ] **Step 3: Add the select, wire apply/strip, keep history**
- [ ] **Step 4: Run tests — expect PASS** (`node --test test/custom-slide-editor-controller.test.js test/custom-slide-editor.test.js test/custom-slide-themes.test.js test/custom-slide-model.test.js`)

---

Spec coverage: 15 templates, 21 palettes, role recolor, native per template, editor UI, model fields, tests, no hardcoded markup options.
