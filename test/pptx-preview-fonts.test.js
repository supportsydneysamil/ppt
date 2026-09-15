import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = path.join(rootDir, "public", "pptx-fonts");

const read = (...parts) => fs.readFile(path.join(rootDir, ...parts), "utf8");

function faces(css) {
  return css.match(/@font-face \{[\s\S]*?\}/gu) ?? [];
}

function descriptor(face, name) {
  return new RegExp(`${name}: ([^;]+);`, "u").exec(face)?.[1] ?? null;
}

test("PPTX preview font substitutes", async (t) => {
  const { FONT_SUBSTITUTES } = await import(
    path.join(fontsDir, "manifest.js")
  );

  await t.test("ships one stylesheet per substituted family", async () => {
    const files = await fs.readdir(fontsDir);
    for (const entry of FONT_SUBSTITUTES) {
      assert.ok(files.includes(`${entry.id}.css`), entry.family);
    }
    // Nothing stale: every stylesheet is claimed by the manifest.
    const ids = new Set(FONT_SUBSTITUTES.map((entry) => entry.id));
    for (const file of files.filter((f) => f.endsWith(".css"))) {
      assert.ok(ids.has(file.replace(/\.css$/u, "")), file);
    }
  });

  await t.test("covers the Office families these decks reference", () => {
    const families = FONT_SUBSTITUTES.map((entry) => entry.family);
    for (const family of [
      "Malgun Gothic",
      "맑은 고딕",
      "Gulim",
      "굴림",
      "Dotum",
      "Batang",
      "바탕",
      "HY견고딕",
      "NanumSquare Bold",
      "Calibri",
      "Arial",
      "Times New Roman",
    ]) {
      assert.ok(families.includes(family), family);
    }
  });

  await t.test("lists the platform names a genuine font may carry", () => {
    const byFamily = new Map(FONT_SUBSTITUTES.map((entry) => [entry.family, entry]));
    // Windows exposes both names; matching either must skip the substitute.
    assert.deepEqual(byFamily.get("Malgun Gothic").localNames, ["Malgun Gothic", "맑은 고딕"]);
    // Linux ships a metric-compatible clone rather than Arial itself.
    assert.ok(byFamily.get("Arial").localNames.includes("Liberation Sans"));
    for (const entry of FONT_SUBSTITUTES) {
      assert.ok(entry.localNames.length > 0, entry.family);
      assert.ok(entry.localNames.includes(entry.family), entry.family);
    }
  });

  await t.test("loads substitutes only for missing fonts", async () => {
    const app = await read("public", "app.js");
    const main = await read("public", "main.jsx");
    assert.match(app, /import\.meta\.glob\('\.\/pptx-fonts\/\*\.css'\)/u);
    assert.match(app, /await loadMissingDeckFonts\(\)/u);
    // Nothing font-related may load on first paint.
    assert.doesNotMatch(main, /pptx-font/u);
  });

  await t.test("never serves a local font alongside adjusted metrics", async () => {
    // A descriptor applies to whichever src loads, so a genuine Office font
    // would be rescaled by a ratio derived for the substitute. Availability is
    // decided before loading instead.
    for (const entry of FONT_SUBSTITUTES) {
      const css = await read("public", "pptx-fonts", `${entry.id}.css`);
      assert.doesNotMatch(css, /local\(/u, entry.family);
      assert.doesNotMatch(css, /woff2-variations/u, entry.family);
    }
  });

  await t.test("scales Hangul to the original advance, and only Hangul", async () => {
    const css = await read("public", "pptx-fonts", "malgun-gothic.css");
    const korean = faces(css).filter((face) => /noto-sans-kr-\d+-wght-normal/u.test(face));
    const latin = faces(css).filter((face) => /noto-sans-kr-latin-wght-normal/u.test(face));

    assert.ok(korean.length > 100, "expected many Korean subset faces");
    assert.equal(latin.length, 1);

    // Every Hangul syllable is 1.0em in Malgun Gothic and 0.92em in Noto Sans
    // KR, so 1/0.92 is exact rather than fitted.
    for (const face of korean) {
      assert.equal(descriptor(face, "size-adjust"), "108.6957%");
    }
    // Latin advances differ per glyph, so no single ratio is correct.
    assert.equal(descriptor(latin[0], "size-adjust"), null);
  });

  await t.test("pins vertical metrics to the original font", async () => {
    const css = await read("public", "pptx-fonts", "malgun-gothic.css");
    // Malgun Gothic: ascent 1.0884em, descent 0.2417em.
    const [latin] = faces(css).filter((face) => /noto-sans-kr-latin-wght-normal/u.test(face));
    assert.equal(descriptor(latin, "ascent-override"), "108.8379%");
    assert.equal(descriptor(latin, "descent-override"), "24.1699%");
    assert.equal(descriptor(latin, "line-gap-override"), "0%");

    // Chrome scales metric overrides by size-adjust too, so the Korean faces
    // carry pre-divided values that resolve back to the same metrics.
    const [korean] = faces(css).filter((face) => /noto-sans-kr-\d+-wght-normal/u.test(face));
    const sizeAdjust = 1.086957;
    const ascent = parseFloat(descriptor(korean, "ascent-override")) / 100;
    const descent = parseFloat(descriptor(korean, "descent-override")) / 100;
    assert.ok(Math.abs(ascent * sizeAdjust - 1.0884) < 0.0005);
    assert.ok(Math.abs(descent * sizeAdjust - 0.2417) < 0.0005);
  });

  await t.test("substitutes unmeasurable fonts without guessing metrics", async () => {
    // HY견고딕 is not installed anywhere, so any ratio would be invented.
    const css = await read("public", "pptx-fonts", "hy-gothic-extra.css");
    for (const face of faces(css)) {
      assert.equal(descriptor(face, "size-adjust"), null);
      assert.equal(descriptor(face, "ascent-override"), null);
    }
  });

  await t.test("keeps the container strut aligned with deck body text", async () => {
    // A strut whose ascent/descent ratio differs from the run's grows the line
    // box; inheriting the app UI font added 5px per line.
    const styles = await read("public", "styles.css");
    assert.match(styles, /\.pptx-deck \{[^}]*font-family: "Malgun Gothic"/u);
  });
});
