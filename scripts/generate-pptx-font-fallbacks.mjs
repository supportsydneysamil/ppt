// Generates public/pptx-font-fallbacks.css so the PPTX preview can substitute
// Office fonts it cannot ship.
//
// Every number here is derived from the font binaries, not tuned against a
// screenshot: Hangul advances are uniform within a font, so the horizontal
// ratio is exact, and vertical metrics are fixed values in each file. Fonts
// whose original is not installed get a plain alias with no adjustment, since
// guessing their metrics would only fit the deck it was guessed from.
//
// Latin is deliberately left unadjusted. Malgun/Carlito Latin advances differ
// per glyph (space 1.60x, period 0.95x, 'B' 0.92x), so no single size-adjust
// is correct and any value would just overfit one sentence.
import * as fontkit from 'fontkit';
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, "public", "pptx-font-fallbacks.css");

// Where an original Office font may be installed. Used for measurement only;
// these files are never copied or served.
const FONT_SEARCH_DIRS = [
  "/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts",
  "/Applications/Microsoft Word.app/Contents/Resources/DFonts",
  "/Library/Fonts",
  "/System/Library/Fonts",
  "/System/Library/Fonts/Supplemental",
  "C:/Windows/Fonts",
];

// A Hangul syllable and a Latin letter, used to probe advance widths.
const HANGUL_SAMPLE = 0xac00;

const groups = [
  {
    packageName: "@fontsource-variable/noto-sans-kr",
    sourceFamily: "Noto Sans KR Variable",
    aliases: [
      { family: "Malgun Gothic", file: "malgun.ttf", locals: ["Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo"] },
      { family: "맑은 고딕", file: "malgun.ttf", locals: ["맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo"] },
      { family: "Gulim", file: "gulim.ttc", locals: ["Gulim", "굴림", "Apple SD Gothic Neo"] },
      { family: "굴림", file: "gulim.ttc", locals: ["굴림", "Gulim", "Apple SD Gothic Neo"] },
      { family: "Dotum", file: "dotum.ttc", locals: ["Dotum", "돋움", "Apple SD Gothic Neo"] },
      { family: "돋움", file: "dotum.ttc", locals: ["돋움", "Dotum", "Apple SD Gothic Neo"] },
      // No installed original to measure; alias only, so it degrades to plain
      // substitution instead of a guessed metric.
      { family: "HY견고딕", locals: ["HY견고딕", "HYGothic-Extra", "Apple SD Gothic Neo"] },
      { family: "NanumSquare Bold", locals: ["NanumSquare Bold", "NanumSquare", "Apple SD Gothic Neo"] },
    ],
  },
  {
    packageName: "@fontsource-variable/noto-serif-kr",
    sourceFamily: "Noto Serif KR Variable",
    aliases: [
      { family: "Batang", file: "batang.ttc", locals: ["Batang", "바탕", "AppleMyungjo"] },
      { family: "바탕", file: "batang.ttc", locals: ["바탕", "Batang", "AppleMyungjo"] },
    ],
  },
  {
    packageName: "@fontsource/carlito",
    sourceFamily: "Carlito",
    aliases: [
      { family: "Calibri", file: "Calibri.ttf", locals: ["Calibri", "Carlito"] },
      { family: "Calibri Light", file: "calibril.ttf", locals: ["Calibri Light", "Calibri", "Carlito"] },
      { family: "Aptos", file: "Aptos.ttf", locals: ["Aptos", "Calibri", "Carlito"] },
      { family: "Aptos Display", file: "Aptos-Display.ttf", locals: ["Aptos Display", "Aptos", "Calibri", "Carlito"] },
    ],
  },
  {
    packageName: "@fontsource/arimo",
    sourceFamily: "Arimo",
    aliases: [{ family: "Arial", file: "arial.ttf", locals: ["Arial", "Arial Unicode MS", "Liberation Sans", "Arimo"] }],
  },
  {
    packageName: "@fontsource/tinos",
    sourceFamily: "Tinos",
    aliases: [
      { family: "Times New Roman", file: "times.ttf", locals: ["Times New Roman", "Liberation Serif", "Tinos"] },
    ],
  },
];

