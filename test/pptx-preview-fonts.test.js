import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (...parts) => fs.readFile(path.join(rootDir, ...parts), "utf8");

function facesFor(css, family) {
  return (css.match(/@font-face \{[\s\S]*?\}/gu) ?? []).filter((block) =>
    block.includes(`font-family: '${family}';`)
  );
}

function descriptor(face, name) {
  return new RegExp(`${name}: ([^;]+);`, "u").exec(face)?.[1] ?? null;
}

test("PPTX preview font fallbacks", async (t) => {
  const [css, main, app] = await Promise.all([
    read("public", "pptx-font-fallbacks.css"),
    read("public", "main.jsx"),
    read("public", "app.js"),
  ]);

  await t.test("loads only when a deck is previewed", () => {
    assert.doesNotMatch(main, /pptx-font-fallbacks\.css/);
    assert.match(app, /await import\(['"]\.\/pptx-font-fallbacks\.css['"]\)/);
  });

  await t.test("covers the Office families these decks reference", () => {
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
      "Calibri Light",
      "Aptos",
      "Arial",
      "Times New Roman",
    ]) {
      assert.ok(facesFor(css, family).length > 0, family);
    }
  });

  await t.test("never serves a local font alongside adjusted metrics", () => {
    // A descriptor applies to whichever src loads, so a genuine Office font
    // would be rescaled by a ratio derived for the substitute.
    assert.doesNotMatch(css, /local\(/u);
  });

  await t.test("lets Chrome instantiate the weight axis", () => {
    // 'woff2-variations' makes Chrome load the default instance and synthesise
    // bold, which pads every advance.
    assert.doesNotMatch(css, /woff2-variations/u);
  });

  await t.test("scales Hangul to the original advance, and only Hangul", () => {
    const korean = facesFor(css, "Malgun Gothic").filter((face) =>
      /noto-sans-kr-\d+-wght-normal/u.test(face)
    );
    const latin = facesFor(css, "Malgun Gothic").filter((face) =>
      /noto-sans-kr-latin-wght-normal/u.test(face)
    );

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

  await t.test("pins vertical metrics to the original font", () => {
    // Malgun Gothic: ascent 1.0884em, descent 0.2417em. Chrome scales metric
    // overrides by size-adjust too, so the Korean faces carry pre-divided
    // values that resolve back to the same effective metrics.
    const [latin] = facesFor(css, "Malgun Gothic").filter((face) =>
      /noto-sans-kr-latin-wght-normal/u.test(face)
    );
    assert.equal(descriptor(latin, "ascent-override"), "108.8379%");
    assert.equal(descriptor(latin, "descent-override"), "24.1699%");
    assert.equal(descriptor(latin, "line-gap-override"), "0%");

    const [korean] = facesFor(css, "Malgun Gothic").filter((face) =>
      /noto-sans-kr-\d+-wght-normal/u.test(face)
    );
    const sizeAdjust = 1.086957;
    const ascent = parseFloat(descriptor(korean, "ascent-override")) / 100;
    const descent = parseFloat(descriptor(korean, "descent-override")) / 100;
    assert.ok(Math.abs(ascent * sizeAdjust - 1.0884) < 0.0005);
    assert.ok(Math.abs(descent * sizeAdjust - 0.2417) < 0.0005);
  });

  await t.test("substitutes unmeasurable fonts without guessing metrics", () => {
    // HY견고딕 is not installed anywhere, so any ratio would be invented.
    for (const face of facesFor(css, "HY견고딕")) {
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
