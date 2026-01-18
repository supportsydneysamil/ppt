import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import PptxGenJS from "pptxgenjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URLS = {
  ko: "https://biblics.com/ko/성경/새번역",
  en: "https://biblics.com/en/bible/new-international-version",
};

const booksPath = path.join(__dirname, "data", "books.json");
const booksData = JSON.parse(await fs.readFile(booksPath, "utf-8"));

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/books", (req, res) => {
  res.json(booksData);
});

app.get("/api/verses", async (req, res) => {
  try {
    const payload = await getVersePayload(req.query);
    return res.json(payload);
  } catch (err) {
    return res.status(err.statusCode || 502).json({ error: err.message });
  }
});

app.get("/api/pptx", async (req, res) => {
  try {
    const payload = await getVersePayload(req.query);
    const pptx = buildPptx(payload.lines);
    const buffer = await pptx.write({ outputType: "nodebuffer" });
    const filename = buildPptxFilename(req.query, payload);
    const asciiFilename = sanitizeAsciiFilename(filename);
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    return res.send(buffer);
  } catch (err) {
    return res.status(err.statusCode || 502).json({ error: err.message });
  }
});

function buildUrl(language, testamentEntry, bookEntry, chapterNum) {
  const testamentSlug =
    language === "en" ? testamentEntry.slugEn : testamentEntry.slugKo;
  const bookSlug = language === "en" ? bookEntry.slugEn : bookEntry.slugKo;

  return `${BASE_URLS[language]}/${encodeURIComponent(
    testamentSlug
  )}/${encodeURIComponent(bookSlug)}/${chapterNum}`;
}

function normalizeLanguages(raw) {
  if (!raw) {
    return ["ko"];
  }

  const languages = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(languages)].filter((lang) =>
    Object.prototype.hasOwnProperty.call(BASE_URLS, lang)
  );
}

async function getVersePayload(query) {
  const { testament, book, chapter, start, end, lang } = query;
  if (!testament || !book || !chapter) {
    const err = new Error("testament, book, chapter are required");
    err.statusCode = 400;
    throw err;
  }

  const testamentEntry = booksData.testaments.find((t) => t.id === testament);
  if (!testamentEntry) {
    const err = new Error("invalid testament");
    err.statusCode = 400;
    throw err;
  }

  const bookEntry = testamentEntry.books.find(
    (b) => b.slugKo === book || b.slugEn === book || b.name === book
  );
  if (!bookEntry) {
    const err = new Error("invalid book");
    err.statusCode = 400;
    throw err;
  }

  const chapterNum = Number.parseInt(chapter, 10);
  if (!Number.isFinite(chapterNum) || chapterNum <= 0) {
    const err = new Error("invalid chapter");
    err.statusCode = 400;
    throw err;
  }

  const startNum = start ? Number.parseInt(start, 10) : null;
  const endNum = end ? Number.parseInt(end, 10) : null;
  if (startNum !== null && (!Number.isFinite(startNum) || startNum <= 0)) {
    const err = new Error("invalid start");
    err.statusCode = 400;
    throw err;
  }
  if (endNum !== null && (!Number.isFinite(endNum) || endNum <= 0)) {
    const err = new Error("invalid end");
    err.statusCode = 400;
    throw err;
  }
  if (startNum !== null && endNum !== null && startNum > endNum) {
    const err = new Error("start cannot be greater than end");
    err.statusCode = 400;
    throw err;
  }

  const languages = normalizeLanguages(lang);
  if (languages.length === 0) {
    const err = new Error("invalid language selection");
    err.statusCode = 400;
    throw err;
  }

  try {
    const results = await Promise.all(
      languages.map(async (language) => {
        const url = buildUrl(language, testamentEntry, bookEntry, chapterNum);
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; biblics-extractor/1.0)",
          },
        });

        if (!resp.ok) {
          const err = new Error("failed to fetch source");
          err.statusCode = 502;
          throw err;
        }

        const html = await resp.text();
        const items = parseChapter(html);
        const lines = filterLines(items, startNum, endNum);
        return { language, url, lines };
      })
    );

    if (results.some((result) => result.lines.length === 0)) {
      const err = new Error("no verses found");
      err.statusCode = 404;
      throw err;
    }

    const sourceUrl = {};
    const lines = {};

    results.forEach((result) => {
      sourceUrl[result.language] = result.url;
      lines[result.language] = result.lines;
    });

    return { sourceUrl, lines };
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 502;
    }
    throw err;
  }
}

