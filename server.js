import express from "express";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import PptxGenJS from "pptxgenjs";
import multer from "multer";
import AdmZip from "adm-zip";
import https from "https";
import http from "http";
import { createWriteStream } from "fs";
import { exec, execFile } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const BUNDLED_NODE_MODULES = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules"
);
const BASE_URLS = {
  ko: "https://biblics.com/ko/성경",
  en: "https://biblics.com/en/bible/new-international-version",
};

const KO_TRANSLATIONS = new Set(["새번역", "개역한글", "현대인의-성경"]);

const booksPath = path.join(__dirname, "data", "books.json");
const slidesPath = path.join(__dirname, "data", "slides.json");
const templatesPath = path.join(__dirname, "data", "templates.json");
const hymnsPath = path.join(__dirname, "data", "hymns.json");
const uploadsDir = path.join(__dirname, "uploads");
const scriptureTitleTopImagePath = path.join(
  __dirname,
  "public",
  "assets",
  "scriptures",
  "title-top.png"
);
const scriptureTitleBottomImagePath = path.join(
  __dirname,
  "public",
  "assets",
  "scriptures",
  "title-bottom.png"
);
const hymnTitleBgImagePath = path.join(
  __dirname,
  "public",
  "assets",
  "hymn-title-bg.png"
);
const hymnTitleBandImagePath = path.join(
  __dirname,
  "public",
  "assets",
  "hymn-title-band.png"
);
const SOFFICE_PATH = "/opt/homebrew/bin/soffice";
const scriptureSessions = new Map();

// Ensure structure exists
(async () => {
  try { await fs.access(uploadsDir); } catch { await fs.mkdir(uploadsDir, { recursive: true }); }
  try { await fs.access(path.dirname(slidesPath)); } catch { await fs.mkdir(path.dirname(slidesPath), { recursive: true }); }
  try { await fs.access(slidesPath); } catch { await fs.writeFile(slidesPath, "[]", "utf-8"); }
  try { await fs.access(templatesPath); } catch { await fs.writeFile(templatesPath, "[]", "utf-8"); }
})();

const booksData = JSON.parse(await fs.readFile(booksPath, "utf-8"));
const hymnsData = JSON.parse(await fs.readFile(hymnsPath, "utf-8"));
let pdfRenderDepsPromise = null;

function getWideLayoutSize() {
  return { width: 13.333, height: 7.5 };
}

function sanitizeSlideForTemplate(slide) {
  return {
    id: slide.id,
    name: slide.name,
    type: slide.type,
    sourceType: slide.sourceType,
    content: slide.content || "",
    font: slide.font || "Malgun Gothic",
    fontSize: slide.fontSize || "40",
    bg: slide.bg || "black",
    align: slide.align || "center",
    fileName: slide.fileName || null,
    fileSaved: Boolean(slide.fileSaved),
    saved: slide.saved !== false,
    serverFilePath: slide.serverFilePath || null,
    thumbnail: slide.thumbnail || null,
    hymnNumber: slide.hymnNumber || null,
    originalUrl: slide.originalUrl || null,
    adTitle: slide.adTitle || "",
    adTitleSize: slide.adTitleSize || "medium",
    adTitleAlign: slide.adTitleAlign || "center",
    adBgSource: slide.adBgSource || "none",
    adBgImagePath: slide.adBgImagePath || null,
    adBgImageUrl: slide.adBgImageUrl || null,
    adBgOpacity:
      typeof slide.adBgOpacity === "number" ? slide.adBgOpacity : 30,
  };
}

function sanitizeTemplateName(value) {
  const trimmed = (value || "").trim();
  return trimmed || "새 템플릿";
}

function createEntityId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readTemplates() {
  try {
    return JSON.parse((await fs.readFile(templatesPath, "utf-8")) || "[]");
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeTemplates(templates) {
  await fs.writeFile(templatesPath, JSON.stringify(templates, null, 2));
}

async function cleanupScriptureSessions() {
  const now = Date.now();
  const deletions = [];

  scriptureSessions.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      scriptureSessions.delete(key);
      if (entry.filePath) {
        deletions.push(fs.unlink(entry.filePath).catch(() => {}));
      }
      if (entry.renderDir) {
        deletions.push(
          fs.rm(entry.renderDir, { recursive: true, force: true }).catch(() => {})
        );
      }
    }
  });

  if (deletions.length) {
    await Promise.all(deletions);
  }
}

function createScriptureWebViewSession(payload) {
  cleanupScriptureSessions().catch(() => {});
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  scriptureSessions.set(sessionId, {
    payload,
    expiresAt: Date.now() + 1000 * 60 * 30,
  });
  return sessionId;
}

function createScripturePptxPreviewSession(
  payload,
  filePath,
  filename,
  renderDir,
  imagePaths
) {
  cleanupScriptureSessions().catch(() => {});
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  scriptureSessions.set(sessionId, {
    payload,
    filePath,
    filename,
    renderDir,
    imagePaths,
    expiresAt: Date.now() + 1000 * 60 * 30,
  });
  return sessionId;
}

