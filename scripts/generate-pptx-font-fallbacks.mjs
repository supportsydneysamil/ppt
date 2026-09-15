// Generates the substitute stylesheets the PPTX preview falls back to when an
// Office font is not installed, one file per family plus a manifest.
//
// The preview detects at runtime whether each family is actually available on
// the machine. When it is, nothing here is loaded and the genuine font renders
// as-is, which is exact. Only the missing families pull in a substitute. That
// is why the families are split into separate files rather than one bundle, and
// why the manifest carries the names a genuine font may be installed under:
// Windows exposes Malgun Gothic as both "Malgun Gothic" and "맑은 고딕", and
// the same font is absent on macOS and Linux.
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
//
// No local() sources are emitted. A descriptor applies to whichever src loads,
// so a local Office font would be scaled by a ratio derived for the substitute
// and end up wrong — and Chrome does not honour declaration order well enough
// to prefer a local face from a separate unadjusted rule (verified with
// scripts/font-fallback-order-probe.mjs). Always using the adjusted substitute
// keeps advances equal to the original and renders the same on every machine.
import * as fontkit from 'fontkit';
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "public", "pptx-fonts");

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

// A Hangul syllable, used to probe advance widths. Hangul is the one script
// that can be corrected exactly: every syllable shares a single advance within
// a font, and it does not vary along the weight axis.
const HANGUL_SAMPLE = 0xac00;

// The word space was tried as a separate correction, since it is the largest
// mismatch (Malgun 0.3516em vs Noto 0.2200em) and invisible, so scaling it
// changes no glyph shapes. It is not emitted: Noto's Latin and punctuation
// advances move along the variable weight axis, so Chrome lays a space out
// 1.27x wider than the static tables report and one fixed ratio cannot serve
// both regular and bold runs. Measured with scripts/dom-advance-probe.mjs.
const SPACE = 0x20;