function buildPptxFilename(query, payload) {
  const book = query.book || "bible";
  const chapter = query.chapter || "chapter";
  const start = query.start;
  const end = query.end;
  const range = start && end ? `${start}-${end}` : start || end || "all";
  const langs = Object.keys(payload.lines || {});
  const langLabel = langs.length === 2 ? "KO-EN" : langs[0]?.toUpperCase() || "LANG";
  const raw = `${book}_${chapter}_${range}_${langLabel}.pptx`;

  return sanitizeFilename(raw);
}

function buildPptx(linesByLang) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const layout = {
    width: 13.333,
    height: 7.5,
    marginX: 1.0,
    marginY: 0.6,
  };
  const safe = {
    x: layout.marginX,
    y: layout.marginY,
    w: layout.width - layout.marginX * 2,
    h: layout.height - layout.marginY * 2,
  };

  const hasKo = Array.isArray(linesByLang.ko);
  const hasEn = Array.isArray(linesByLang.en);

  if (hasKo && hasEn) {
    addBothSlides(pptx, linesByLang, safe);
  } else if (hasEn) {
    addSingleLanguageSlides(pptx, linesByLang.en, safe, "en");
  } else {
    addSingleLanguageSlides(pptx, linesByLang.ko || [], safe, "ko");
  }

  return pptx;
}

function addSingleLanguageSlides(pptx, lines, safe, lang) {
  const config = getLanguageConfig(lang);
  const entries = toEntries(lines);
  const textBlocks = entries.length ? entries.map((entry) => entry.line) : lines;

  textBlocks.forEach((text) => {
    const slides = fitTextToSlides(text, safe, config);
    slides.forEach((slideItem) => {
      const slide = pptx.addSlide();
      slide.background = { color: "000000" };
      slide.addText(slideItem.text, {
        x: safe.x,
        y: safe.y,
        w: safe.w,
        h: safe.h,
        fontFace: config.fontFace,
        fontSize: slideItem.fontSize,
        bold: true,
        color: "FFFFFF",
        align: "left",
        valign: "top",
        lineSpacingMultiple: config.lineSpacing,
      });
    });
  });
}

function addBothSlides(pptx, linesByLang, safe) {
  const koEntries = toEntries(linesByLang.ko || []);
  const enEntries = toEntries(linesByLang.en || []);
  const koMap = new Map(koEntries.filter((e) => e.num !== null).map((e) => [e.num, e.line]));
  const enMap = new Map(enEntries.filter((e) => e.num !== null).map((e) => [e.num, e.line]));
  const orderedNums = koEntries.length
    ? koEntries.filter((e) => e.num !== null).map((e) => e.num)
    : enEntries.filter((e) => e.num !== null).map((e) => e.num);

  const topHeight = safe.h * 0.62;
  const gap = safe.h * 0.05;
  const bottomHeight = safe.h - topHeight - gap;
  const topBox = { x: safe.x, y: safe.y, w: safe.w, h: topHeight };
  const bottomBox = {
    x: safe.x,
    y: safe.y + topHeight + gap,
    w: safe.w,
    h: bottomHeight,
  };

  const enConfig = getLanguageConfig("en");
  const koConfig = getLanguageConfig("ko");
  const enConfigBoth = { ...enConfig, maxFontSize: 36 };

  orderedNums.forEach((num) => {
    const koText = koMap.get(num) || "";
    const enText = enMap.get(num) || "";
    const slide = pptx.addSlide();
    slide.background = { color: "000000" };

    if (koText) {
      const fittedKo = fitText(koText, topBox, koConfig);
      slide.addText(fittedKo.text, {
        x: topBox.x,
        y: topBox.y,
        w: topBox.w,
        h: topBox.h,
        fontFace: koConfig.fontFace,
        fontSize: fittedKo.fontSize,
        bold: true,
        color: "FFFFFF",
        align: "left",
        valign: "top",
        lineSpacingMultiple: koConfig.lineSpacing,
      });
    }

    if (enText) {
      const fittedEn = fitText(enText, bottomBox, enConfigBoth);
      slide.addText(fittedEn.text, {
        x: bottomBox.x,
        y: bottomBox.y,
        w: bottomBox.w,
        h: bottomBox.h,
        fontFace: enConfig.fontFace,
        fontSize: fittedEn.fontSize,
        bold: true,
        color: "FFFFFF",
        align: "left",
        valign: "top",
        lineSpacingMultiple: enConfig.lineSpacing,
      });
    }
  });
}