function resolveUploadedFilePath(serverFilePath) {
  if (!serverFilePath || typeof serverFilePath !== "string") {
    return null;
  }
  if (!serverFilePath.startsWith("/uploads/")) {
    return null;
  }
  const relativePath = serverFilePath.replace(/^\/uploads\//, "");
  return path.join(uploadsDir, relativePath);
}

async function cloneUploadedAsset(serverFilePath) {
  const sourcePath = resolveUploadedFilePath(serverFilePath);
  if (!sourcePath) {
    return serverFilePath || null;
  }

  try {
    await fs.access(sourcePath);
  } catch {
    return serverFilePath || null;
  }

  const ext = path.extname(sourcePath);
  const base = path.basename(sourcePath, ext);
  const cloneName = `${base}-clone-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}${ext}`;
  const targetPath = path.join(uploadsDir, cloneName);

  await fs.copyFile(sourcePath, targetPath);
  return `/uploads/${cloneName}`;
}

async function cloneSlideForTemplate(slide) {
  const cloned = sanitizeSlideForTemplate(slide);
  cloned.id = createEntityId("slide");
  cloned.serverFilePath = await cloneUploadedAsset(cloned.serverFilePath);
  cloned.thumbnail = await cloneUploadedAsset(cloned.thumbnail);
  cloned.adBgImagePath = await cloneUploadedAsset(cloned.adBgImagePath);
  return cloned;
}

async function deleteSlideAsset(slide) {
  const assetPaths = [
    slide?.serverFilePath,
    slide?.thumbnail,
    slide?.adBgImagePath,
  ].filter(Boolean);

  const uniqueResolvedPaths = [...new Set(assetPaths)]
    .map(resolveUploadedFilePath)
    .filter(Boolean);

  await Promise.all(
    uniqueResolvedPaths.map(async (assetPath) => {
      try {
        await fs.unlink(assetPath);
      } catch (err) {
        console.warn("Failed to delete accompanying file:", err.message);
      }
    })
  );
}

async function loadPdfRenderDeps() {
  if (pdfRenderDepsPromise) {
    return pdfRenderDepsPromise;
  }

  pdfRenderDepsPromise = (async () => {
    try {
      const canvasMod = await import("@napi-rs/canvas");
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      return { createCanvas: canvasMod.createCanvas, pdfjsLib };
    } catch (err) {
      const canvasUrl = pathToFileURL(
        path.join(BUNDLED_NODE_MODULES, "@napi-rs", "canvas", "index.js")
      ).href;
      const pdfUrl = pathToFileURL(
        path.join(BUNDLED_NODE_MODULES, "pdfjs-dist", "legacy", "build", "pdf.mjs")
      ).href;
      const canvasMod = await import(canvasUrl);
      const pdfjsLib = await import(pdfUrl);
      return { createCanvas: canvasMod.createCanvas, pdfjsLib };
    }
  })();

  return pdfRenderDepsPromise;
}

async function convertPresentationToPdf(inputPath, outputDir) {
  await execFileAsync(SOFFICE_PATH, [
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    inputPath,
  ]);

  const pdfPath = path.join(
    outputDir,
    `${path.basename(inputPath, path.extname(inputPath))}.pdf`
  );

  await fs.access(pdfPath);
  return pdfPath;
}

async function renderPdfPagesToImages(pdfPath, outputDir) {
  const { createCanvas, pdfjsLib } = await loadPdfRenderDeps();
  const pdfData = await fs.readFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfData),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const renderedImages = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const imagePath = path.join(
      outputDir,
      `${path.basename(pdfPath, ".pdf")}-page-${pageIndex}.png`
    );
    await fs.writeFile(imagePath, canvas.toBuffer("image/png"));
    renderedImages.push(imagePath);
  }

  return renderedImages;
}

