import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("PPTX preview registers deterministic Office font fallbacks", async () => {
  const [css, main, app] = await Promise.all([
    fs.readFile(path.join(rootDir, "public", "pptx-font-fallbacks.css"), "utf8"),
    fs.readFile(path.join(rootDir, "public", "main.jsx"), "utf8"),
    fs.readFile(path.join(rootDir, "public", "app.js"), "utf8"),
  ]);

  assert.doesNotMatch(main, /pptx-font-fallbacks\.css/);
  assert.match(app, /await import\(['"]\.\/pptx-font-fallbacks\.css['"]\)/);

  for (const family of [
    "Malgun Gothic",
    "맑은 고딕",
    "굴림",
    "Batang",
    "Calibri",
    "Calibri Light",
    "Aptos",
    "Arial",
    "Times New Roman",
  ]) {
    assert.match(css, new RegExp(`font-family: '${family}'`, "u"), family);
  }

  assert.match(
    css,
    /font-family: 'Malgun Gothic'[\s\S]*?src: local\('Malgun Gothic'\), local\('맑은 고딕'\), local\('Apple SD Gothic Neo'\), local\('Noto Sans CJK KR'\), url\(/u,
  );
  assert.match(
    css,
    /font-family: 'Malgun Gothic'[\s\S]*?size-adjust: 105%/u,
  );
  assert.match(css, /font-family: 'Calibri'[\s\S]*?local\('Calibri'\)[\s\S]*?carlito-latin/u);
  assert.match(css, /font-family: 'Arial'[\s\S]*?local\('Arial'\)[\s\S]*?arimo-latin/u);
  assert.match(css, /font-family: 'Times New Roman'[\s\S]*?local\('Times New Roman'\)[\s\S]*?tinos-latin/u);

  // Fontsource splits Korean into unicode-range chunks. Keeping those ranges
  // means the browser downloads only chunks containing glyphs used by a deck.
  assert.ok((css.match(/font-family: 'Malgun Gothic'/gu) || []).length > 100);
  assert.ok((css.match(/unicode-range:/gu) || []).length > 200);
});