async function findFontFile(fileName) {
  if (!fileName) return null;
  for (const dir of FONT_SEARCH_DIRS) {
    const candidate = path.join(dir, fileName);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

/** fontkit returns a collection for .ttc; the first face is the regular one. */
async function openFace(filePath) {
  const opened = await fontkit.open(filePath);
  return opened.fonts ? opened.fonts[0] : opened;
}

function verticalMetrics(face) {
  const upem = face.unitsPerEm;
  return {
    ascent: face.ascent / upem,
    descent: Math.abs(face.descent) / upem,
    lineGap: face.lineGap / upem,
  };
}

function advanceOf(face, codePoint) {
  if (!face.hasGlyphForCodePoint(codePoint)) return null;
  return face.glyphForCodePoint(codePoint).advanceWidth / face.unitsPerEm;
}

/** Finds the subset chunk that actually contains a code point. */
async function advanceAcrossChunks(files, dir, codePoint) {
  for (const file of files) {
    const face = await openFace(path.join(dir, file));
    const advance = advanceOf(face, codePoint);
    if (advance != null) return advance;
  }
  return null;
}

function percent(value) {
  return `${+(value * 100).toFixed(4)}%`;
}

/** Korean subsets are the numbered chunks; latin/cyrillic/vietnamese are not. */
function isKoreanChunk(url) {
  return /-\d+-wght-normal\.woff2$/.test(url);
}

const report = [];

function buildFaces(css, group, alias, measurements) {
  const packageUrl = `../node_modules/${group.packageName}/files/`;
  const blocks = css.match(/@font-face \{[\s\S]*?\}/gu) ?? [];
  const out = [];

  for (const block of blocks) {
    const url = /url\(\.\/files\/([^)]+)\)/u.exec(block)?.[1] ?? "";
    const applySizeAdjust = measurements.sizeAdjust != null && isKoreanChunk(url);

    const descriptors = [];
    if (applySizeAdjust) descriptors.push(`  size-adjust: ${percent(measurements.sizeAdjust)};`);
    if (measurements.vertical) {
      // Chrome scales metric overrides by size-adjust as well, so divide them
      // out first; verified with scripts/font-descriptor-probe.mjs.
      const divisor = applySizeAdjust ? measurements.sizeAdjust : 1;
      const { ascent, descent, lineGap } = measurements.vertical;
      descriptors.push(`  ascent-override: ${percent(ascent / divisor)};`);
      descriptors.push(`  descent-override: ${percent(descent / divisor)};`);
      descriptors.push(`  line-gap-override: ${percent(lineGap / divisor)};`);
    }

    out.push(
      block
        .replace(`font-family: '${group.sourceFamily}'`, `font-family: '${alias.family}'`)
        .replace("font-display: swap", "font-display: block")
        .replace("url(./files/", `url(${packageUrl}`)
        .replace(/ {2}src: /u, `  src: ${alias.locals.map((n) => `local('${n}')`).join(", ")}, `)
        .replace(/\n\}$/u, `\n${descriptors.join("\n")}\n}`)
    );
  }

  return out.join("\n\n");
}

const sections = [
  "/* Generated by scripts/generate-pptx-font-fallbacks.mjs — do not edit by hand.",
  " *",
  " * Substitutes Office fonts that cannot be shipped. size-adjust and the metric",
  " * overrides are computed from the original font binaries, so they hold for any",
  " * deck rather than the one they were checked against. Fonts with no installed",
  " * original are aliased without adjustment. Latin advances are left alone",
  " * because they differ per glyph and no single ratio is correct.",
  " */",
];

for (const group of groups) {
  const packageDir = path.join(rootDir, "node_modules", group.packageName);
  const css = await fs.readFile(path.join(packageDir, "index.css"), "utf8");
  const filesDir = path.join(packageDir, "files");
  const chunkFiles = (await fs.readdir(filesDir)).filter((f) => f.endsWith(".woff2"));

  // Korean packages are measured on a Hangul syllable; the Latin-only
  // fallbacks are aliased without a horizontal adjustment.
  const koreanChunks = chunkFiles.filter((f) => /-\d+-wght-normal\.woff2$/.test(f)).sort();
  const fallbackHangul = koreanChunks.length
    ? await advanceAcrossChunks(koreanChunks, filesDir, HANGUL_SAMPLE)
    : null;

  for (const alias of group.aliases) {
    const originalPath = await findFontFile(alias.file);
    const measurements = { sizeAdjust: null, vertical: null };

    if (originalPath) {
      const face = await openFace(originalPath);
      measurements.vertical = verticalMetrics(face);
      const originalHangul = advanceOf(face, HANGUL_SAMPLE);
      if (originalHangul != null && fallbackHangul) {
        measurements.sizeAdjust = originalHangul / fallbackHangul;
      }
    }

    report.push({
      family: alias.family,
      source: originalPath ? path.basename(originalPath) : "not installed",
      sizeAdjust: measurements.sizeAdjust ? percent(measurements.sizeAdjust) : "-",
      vertical: measurements.vertical
        ? `asc ${measurements.vertical.ascent.toFixed(4)} desc ${measurements.vertical.descent.toFixed(4)}`
        : "-",
    });

    sections.push(`\n/* PowerPoint family: ${alias.family} */\n`, buildFaces(css, group, alias, measurements));
  }
}

await fs.writeFile(outputPath, `${sections.join("\n")}\n`);

console.log("family              measured from      size-adjust   vertical");
for (const row of report) {
  console.log(
    `${row.family.padEnd(19)} ${row.source.padEnd(18)} ${row.sizeAdjust.padEnd(13)} ${row.vertical}`
  );
}
console.log(`\nwrote ${path.relative(rootDir, outputPath)}`);