async function appendSimpleSlide(pptx, slideData) {
  const slide = pptx.addSlide();
  const bgColor = slideData.bg === "white" ? "FFFFFF" : "000000";
  const textColor = slideData.bg === "white" ? "000000" : "FFFFFF";
  const safeFont = slideData.font || "Malgun Gothic";
  const safeFontSize = Number.parseInt(slideData.fontSize, 10) || 24;
  const safeAlign = slideData.align || "center";

  if (slideData.adBgSource === "file" && slideData.adBgImagePath) {
    const imagePath = path.join(__dirname, slideData.adBgImagePath);
    const imageBuffer = await fs.readFile(imagePath);
    const imageData = imageBuffer.toString("base64");
    const ext = path.extname(slideData.adBgImagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    slide.addImage({ data: `data:${mimeType};base64,${imageData}`, x: 0, y: 0, w: "100%", h: "100%" });
  } else if (slideData.adBgSource === "url" && slideData.adBgImageUrl) {
    const imageData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("URL fetch timeout")), 10000);
      const protocol = slideData.adBgImageUrl.startsWith("https") ? https : http;
      protocol.get(slideData.adBgImageUrl, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => { clearTimeout(timeout); resolve(Buffer.concat(chunks).toString("base64")); });
      }).on("error", (error) => { clearTimeout(timeout); reject(error); });
    });
    slide.addImage({ data: `data:image/jpeg;base64,${imageData}`, x: 0, y: 0, w: "100%", h: "100%" });
  } else {
    slide.background = { color: bgColor };
  }

  if (slideData.adBgSource === "file" || slideData.adBgSource === "url") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: "100%",
      fill: { color: "000000", transparency: 100 - (slideData.adBgOpacity ?? 30) },
      line: { color: "000000", transparency: 100 },
    });
  }

  slide.addText(slideData.content || "", {
    x: "5%",
    y: safeAlign === "top" ? "5%" : "10%",
    w: "90%",
    h: "80%",
    fontSize: safeFontSize,
    fontFace: safeFont,
    color: textColor,
    align: safeAlign === "top" ? "left" : safeAlign,
    valign: safeAlign === "top" ? "top" : "middle",
    wrap: true,
  });
}

async function appendAdSlide(pptx, slideData) {
  const slide = pptx.addSlide();
  const bgColor = slideData.bg === "white" ? "FFFFFF" : "000000";
  const textColor = slideData.bg === "white" ? "000000" : "FFFFFF";

  if (slideData.adBgSource === "file" && slideData.adBgImagePath) {
    const imagePath = path.join(__dirname, slideData.adBgImagePath);
    const imageBuffer = await fs.readFile(imagePath);
    const imageData = imageBuffer.toString("base64");
    const ext = path.extname(slideData.adBgImagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    slide.addImage({
      data: `data:${mimeType};base64,${imageData}`,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  } else if (slideData.adBgSource === "url" && slideData.adBgImageUrl) {
    const imageData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("URL fetch timeout")),
        10000
      );
      const protocol = slideData.adBgImageUrl.startsWith("https") ? https : http;

      protocol
        .get(slideData.adBgImageUrl, (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            clearTimeout(timeout);
            resolve(Buffer.concat(chunks).toString("base64"));
          });
        })
        .on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });

    slide.addImage({
      data: `data:image/jpeg;base64,${imageData}`,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  } else {
    slide.background = { color: bgColor };
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
    fill: {
      color: "000000",
      transparency: 100 - (slideData.adBgOpacity ?? 30),
    },
    line: { color: "000000", transparency: 100 },
  });

  const hasTitle = !!slideData.adTitle;
  if (hasTitle) {
    const titleSizeMap = { large: 60, medium: 40, small: 24 };
    slide.addText(slideData.adTitle, {
      x: "5%",
      y: "5%",
      w: "90%",
      h: "15%",
      fontSize: titleSizeMap[slideData.adTitleSize] || 40,
      bold: true,
      color: textColor,
      align: slideData.adTitleAlign || "center",
      valign: "top",
    });
  }

  slide.addText(slideData.content || "", {
    x: "5%",
    y: hasTitle ? "25%" : "5%",
    w: "90%",
    h: hasTitle ? "65%" : "85%",
    fontSize: Number.parseInt(slideData.fontSize, 10) || 24,
    fontFace: slideData.font || "Malgun Gothic",
    color: textColor,
    align: slideData.align || "center",
    valign: "middle",
    wrap: true,
  });
}

function appendImageSlide(pptx, imagePath) {
  const layout = getWideLayoutSize();
  const slide = pptx.addSlide();
  slide.addImage({
    path: imagePath,
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  });
}

async function appendUploadedSlideDeck(pptx, slideData, tempDirs) {
  const sourcePath = resolveUploadedFilePath(slideData.serverFilePath);
  if (!sourcePath) {
    throw new Error(`업로드 파일 경로가 없습니다: ${slideData.name}`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "samil-export-"));
  tempDirs.push(tempDir);

  const pdfPath = await convertPresentationToPdf(sourcePath, tempDir);
  const imagePaths = await renderPdfPagesToImages(pdfPath, tempDir);

  if (imagePaths.length === 0) {
    throw new Error("렌더링된 슬라이드 이미지가 없습니다.");
  }

  imagePaths.forEach((imagePath) => appendImageSlide(pptx, imagePath));
}