// `face` picks a specific font out of a .ttc collection; gulim.ttc holds Gulim,
// GulimChe, Dotum and DotumChe, and batang.ttc holds Batang and Gungsuh.
// Aliases with no `file` have no installed original to measure, so they are
// substituted without adjustment rather than with a guessed ratio.
//
// `localNames` are the names the genuine font may be registered under on any
// platform. Hitting one of them means the substitute is skipped entirely, so
// only names of the real font belong here, or of a font metric-compatible with
// it by design. A mere lookalike would silently lose the match to the original.
const groups = [
  {
    packageName: "@fontsource-variable/noto-sans-kr",
    sourceFamily: "Noto Sans KR Variable",
    aliases: [
      { family: "Malgun Gothic", id: "malgun-gothic", file: "malgun.ttf", localNames: ["Malgun Gothic", "맑은 고딕"] },
      { family: "맑은 고딕", id: "malgun-gothic-ko", file: "malgun.ttf", localNames: ["맑은 고딕", "Malgun Gothic"] },
      { family: "Gulim", id: "gulim", file: "gulim.ttc", face: "Gulim", localNames: ["Gulim", "굴림"] },
      { family: "굴림", id: "gulim-ko", file: "gulim.ttc", face: "Gulim", localNames: ["굴림", "Gulim"] },
      { family: "Dotum", id: "dotum", file: "gulim.ttc", face: "Dotum", localNames: ["Dotum", "돋움"] },
      { family: "돋움", id: "dotum-ko", file: "gulim.ttc", face: "Dotum", localNames: ["돋움", "Dotum"] },
      { family: "HY견고딕", id: "hy-gothic-extra", localNames: ["HY견고딕", "HYGothic-Extra"] },
      { family: "NanumSquare Bold", id: "nanum-square-bold", localNames: ["NanumSquare Bold", "NanumSquare"] },
    ],
  },
  {
    packageName: "@fontsource-variable/noto-serif-kr",
    sourceFamily: "Noto Serif KR Variable",
    aliases: [
      { family: "Batang", id: "batang", file: "batang.ttc", face: "Batang", localNames: ["Batang", "바탕"] },
      { family: "바탕", id: "batang-ko", file: "batang.ttc", face: "Batang", localNames: ["바탕", "Batang"] },
      { family: "Gungsuh", id: "gungsuh", file: "batang.ttc", face: "Gungsuh", localNames: ["Gungsuh", "궁서"] },
      { family: "궁서", id: "gungsuh-ko", file: "batang.ttc", face: "Gungsuh", localNames: ["궁서", "Gungsuh"] },
    ],
  },
  {
    packageName: "@fontsource/carlito",
    sourceFamily: "Carlito",
    aliases: [
      // Carlito is a metric-compatible clone of Calibri, so a local Carlito is
      // as good as the original here.
      { family: "Calibri", id: "calibri", file: "Calibri.ttf", localNames: ["Calibri", "Carlito"] },
      { family: "Calibri Light", id: "calibri-light", file: "calibril.ttf", localNames: ["Calibri Light"] },
      { family: "Aptos", id: "aptos", file: "Aptos.ttf", localNames: ["Aptos"] },
      { family: "Aptos Display", id: "aptos-display", file: "Aptos-Display.ttf", localNames: ["Aptos Display"] },
    ],
  },
  {
    packageName: "@fontsource/arimo",
    sourceFamily: "Arimo",
    aliases: [
      { family: "Arial", id: "arial", file: "arial.ttf", localNames: ["Arial", "Liberation Sans", "Arimo"] },
    ],
  },
  {
    packageName: "@fontsource/tinos",
    sourceFamily: "Tinos",
    aliases: [
      {
        family: "Times New Roman",
        id: "times-new-roman",
        file: "times.ttf",
        localNames: ["Times New Roman", "Liberation Serif", "Tinos"],
      },
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

/** fontkit returns a collection for .ttc, so the wanted face is named. */
async function openFace(filePath, faceName) {
  const opened = await fontkit.open(filePath);
  if (!opened.fonts) return opened;
  if (!faceName) return opened.fonts[0];
  const match = opened.fonts.find(
    (f) => f.postscriptName === faceName || f.familyName === faceName
  );
  if (!match) throw new Error(`face ${faceName} not found in ${path.basename(filePath)}`);
  return match;
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

/** Finds the subset chunk that actually contains a code point. Chunks without
 *  it return a .notdef advance, which would silently corrupt the ratio. */
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

/** Drops U+0020 from a unicode-range list so the dedicated space face is the
 *  only one covering it, instead of relying on declaration-order precedence. */
function excludeSpace(rangeList) {
  return rangeList
    .split(",")
    .flatMap((entry) => {
      const token = entry.trim();
      const [startRaw, endRaw] = token.replace(/^U\+/iu, "").split("-");
      const start = parseInt(startRaw, 16);
      const end = endRaw === undefined ? start : parseInt(endRaw, 16);
      if (Number.isNaN(start) || SPACE < start || SPACE > end) return [token];
      const kept = [];
      if (start <= SPACE - 1) kept.push(start === SPACE - 1 ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${(SPACE - 1).toString(16)}`);
      if (end >= SPACE + 1) kept.push(end === SPACE + 1 ? `U+${end.toString(16)}` : `U+${(SPACE + 1).toString(16)}-${end.toString(16)}`);
      return kept;
    })
    .join(",");
}

const report = [];

function buildFaces(css, group, alias, measurements) {
  // Relative to public/pptx-fonts/, so two levels up to the repo root.
  const packageUrl = `../../node_modules/${group.packageName}/files/`;
  const blocks = css.match(/@font-face \{[\s\S]*?\}/gu) ?? [];
  const out = [];
  const hasSpaceFace = measurements.spaceAdjust != null;
  let spaceSourceBlock = null;

  const metricDescriptors = (sizeAdjust) => {
    const descriptors = [];
    if (sizeAdjust != null) descriptors.push(`  size-adjust: ${percent(sizeAdjust)};`);
    if (measurements.vertical) {
      // Chrome scales metric overrides by size-adjust too, so divide them out
      // first; verified with scripts/font-descriptor-probe.mjs.
      const divisor = sizeAdjust ?? 1;
      const { ascent, descent, lineGap } = measurements.vertical;
      descriptors.push(`  ascent-override: ${percent(ascent / divisor)};`);
      descriptors.push(`  descent-override: ${percent(descent / divisor)};`);
      descriptors.push(`  line-gap-override: ${percent(lineGap / divisor)};`);
    }
    return descriptors;
  };

  for (const block of blocks) {
    const url = /url\(\.\/files\/([^)]+)\)/u.exec(block)?.[1] ?? "";
    const range = /unicode-range: ([^;]+);/u.exec(block)?.[1] ?? "";
    const applySizeAdjust = measurements.sizeAdjust != null && isKoreanChunk(url);

    let rewritten = block
      .replace(`font-family: '${group.sourceFamily}'`, `font-family: '${alias.family}'`)
      .replace("font-display: swap", "font-display: block")
      .replaceAll("url(./files/", `url(${packageUrl}`)
      // Chrome does not instantiate the weight axis for the legacy
      // 'woff2-variations' hint; it loads the default (Thin) instance and
      // synthesises bold, which pads every advance. Plain 'woff2' lets it use
      // the real weight.
      .replace("format('woff2-variations')", "format('woff2')")
      .replace(/\n\}$/u, `\n${metricDescriptors(applySizeAdjust ? measurements.sizeAdjust : null).join("\n")}\n}`);

    if (hasSpaceFace && range) {
      const withoutSpace = excludeSpace(range);
      if (withoutSpace !== range) {
        if (!spaceSourceBlock) spaceSourceBlock = { url, block };
        // An empty range would match nothing, so drop the face entirely.
        if (!withoutSpace) continue;
        rewritten = rewritten.replace(`unicode-range: ${range};`, `unicode-range: ${withoutSpace};`);
      }
    }

    out.push(rewritten);
  }

  if (hasSpaceFace && spaceSourceBlock) {
    out.push(
      spaceSourceBlock.block
        .replace(`font-family: '${group.sourceFamily}'`, `font-family: '${alias.family}'`)
        .replace("font-display: swap", "font-display: block")
        .replaceAll("url(./files/", `url(${packageUrl}`)
        .replace(/unicode-range: [^;]+;/u, "unicode-range: U+20;")
        .replace(/\n\}$/u, `\n${metricDescriptors(measurements.spaceAdjust).join("\n")}\n}`)
    );
  }

  return out.join("\n\n");
}

const header = (family) =>
  [
    "/* Generated by scripts/generate-pptx-font-fallbacks.mjs — do not edit by hand.",
    " *",
    ` * Substitute for the Office family "${family}", loaded only when that font`,
    " * is not installed on the machine viewing the preview. size-adjust and the",
    " * metric overrides are computed from the original font binary, so they hold",
    " * for any deck rather than the one they were checked against. Latin advances",
    " * are left alone because they differ per glyph and no single ratio is right.",
    " */",
  ].join("\n");

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
const manifest = [];

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
  const fallbackSpace = await advanceAcrossChunks(chunkFiles.sort(), filesDir, SPACE);

  for (const alias of group.aliases) {
    const originalPath = await findFontFile(alias.file);
    const measurements = { sizeAdjust: null, spaceRatio: null, vertical: null };

    if (originalPath) {
      const face = await openFace(originalPath, alias.face);
      measurements.vertical = verticalMetrics(face);
      const originalHangul = advanceOf(face, HANGUL_SAMPLE);
      if (originalHangul != null && fallbackHangul) {
        measurements.sizeAdjust = originalHangul / fallbackHangul;
      }
      const originalSpace = advanceOf(face, SPACE);
      if (originalSpace != null && fallbackSpace) {
        // Reported for reference only; see the SPACE comment for why no face
        // is generated from it.
        measurements.spaceRatio = originalSpace / fallbackSpace;
      }
    }

    report.push({
      family: alias.family,
      source: originalPath ? path.basename(originalPath) : "not installed",
      sizeAdjust: measurements.sizeAdjust ? percent(measurements.sizeAdjust) : "-",
      spaceAdjust: measurements.spaceRatio ? `(${percent(measurements.spaceRatio)})` : "-",
      vertical: measurements.vertical
        ? `asc ${measurements.vertical.ascent.toFixed(4)} desc ${measurements.vertical.descent.toFixed(4)}`
        : "-",
    });

    const file = `${alias.id}.css`;
    await fs.writeFile(
      path.join(outputDir, file),
      `${header(alias.family)}\n\n${buildFaces(css, group, alias, measurements)}\n`
    );
    manifest.push({ family: alias.family, id: alias.id, localNames: alias.localNames });
  }
}

const manifestBody = manifest
  .map(
    (entry) =>
      `  { family: ${JSON.stringify(entry.family)}, id: ${JSON.stringify(entry.id)},` +
      ` localNames: ${JSON.stringify(entry.localNames)} },`
  )
  .join("\n");

await fs.writeFile(
  path.join(outputDir, "manifest.js"),
  [
    "// Generated by scripts/generate-pptx-font-fallbacks.mjs — do not edit by hand.",
    "//",
    "// localNames are the names the genuine Office font may be installed under on",
    "// any platform. If one of them resolves, the preview uses that font directly",
    "// and never loads the substitute stylesheet.",
    "export const FONT_SUBSTITUTES = [",
    manifestBody,
    "];",
    "",
  ].join("\n")
);

console.log("family              measured from      size-adjust   space        vertical");
for (const row of report) {
  console.log(
    `${row.family.padEnd(19)} ${row.source.padEnd(18)} ${row.sizeAdjust.padEnd(13)} ` +
    `${row.spaceAdjust.padEnd(12)} ${row.vertical}`
  );
}
console.log(`\nwrote ${manifest.length} stylesheets + manifest.js to ${path.relative(rootDir, outputDir)}`);
