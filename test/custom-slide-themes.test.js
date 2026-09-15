import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCustomSlide } from "../public/custom-slide-model.js";
import {
  CUSTOM_SLIDE_THEMES,
  applyTheme,
  clearThemeRoleForColorField,
  nativePaletteFromDefinition,
  resolvePalette,
} from "../public/custom-slide-themes.js";

const EXPECTED_THEME_IDS = [
  "native",
  "plain",
  "deep-black",
  "simple",
  "midnight",
  "warm-sand",
  "evergreen",
  "navy-gold",
  "stone",
  "wine",
  "ivory",
  "charcoal",
  "dawn",
  "cobalt",
  "linen",
  "graphite",
  "fog",
  "copper",
  "pearl",
  "violet",
  "lake",
];

test("CUSTOM_SLIDE_THEMES lists twenty-one unique church palettes", () => {
  assert.equal(CUSTOM_SLIDE_THEMES.length, 21);
  assert.deepEqual(
    CUSTOM_SLIDE_THEMES.map((theme) => theme.id),
    EXPECTED_THEME_IDS
  );
  assert.equal(new Set(EXPECTED_THEME_IDS).size, 21);
  const plain = CUSTOM_SLIDE_THEMES.find((theme) => theme.id === "plain");
  assert.equal(plain.label, "플레인");
  assert.equal(plain.background, "#ffffff");
  assert.equal(plain.accent, "#111827");
  assert.equal(plain.title, "#111827");
});

test("nativePaletteFromDefinition reads background and role colors", () => {
  const palette = nativePaletteFromDefinition({
    background: "#0f172a",
    elements: [
      { type: "rect", themeRole: "accent", fill: "#1d4ed8" },
      { type: "text", themeRole: "title", color: "#ffffff" },
      { type: "roundRect", themeRole: "surface", themeStrokeRole: "stroke", fill: "#ffffff", stroke: "#cbd5e1" },
      { type: "line", themeRole: "accent", stroke: "#2563eb" },
    ],
  });
  assert.equal(palette.background, "#0f172a");
  assert.equal(palette.accent, "#2563eb");
  assert.equal(palette.title, "#ffffff");
  assert.equal(palette.surface, "#ffffff");
  assert.equal(palette.stroke, "#cbd5e1");
});

test("resolvePalette uses native fallback for missing ids", () => {
  const native = { background: "#0f172a", title: "#ffffff", accent: "#1d4ed8", body: "#ccc", muted: "#aaa", surface: "#111", stroke: "#222" };
  assert.equal(resolvePalette("native", native).background, "#0f172a");
  assert.equal(resolvePalette("does-not-exist", native).background, "#0f172a");
  assert.equal(resolvePalette("plain", native).background, "#ffffff");
});

test("applyTheme recolors role-bearing elements and leaves copy and geometry", () => {
  const model = normalizeCustomSlide({
    background: { color: "#0f172a" },
    elements: [
      {
        id: "band",
        type: "rect",
        x: 0,
        y: 232,
        width: 1280,
        height: 256,
        fill: "#1d4ed8",
        themeRole: "accent",
      },
      {
        id: "title",
        type: "text",
        x: 140,
        y: 268,
        width: 1000,
        height: 110,
        text: "제목을 입력하세요",
        color: "#ffffff",
        fontSize: 72,
        themeRole: "title",
      },
      {
        id: "extra",
        type: "rect",
        x: 10,
        y: 10,
        width: 40,
        height: 40,
        fill: "#ff00ff",
      },
      {
        id: "photo",
        type: "image",
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        src: "/uploads/a.png",
        themeRole: "surface",
      },
    ],
  });

  const painted = applyTheme(model, resolvePalette("plain", { background: "#0f172a" }));
  assert.equal(painted.themeId, "plain");
  assert.equal(painted.background.color, "#ffffff");
  assert.equal(painted.elements[0].fill, "#111827");
  assert.equal(painted.elements[0].x, 0);
  assert.equal(painted.elements[1].color, "#111827");
  assert.equal(painted.elements[1].text, "제목을 입력하세요");
  assert.equal(painted.elements[1].fontSize, 72);
  assert.equal(painted.elements[2].fill, "#ff00ff");
  assert.equal(painted.elements[3].src, "/uploads/a.png");
});

test("clearThemeRoleForColorField drops only the matching role", () => {
  const card = {
    type: "roundRect",
    themeRole: "surface",
    themeStrokeRole: "stroke",
    fill: "#ffffff",
    stroke: "#cbd5e1",
  };
  const afterFill = clearThemeRoleForColorField(card, "fill");
  assert.equal(afterFill.themeRole, undefined);
  assert.equal(afterFill.themeStrokeRole, "stroke");
  const afterColor = clearThemeRoleForColorField({ type: "text", themeRole: "title" }, "color");
  assert.equal(afterColor.themeRole, undefined);
  const afterStroke = clearThemeRoleForColorField(card, "stroke");
  assert.equal(afterStroke.themeStrokeRole, undefined);
  assert.equal(afterStroke.themeRole, "surface");
});
