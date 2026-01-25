import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import PptxGenJS from "pptxgenjs";
import multer from "multer";
import AdmZip from "adm-zip";
import https from "https";
import { createWriteStream } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URLS = {
  ko: "https://biblics.com/ko/성경",
  en: "https://biblics.com/en/bible/new-international-version",
};

const KO_TRANSLATIONS = new Set(["새번역", "개역한글", "현대인의-성경"]);

const booksPath = path.join(__dirname, "data", "books.json");
const slidesPath = path.join(__dirname, "data", "slides.json");
const uploadsDir = path.join(__dirname, "uploads");

// Ensure structure exists
(async () => {
  try { await fs.access(uploadsDir); } catch { await fs.mkdir(uploadsDir, { recursive: true }); }
  try { await fs.access(path.dirname(slidesPath)); } catch { await fs.mkdir(path.dirname(slidesPath), { recursive: true }); }
  try { await fs.access(slidesPath); } catch { await fs.writeFile(slidesPath, "[]", "utf-8"); }
})();

const booksData = JSON.parse(await fs.readFile(booksPath, "utf-8"));

// Multer Setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    // Sanitize filename to be safe
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName)
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files

// --- Slide Persistence APIs ---

// Get all slides
app.get("/api/slides", async (req, res) => {
  try {
    const data = await fs.readFile(slidesPath, "utf-8");
    res.json(JSON.parse(data || "[]"));
  } catch (err) {
    // If file doesn't exist, return empty array
    if (err.code === 'ENOENT') {
      return res.json([]);
    }
    res.status(500).json({ error: "Failed to load slides" });
  }
});

// Save all slides (Sync)
// In a real app we'd do individual updates, but for this single-user tool,
// syncing the whole list is easier to migrate from localStorage.
app.post("/api/slides", async (req, res) => {
  try {
    const slides = req.body;
    if (!Array.isArray(slides)) {
      return res.status(400).json({ error: "Invalid data format" });
    }
    await fs.writeFile(slidesPath, JSON.stringify(slides, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save slides" });
  }
});

// Upload File
app.post("/api/upload", upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  let filePath = req.file.path;
  let filename = req.file.filename;
  // Fix for Korean text encoding issues (Multer/Node often parses headers as latin1)
  const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  let thumbnailPath = null;

  // Automatic .ppt to .pptx conversion
  if (path.extname(originalName).toLowerCase() === '.ppt') {
    try {
      console.log(`Converting ${originalName} to PPTX...`);
      const soffice = "/opt/homebrew/bin/soffice"; // Path verified

      // Helper to execute conversion
      // Usage: soffice --headless --convert-to pptx --outdir <dir> <file>
      const cmd = `"${soffice}" --headless --convert-to pptx --outdir "${uploadsDir}" "${filePath}"`;
      await execAsync(cmd);

      // Calculate new filename (soffice replaces extension)
      const newFilename = filename.replace(/\.ppt$/i, '.pptx');
      const newPath = path.join(uploadsDir, newFilename);

      // Verify existence
      await fs.access(newPath);

      // Delete original .ppt
      await fs.unlink(filePath);

      filePath = newPath;
      filename = newFilename;
      console.log("Conversion successful:", filename);

    } catch (e) {
      console.warn("PPT conversion failed (will use original):", e.message);
    }
  }

  // Try extracting thumbnail (works for regular .pptx AND converted .ppt)
  if (filename.toLowerCase().endsWith(".pptx")) {
    try {
      const zip = new AdmZip(filePath);
      const thumbEntry = zip.getEntry("docProps/thumbnail.jpeg");
      if (thumbEntry) {
        const thumbName = filename + "-thumb.jpeg";
        const thumbOutPath = path.join(uploadsDir, thumbName);
        await fs.writeFile(thumbOutPath, thumbEntry.getData());
        thumbnailPath = `/uploads/${thumbName}`;
      }
    } catch (e) {
      console.warn("Failed to extract thumbnail:", e.message);
    }
  }

  // Return web-accessible path
  res.json({
    filename: filename,
    path: `/uploads/${filename}`,
    originalName: originalName,
    thumbnail: thumbnailPath
  });
});

// Download Hymn from External Source
app.post("/api/hymn/download", async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ error: "Hymn number required" });
    }

    // Ensure uploads folder exists
    try {
      await fs.access(uploadsDir);
    } catch {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    const fileName = `nhymn${number}.ppt`;
    const url = `https://www.rickc.online/uploads/1/0/9/7/109730685/${fileName}`;
    const localFileName = `hymn_${number}_${Date.now()}.ppt`;
    const savePath = path.join(uploadsDir, localFileName);

    console.log(`Downloading (curl) ${url} to ${savePath}`);

    try {
      await execAsync(`curl -L -f -s -o "${savePath}" "${url}"`);

      // Verify file size > 0
      const stats = await fs.stat(savePath);
      if (stats.size === 0) {
        await fs.unlink(savePath);
        throw new Error("Downloaded file is empty");
      }

      res.json({
        success: true,
        path: `/uploads/${localFileName}`,
        filename: localFileName,
        originalName: fileName,
        originalUrl: url,
        thumbnail: null
      });

    } catch (err) {
      console.error("Curl download failed:", err);
      try { await fs.unlink(savePath); } catch { }
      res.status(404).json({ error: "Download failed. Check if hymn number is correct." });
    }

  } catch (e) {
    console.error("Hymn Download Endpoint Error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    }
  }
});