function addHymnTitleSlide(pptx, hymnNumber, korTitle, engTitle) {
  const layout = getWideLayoutSize();
  const slide = pptx.addSlide();

  slide.addImage({ path: hymnTitleBgImagePath, x: 0, y: 0, w: layout.width, h: layout.height });
  slide.addImage({ path: hymnTitleBandImagePath, x: 0, y: 5.767, w: layout.width, h: 1.735 });

  slide.addText("찬", {
    x: 5.385, y: 2.078, w: 1.0, h: 0.731,
    fontFace: "Batang", fontSize: 105, bold: true,
    color: "FFFFFF", align: "center", valign: "mid", margin: 0,
  });
  slide.addText("송", {
    x: 6.720, y: 2.476, w: 1.0, h: 0.731,
    fontFace: "Batang", fontSize: 105, bold: true,
    color: "FFFFFF", align: "center", valign: "mid", margin: 0,
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 5.127, y: 4.047, w: 3.191, h: 0,
    line: { color: "FFFFFF", width: 1 },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 5.10, y: 4.02, w: 0.07, h: 0.07,
    fill: { color: "FFFFFF" }, line: { color: "FFFFFF", transparency: 100 },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 8.28, y: 4.02, w: 0.07, h: 0.07,
    fill: { color: "FFFFFF" }, line: { color: "FFFFFF", transparency: 100 },
  });

  slide.addText("HYMN", {
    x: 4.789, y: 4.23, w: 3.757, h: 0.437,
    fontFace: "Arial", fontSize: 20, bold: true,
    color: "FFFFFF", align: "center", valign: "mid",
    charSpace: 8, margin: 0,
  });

  let titleLine1 = hymnNumber ? `${hymnNumber}.` : "";
  if (korTitle) titleLine1 += ` ${korTitle}`;
  const titleParts = [{ text: titleLine1.trim(), options: { breakLine: true } }];
  if (engTitle) titleParts.push({ text: `(${engTitle})` });

  slide.addText(titleParts, {
    x: 0, y: 5.82, w: layout.width, h: 1.08,
    fontFace: "Malgun Gothic", fontSize: 28, bold: true,
    color: "FFFFFF", align: "center", valign: "mid", margin: 0,
  });
}

async function appendSlideDefinitionToDeck(pptx, slideData, tempDirs) {
  if (slideData.type === "hymn" && slideData.includeTitle) {
    addHymnTitleSlide(pptx, slideData.hymnNumber, slideData.hymnKorTitle, slideData.hymnEngTitle);
  }

  if (slideData.sourceType === "upload") {
    await appendUploadedSlideDeck(pptx, slideData, tempDirs);
    return;
  }

  if (slideData.type === "ad") {
    await appendAdSlide(pptx, slideData);
    return;
  }

  await appendSimpleSlide(pptx, slideData);
}

async function buildCombinedSlidesDeck(slides) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const tempDirs = [];

  try {
    for (const rawSlide of slides) {
      await appendSlideDefinitionToDeck(
        pptx,
        sanitizeSlideForTemplate(rawSlide),
        tempDirs
      );
    }

    let buffer = await pptx.write({ outputType: "nodebuffer" });
    buffer = injectThumbnail(buffer);
    return buffer;
  } finally {
    await Promise.all(
      tempDirs.map((tempDir) =>
        fs.rm(tempDir, { recursive: true, force: true })
      )
    );
  }
}

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

app.post("/api/slides/bulk-delete", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const requestSlides = Array.isArray(req.body?.slides) ? req.body.slides : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: "No slide ids provided" });
    }

    const data = JSON.parse((await fs.readFile(slidesPath, "utf-8")) || "[]");
    const slidesToDelete = data.filter((slide) => ids.includes(slide.id));
    const requestedAssets = requestSlides
      .filter((slide) => ids.includes(slide.id))
      .map(sanitizeSlideForTemplate);
    const assetTargets = [
      ...slidesToDelete,
      ...requestedAssets.filter(
        (slide) => !slidesToDelete.some((savedSlide) => savedSlide.id === slide.id)
      ),
    ];

    await Promise.all(assetTargets.map(deleteSlideAsset));

    const nextSlides = data.filter((slide) => !ids.includes(slide.id));
    await fs.writeFile(slidesPath, JSON.stringify(nextSlides, null, 2));
    res.json({ success: true, deleted: slidesToDelete.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete selected slides" });
  }
});

app.get("/api/templates", async (req, res) => {
  try {
    res.json(await readTemplates());
  } catch (err) {
    res.status(500).json({ error: "Failed to load templates" });
  }
});