function getLanguageConfig(lang) {
  if (lang === "en") {
    return {
      fontFace: "Calibri",
      maxFontSize: 60,
      minFontSize: 12,
      lineSpacing: 1.1,
      charWidth: 0.55,
      preserveText: true,
    };
  }
  return {
    fontFace: "Malgun Gothic",
    maxFontSize: 54,
    minFontSize: 18,
    lineSpacing: 1.22,
    charWidth: 0.95,
    preserveText: true,
  };
}

function toEntries(lines) {
  return lines
    .map((line) => {
      const match = line.match(/^(\d+)\.\s*(.*)$/);
      if (!match) {
        return { num: null, line: line.trim() };
      }
      return {
        num: Number.parseInt(match[1], 10),
        line: `${match[1]}. ${match[2]}`.trim(),
      };
    })
    .filter((entry) => entry.line);
}

function fitTextToSlides(text, box, config) {
  const fitted = fitText(text, box, config);
  if (fitted.fits) {
    return [{ text: fitted.text, fontSize: fitted.fontSize }];
  }

  const forced = fitText(text, box, { ...config, maxFontSize: config.minFontSize });
  const maxLines = Math.max(
    1,
    Math.floor((box.h * 72) / (config.minFontSize * config.lineSpacing))
  );
  const chunks = [];
  for (let i = 0; i < forced.lines.length; i += maxLines) {
    const slice = forced.lines.slice(i, i + maxLines);
    chunks.push({
      text: config.preserveText ? slice.join(" ") : slice.join("\n"),
      fontSize: config.minFontSize,
    });
  }
  return chunks.length
    ? chunks
    : [{ text: fitted.text, fontSize: fitted.fontSize }];
}

function fitText(text, box, config) {
  const normalized = text.replace(/\s+/g, " ").trim();
  let fontSize = config.maxFontSize;
  let fittedLines = [];

  while (fontSize >= config.minFontSize) {
    const { lines, fits } = measureText(normalized, box, {
      fontSize,
      lineSpacing: config.lineSpacing,
      charWidth: config.charWidth,
    });
    if (fits) {
      fittedLines = lines;
      return {
        text: config.preserveText ? normalized : lines.join("\n"),
        lines,
        fontSize,
        fits: true,
      };
    }
    fontSize -= 1;
    fittedLines = lines;
  }

  return {
    text: config.preserveText ? normalized : fittedLines.join("\n"),
    lines: fittedLines,
    fontSize: config.minFontSize,
    fits: false,
  };
}