// Delete Slide (and optionally file)
app.delete("/api/slides/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = JSON.parse(await fs.readFile(slidesPath, "utf-8") || "[]");

    // Find slide to check for file deletion
    const slide = data.find(s => s.id === id);
    if (slide && slide.serverFilePath) {
      // Try to delete the file
      try {
        // serverFilePath is like "/uploads/filename.pptx"
        // We need absolute path
        const relativePath = slide.serverFilePath.replace(/^\/uploads\//, '');
        const absPath = path.join(uploadsDir, relativePath);
        await fs.unlink(absPath);
      } catch (e) {
        console.warn("Failed to delete accompanying file:", e.message);
      }
    }

    const newData = data.filter(s => s.id !== id);
    await fs.writeFile(slidesPath, JSON.stringify(newData, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete slide" });
  }
});

// --- Existing APIs ---

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
    const theme = resolvePptxTheme(req.query);
    const pptx = buildPptx(payload, theme);
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

app.post("/api/create-slide-pptx", async (req, res) => {
  try {
    const { content, font, fontSize, bg, align } = req.body;

    // Create PPTX
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE"; // 16:9

    // Define colors based on background selection
    const bgColor = bg === 'white' ? 'FFFFFF' : '000000';
    const textColor = bg === 'white' ? '000000' : 'FFFFFF';

    // Clean inputs
    const safeContent = content || "";
    const safeFont = font || "Malgun Gothic";
    const safeFontSize = parseInt(fontSize, 10) || 24;
    const safeAlign = align || "center";
    // align map: 'left'|'center'|'right'|'justify'

    const slide = pptx.addSlide();
    slide.background = { color: bgColor };

    // Determine position based on alignment
    let yPos = "10%";
    let valign = "middle";

    if (safeAlign === 'top') {
      yPos = "5%";
      valign = "top";
    }

    // Map horizontal align
    let hAlign = safeAlign === 'top' ? 'left' : safeAlign;

    slide.addText(safeContent, {
      x: "5%",
      y: yPos,
      w: "90%",
      h: "80%",
      fontSize: safeFontSize,
      fontFace: safeFont,
      color: textColor,
      align: hAlign,
      valign: valign,
      wrap: true,
      autoFit: false
    });

    let buffer = await pptx.write({ outputType: "nodebuffer" });
    buffer = injectThumbnail(buffer); // Inject thumbnail
    const filename = `slide_${Date.now()}.pptx`;
    const asciiFilename = sanitizeAsciiFilename(filename);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFilename}"`
    );
    return res.send(buffer);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/pptx", async (req, res) => {
  try {
    const payload = await getVersePayload(req.body);
    const theme = resolvePptxTheme(req.body);
    const pptx = buildPptx(payload, theme);
    let buffer = await pptx.write({ outputType: "nodebuffer" });
    buffer = injectThumbnail(buffer); // Inject thumbnail

    const filename = buildPptxFilename(req.body, payload);
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

function buildUrl(
  language,
  testamentEntry,
  bookEntry,
  chapterNum,
  koVersion
) {
  if (language === "en") {
    return `${BASE_URLS.en}/${encodeURIComponent(
      testamentEntry.slugEn
    )}/${encodeURIComponent(bookEntry.slugEn)}/${chapterNum}`;
  }

  const version = koVersion || "새번역";
  return `${BASE_URLS.ko}/${encodeURIComponent(version)}/${encodeURIComponent(
    testamentEntry.slugKo
  )}/${encodeURIComponent(bookEntry.slugKo)}/${chapterNum}`;
}

function normalizeLanguages(raw) {
  if (!raw) {
    return [];
  }

  const languages = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(languages)].filter((lang) =>
    Object.prototype.hasOwnProperty.call(BASE_URLS, lang)
  );
}

function normalizeKoVersion(value) {
  if (!value) {
    return "새번역";
  }
  if (KO_TRANSLATIONS.has(value)) {
    return value;
  }
  const err = new Error("invalid ko translation");
  err.statusCode = 400;
  throw err;
}

async function getVersePayload(query) {
  const { testament, book, chapter, start, end, lang, koVersion } = query;
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
  const normalizedKoVersion = languages.includes("ko")
    ? normalizeKoVersion(koVersion)
    : null;

  try {
    const results = await Promise.all(
      languages.map(async (language) => {
        const url = buildUrl(
          language,
          testamentEntry,
          bookEntry,
          chapterNum,
          normalizedKoVersion
        );
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

    return {
      sourceUrl,
      lines,
      meta: {
        bookEntry,
        chapterNum,
        languages,
        koVersion: normalizedKoVersion,
      },
    };
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

function buildPptx(payload, theme) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const layout = {
    width: 13.333,
    height: 7.5,
    marginX: 0.8,
    marginY: 0.45,
  };
  const safe = {
    x: layout.marginX,
    y: layout.marginY,
    w: layout.width - layout.marginX * 2,
    h: layout.height - layout.marginY * 2,
  };

  const linesByLang = payload.lines;
  const hasKo = Array.isArray(linesByLang.ko);
  const hasEn = Array.isArray(linesByLang.en);
  const labelText = buildSlideLabel(
    payload.meta,
    hasKo && !hasEn ? "ko" : hasEn && !hasKo ? "en" : "both"
  );
  const labelBox = buildLabelBox(safe, layout);
  const slideTheme = theme || getPptxTheme("dark");

  if (hasKo && hasEn) {
    addBothSlides(pptx, linesByLang, safe, labelBox, labelText, slideTheme, layout);
  } else if (hasEn) {
    addSingleLanguageSlides(
      pptx,
      linesByLang.en,
      safe,
      labelBox,
      labelText,
      "en",
      slideTheme,
      layout
    );
  } else {
    addSingleLanguageSlides(
      pptx,
      linesByLang.ko || [],
      safe,
      labelBox,
      labelText,
      "ko",
      slideTheme,
      layout
    );
  }

  return pptx;
}

function addSingleLanguageSlides(
  pptx,
  lines,
  safe,
  labelBox,
  labelText,
  lang,
  theme,
  layout
) {
  const config = getLanguageConfig(lang);
  const entries = toEntries(lines);
  const textBlocks = entries.length ? entries.map((entry) => entry.line) : lines;

  textBlocks.forEach((text) => {
    const processedText = lang === "ko" ? insertWordJoiner(text) : text;
    const slides = fitTextToSlides(processedText, safe, config);
    slides.forEach((slideItem) => {
      const slide = pptx.addSlide();
      applySlideBackground(pptx, slide, layout, theme);
      addCornerLabel(slide, labelText, labelBox, getLabelConfig(lang, theme));
      slide.addText(slideItem.text, {
        x: safe.x,
        y: safe.y,
        w: safe.w,
        h: safe.h,
        fontFace: config.fontFace,
        fontSize: slideItem.fontSize,
        bold: true,
        color: theme.textColor,
        align: "left",
        valign: "top",
        lineSpacingMultiple: config.lineSpacing,
        fit: "shrink",
        lang: lang === "ko" ? "ko-KR" : "en-US",
      });
    });
  });
}

function addBothSlides(pptx, linesByLang, safe, labelBox, labelText, theme, layout) {
  const koEntries = toEntries(linesByLang.ko || []);
  const enEntries = toEntries(linesByLang.en || []);
  const koMap = new Map(koEntries.filter((e) => e.num !== null).map((e) => [e.num, e.line]));
  const enMap = new Map(enEntries.filter((e) => e.num !== null).map((e) => [e.num, e.line]));
  const orderedNums = koEntries.length
    ? koEntries.filter((e) => e.num !== null).map((e) => e.num)
    : enEntries.filter((e) => e.num !== null).map((e) => e.num);

  const topHeight = safe.h * 0.62;
  const gap = safe.h * 0.04;
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
    applySlideBackground(pptx, slide, layout, theme);
    addCornerLabel(slide, labelText, labelBox, getLabelConfig("ko", theme));

    if (koText) {
      const processedKo = insertWordJoiner(koText);
      const fittedKo = fitText(processedKo, topBox, koConfig);
      slide.addText(fittedKo.text, {
        x: topBox.x,
        y: topBox.y,
        w: topBox.w,
        h: topBox.h,
        fontFace: koConfig.fontFace,
        fontSize: fittedKo.fontSize,
        bold: true,
        color: theme.textColor,
        align: "left",
        valign: "top",
        lineSpacingMultiple: koConfig.lineSpacing,
        fit: "shrink",
        lang: "ko-KR",
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
        color: theme.textColor,
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
    charWidth: 1.0,
    preserveText: true,
  };
}

function buildLabelBox(safe, layout) {
  const labelHeight = Math.min(0.38, Math.max(0.2, layout.marginY - 0.1));
  const labelY = Math.max(0.08, layout.marginY - labelHeight);
  return {
    x: Math.max(0.08, safe.x - 0.28),
    y: labelY,
    w: Math.min(3.9, safe.w * 0.45 + 0.2),
    h: labelHeight,
  };
}

function getLabelConfig(lang, theme) {
  return {
    fontFace: lang === "en" ? "Calibri" : "Malgun Gothic",
    maxFontSize: 24,
    minFontSize: 12,
    lineSpacing: 1.0,
    charWidth: lang === "en" ? 0.55 : 0.9,
    preserveText: true,
    color: theme.labelColor,
  };
}

function addCornerLabel(slide, text, box, config) {
  if (!text) {
    return;
  }
  const fitted = fitText(text, box, config);
  slide.addText(fitted.text, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fontFace: config.fontFace,
    fontSize: fitted.fontSize,
    bold: true,
    color: config.color,
    align: "left",
    valign: "top",
    lineSpacingMultiple: config.lineSpacing,
  });
}

function buildSlideLabel(meta, mode) {
  if (!meta || !meta.bookEntry || !meta.chapterNum) {
    return "";
  }
  const chapter = meta.chapterNum;
  if (mode === "en") {
    const abbrEn = meta.bookEntry.abbrEn || meta.bookEntry.slugEn || meta.bookEntry.name;
    return `${abbrEn} ${chapter}`;
  }
  const abbrKo = meta.bookEntry.abbrKo || meta.bookEntry.name;
  return `${abbrKo} ${chapter}`;
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
      // Don't break long words if using autoFit strategy (especially for Korean with WordJoiners)
      lines.push(word);
      return;
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
  // Ignore Word Joiner (U+2060)
  return Array.from(value.replace(/\u2060/g, "")).length;
}

function insertWordJoiner(text) {
  // Insert U+2060 between Korean characters
  return text.replace(/([가-힣])(?=[가-힣])/g, "$1\u2060");
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
  // Replace non-ascii chars with underscore
  const sanitized = value.replace(/[^\w.-]+/g, "_");

  // If result is empty, very short, only underscores/dots, or starts with multiple underscores
  if (!sanitized || sanitized.length < 3 || /^[._]+$/.test(sanitized) || sanitized.startsWith("__")) {
    return "bible_extract.pptx";
  }
  return sanitized;
}

function resolvePptxTheme(input) {
  const themeId = input?.themeId || input?.theme || "dark";
  const useCustomImage =
    input?.useCustomImage === true || input?.useCustomImage === "true";
  const customImageData = input?.customImageData;

  if (useCustomImage) {
    if (!customImageData || !customImageData.startsWith("data:image/")) {
      const err = new Error("유효한 배경 이미지를 선택하세요.");
      err.statusCode = 400;
      throw err;
    }
    return {
      ...getPptxTheme(themeId),
      bgImageData: customImageData,
      overlayColor: "000000",
      overlayTransparency: 35,
    };
  }

  return getPptxTheme(themeId);
}

function getPptxTheme(themeId) {
  const themes = {
    dark: {
      id: "dark",
      bgColor: "000000",
      textColor: "FFFFFF",
      labelColor: "EDEDED",
    },
    light: {
      id: "light",
      bgColor: "F6F1E8",
      textColor: "1C1B18",
      labelColor: "4D4036",
    },
    navy: {
      id: "navy",
      bgColor: "0B1325",
      bgImageData: buildSvgDataUri(buildNavySvg()),
      textColor: "F7F3E9",
      labelColor: "E9DFC8",
      overlayColor: "000000",
      overlayTransparency: 30,
    },
    forest: {
      id: "forest",
      bgColor: "0D1B16",
      bgImageData: buildSvgDataUri(buildForestSvg()),
      textColor: "F6F2EA",
      labelColor: "E5D9C5",
      overlayColor: "000000",
      overlayTransparency: 30,
    },
    burgundy: {
      id: "burgundy",
      bgColor: "1B0C12",
      bgImageData: buildSvgDataUri(buildBurgundySvg()),
      textColor: "F7F2EA",
      labelColor: "E6D7C0",
      overlayColor: "000000",
      overlayTransparency: 30,
    },
    "navy-solid": {
      id: "navy-solid",
      bgColor: "0B1325",
      textColor: "F7F3E9",
      labelColor: "F2C15B",
    },
    "forest-solid": {
      id: "forest-solid",
      bgColor: "0D1B16",
      textColor: "F6F2EA",
      labelColor: "D6B36A",
    },
    "burgundy-solid": {
      id: "burgundy-solid",
      bgColor: "1B0C12",
      textColor: "F7F2EA",
      labelColor: "E0B56F",
    },
  };

  return themes[themeId] || themes.dark;
}

function applySlideBackground(pptx, slide, layout, theme) {
  if (theme.bgColor) {
    slide.background = { color: theme.bgColor };
  }
  if (theme.bgImageData) {
    slide.addImage({
      data: theme.bgImageData,
      x: 0,
      y: 0,
      w: layout.width,
      h: layout.height,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: layout.width,
      h: layout.height,
      fill: {
        color: theme.overlayColor || "000000",
        transparency:
          typeof theme.overlayTransparency === "number"
            ? theme.overlayTransparency
            : 30,
      },
      line: { color: "000000", transparency: 100 },
    });
    return;
  }
  slide.background = { color: theme.bgColor || "000000" };
}

function buildSvgDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function buildNavySvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333 750">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1a33"/>
      <stop offset="100%" stop-color="#1c2f52"/>
    </linearGradient>
    <radialGradient id="r" cx="0.85" cy="0.1" r="0.4">
      <stop offset="0%" stop-color="#f2c15b" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#f2c15b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1333" height="750" fill="url(#g)"/>
  <rect width="1333" height="750" fill="url(#r)"/>
</svg>`;
}

function buildForestSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333 750">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1b16"/>
      <stop offset="100%" stop-color="#1f3529"/>
    </linearGradient>
    <radialGradient id="r" cx="0.1" cy="0.1" r="0.5">
      <stop offset="0%" stop-color="#d6b36a" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#d6b36a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1333" height="750" fill="url(#g)"/>
  <rect width="1333" height="750" fill="url(#r)"/>
</svg>`;
}

function buildBurgundySvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333 750">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b0c12"/>
      <stop offset="100%" stop-color="#3b1420"/>
    </linearGradient>
    <radialGradient id="r" cx="0.9" cy="0.1" r="0.4">
      <stop offset="0%" stop-color="#e0b56f" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#e0b56f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1333" height="750" fill="url(#g)"/>
  <rect width="1333" height="750" fill="url(#r)"/>
</svg>`;
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

// Helper to inject a generic thumbnail into PPTX buffer
function injectThumbnail(buffer) {
  try {
    const zip = new AdmZip(buffer);
    // Minimal white 1x1 JPEG
    const thumbBase64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAHAABAAP/2gAIAQEAAD8A0s8g/9k=";
    const thumbBuffer = Buffer.from(thumbBase64, "base64");
    zip.addFile("docProps/thumbnail.jpeg", thumbBuffer);
    return zip.toBuffer();
  } catch (e) {
    console.warn("Failed to inject thumbnail:", e.message);
    return buffer;
  }
}

// Function to extract thumbnail from PPTX
async function extractThumbnail(filePath, uploadsDir) {
  try {
    const zip = new AdmZip(filePath);
    const thumbEntry = zip.getEntry("docProps/thumbnail.jpeg");
    if (thumbEntry) {
      const filename = path.basename(filePath);
      const thumbName = filename + "-thumb.jpeg";
      const thumbOutPath = path.join(uploadsDir, thumbName);
      await fs.writeFile(thumbOutPath, thumbEntry.getData());
      return `/uploads/${thumbName}`;
    }
  } catch (e) {
    console.warn("Failed to extract thumbnail:", e.message);
  }
  return null;
}



app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