app.post("/api/templates", async (req, res) => {
  try {
    const name = sanitizeTemplateName(req.body?.name);
    const rawSlides = Array.isArray(req.body?.slides) ? req.body.slides : [];

    if (rawSlides.length === 0) {
      return res.status(400).json({ error: "No slides provided" });
    }

    const templates = await readTemplates();
    const template = {
      id: createEntityId("template"),
      name,
      createdAt: new Date().toISOString(),
      slideCount: rawSlides.length,
      slides: await Promise.all(rawSlides.map(cloneSlideForTemplate)),
    };

    templates.push(template);
    await writeTemplates(templates);
    res.json({ success: true, template });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

app.put("/api/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const templates = await readTemplates();
    const templateIndex = templates.findIndex((template) => template.id === id);

    if (templateIndex === -1) {
      return res.status(404).json({ error: "Template not found" });
    }

    const name = sanitizeTemplateName(req.body?.name || templates[templateIndex].name);
    const rawSlides = Array.isArray(req.body?.slides) ? req.body.slides : [];
    const nextSlides = rawSlides.map(sanitizeSlideForTemplate);
    const previousSlides = Array.isArray(templates[templateIndex].slides)
      ? templates[templateIndex].slides
      : [];
    const nextIds = new Set(nextSlides.map((slide) => slide.id));
    const removedSlides = previousSlides.filter((slide) => !nextIds.has(slide.id));

    await Promise.all(removedSlides.map(deleteSlideAsset));

    const nextTemplate = {
      ...templates[templateIndex],
      name,
      slideCount: nextSlides.length,
      slides: nextSlides,
    };

    templates[templateIndex] = nextTemplate;
    await writeTemplates(templates);
    res.json({ success: true, template: nextTemplate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

app.delete("/api/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const templates = await readTemplates();
    const template = templates.find((entry) => entry.id === id);

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    await Promise.all((template.slides || []).map(deleteSlideAsset));

    const nextTemplates = templates.filter((entry) => entry.id !== id);
    await writeTemplates(nextTemplates);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete template" });
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

// Get hymn title by number
app.get("/api/hymn/title/:number", (req, res) => {
  const hymn = hymnsData[req.params.number];
  if (!hymn) return res.status(404).json({ error: "Hymn not found" });
  res.json(hymn);
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
    await deleteSlideAsset(slide);

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
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    await appendSimpleSlide(pptx, req.body);
    let buffer = await pptx.write({ outputType: "nodebuffer" });
    buffer = injectThumbnail(buffer);
    const filename = `slide_${Date.now()}.pptx`;
    const asciiFilename = sanitizeAsciiFilename(filename);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFilename}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/create-ad-slide-pptx", async (req, res) => {
  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    await appendAdSlide(pptx, req.body);
    let buffer = await pptx.write({ outputType: "nodebuffer" });
    buffer = injectThumbnail(buffer);
    const filename = `ad_slide_${Date.now()}.pptx`;
    const asciiFilename = sanitizeAsciiFilename(filename);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFilename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error("Ad slide PPTX generation error:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/slides/export-pptx", async (req, res) => {
  try {
    const rawSlides = Array.isArray(req.body?.slides) ? req.body.slides : [];
    if (rawSlides.length === 0) {
      return res.status(400).json({ error: "No slides provided" });
    }

    const buffer = await buildCombinedSlidesDeck(rawSlides);
    const filename = sanitizeFilename(
      `selected_slides_${rawSlides.length}_${Date.now()}.pptx`
    );
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
    console.error("Selected slides export error:", err);
    return res.status(500).json({
      error:
        err?.message ||
        "선택한 슬라이드를 하나의 PPTX로 묶는 중 오류가 발생했습니다.",
    });
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

app.post("/api/scripture/web-view-session", async (req, res) => {
  try {
    const payload = await getVersePayload(req.body);
    const theme = resolvePptxTheme(req.body);
    const sessionId = createScriptureWebViewSession(
      buildScriptureWebViewPayload(payload, theme, req.body)
    );

    return res.json({ success: true, sessionId });
  } catch (err) {
    return res.status(err.statusCode || 502).json({ error: err.message });
  }
});

app.get("/api/scripture/web-view-session/:sessionId", async (req, res) => {
  await cleanupScriptureSessions();
  const entry = scriptureSessions.get(req.params.sessionId);

  if (!entry || !entry.payload) {
    return res.status(404).json({ error: "Web View 세션을 찾을 수 없습니다." });
  }

  return res.json(entry.payload);
});

app.post("/api/scripture/pptx-preview-session", async (req, res) => {
  try {
    const payload = await getVersePayload(req.body);
    const theme = resolvePptxTheme(req.body);
    const pptx = buildPptx(payload, theme);
    let buffer = await pptx.write({ outputType: "nodebuffer" });
    buffer = injectThumbnail(buffer);

    const filename = buildPptxFilename(req.body, payload);
    const previewFilename = `preview-${Date.now()}-${sanitizeFilename(filename)}`;
    const filePath = path.join(uploadsDir, previewFilename);
    await fs.writeFile(filePath, buffer);
    const renderDir = await fs.mkdtemp(path.join(os.tmpdir(), "samil-preview-"));
    const pdfPath = await convertPresentationToPdf(filePath, renderDir);
    const imagePaths = await renderPdfPagesToImages(pdfPath, renderDir);

    const sessionId = createScripturePptxPreviewSession(
      {
        title: buildScriptureReferenceText(payload.meta, req.body),
        filename,
      },
      filePath,
      previewFilename,
      renderDir,
      imagePaths
    );

    return res.json({ success: true, sessionId });
  } catch (err) {
    return res.status(err.statusCode || 502).json({ error: err.message });
  }
});

app.get("/api/scripture/pptx-preview-session/:sessionId", async (req, res) => {
  await cleanupScriptureSessions();
  const entry = scriptureSessions.get(req.params.sessionId);

  if (!entry || !entry.filePath) {
    return res.status(404).json({ error: "PPTX Preview 세션을 찾을 수 없습니다." });
  }

  return res.json({
    title: entry.payload?.title || "PPTX Preview",
    filename: entry.payload?.filename || entry.filename,
    slideCount: Array.isArray(entry.imagePaths) ? entry.imagePaths.length : 0,
    slides: Array.isArray(entry.imagePaths)
      ? entry.imagePaths.map((_, index) =>
          `/api/scripture/pptx-preview-image/${encodeURIComponent(
            req.params.sessionId
          )}/${index}`
        )
      : [],
    downloadUrl: `/api/scripture/pptx-preview-file/${encodeURIComponent(
      req.params.sessionId
    )}?download=1`,
  });
});

app.get("/api/scripture/pptx-preview-file/:sessionId", async (req, res) => {
  await cleanupScriptureSessions();
  const entry = scriptureSessions.get(req.params.sessionId);

  if (!entry || !entry.filePath) {
    return res.status(404).json({ error: "PPTX Preview 파일을 찾을 수 없습니다." });
  }

  const downloadName = entry.payload?.filename || entry.filename || "preview.pptx";
  const asciiFilename = sanitizeAsciiFilename(downloadName);
  const encodedFilename = encodeURIComponent(downloadName);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
  res.setHeader(
    "Content-Disposition",
    `${req.query.download === "1" ? "attachment" : "inline"}; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
  );

  return res.sendFile(entry.filePath);
});

app.get("/api/scripture/pptx-preview-image/:sessionId/:index", async (req, res) => {
  await cleanupScriptureSessions();
  const entry = scriptureSessions.get(req.params.sessionId);
  const index = Number.parseInt(req.params.index, 10);

  if (!entry || !Array.isArray(entry.imagePaths) || !Number.isInteger(index)) {
    return res.status(404).json({ error: "PPTX Preview 이미지를 찾을 수 없습니다." });
  }

  const imagePath = entry.imagePaths[index];
  if (!imagePath) {
    return res.status(404).json({ error: "PPTX Preview 이미지를 찾을 수 없습니다." });
  }

  return res.sendFile(imagePath);
});

app.post("/api/scripture/export-slide", async (req, res) => {
  try {
    const requestedName = (req.body?.slideName || "").trim();
    if (!requestedName) {
      return res.status(400).json({ error: "슬라이드 제목이 필요합니다." });
    }

    const includeTitleSlide =
      req.body?.includeTitleSlide === true ||
      req.body?.includeTitleSlide === "true";
    const titleSlideType = req.body?.titleSlideType || "말씀";
    const payload = await getVersePayload(req.body);
    const theme = resolvePptxTheme(req.body);
    const savedSlides = JSON.parse((await fs.readFile(slidesPath, "utf-8")) || "[]");
    const finalSlideName = buildUniqueSlideName(requestedName, savedSlides);
    const originalFilename = sanitizeFilename(`${finalSlideName}.pptx`);
    const serverFilename = `${Date.now()}-${originalFilename}`;
    const outputPath = path.join(uploadsDir, serverFilename);
    const pptx = buildPptx(payload, theme, {
      includeTitleSlide,
      titleSlideType,
      referenceText: buildScriptureReferenceText(payload.meta, req.body),
    });

    let buffer = await pptx.write({ outputType: "nodebuffer" });
    buffer = injectThumbnail(buffer);
    await fs.writeFile(outputPath, buffer);

    const thumbnail = await extractThumbnail(outputPath, uploadsDir);
    const slideRecord = buildUploadSlideRecord({
      slideName: finalSlideName,
      serverFilename,
      originalFilename,
      thumbnail,
    });

    savedSlides.push(slideRecord);
    await fs.writeFile(slidesPath, JSON.stringify(savedSlides, null, 2));

    return res.json({ success: true, slide: slideRecord });
  } catch (err) {
    return res.status(err.statusCode || 502).json({
      error: err.message || "PPT 생성기 export 중 오류가 발생했습니다.",
    });
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

function buildScriptureLayout() {
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

  return { layout, safe };
}

function titleCaseWords(value) {
  return (value || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) =>
      /^\d+$/.test(part)
        ? part
        : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
    )
    .join(" ");
}

function buildEnglishBookName(bookEntry) {
  if (!bookEntry) {
    return "Scripture";
  }

  const slug = bookEntry.slugEn || bookEntry.abbrEn || bookEntry.name || "Scripture";
  return titleCaseWords(slug.replace(/_/g, "-"));
}

function buildScriptureReferenceText(meta, input) {
  if (!meta?.bookEntry || !meta?.chapterNum) {
    return "성경말씀";
  }

  const start = input?.start ? String(input.start).trim() : "";
  const end = input?.end ? String(input.end).trim() : "";
  const verseRange =
    start && end ? `${start}-${end}` : start || end ? start || end : "";
  const suffix = verseRange ? `${meta.chapterNum}:${verseRange}` : `${meta.chapterNum}`;

  return `${meta.bookEntry.name} (${buildEnglishBookName(meta.bookEntry)}) ${suffix}`;
}

function buildUniqueSlideName(name, existingSlides) {
  const baseName = (name || "").trim() || "성경말씀";
  const existingNames = new Set(
    (existingSlides || []).map((slide) => (slide?.name || "").trim()).filter(Boolean)
  );

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 2;
  while (existingNames.has(`${baseName} (${counter})`)) {
    counter += 1;
  }
  return `${baseName} (${counter})`;
}

function buildUploadSlideRecord({
  slideName,
  serverFilename,
  originalFilename,
  thumbnail,
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: slideName,
    type: "simple",
    sourceType: "upload",
    content: "",
    font: "Malgun Gothic",
    fontSize: "40",
    bg: "black",
    align: "center",
    file: null,
    fileData: null,
    fileName: originalFilename,
    fileSaved: true,
    saved: true,
    serverFilePath: `/uploads/${serverFilename}`,
    thumbnail,
  };
}

function buildPptx(payload, theme, options = {}) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const { layout, safe } = buildScriptureLayout();

  const linesByLang = payload.lines;
  const hasKo = Array.isArray(linesByLang.ko);
  const hasEn = Array.isArray(linesByLang.en);
  const labelText = buildSlideLabel(
    payload.meta,
    hasKo && !hasEn ? "ko" : hasEn && !hasKo ? "en" : "both"
  );
  const labelBox = buildLabelBox(safe, layout);
  const slideTheme = theme || getPptxTheme("dark");

  if (options.includeTitleSlide) {
    if (options.titleSlideType === "봉독") {
      addScriptureBongdokTitleSlide(pptx, payload, layout, options.referenceText);
    } else {
      addScriptureTitleSlide(pptx, payload, layout, options.referenceText);
    }
  }

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

function addScriptureTitleSlide(pptx, payload, layout, referenceText) {
  const slide = pptx.addSlide();
  const titleRef = referenceText || buildScriptureReferenceText(payload.meta, {});

  slide.background = { color: "101114" };
  slide.addImage({
    path: scriptureTitleTopImagePath,
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  });
  slide.addImage({
    path: scriptureTitleBottomImagePath,
    x: 0,
    y: 5.767,
    w: layout.width,
    h: 1.735,
  });

  const titleLetters = [
    { text: "성", x: 4.28, y: 2.29 },
    { text: "경", x: 5.41, y: 2.74 },
    { text: "말", x: 6.57, y: 2.29 },
    { text: "씀", x: 7.74, y: 2.74 },
  ];

  titleLetters.forEach((item) => {
    slide.addText(item.text, {
      x: item.x,
      y: item.y,
      w: 1.0,
      h: 0.72,
      fontFace: "Batang",
      fontSize: 96,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "mid",
      margin: 0,
      shadow: { type: "outer", color: "000000", opacity: 0.4, blur: 5, offset: 0, angle: 0 },
    });
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 5.03,
    y: 4.05,
    w: 3.27,
    h: 0,
    line: { color: "FFFFFF", width: 1 },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 5.01,
    y: 4.02,
    w: 0.07,
    h: 0.07,
    line: { color: "FFFFFF", transparency: 100 },
    fill: { color: "FFFFFF" },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 8.25,
    y: 4.02,
    w: 0.07,
    h: 0.07,
    line: { color: "FFFFFF", transparency: 100 },
    fill: { color: "FFFFFF" },
  });

  slide.addText("SCRIPTURES", {
    x: 3.1,
    y: 4.18,
    w: 7.15,
    h: 0.38,
    fontFace: "Arial",
    fontSize: 16,
    bold: true,
    color: "FFFFFF",
    align: "center",
    valign: "mid",
    charSpace: 3,
    margin: 0,
  });

  slide.addText(titleRef, {
    x: 0,
    y: 5.80,
    w: layout.width,
    h: 1.74,
    fontFace: "Malgun Gothic",
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
    align: "center",
    valign: "mid",
    margin: 0,
  });
}

function addScriptureBongdokTitleSlide(pptx, payload, layout, referenceText) {
  const slide = pptx.addSlide();
  const titleRef = referenceText || buildScriptureReferenceText(payload.meta, {});

  slide.background = { color: "101114" };
  slide.addImage({
    path: scriptureTitleTopImagePath,
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  });
  slide.addImage({
    path: scriptureTitleBottomImagePath,
    x: 0,
    y: 5.767,
    w: layout.width,
    h: 1.735,
  });

  // Exact slide-coordinate positions derived from original XML group transforms
  const titleLetters = [
    { text: "성", x: 4.4441, y: 2.4016 },
    { text: "경", x: 5.5428, y: 2.8333 },
    { text: "봉", x: 6.7211, y: 2.3200 },
    { text: "독", x: 7.8865, y: 2.7552 },
  ];

  titleLetters.forEach((item) => {
    slide.addText(item.text, {
      x: item.x,
      y: item.y,
      w: 1.0027,
      h: 0.7312,
      fontFace: "Batang",
      fontSize: 100,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "mid",
      margin: 0,
      shadow: { type: "outer", color: "000000", opacity: 0.4, blur: 5, offset: 0, angle: 0 },
    });
  });

  // Decorative line + endpoint dots (exact coords from group transform)
  slide.addShape(pptx.ShapeType.line, {
    x: 4.1516,
    y: 4.1235,
    w: 4.9788,
    h: 0,
    line: { color: "FFFFFF", width: 1.5 },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 4.1404,
    y: 4.0923,
    w: 0.0625,
    h: 0.0625,
    line: { color: "FFFFFF", transparency: 100 },
    fill: { color: "FFFFFF" },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 9.1304,
    y: 4.0923,
    w: 0.0625,
    h: 0.0625,
    line: { color: "FFFFFF", transparency: 100 },
    fill: { color: "FFFFFF" },
  });

  // Note: charSpacing (not charSpace) is the correct PptxGenJS parameter for letter spacing
  slide.addText("SCRIPTURE READING", {
    x: 3.7384,
    y: 4.3074,
    w: 5.8565,
    h: 0.4376,
    fontFace: "Arial",
    fontSize: 20,
    bold: true,
    color: "FFFFFF",
    align: "center",
    valign: "mid",
    charSpacing: 8,
    margin: 0,
  });

  slide.addText(titleRef, {
    x: 0,
    y: 5.80,
    w: layout.width,
    h: 1.74,
    fontFace: "Malgun Gothic",
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
    align: "center",
    valign: "mid",
    margin: 0,
  });
}

function buildScriptureWebViewPayload(payload, theme, input) {
  const { layout, safe } = buildScriptureLayout();
  const linesByLang = payload.lines;
  const hasKo = Array.isArray(linesByLang.ko);
  const hasEn = Array.isArray(linesByLang.en);
  const labelText = buildSlideLabel(
    payload.meta,
    hasKo && !hasEn ? "ko" : hasEn && !hasKo ? "en" : "both"
  );
  const slides = [];
  const slideTheme = theme || getPptxTheme("dark");

  if (hasKo && hasEn) {
    const koEntries = toEntries(linesByLang.ko || []);
    const enEntries = toEntries(linesByLang.en || []);
    const koMap = new Map(
      koEntries.filter((entry) => entry.num !== null).map((entry) => [entry.num, entry.line])
    );
    const enMap = new Map(
      enEntries.filter((entry) => entry.num !== null).map((entry) => [entry.num, entry.line])
    );
    const orderedNums = koEntries.length
      ? koEntries.filter((entry) => entry.num !== null).map((entry) => entry.num)
      : enEntries.filter((entry) => entry.num !== null).map((entry) => entry.num);

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
    const enConfig = { ...getLanguageConfig("en"), maxFontSize: 36 };
    const koConfig = getLanguageConfig("ko");

    orderedNums.forEach((num) => {
      const koText = koMap.get(num) || "";
      const enText = enMap.get(num) || "";
      const fittedKo = koText
        ? fitText(insertWordJoiner(koText), topBox, koConfig)
        : { text: "", fontSize: koConfig.maxFontSize };
      const fittedEn = enText
        ? fitText(enText, bottomBox, enConfig)
        : { text: "", fontSize: enConfig.maxFontSize };

      slides.push({
        kind: "bilingual",
        labelText,
        koText: fittedKo.text,
        koFontSize: fittedKo.fontSize,
        enText: fittedEn.text,
        enFontSize: fittedEn.fontSize,
      });
    });
  } else {
    const lang = hasEn ? "en" : "ko";
    const config = getLanguageConfig(lang);
    const entries = toEntries(linesByLang[lang] || []);
    const textBlocks = entries.length ? entries.map((entry) => entry.line) : linesByLang[lang] || [];

    textBlocks.forEach((text) => {
      const processedText = lang === "ko" ? insertWordJoiner(text) : text;
      fitTextToSlides(processedText, safe, config).forEach((slideItem) => {
        slides.push({
          kind: "single",
          labelText,
          lang,
          text: slideItem.text,
          fontSize: slideItem.fontSize,
        });
      });
    });
  }

  return {
    title: buildScriptureReferenceText(payload.meta, input),
    slideCount: slides.length,
    theme: {
      id: slideTheme.id || "dark",
      bgColor: slideTheme.bgColor || "000000",
      textColor: slideTheme.textColor || "FFFFFF",
      labelColor: slideTheme.labelColor || "EDEDED",
      bgImageData: slideTheme.bgImageData || null,
      overlayColor: slideTheme.overlayColor || null,
      overlayTransparency:
        typeof slideTheme.overlayTransparency === "number"
          ? slideTheme.overlayTransparency
          : null,
    },
    slides,
  };
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