function measureText(text, box, options) {
  const widthPt = box.w * 72;
  const heightPt = box.h * 72;
  const maxChars = Math.max(
    8,
    Math.floor(widthPt / (options.fontSize * options.charWidth))
  );
  const lines = wrapText(text, maxChars);
  const totalHeight = lines.length * options.fontSize * options.lineSpacing;
  return { lines, fits: totalHeight <= heightPt };
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [text.trim()];
  }

  const lines = [];
  let current = "";

  words.forEach((word) => {
    const wordLength = countChars(word);
    const currentLength = countChars(current);
    const spacer = current ? 1 : 0;

    if (currentLength + wordLength + spacer <= maxChars) {
      current = current ? `${current} ${word}` : word;
      return;
    }

    if (!current) {
      lines.push(...breakLongWord(word, maxChars));
      return;
    }

    lines.push(current);
    current = "";

    if (wordLength > maxChars) {
      lines.push(...breakLongWord(word, maxChars));
    } else {
      current = word;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function breakLongWord(word, maxChars) {
  const chars = Array.from(word);
  const parts = [];
  for (let i = 0; i < chars.length; i += maxChars) {
    parts.push(chars.slice(i, i + maxChars).join(""));
  }
  return parts;
}

function countChars(value) {
  return Array.from(value).length;
}

function getFixedFontSize(texts, box, config) {
  if (!texts.length) {
    return config.maxFontSize;
  }
  let size = config.maxFontSize;
  texts.forEach((text) => {
    const fitted = fitText(text, box, config);
    if (fitted.fontSize < size) {
      size = fitted.fontSize;
    }
  });
  return Math.max(size, config.minFontSize);
}

function sanitizeFilename(value) {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, "_");
}

function sanitizeAsciiFilename(value) {
  return value.replace(/[^\w.-]+/g, "_");
}

function filterLines(items, startNum, endNum) {
  if (startNum === null && endNum === null) {
    return items.map((item) => item.line);
  }

  const verseNums = items
    .filter((item) => item.type === "verse" && item.num !== null)
    .map((item) => item.num);
  if (verseNums.length === 0) {
    return [];
  }

  const minNum = verseNums[0];
  const maxNum = verseNums[verseNums.length - 1];
  const lo = startNum ?? minNum;
  const hi = endNum ?? maxNum;

  let started = false;
  let done = false;
  const lines = [];

  for (const item of items) {
    if (done) {
      continue;
    }

    if (item.type === "verse") {
      if (item.num === null || item.num < lo) {
        continue;
      }
      if (item.num > hi) {
        done = true;
        continue;
      }
      started = true;
      lines.push(item.line);
      continue;
    }

    if (item.type === "heading" && started && !done) {
      lines.push(item.line);
    }
  }

  if (lo < minNum || hi > maxNum) {
    return lines;
  }

  return lines;
}

function parseChapter(html) {
  const slice = extractChapterSlice(html);
  const regex = /<(h3|p)([^>]*)>([\s\S]*?)<\/\1>/gi;
  const items = [];
  let match;

  while ((match = regex.exec(slice)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || "";
    const inner = match[3] || "";

    if (tag === "p" && !/class=["'][^"']*verse[^"']*["']/.test(attrs)) {
      continue;
    }

    const cleaned = normalizeText(stripTags(inner));
    if (!cleaned) {
      continue;
    }

    if (tag === "h3") {
      items.push({ type: "heading", line: cleaned });
      continue;
    }

    const verseMatch = cleaned.match(/^(\d+)\.\s*(.*)$/);
    if (verseMatch) {
      items.push({
        type: "verse",
        num: Number.parseInt(verseMatch[1], 10),
        line: `${verseMatch[1]}. ${verseMatch[2]}`,
      });
    } else {
      items.push({ type: "verse", num: null, line: cleaned });
    }
  }

  return items;
}

function extractChapterSlice(html) {
  const startIdx = html.indexOf("class=\"chapter-content\"");
  if (startIdx === -1) {
    return html;
  }

  const pagerIdx = html.indexOf("<ul class=\"pager\"", startIdx);
  if (pagerIdx === -1) {
    return html.slice(startIdx);
  }

  return html.slice(startIdx, pagerIdx);
}

function stripTags(text) {
  return text.replace(/<[^>]*>/g, "");
}

function normalizeText(text) {
  return decodeEntities(text.replace(/\s+/g, " ").trim());
}

function decodeEntities(text) {
  const named = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    ldquo: "\"",
    rdquo: "\"",
    lsquo: "'",
    rsquo: "'",
    ndash: "-",
    mdash: "-",
    hellip: "...",
  };

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const num = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    if (code.startsWith("#")) {
      const num = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    return Object.prototype.hasOwnProperty.call(named, code) ? named[code] : m;
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
