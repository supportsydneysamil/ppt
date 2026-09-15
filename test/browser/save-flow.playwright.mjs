// Browser regression suite for the save-state and unsaved-changes popup flow.
//
//   npm run test:browser
//
// Builds the client bundle, starts the app server on an ephemeral port, stubs
// every /api route inside the browser and stops the server again, so no data
// file is ever written. The page entry point is bundled, so the server has to
// serve dist/ rather than public/ for the app to boot at all. Set BASE_URL to
// point at a server you started yourself instead.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import PptxGenJS from "pptxgenjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const pptxFixture = new PptxGenJS();
pptxFixture.layout = "LAYOUT_WIDE";
pptxFixture.addSlide().addText("Browser fixture", {
  x: 1,
  y: 1,
  w: 4,
  h: 1,
});
const validPptxBuffer = await pptxFixture.write({ outputType: "nodebuffer" });

// A fixed port makes the run depend on whatever else is listening, so the
// default is whatever the OS hands out.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
}

const externalBaseURL = process.env.BASE_URL || "";
const port = Number(process.env.PORT || 0) || (await findFreePort());
const baseURL = externalBaseURL || `http://127.0.0.1:${port}`;
const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-browser-"));

async function waitForServer(url, { timeoutMs = 60000, child = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `server exited with code ${child.exitCode} before listening`
      );
    }
    try {
      const resp = await fetch(url, { method: "GET" });
      if (resp.ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      throw new Error(`server did not come up at ${url} within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

// The scenarios exercise the shipped bundle, so they build it from the current
// sources instead of trusting whatever dist/ happens to hold.
function buildClient() {
  return new Promise((resolve, reject) => {
    const build = spawn(
      process.execPath,
      [path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"), "build"],
      { cwd: repoRoot, stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    build.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    build.once("error", reject);
    build.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vite build failed with code ${code}: ${stderr}`));
    });
  });
}

async function startServer() {
  if (externalBaseURL) {
    await waitForServer(baseURL);
    return null;
  }
  await buildClient();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.resume();
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer(baseURL, { child });
  return child;
}

const slideDefaults = {
  sourceType: "basic",
  content: "원본 내용",
  font: "Malgun Gothic",
  fontSize: "40",
  bg: "black",
  align: "center",
  fileName: null,
  fileSaved: false,
  saved: true,
  serverFilePath: null,
  thumbnail: null,
  hymnNumber: null,
  hymnKorTitle: "",
  hymnEngTitle: "",
  originalUrl: null,
  adTitle: "",
  adTitleSize: "medium",
  adTitleAlign: "center",
  adBgSource: "none",
  adBgImagePath: null,
  adBgImageUrl: null,
  adBgOpacity: 30,
  titleDesign: "chapel",
  churchName: "",
  serviceDate: "",
  titleSubtitle: "",
  customTitleDesign: "aurora",
  customTitleKo: "",
  customTitleEn: "",
  includeTitle: false,
  titleSlideType: "말씀",
  testament: "",
  book: "",
  chapter: "",
  start: "",
  end: "",
  koVersion: "",
  enVersion: "",
  themeId: "dark",
  customImageData: null,
  scriptureSignature: "",
};

function slide(id, name, type = "simple", extra = {}) {
  return { ...slideDefaults, id, name, type, ...extra };
}

const basicSlides = [
  slide("main-1", "첫 슬라이드"),
  slide("main-2", "둘째 슬라이드", "ad", {
    content: "광고 본문",
    adTitle: "광고",
  }),
];

const savedScriptureSignature =
  '{"testament":"old","book":"genesis","chapter":"1","start":"","end":"","koVersion":"새번역","enVersion":"","themeId":"dark","includeTitle":false,"titleSlideType":"말씀","customImage":false,"customImageSize":0}';

const allTypeSlides = [
  slide("type-simple", "단순", "simple"),
  slide("type-ad", "광고", "ad", { adTitle: "광고" }),
  slide("type-title", "주일예배", "title", {
    churchName: "테스트 교회",
    serviceDate: "2026-09-13",
  }),
  slide("type-custom", "커스텀", "custom-title", {
    customTitleKo: "커스텀",
    customTitleEn: "Custom",
  }),
  slide("type-hymn", "찬송", "hymn", {
    sourceType: "upload",
    hymnNumber: "1",
    fileName: "hymn.pptx",
    fileSaved: true,
    serverFilePath: "/fixtures/hymn.pptx",
  }),
  slide("type-scripture", "말씀", "scripture", {
    sourceType: "upload",
    testament: "old",
    book: "genesis",
    chapter: "1",
    koVersion: "새번역",
    serverFilePath: "/fixtures/scripture.pptx",
    scriptureSignature: savedScriptureSignature,
  }),
];

const customCanvasSlides = [
  slide("custom-canvas", "커스텀 캔버스", "custom", {
    customSlide: {
      version: 1,
      width: 1280,
      height: 720,
      background: { color: "#1e293b" },
      elements: [
        {
          id: "saved-rect",
          type: "rect",
          x: 120,
          y: 100,
          width: 480,
          height: 260,
          rotation: 0,
          opacity: 1,
          fill: "#ef4444",
          stroke: "",
          strokeWidth: 0,
          zIndex: 0,
        },
      ],
    },
  }),
];

const loadingCustomCanvasSlides = [
  slide("custom-loading", "로딩 중 캔버스", "custom", {
    customSlide: {
      version: 1,
      width: 1280,
      height: 720,
      background: { color: "#ffffff" },
      elements: [
        {
          id: "slow-image",
          type: "image",
          src: "/uploads/slow-reset.png",
          fit: "contain",
          x: 100,
          y: 100,
          width: 640,
          height: 360,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
        },
      ],
    },
  }),
];

const scriptureSlides = [
  slide("main-scripture", "말씀 슬라이드", "scripture", {
    sourceType: "upload",
    testament: "old",
    book: "genesis",
    chapter: "1",
    koVersion: "새번역",
    serverFilePath: "/fixtures/scripture.pptx",
    scriptureSignature: savedScriptureSignature,
  }),
  slide("main-plain", "단순 슬라이드"),
];

const books = {
  testaments: [
    {
      id: "old",
      name: "구약",
      books: [
        {
          name: "창세기",
          slugKo: "genesis",
          slugEn: "genesis",
          abbrKo: "창",
          abbrEn: "Gen",
        },
        {
          name: "출애굽기",
          slugKo: "exodus",
          slugEn: "exodus",
          abbrKo: "출",
          abbrEn: "Exo",
        },
      ],
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function relativeLuminance(cssColor) {
  const channels = cssColor.match(/[\d.]+/g).slice(0, 3).map(Number);
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function templateFixture() {
  return {
    id: "template-1",
    name: "주일 템플릿",
    createdAt: "2026-09-13T00:00:00.000Z",
    slideCount: 2,
    slides: [
      slide("tpl-slide-1", "템플릿 첫 슬라이드"),
      slide("tpl-slide-2", "템플릿 둘째 슬라이드"),
    ],
  };
}

function createGate() {
  let release = () => {};
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const ledger = [];
const server = await startServer();
const browser = await chromium.launch({ headless: true });

async function runScenario(name, body, options = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    alerts: [],
    beforeunload: 0,
  };

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") {
      diagnostics.beforeunload += 1;
    } else {
      diagnostics.alerts.push({ type: dialog.type(), message: dialog.message() });
    }
    await dialog.accept(
      dialog.type() === "prompt" ? options.promptAnswer ?? "" : undefined
    );
  });

  try {
    await body(page, diagnostics);
    const unexpectedConsole = diagnostics.consoleErrors.filter(
      (message) =>
        !(options.expectedConsole || []).some((pattern) =>
          typeof pattern === "string"
            ? message.includes(pattern)
            : pattern.test(message)
        )
    );
    assert.deepEqual(diagnostics.pageErrors, [], "unexpected page errors");
    assert.deepEqual(unexpectedConsole, [], "unexpected console errors");
    ledger.push({ name, status: "PASS", ...diagnostics });
    console.log(`PASS ${name}`);
  } catch (error) {
    const safeName = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await page
      .screenshot({
        path: path.join(artifactDir, `${safeName}.png`),
        fullPage: true,
      })
      .catch(() => {});
    ledger.push({
      name,
      status: "FAIL",
      error: error.stack || String(error),
      ...diagnostics,
    });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

async function setup(page, options = {}) {
  const state = {
    slides: clone(options.slides || basicSlides),
    templates: clone(options.templates || [templateFixture()]),
    counts: {
      booksGet: 0,
      slidePost: 0,
      slideDelete: 0,
      bulkDelete: 0,
      templateSlidePost: 0,
      templateSlidePut: 0,
      templateSlideDelete: 0,
      templateBulkDelete: 0,
      templateDuplicate: 0,
      templateOrderPut: 0,
      templatePatch: 0,
      templateDelete: 0,
      uploadPost: 0,
      scriptureGenerate: 0,
    },
  };

  if (options.customResetGate) {
    await page.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        "src"
      );
      let matchingAssignments = 0;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      globalThis.__releaseCustomResetImage = release;
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        ...descriptor,
        set(value) {
          const isResetFixture = String(value).includes("/uploads/slow-reset.png");
          matchingAssignments += isResetFixture ? 1 : 0;
          if (isResetFixture && matchingAssignments > 1) {
            globalThis.__customResetImageBlocked = true;
            gate.then(() => descriptor.set.call(this, value));
            return;
          }
          descriptor.set.call(this, value);
        },
      });
    });
  }

  await page.route("https://**/*", async (route) => {
    const type = route.request().resourceType();
    if (type === "stylesheet") {
      await route.fulfill({ status: 200, contentType: "text/css", body: "" });
    } else if (type === "script") {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "",
      });
    } else {
      await route.fulfill({ status: 204, body: "" });
    }
  });

  if (options.customImageGate || options.customResetGate) {
    await page.route(`${baseURL}/uploads/slow-reset.png`, async (route) => {
      if (options.customImageGate) {
        await options.customImageGate.promise;
      }
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "cache-control": "no-store" },
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64"
        ),
      });
    });
  }

  await page.route(`${baseURL}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === "/api/books" && method === "GET") {
      state.counts.booksGet += 1;
      if (options.booksDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.booksDelayMs));
      }
      if (options.booksGate) {
        await options.booksGate.promise;
      }
      if (options.booksStatus && options.booksStatus >= 400) {
        return route.fulfill({
          status: options.booksStatus,
          json: { error: "injected books failure" },
        });
      }
      return route.fulfill({ status: 200, json: books });
    }
    if (url.pathname === "/api/slides" && method === "GET") {
      return route.fulfill({ status: 200, json: state.slides });
    }
    if (url.pathname === "/api/slides" && method === "POST") {
      state.counts.slidePost += 1;
      const payload = request.postDataJSON();
      const response = options.onSlidePost
        ? await options.onSlidePost({
            count: state.counts.slidePost,
            payload,
            state,
          })
        : { status: 200, json: { success: true } };
      if (response.status < 400) state.slides = clone(payload);
      return route.fulfill(response);
    }
    if (/^\/api\/slides\/[^/]+$/.test(url.pathname) && method === "DELETE") {
      state.counts.slideDelete += 1;
      const id = decodeURIComponent(url.pathname.split("/").pop());
      state.slides = state.slides.filter((entry) => entry.id !== id);
      return route.fulfill({ status: 200, json: { success: true } });
    }
    if (url.pathname === "/api/slides/bulk-delete" && method === "POST") {
      state.counts.bulkDelete += 1;
      const payload = request.postDataJSON();
      state.slides = state.slides.filter(
        (entry) => !payload.ids.includes(entry.id)
      );
      return route.fulfill({ status: 200, json: { success: true } });
    }
    if (url.pathname === "/api/templates" && method === "GET") {
      const responseTemplates = options.onTemplatesGet
        ? await options.onTemplatesGet({ state })
        : state.templates;
      return route.fulfill({ status: 200, json: responseTemplates });
    }
    // One stub per scope, mirroring the server: a slide route can only touch
    // that slide, and a structural route can only touch order, membership or
    // the name.
    const templateMatch = url.pathname.match(
      /^\/api\/templates\/([^/]+)(\/.*)?$/
    );
    if (templateMatch && templateMatch[2] !== undefined) {
      const templateId = decodeURIComponent(templateMatch[1]);
      const rest = templateMatch[2];
      const template = state.templates.find((entry) => entry.id === templateId);
      if (!template) {
        return route.fulfill({
          status: 404,
          json: { error: "Template not found" },
        });
      }

      const commit = (nextSlides, name = template.name) => ({
        ...template,
        name,
        slideCount: nextSlides.length,
        slides: clone(nextSlides),
      });
      const store = (nextTemplate, response) => {
        if (response.status < 400) {
          state.templates = state.templates.map((entry) =>
            entry.id === templateId ? clone(nextTemplate) : entry
          );
        }
        return route.fulfill(response);
      };

      const slideMatch = rest.match(/^\/slides\/([^/]+)$/);
      if (slideMatch && method === "PUT") {
        state.counts.templateSlidePut += 1;
        const slideId = decodeURIComponent(slideMatch[1]);
        const payload = request.postDataJSON();
        const nextTemplate = commit(
          template.slides.map((entry) =>
            entry.id === slideId
              ? { ...clone(payload.slide), id: slideId }
              : entry
          )
        );
        const response = options.onTemplateSlidePut
          ? await options.onTemplateSlidePut({
              count: state.counts.templateSlidePut,
              nextTemplate,
              state,
            })
          : { status: 200, json: { success: true, template: nextTemplate } };
        return store(nextTemplate, response);
      }

      if (rest === "/slides" && method === "POST") {
        state.counts.templateSlidePost += 1;
        const payload = request.postDataJSON();
        const nextSlides = clone(template.slides);
        nextSlides.splice(
          Math.max(0, Math.min(payload.index ?? nextSlides.length, nextSlides.length)),
          0,
          clone(payload.slide)
        );
        const nextTemplate = commit(nextSlides);
        return store(nextTemplate, {
          status: 200,
          json: { success: true, template: nextTemplate },
        });
      }

      if (rest === "/slides/bulk-delete" && method === "POST") {
        state.counts.templateBulkDelete += 1;
        const payload = request.postDataJSON();
        const nextTemplate = commit(
          template.slides.filter((entry) => !payload.ids.includes(entry.id))
        );
        return store(nextTemplate, {
          status: 200,
          json: { success: true, template: nextTemplate },
        });
      }

      if (slideMatch && method === "DELETE") {
        state.counts.templateSlideDelete += 1;
        const slideId = decodeURIComponent(slideMatch[1]);
        const nextTemplate = commit(
          template.slides.filter((entry) => entry.id !== slideId)
        );
        return store(nextTemplate, {
          status: 200,
          json: { success: true, template: nextTemplate },
        });
      }

      const duplicateMatch = rest.match(/^\/slides\/([^/]+)\/duplicate$/);
      if (duplicateMatch && method === "POST") {
        state.counts.templateDuplicate += 1;
        const slideId = decodeURIComponent(duplicateMatch[1]);
        const sourceIndex = template.slides.findIndex(
          (entry) => entry.id === slideId
        );
        const duplicate = {
          ...clone(template.slides[sourceIndex]),
          id: `${slideId}-copy`,
          name: `${template.slides[sourceIndex].name} 복사`,
        };
        const nextSlides = clone(template.slides);
        nextSlides.splice(sourceIndex + 1, 0, duplicate);
        const nextTemplate = commit(nextSlides);
        return store(nextTemplate, {
          status: 200,
          json: { success: true, template: nextTemplate, slide: duplicate },
        });
      }

      if (rest === "/slide-order" && method === "PUT") {
        state.counts.templateOrderPut += 1;
        const payload = request.postDataJSON();
        const nextTemplate = commit(
          payload.slideIds.map((id) =>
            template.slides.find((entry) => entry.id === id)
          )
        );
        const response = options.onTemplateOrderPut
          ? await options.onTemplateOrderPut({
              count: state.counts.templateOrderPut,
              nextTemplate,
              state,
            })
          : { status: 200, json: { success: true, template: nextTemplate } };
        return store(nextTemplate, response);
      }
    }

    if (/^\/api\/templates\/[^/]+$/.test(url.pathname) && method === "PATCH") {
      state.counts.templatePatch += 1;
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const payload = request.postDataJSON();
      const template = state.templates.find((entry) => entry.id === id);
      const nextTemplate = { ...template, name: payload.name };
      state.templates = state.templates.map((entry) =>
        entry.id === id ? clone(nextTemplate) : entry
      );
      return route.fulfill({
        status: 200,
        json: { success: true, template: nextTemplate },
      });
    }

    if (/^\/api\/templates\/[^/]+$/.test(url.pathname) && method === "DELETE") {
      state.counts.templateDelete += 1;
      const id = decodeURIComponent(url.pathname.split("/").pop());
      state.templates = state.templates.filter((entry) => entry.id !== id);
      return route.fulfill({ status: 200, json: { success: true } });
    }
    if (url.pathname === "/api/upload" && method === "POST") {
      state.counts.uploadPost += 1;
      const response = options.onUpload
        ? await options.onUpload({ count: state.counts.uploadPost, state })
        : {
            status: 200,
            json: {
              path: "/fixtures/uploaded.pptx",
              originalName: "fixture.pptx",
              thumbnail: null,
            },
          };
      return route.fulfill(response);
    }
    if (
      url.pathname === "/api/scripture/generate-slide" &&
      method === "POST"
    ) {
      state.counts.scriptureGenerate += 1;
      const response = options.onScriptureGenerate
        ? await options.onScriptureGenerate({
            count: state.counts.scriptureGenerate,
            state,
          })
        : {
            status: 200,
            json: {
              success: true,
              path: null,
              originalName: "scripture.pptx",
              thumbnail: null,
            },
          };
      return route.fulfill(response);
    }

    return route.fulfill({
      status: 404,
      json: { error: `Unstubbed API: ${method} ${url.pathname}` },
    });
  });

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator("#navPpt").click();
  if (options.skipReady) {
    return state;
  }
  await waitForPptReady(page);
  const layoutMode = await page
    .locator("#pptWorkspace")
    .getAttribute("data-layout-mode");
  const slidesOpen = await page
    .locator("#pptWorkspace")
    .getAttribute("data-slides-open");
  if (layoutMode === "compact" && slidesOpen === "false") {
    await page.locator("#pptSlidesPaneBtn").click();
  }
  await page
    .locator("#slideListContainer .slide-card")
    .first()
    .waitFor({ state: "visible" });
  return state;
}

// The marker is written for both outcomes, so a failed init fails the wait
// with its reason instead of hanging until the locator times out.
async function waitForPptReady(page) {
  await page.locator("body[data-ppt-ready]").waitFor();
  assert.equal(
    await page.locator("body").getAttribute("data-ppt-ready"),
    "true",
    "the workspace must report a successful readiness state"
  );
}

async function selectMainSlide(page, index) {
  await page.locator("#slideListContainer .slide-card").nth(index).click();
  await page.locator("#slideEditor").waitFor({ state: "visible" });
}

async function openTemplate(page) {
  await page.locator("#tabTemplatesBtn").click();
  await page.locator(".template-card-open").first().click();
  await page.locator("#templateWorkspaceBar").waitFor({ state: "visible" });
  await selectMainSlide(page, 0);
}

async function installDialogCounter(page) {
  await page.evaluate(() => {
    window.__unsavedOpenCount = 0;
    const target = document.querySelector("#unsavedChangesModal");
    new MutationObserver(() => {
      if (target.open) window.__unsavedOpenCount += 1;
    }).observe(target, { attributes: true, attributeFilter: ["open"] });
  });
}

async function assertDialogOpenCount(page, expected) {
  await page.locator("#unsavedChangesModal").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => window.__unsavedOpenCount), expected);
  assert.equal(await page.locator("dialog[open]").count(), 1);
}

// The request counters live in Node, so scenarios that assert on them have to
// wait for the browser's request to actually land.
async function waitForCount(read, expected, label) {
  const deadline = Date.now() + 5000;
  while (read() !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(read(), expected, label);
}

async function fillName(page, value) {
  await page.locator("#slideName").fill(value);
}

async function expectToastOnce(page, text) {
  const matching = page.locator("#appToastRegion .app-toast", { hasText: text });
  await matching.first().waitFor({ state: "visible" });
  assert.equal(await matching.count(), 1, `toast count for ${text}`);
}

async function expectToast(page, text) {
  await page
    .locator("#appToastRegion .app-toast", { hasText: text })
    .first()
    .waitFor({ state: "visible" });
}

function slideNames(page) {
  return page.locator("#slideListContainer .slide-card h4").allTextContents();
}

async function waitForAlert(diagnostics, text) {
  const deadline = Date.now() + 5000;
  while (
    !diagnostics.alerts.some((entry) => entry.message.includes(text)) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(
    diagnostics.alerts.some((entry) => entry.message.includes(text)),
    `expected alert containing: ${text}`
  );
}

await runScenario(
  "global and PPT navigation stay fixed while content surfaces change",
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setup(page);
    const positions = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [
            "#navExtractor",
            "#navPpt",
            "#appSettingsBtn",
            "#tabSlidesBtn",
            "#tabTemplatesBtn",
          ].map((selector) => [
            selector,
            Math.round(
              document.querySelector(selector).getBoundingClientRect().left
            ),
          ])
        )
      );

    const slides = await positions();
    const globalNavCenter = await page.evaluate(() => {
      const first = document.querySelector("#navExtractor").getBoundingClientRect();
      const last = document.querySelector("#navPpt").getBoundingClientRect();
      return (first.left + last.right) / 2;
    });
    assert.ok(
      Math.abs(globalNavCenter - 720) <= 1,
      `global navigation is not centered: ${globalNavCenter}`
    );
    await page.locator("#tabTemplatesBtn").click();
    const templates = await positions();
    assert.deepEqual(templates, slides);

    await page.locator("#navExtractor").click();
    const extractor = await positions();
    assert.equal(extractor["#navExtractor"], slides["#navExtractor"]);
    assert.equal(extractor["#navPpt"], slides["#navPpt"]);
    assert.equal(extractor["#appSettingsBtn"], slides["#appSettingsBtn"]);
  }
);

await runScenario(
  "blocked custom editor popup leaves inline editing available",
  async (page) => {
    await setup(page);
    await page.locator("#addSlideBtn").click();
    await page.locator("#slideType").selectOption("custom");
    await page.locator("#customSlideEditor:not([hidden])").waitFor();
    await page.evaluate(() => {
      window.open = () => null;
    });

    await page.locator("#customEditorPopoutBtn").click();
    await expectToast(page, "팝업 차단");
    assert.equal(await page.locator("#customSlideEditor").getAttribute("inert"), null);
    assert.equal(await page.locator("#customEditorPopoutBtn").isEnabled(), true);
  }
);

await runScenario(
  "custom editor popout mirrors edits and restores inline ownership",
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const state = await setup(page);
    await page.locator("#addSlideBtn").click();
    await page.locator("#slideType").selectOption("custom");
    await page.locator("#customSlideEditor:not([hidden])").waitFor();

    const popupReady = page.waitForEvent("popup");
    await page.locator("#customEditorPopoutBtn").click();
    const popup = await popupReady;
    await popup.getByText("주 창과 연결됨").waitFor({ timeout: 15000 });
    assert.equal(await popup.locator("[data-custom-editor='canvas']").count(), 1);
    assert.equal(await page.locator("#customSlideEditor").getAttribute("inert"), "");

    await popup.locator("[data-editor-action='add-text']").click();
    await page.locator("#editorSaveBtn:not([disabled])").waitFor();
    await popup.getByRole("button", { name: "저장" }).click();
    await popup.getByText("저장됨").waitFor();
    assert.equal(state.counts.slidePost, 1);

    const closed = popup.waitForEvent("close");
    await popup.getByRole("button", { name: "주 창으로 합치기" }).click();
    await closed;
    await page.waitForFunction(
      () => !document.querySelector("#customSlideEditor")?.hasAttribute("inert")
    );
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  }
);

await runScenario(
  "leaving a clean custom slide closes its popout",
  async (page) => {
    await setup(page, { slides: customCanvasSlides });
    await selectMainSlide(page, 0);
    await page
      .locator("#customSlideEditor [data-custom-editor='status']")
      .first()
      .filter({ hasText: "슬라이드를 불러왔습니다" })
      .waitFor();

    const popupReady = page.waitForEvent("popup");
    await page.locator("#customEditorPopoutBtn").click();
    const popup = await popupReady;
    await popup.getByText("주 창과 연결됨").waitFor({ timeout: 15000 });

    const closed = popup.waitForEvent("close");
    await page.locator("#addSlideBtn").click();
    await closed;
    assert.equal(await page.locator("#customSlideEditor").getAttribute("inert"), null);
  }
);

await runScenario(
  "wide PPT workspace supports three panes and canvas-first focus mode",
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setup(page, { slides: customCanvasSlides });
    await selectMainSlide(page, 0);
    await page
      .locator("#customSlideEditor [data-custom-editor='status']")
      .first()
      .filter({ hasText: "슬라이드를 불러왔습니다" })
      .waitFor();

    const workspace = page.locator("#pptWorkspace");
    assert.equal(await workspace.getAttribute("data-layout-mode"), "wide");
    assert.equal(await workspace.getAttribute("data-slides-open"), "true");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "true");
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);

    const normalWidth = await page
      .locator("#customSlideEditor .canvas-container")
      .evaluate((node) => Math.round(node.getBoundingClientRect().width));
    assert.ok(normalWidth >= 630, `three-pane canvas stayed narrow: ${normalWidth}`);

    await page.locator("#slidePanelCollapseBtn").click();
    await page.waitForFunction(
      (before) =>
        document.querySelector("#customSlideEditor .canvas-container")
          ?.getBoundingClientRect().width > before + 180,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-slides-open"), "false");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "true");
    await page.locator("#slidePanelCollapseBtn").click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          document.querySelector("#customSlideEditor .canvas-container")
            ?.getBoundingClientRect().width - expected
        ) <= 2,
      normalWidth
    );

    await page.locator("#pptFocusModeBtn").click();
    await page.waitForFunction(
      (before) =>
        document.querySelector("#customSlideEditor .canvas-container")
          ?.getBoundingClientRect().width > before + 200,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-focus-mode"), "true");
    assert.equal(await page.locator(".slide-cards").getAttribute("inert"), "");
    assert.equal(await page.locator("#slideForm").getAttribute("inert"), "");

    const focusWidth = await page
      .locator("#customSlideEditor .canvas-container")
      .evaluate((node) => Math.round(node.getBoundingClientRect().width));
    assert.ok(focusWidth >= 960, `focus canvas stayed narrow: ${focusWidth}`);
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);

    await page.locator("#pptFocusModeBtn").click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          document.querySelector("#customSlideEditor .canvas-container")
            ?.getBoundingClientRect().width - expected
        ) <= 2,
      normalWidth
    );
    assert.equal(await workspace.getAttribute("data-focus-mode"), "false");
    assert.equal(await page.locator(".slide-cards").getAttribute("inert"), null);
    assert.equal(await page.locator("#slideForm").getAttribute("inert"), null);
  }
);

await runScenario(
  "compact PPT workspace opens one drawer and Escape closes it",
  async (page) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await setup(page);
    const workspace = page.locator("#pptWorkspace");

    assert.equal(await workspace.getAttribute("data-layout-mode"), "compact");
    assert.equal(await workspace.getAttribute("data-slides-open"), "true");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "false");

    await selectMainSlide(page, 0);
    assert.equal(await workspace.getAttribute("data-slides-open"), "false");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "true");

    await page.keyboard.press("Escape");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "false");
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  }
);

await runScenario(
  "mobile PPT workspace keeps panels in flow and hides pane toggles",
  async (page) => {
    await page.setViewportSize({ width: 899, height: 900 });
    await setup(page);
    const workspace = page.locator("#pptWorkspace");

    assert.equal(await workspace.getAttribute("data-layout-mode"), "mobile");
    assert.equal(await workspace.getAttribute("data-slides-open"), "true");
    assert.equal(await workspace.getAttribute("data-inspector-open"), "true");
    assert.equal(await page.locator("#slideListPanel").isVisible(), true);
    assert.equal(await page.locator("#pptSlidesPaneBtn").isHidden(), true);

    await selectMainSlide(page, 0);
    assert.equal(await page.locator("#slideForm").isVisible(), true);
    assert.equal(await page.locator("#pptInspectorPaneBtn").isHidden(), true);
    assert.equal(await page.locator("#pptFocusModeBtn").isHidden(), true);
  }
);

await runScenario(
  "workspace width follows the active product without widening scripture",
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setup(page, { slides: customCanvasSlides });
    await page.locator("#navExtractor").click();

    const extractorShellWidth = await page.locator(".page").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    const extractorContentWidth = await page.locator("#view-extractor").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    assert.ok(extractorShellWidth >= 1390);
    assert.equal(extractorContentWidth, 932);
    assert.equal(
      await page.locator(".page").getAttribute("data-workspace"),
      "extractor"
    );

    await page.locator("#navPpt").click();
    assert.equal(
      await page.locator(".page").getAttribute("data-ppt-surface"),
      "editor"
    );
    const pptShellWidth = await page.locator(".page").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    assert.equal(pptShellWidth, extractorShellWidth);

    await page.locator("#tabTemplatesBtn").click();
    assert.equal(
      await page.locator(".page").getAttribute("data-ppt-surface"),
      "gallery"
    );
    await page.locator("#tabSlidesBtn").click();

    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      assert.ok(overflow <= 1, `${width}px viewport overflowed by ${overflow}px`);
    }

    await page.locator("#navExtractor").click();
    assert.equal(
      await page.locator(".page").getAttribute("data-workspace"),
      "extractor"
    );
  }
);

await runScenario(
  "custom canvas grows with the browser and recovers after a hidden view",
  async (page) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page, { slides: customCanvasSlides });
    await selectMainSlide(page, 0);
    const status = page
      .locator("#customSlideEditor [data-custom-editor='status']")
      .first();
    await status.filter({ hasText: "슬라이드를 불러왔습니다" }).waitFor();

    const narrowWidth = await page.locator(
      "#customSlideEditor .canvas-container"
    ).evaluate((node) => Math.round(node.getBoundingClientRect().width));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(
      (before) =>
        document.querySelector("#customSlideEditor .canvas-container")
          ?.getBoundingClientRect().width > before + 80,
      narrowWidth
    );

    const wideWidth = await page.locator(
      "#customSlideEditor .canvas-container"
    ).evaluate((node) => Math.round(node.getBoundingClientRect().width));
    assert.ok(wideWidth >= 630, `custom canvas stayed narrow: ${wideWidth}`);

    await page.locator("#navExtractor").click();
    await page.locator("#navPpt").click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          document.querySelector("#customSlideEditor .canvas-container")
            ?.getBoundingClientRect().width - expected
        ) <= 2,
      wideWidth
    );
  }
);

await runScenario(
  "title preview rerenders at the current stage width",
  async (page) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page);
    await selectMainSlide(page, 0);
    await page.locator("#slideType").selectOption("title");
    await page.locator("#titleKo").fill("주일예배");

    const initial = await page.locator("#slidePreview > div").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(
      (before) =>
        document.querySelector("#slidePreview > div")
          ?.getBoundingClientRect().width > before + 80,
      initial
    );

    const resized = await page.locator("#slidePreview > div").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    const host = await page.locator("#slidePreview").evaluate(
      (node) => Math.round(node.getBoundingClientRect().width)
    );
    assert.ok(Math.abs(resized - host) <= 2, `${resized} did not fit ${host}`);
  }
);

await runScenario("save buttons across saved types and main success", async (page) => {
  const state = await setup(page, { slides: allTypeSlides });
  for (let index = 0; index < allTypeSlides.length; index += 1) {
    await selectMainSlide(page, index);
    assert.equal(
      await page.locator("#editorSaveBtn").isDisabled(),
      true,
      `${allTypeSlides[index].type} should start clean`
    );
  }

  await selectMainSlide(page, 0);
  await fillName(page, "단순 변경");
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  await fillName(page, "단순");
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);

  await page.locator("#addSlideBtn").click();
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  await fillName(page, "브라우저 신규");
  await page.locator("#editorSaveBtn").click();
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  await expectToastOnce(page, "슬라이드가 저장되었습니다");
  assert.equal(state.counts.slidePost, 1);
});

await runScenario("a template slide save writes that slide only", async (page) => {
  const state = await setup(page);
  await openTemplate(page);
  await fillName(page, "템플릿 수정 1");
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  // There is no second save to press: the workspace bar carries no save button.
  assert.equal(await page.locator("#templateSaveBtn").count(), 0);

  await page.locator("#editorSaveBtn").click();
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  await expectToastOnce(page, "슬라이드가 저장되었습니다");

  assert.equal(state.counts.templateSlidePut, 1);
  assert.equal(state.counts.slidePost, 0, "the main slide list is untouched");
  assert.equal(state.counts.templateOrderPut, 0, "a content save sets no order");
  assert.equal(state.counts.templatePatch, 0, "a content save sets no name");
  assert.equal(state.templates[0].slides[0].name, "템플릿 수정 1");
  assert.deepEqual(
    state.templates[0].slides.map((entry) => entry.id),
    ["tpl-slide-1", "tpl-slide-2"],
    "the order the request never carried must be unchanged"
  );
});

await runScenario("a template reorder writes the order only", async (page) => {
  const state = await setup(page);
  await openTemplate(page);
  await page.locator("#slideName").waitFor();

  await page
    .locator("#slideListContainer .slide-card")
    .first()
    .locator(".slide-move-btn")
    .last()
    .click();
  await waitForCount(
    () => state.counts.templateOrderPut,
    1,
    "the reorder must reach the server on its own"
  );
  // The bar has no save button, so the toast is what tells the user the new
  // order is already stored.
  await expectToastOnce(page, "순서를 저장했습니다");

  assert.deepEqual(await slideNames(page), [
    "템플릿 둘째 슬라이드",
    "템플릿 첫 슬라이드",
  ]);
  assert.equal(state.counts.templateSlidePut, 0, "no content was written");
  assert.deepEqual(
    state.templates[0].slides.map((entry) => entry.id),
    ["tpl-slide-2", "tpl-slide-1"]
  );
  // A structural change is not the editor's business, so its button stays shut.
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
});

await runScenario(
  "a rejected template reorder restores the server order",
  async (page, diagnostics) => {
    const state = await setup(page, {
      onTemplateOrderPut: () => ({
        status: 500,
        json: { error: "injected order failure" },
      }),
    });
    await openTemplate(page);

    await page
      .locator("#slideListContainer .slide-card")
      .first()
      .locator(".slide-move-btn")
      .last()
      .click();
    await waitForAlert(diagnostics, "슬라이드 순서를 저장하지 못했습니다");

    assert.deepEqual(await slideNames(page), [
      "템플릿 첫 슬라이드",
      "템플릿 둘째 슬라이드",
    ]);
    assert.deepEqual(
      state.templates[0].slides.map((entry) => entry.id),
      ["tpl-slide-1", "tpl-slide-2"]
    );
  },
  { expectedConsole: [/500/, "Failed to reorder template slides"] }
);

await runScenario("template delete and duplicate write membership", async (page) => {
  const state = await setup(page);
  await openTemplate(page);

  await page.locator("#duplicateSlideBtn").click();
  await expectToast(page, "슬라이드를 복제했습니다");
  await waitForCount(() => state.counts.templateDuplicate, 1, "duplicate landed");
  assert.equal(state.templates[0].slides.length, 3);
  assert.equal(state.counts.templateSlidePut, 0, "no content was written");

  await page.locator("#editorDeleteBtn").click();
  await page.waitForFunction(
    () => document.querySelectorAll("#slideListContainer .slide-card").length === 2
  );
  await waitForCount(() => state.counts.templateSlideDelete, 1, "delete landed");
  await expectToastOnce(page, "슬라이드를 삭제했습니다");
  assert.equal(state.templates[0].slides.length, 2);
});

await runScenario(
  "renaming a template writes the name only",
  async (page) => {
  const state = await setup(page);
  await openTemplate(page);

  await page.locator("#templateNameDisplay").click();
  await page.waitForFunction(
    () => document.querySelector("#templateNameDisplay").textContent === "새 템플릿 이름"
  );
  assert.equal(state.counts.templatePatch, 1);
  await expectToastOnce(page, "템플릿 이름을 변경했습니다");
  assert.equal(state.templates[0].name, "새 템플릿 이름");
  assert.equal(state.counts.templateSlidePut, 0);
  assert.equal(state.counts.templateOrderPut, 0);
  },
  { promptAnswer: "새 템플릿 이름" }
);

await runScenario("navigation popup is singular and continue retains state", async (page) => {
  await setup(page);
  await selectMainSlide(page, 0);
  await installDialogCounter(page);
  await fillName(page, "계속 편집 유지");

  await page.locator("#slideListContainer .slide-card").nth(1).click();
  await assertDialogOpenCount(page, 1);
  await page.locator("#unsavedCancelBtn").click();
  assert.equal(await page.locator("#slideName").inputValue(), "계속 편집 유지");
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "main-1"
  );

  await page.locator("#tabTemplatesBtn").click();
  await assertDialogOpenCount(page, 2);
  await page.locator("#unsavedCancelBtn").click();
  assert.equal(await page.locator("#tabSlidesBtn").getAttribute("aria-selected"), "true");

  await page.locator("#navExtractor").click();
  await assertDialogOpenCount(page, 3);
  await page.locator("#unsavedCancelBtn").click();
  assert.equal(await page.locator("#view-ppt").isVisible(), true);
  assert.equal(await page.locator("#slideName").inputValue(), "계속 편집 유지");
});

await runScenario("only the slide draft can raise the popup", async (page) => {
  const state = await setup(page);
  await openTemplate(page);
  await installDialogCounter(page);

  // A structural change is already on the server, so leaving asks nothing.
  await page
    .locator("#slideListContainer .slide-card")
    .first()
    .locator(".slide-move-btn")
    .last()
    .click();
  await waitForCount(() => state.counts.templateOrderPut, 1, "reorder landed");

  await page.locator("#templateBackBtn").click();
  await page.locator("#templateGallery").waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => window.__unsavedOpenCount),
    0,
    "a change that is already saved must not be questioned"
  );

  // An unsaved draft still does.
  await page.locator(".template-card-open").first().click();
  await selectMainSlide(page, 0);
  await fillName(page, "미저장 초안");
  await page.locator("#templateBackBtn").click();
  await assertDialogOpenCount(page, 1);
  assert.match(
    await page.locator("#unsavedChangesMessage").textContent(),
    /슬라이드에 저장하지 않은 변경사항/
  );
  await page.locator("#unsavedCancelBtn").click();
});

await runScenario("discard removes new and restores existing slide", async (page) => {
  await setup(page);
  await selectMainSlide(page, 0);
  await fillName(page, "버릴 기존 수정");
  await page.locator("#slideListContainer .slide-card").nth(1).click();
  await page.locator("#unsavedDiscardBtn").click();
  await page.locator(".slide-card.active").waitFor();
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "main-2"
  );
  await selectMainSlide(page, 0);
  assert.equal(await page.locator("#slideName").inputValue(), "첫 슬라이드");

  await page.locator("#addSlideBtn").click();
  assert.equal(await page.locator(".slide-card").count(), 3);
  await page.locator("#slideListContainer .slide-card").first().click();
  await page.locator("#unsavedDiscardBtn").click();
  assert.equal(await page.locator(".slide-card").count(), 2);
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "main-1"
  );
});

await runScenario("discard restores a template slide from its record", async (page) => {
  const state = await setup(page);
  await openTemplate(page);
  await fillName(page, "로컬 템플릿 수정");
  await page.locator("#templateBackBtn").click();
  await page.locator("#unsavedDiscardBtn").click();
  await page.locator(".template-card-open").waitFor({ state: "visible" });
  await page.locator(".template-card-open").click();
  await selectMainSlide(page, 0);
  assert.equal(
    await page.locator("#slideName").inputValue(),
    "템플릿 첫 슬라이드"
  );
  assert.equal(state.counts.templateSlidePut, 0, "a discard writes nothing");
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
});

await runScenario("save then move main runs one POST", async (page) => {
  const gate = createGate();
  const state = await setup(page, {
    onSlidePost: async () => {
      await gate.promise;
      return { status: 200, json: { success: true } };
    },
  });
  await selectMainSlide(page, 0);
  await fillName(page, "저장 후 이동");
  await page.locator("#slideListContainer .slide-card").nth(1).click();
  await page.locator("#unsavedSaveBtn").click();

  // The busy phase cannot be interrupted, so focus has to stay inside the
  // dialog even though every button is disabled.
  await page.locator("#unsavedChangesModal[aria-busy='true']").waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "unsavedChangesCard",
    "focus must rest on the modal card while the dialog is busy"
  );
  gate.release();

  await page.locator("#unsavedChangesModal").waitFor({ state: "hidden" });
  assert.equal(state.counts.slidePost, 1);
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "main-2"
  );
  await expectToastOnce(page, "변경사항을 저장했습니다");
});

await runScenario("save then move writes the template slide once", async (page) => {
  const state = await setup(page);
  await openTemplate(page);
  await fillName(page, "가드가 저장한 이름");
  await page.locator("#templateBackBtn").click();
  await page.locator("#unsavedSaveBtn").click();
  await page.locator("#unsavedChangesModal").waitFor({ state: "hidden" });
  await page.locator(".template-card-open").waitFor({ state: "visible" });
  assert.equal(state.counts.slidePost, 0);
  assert.equal(state.counts.templateSlidePut, 1);
  assert.equal(state.templates[0].slides[0].name, "가드가 저장한 이름");
  await expectToastOnce(page, "변경사항을 저장했습니다");
});

await runScenario("beforeunload fires only while dirty", async (page, diagnostics) => {
  await setup(page);
  await selectMainSlide(page, 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(diagnostics.beforeunload, 0, "clean reload must not prompt");
  await page.locator("#navPpt").click();
  await waitForPptReady(page);
  await selectMainSlide(page, 0);
  await fillName(page, "beforeunload dirty");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(diagnostics.beforeunload, 1, "dirty reload must prompt once");
});

await runScenario(
  "POST slides failure preserves draft badge and retry",
  async (page, diagnostics) => {
    const state = await setup(page, {
      onSlidePost: ({ count }) =>
        count === 1
          ? { status: 500, json: { error: "injected slide failure" } }
          : { status: 200, json: { success: true } },
    });
    await page.locator("#addSlideBtn").click();
    await fillName(page, "POST 실패 초안");
    await page.locator("#slideListContainer .slide-card").first().click();
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "visible" });
    await waitForAlert(diagnostics, "injected slide failure");
    assert.equal(await page.locator("#slideName").inputValue(), "POST 실패 초안");
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
    assert.equal(
      await page.locator(".slide-card.active .slide-save-badge").textContent(),
      "미저장"
    );
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "hidden" });
    assert.equal(state.counts.slidePost, 2);
    assert.equal(
      await page.locator(".slide-card.active").getAttribute("data-slide-id"),
      "main-1"
    );
  },
  { expectedConsole: [/500/, "Error in saveCurrentSlide"] }
);

await runScenario(
  "a failed template slide save preserves the draft and retries",
  async (page, diagnostics) => {
    const state = await setup(page, {
      onTemplateSlidePut: ({ count, nextTemplate }) =>
        count === 1
          ? { status: 500, json: { error: "injected slide failure" } }
          : { status: 200, json: { success: true, template: nextTemplate } },
    });
    await openTemplate(page);
    await fillName(page, "저장 실패 초안");
    await page.locator("#editorSaveBtn").click();
    await waitForAlert(diagnostics, "injected slide failure");
    assert.equal(await page.locator("#slideName").inputValue(), "저장 실패 초안");
    assert.equal(
      await page.locator("#editorSaveBtn").isEnabled(),
      true,
      "a refused save has to stay retryable"
    );
    assert.equal(
      await page.locator("#editorSaveBtn").textContent(),
      "저장",
      "the progress label must be restored after a failure"
    );

    await page.locator("#editorSaveBtn").click();
    await waitForCount(() => state.counts.templateSlidePut, 2, "retry landed");
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
    assert.equal(state.templates[0].slides[0].name, "저장 실패 초안");
  },
  { expectedConsole: [/500/, "Error in saveCurrentSlide"] }
);

await runScenario(
  "upload failure preserves selected file draft badge and retry",
  async (page, diagnostics) => {
    const state = await setup(page, {
      onUpload: ({ count }) =>
        count === 1
          ? { status: 500, json: { error: "injected upload failure" } }
          : {
              status: 200,
              json: {
                path: "/fixtures/retry-upload.pptx",
                originalName: "retry.pptx",
                thumbnail: null,
              },
            },
    });
    await page.locator("#addSlideBtn").click();
    await fillName(page, "업로드 실패 초안");
    await page.locator('input[name="sourceType"][value="upload"]').check();
    await page.locator("#userPptxFile").setInputFiles({
      name: "retry.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: validPptxBuffer,
    });
    await page.locator("#slideListContainer .slide-card").first().click();
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "visible" });
    await waitForAlert(diagnostics, "파일 업로드 실패");
    assert.equal(await page.locator("#slideName").inputValue(), "업로드 실패 초안");
    assert.equal(
      await page.locator("#userPptxFile").evaluate((input) => input.files[0].name),
      "retry.pptx"
    );
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
    assert.equal(
      await page.locator(".slide-card.active .slide-save-badge").textContent(),
      "미저장"
    );
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "hidden" });
    assert.equal(state.counts.uploadPost, 2);
    assert.equal(state.counts.slidePost, 1);
  },
  { expectedConsole: [/500/, "Upload Error"] }
);

await runScenario(
  "scripture generation failure preserves image draft badge and retry",
  async (page, diagnostics) => {
    const state = await setup(page, {
      onScriptureGenerate: ({ count }) =>
        count === 1
          ? { status: 500, json: { error: "injected scripture failure" } }
          : {
              status: 200,
              json: {
                success: true,
                path: null,
                originalName: "scripture.pptx",
                thumbnail: null,
              },
            },
    });
    await page.locator("#addSlideBtn").click();
    await fillName(page, "말씀 실패 초안");
    await page.locator("#slideType").selectOption("scripture");
    await page.locator("#scriptureChapter").fill("1");
    await page.locator("#scriptureEnVersion").selectOption("");
    await page.locator("#scripturePptxImage").setInputFiles({
      name: "background.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      ),
    });
    await page.locator("#slideListContainer .slide-card").first().click();
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "visible" });
    await waitForAlert(diagnostics, "injected scripture failure");
    assert.equal(await page.locator("#slideName").inputValue(), "말씀 실패 초안");
    assert.equal(
      await page
        .locator("#scripturePptxImage")
        .evaluate((input) => input.files[0].name),
      "background.png"
    );
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
    assert.equal(
      await page.locator(".slide-card.active .slide-save-badge").textContent(),
      "미저장"
    );
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "hidden" });
    assert.equal(state.counts.scriptureGenerate, 2);
    assert.equal(state.counts.slidePost, 1);
  },
  { expectedConsole: [/500/] }
);

// --- Busy guard over destructive and reordering actions ---

await runScenario(
  "a running slide save blocks delete, reset and reorder",
  async (page) => {
    const gate = createGate();
    const state = await setup(page, {
      onSlidePost: async () => {
        await gate.promise;
        return { status: 200, json: { success: true } };
      },
    });

    await selectMainSlide(page, 0);
    await fillName(page, "저장 중 파괴 시도");
    await page.locator("#editorSaveBtn").click();
    await page.locator("#editorSaveBtn").waitFor({ state: "visible" });
    await page.locator("#editorSaveBtn[disabled]").waitFor();

    await page.locator("#editorCancelBtn").click();
    await expectToast(page, "저장이 진행 중입니다");
    assert.equal(
      await page.locator("#slideName").inputValue(),
      "저장 중 파괴 시도",
      "cancel must not roll the draft back mid-save"
    );

    await page.locator("#editorResetBtn").click();
    await expectToast(page, "저장이 진행 중입니다");
    assert.equal(
      await page.locator("#slideName").inputValue(),
      "저장 중 파괴 시도",
      "reset must not roll the draft back mid-save"
    );

    await page.locator("#editorDeleteBtn").click();
    await page
      .locator("#slideListContainer .slide-card")
      .first()
      .locator(".slide-move-btn")
      .last()
      .click();
    await page.locator("#selectAllSlidesCheckbox").check();
    await page.locator("#bulkActionMenuBtn").click();
    await page.locator("#bulkDeleteBtn").click();

    assert.equal(state.counts.slideDelete, 0, "no DELETE during a save");
    assert.equal(state.counts.bulkDelete, 0, "no bulk delete during a save");
    assert.equal(state.counts.slidePost, 1, "no extra POST during a save");
    // The list still shows the stored names: the rename lands with the save.
    assert.deepEqual(await slideNames(page), ["첫 슬라이드", "둘째 슬라이드"]);

    gate.release();
    await expectToastOnce(page, "슬라이드가 저장되었습니다");
    assert.deepEqual(await slideNames(page), ["저장 중 파괴 시도", "둘째 슬라이드"]);
    assert.equal(state.counts.slidePost, 1);
    assert.equal(state.counts.slideDelete, 0);
    assert.equal(state.counts.bulkDelete, 0);
    assert.deepEqual(state.slides.map((entry) => entry.name), [
      "저장 중 파괴 시도",
      "둘째 슬라이드",
    ]);
  }
);

await runScenario(
  "main reorder persists exactly once and blocks a second reorder",
  async (page) => {
    const gate = createGate();
    const state = await setup(page, {
      onSlidePost: async () => {
        await gate.promise;
        return { status: 200, json: { success: true } };
      },
    });

    // A dirty editor draft must survive the reorder with its save button
    // usable: the reorder only owns the order, not the draft.
    await selectMainSlide(page, 0);
    await fillName(page, "순서 변경 중 초안");
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);

    const moveDown = page
      .locator("#slideListContainer .slide-card")
      .first()
      .locator(".slide-move-btn")
      .last();
    await moveDown.click();
    assert.deepEqual(await slideNames(page), ["둘째 슬라이드", "첫 슬라이드"]);

    // The order is only authoritative once the POST lands, so a second
    // reorder may not start behind it.
    await page
      .locator("#slideListContainer .slide-card")
      .first()
      .locator(".slide-move-btn")
      .last()
      .click();
    await expectToast(page, "저장이 진행 중입니다");
    assert.equal(state.counts.slidePost, 1);

    gate.release();
    await page
      .locator("#editorSaveBtn:not([disabled])")
      .waitFor({ timeout: 5000 });
    assert.equal(
      await page.locator("#editorSaveBtn").isEnabled(),
      true,
      "a successful reorder must hand the dirty draft its save button back"
    );
    assert.equal(await page.locator("#slideName").inputValue(), "순서 변경 중 초안");
    assert.equal(state.counts.slidePost, 1, "one reorder means one POST");
    assert.deepEqual(state.slides.map((entry) => entry.name), [
      "둘째 슬라이드",
      "첫 슬라이드",
    ]);
    assert.deepEqual(await slideNames(page), ["둘째 슬라이드", "첫 슬라이드"]);
  }
);

await runScenario(
  "a running slide save blocks template rename and delete",
  async (page, diagnostics) => {
    const gate = createGate();
    const state = await setup(page, {
      onTemplateSlidePut: async ({ nextTemplate }) => {
        await gate.promise;
        return { status: 200, json: { success: true, template: nextTemplate } };
      },
    });

    await openTemplate(page);
    await fillName(page, "템플릿 저장 중 초안");
    await page.locator("#editorSaveBtn").click();
    await page.locator("#editorSaveBtn[disabled]").waitFor();

    // A rename accepted here would race the write already in flight, and a
    // delete would race a template the server is still writing.
    await page.locator("#templateNameDisplay").click();
    await expectToast(page, "저장이 진행 중입니다");
    await page.locator("#templateDeleteBtn").click();

    assert.deepEqual(
      diagnostics.alerts.filter((entry) => entry.type !== "alert"),
      [],
      "neither the rename prompt nor the delete confirm may open"
    );
    assert.equal(state.counts.templateDelete, 0, "no DELETE during a save");
    assert.equal(state.counts.templatePatch, 0, "no rename during a save");

    gate.release();
    await expectToastOnce(page, "슬라이드가 저장되었습니다");
    assert.equal(state.counts.templateSlidePut, 1);
    assert.equal(state.counts.templateDelete, 0);
    assert.equal(state.templates.length, 1);
    assert.equal(state.templates[0].name, "주일 템플릿");
    assert.equal(state.templates[0].slides[0].name, "템플릿 저장 중 초안");
  }
);

await runScenario(
  "a rejected reorder restores the server order",
  async (page, diagnostics) => {
    const state = await setup(page, {
      onSlidePost: ({ count }) =>
        count === 1
          ? { status: 500, json: { error: "injected reorder failure" } }
          : { status: 200, json: { success: true } },
    });

    await selectMainSlide(page, 0);
    await page
      .locator("#slideListContainer .slide-card")
      .first()
      .locator(".slide-move-btn")
      .last()
      .click();
    await waitForAlert(diagnostics, "슬라이드 순서를 저장하지 못했습니다");

    assert.deepEqual(await slideNames(page), ["첫 슬라이드", "둘째 슬라이드"]);
    assert.deepEqual(state.slides.map((entry) => entry.name), [
      "첫 슬라이드",
      "둘째 슬라이드",
    ]);
    assert.equal(
      await page.locator(".slide-card.active").getAttribute("data-slide-id"),
      "main-1",
      "the selection has to survive the rollback"
    );
    assert.equal(await page.locator("#slideEditor").isVisible(), true);

    // A later reorder still works, so nothing stayed latched.
    await page
      .locator("#slideListContainer .slide-card")
      .first()
      .locator(".slide-move-btn")
      .last()
      .click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("#slideListContainer .slide-card h4")].map(
          (node) => node.textContent
        )[0] === "둘째 슬라이드"
    );
    assert.equal(state.counts.slidePost, 2);
  },
  { expectedConsole: [/500/, "Failed to save slides"] }
);

// --- /api/books race and failure ---

await runScenario(
  "the workspace waits for the book list before anything can be selected",
  async (page) => {
    const gate = createGate();
    await setup(page, {
      slides: scriptureSlides,
      booksGate: gate,
      skipReady: true,
    });

    assert.equal(
      await page.locator("body[data-ppt-ready='true']").count(),
      0,
      "the workspace must not report ready before the books arrive"
    );
    assert.equal(
      await page.locator("#slideListContainer .slide-card").count(),
      0,
      "no slide may be selectable before the books arrive"
    );

    gate.release();
    await waitForPptReady(page);
    await page
      .locator("#slideListContainer .slide-card")
      .first()
      .waitFor({ state: "visible" });

    await selectMainSlide(page, 0);
    assert.equal(await page.locator("#scriptureBook").inputValue(), "genesis");
    assert.equal(await page.locator("#scriptureTestament").inputValue(), "old");
    assert.equal(
      await page.locator("#editorSaveBtn").isDisabled(),
      true,
      "a saved scripture slide must be baselined clean, not with an empty book"
    );
  }
);

await runScenario(
  "a failed book list blocks the scripture save with a named reason",
  async (page, diagnostics) => {
    const state = await setup(page, {
      slides: scriptureSlides,
      booksStatus: 500,
    });

    await expectToast(page, "성경 책 목록을 불러오지 못했습니다");
    await selectMainSlide(page, 0);
    await page.locator("#scriptureChapter").fill("5");
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
    await page.locator("#editorSaveBtn").click();
    await waitForAlert(diagnostics, "성경 책 목록을 불러오지 못했습니다");

    assert.equal(state.counts.slidePost, 0, "no slide may be written");
    assert.equal(state.counts.scriptureGenerate, 0, "no file may be generated");
    assert.equal(state.slides[0].book, "genesis", "the stored book is untouched");
    assert.equal(await page.locator("#scriptureChapter").inputValue(), "5");
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  },
  { expectedConsole: [/500/] }
);

// Each new slide is saved before the next one is added, so the scenario
// measures the insert position rather than the unsaved-changes guard.
async function addAndSave(page, name, menuItem = null) {
  if (menuItem) {
    await page.locator("#addSlideMenuBtn").click();
    await page.locator(menuItem).click();
  } else {
    await page.locator("#addSlideBtn").click();
  }
  await fillName(page, name);
  await page.locator("#editorSaveBtn").click();
  // The saved name reaching the card is what proves the list has re-rendered.
  await page
    .locator("#slideListContainer .slide-card h4", { hasText: name })
    .first()
    .waitFor();
}

await runScenario("new slides land at the chosen position", async (page) => {
  await setup(page);

  // No slide is being edited, so there is nothing for above/below to mean.
  assert.equal(await page.locator("#slideEditor").isVisible(), false);
  await page.locator("#addSlideMenuBtn").click();
  assert.equal(await page.locator("#addSlideBeforeBtn").isDisabled(), true);
  assert.equal(await page.locator("#addSlideAfterBtn").isDisabled(), true);
  assert.equal(await page.locator("#addSlideEndBtn").isDisabled(), false);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#addSlideDropdown").isHidden(), true);

  await addAndSave(page, "끝 추가");
  assert.deepEqual(await slideNames(page), [
    "첫 슬라이드",
    "둘째 슬라이드",
    "끝 추가",
  ]);

  await selectMainSlide(page, 0);
  await addAndSave(page, "아래 추가");
  assert.deepEqual(await slideNames(page), [
    "첫 슬라이드",
    "아래 추가",
    "둘째 슬라이드",
    "끝 추가",
  ]);

  await selectMainSlide(page, 0);
  await addAndSave(page, "위 추가", "#addSlideBeforeBtn");
  assert.deepEqual(await slideNames(page), [
    "위 추가",
    "첫 슬라이드",
    "아래 추가",
    "둘째 슬라이드",
    "끝 추가",
  ]);

  // A selection must not trap the new slide next to it.
  await selectMainSlide(page, 0);
  await addAndSave(page, "선택 있어도 끝", "#addSlideEndBtn");
  assert.deepEqual(await slideNames(page), [
    "위 추가",
    "첫 슬라이드",
    "아래 추가",
    "둘째 슬라이드",
    "끝 추가",
    "선택 있어도 끝",
  ]);

  // The last card has no neighbour below, and appending there still works.
  await selectMainSlide(page, 5);
  await addAndSave(page, "막차");
  assert.deepEqual((await slideNames(page)).at(-1), "막차");
});

// --- Cancel keeps the current slide context ---

await runScenario("cancel restores an existing dirty slide in place", async (page) => {
  await setup(page);
  await selectMainSlide(page, 0);
  await fillName(page, "취소할 기존 수정");
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  assert.equal(await page.locator("#editorCancelBtn").isEnabled(), true);

  await page.locator("#editorCancelBtn").click();

  assert.equal(
    await page.locator("#unsavedChangesModal").isVisible(),
    false,
    "cancel must not go through the navigation guard"
  );
  assert.equal(await page.locator("#slideEditor").isVisible(), true);
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "main-1"
  );
  assert.equal(await page.locator("#slideName").inputValue(), "첫 슬라이드");
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  assert.equal(await page.locator("#editorCancelBtn").isDisabled(), true);
  assert.deepEqual(await slideNames(page), ["첫 슬라이드", "둘째 슬라이드"]);
});

await runScenario("cancel preserves committed template structure", async (page) => {
  const state = await setup(page);
  await openTemplate(page);

  await page
    .locator("#slideListContainer .slide-card")
    .first()
    .locator(".slide-move-btn")
    .last()
    .click();
  await waitForCount(
    () => state.counts.templateOrderPut,
    1,
    "the template order must be committed before cancel"
  );

  await fillName(page, "슬라이드만 취소");
  await page.locator("#editorSaveBtn:not([disabled])").waitFor();
  await page.locator("#editorCancelBtn").click();

  assert.equal(await page.locator("#slideEditor").isVisible(), true);
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "tpl-slide-1"
  );
  assert.equal(
    await page.locator("#slideName").inputValue(),
    "템플릿 첫 슬라이드"
  );
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  assert.deepEqual(
    state.templates[0].slides.map((slide) => slide.id),
    ["tpl-slide-2", "tpl-slide-1"],
    "cancel must not roll back a committed template-level change"
  );
  assert.equal(state.counts.templateOrderPut, 1);
  assert.equal(state.counts.templateSlidePut, 0);
  assert.equal(await page.locator("#templateWorkspaceBar").isVisible(), true);
});

await runScenario("cancel of a new slide selects the adjacent neighbor", async (page) => {
  await setup(page);
  await selectMainSlide(page, 0);
  await page.locator("#addSlideBtn").click();
  assert.equal(await page.locator("#slideListContainer .slide-card").count(), 3);
  await fillName(page, "중간 신규");

  await page.locator("#editorCancelBtn").click();

  assert.equal(
    await page.locator("#unsavedChangesModal").isVisible(),
    false,
    "cancel must not go through the navigation guard"
  );
  assert.equal(await page.locator("#slideListContainer .slide-card").count(), 2);
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "main-2",
    "a cancelled insert prefers the next neighbor"
  );
  assert.equal(await page.locator("#slideEditor").isVisible(), true);
  assert.equal(await page.locator("#slideName").inputValue(), "둘째 슬라이드");

  await selectMainSlide(page, 1);
  await page.locator("#addSlideBtn").click();
  assert.equal(await page.locator("#slideListContainer .slide-card").count(), 3);
  await page.locator("#editorCancelBtn").click();
  assert.equal(await page.locator("#slideListContainer .slide-card").count(), 2);
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    "main-2",
    "a trailing new slide falls back to the previous neighbor"
  );
});

await runScenario("cancel of the only new slide shows the empty editor", async (page) => {
  await setup(page, { slides: [slide("solo", "혼자")] });
  await selectMainSlide(page, 0);
  await page.locator("#editorDeleteBtn").click();
  await page.locator("#slideListContainer .slide-card").waitFor({ state: "detached" });

  await page.locator("#addSlideBtn").click();
  await page.locator("#slideEditor").waitFor({ state: "visible" });
  assert.equal(await page.locator("#slideListContainer .slide-card").count(), 1);

  await page.locator("#editorCancelBtn").click();

  assert.equal(await page.locator("#slideListContainer .slide-card").count(), 0);
  assert.equal(await page.locator("#slideEditor").isVisible(), false);
  assert.equal(await page.locator("#emptyEditorState").isVisible(), true);
});

// --- Confirmed, type-preserving slide reset ---

await runScenario(
  "reset dialog cancellation is inert and confirmation keeps slide context",
  async (page) => {
    const state = await setup(page);
    await selectMainSlide(page, 1);
    await page.locator("#adBodyContent").fill("초기화 전 초안");
    await page.locator('input[name="sourceType"][value="upload"]').check();
    await page.locator("#userPptxFile").setInputFiles({
      name: "reset-me.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: validPptxBuffer,
    });

    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetModal").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#slideResetModal").getAttribute("role"),
      "alertdialog"
    );
    assert.equal(
      await page.locator("#slideResetModal").getAttribute("aria-labelledby"),
      "slideResetTitle"
    );
    assert.equal(
      await page.locator("#slideResetModal").getAttribute("aria-describedby"),
      "slideResetDescription"
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "slideResetBackBtn",
      "the safe action must receive initial focus"
    );
    const resetConfirmColors = await page
      .locator("#slideResetConfirmBtn")
      .evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          foreground: style.color,
          background: style.backgroundColor,
        };
      });
    assert.ok(
      contrastRatio(
        resetConfirmColors.foreground,
        resetConfirmColors.background
      ) >= 4.5,
      "the filled danger button must meet WCAG AA text contrast"
    );

    await page.keyboard.press("Escape");
    await page.locator("#slideResetModal").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#adBodyContent").inputValue(), "초기화 전 초안");
    assert.equal(
      await page.locator("#userPptxFile").evaluate((input) => input.files[0]?.name),
      "reset-me.pptx"
    );

    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetModal").waitFor({ state: "visible" });
    await page.mouse.click(4, 4);
    await page.locator("#slideResetModal").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#adBodyContent").inputValue(), "초기화 전 초안");

    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    await page.locator("#slideResetModal").waitFor({ state: "hidden" });
    await expectToast(page, "슬라이드를 초기화했습니다");

    assert.equal(await page.locator("#slideName").inputValue(), "둘째 슬라이드");
    assert.equal(await page.locator("#slideType").inputValue(), "ad");
    assert.equal(await page.locator("#adBodyContent").inputValue(), "");
    assert.equal(
      await page.locator("#userPptxFile").evaluate((input) => input.files.length),
      0,
      "reset clears transient files"
    );
    assert.equal(
      await page.locator(".slide-card.active").getAttribute("data-slide-id"),
      "main-2"
    );
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "editorSaveBtn",
      "focus moves to the enabled action after reset"
    );
    assert.equal(await page.locator("#editorCancelBtn").isEnabled(), true);
    assert.equal(await page.locator("#editorResetBtn").isDisabled(), true);
    assert.equal(state.slides[1].content, "광고 본문", "stored data stays untouched");
    assert.equal(state.counts.slidePost, 0);

    await page.locator("#editorCancelBtn").click();
    assert.equal(await page.locator("#adBodyContent").inputValue(), "광고 본문");
    assert.equal(await page.locator("#adTitle").inputValue(), "광고");
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
    assert.equal(await page.locator("#editorCancelBtn").isDisabled(), true);
  }
);

await runScenario(
  "saved default reset stays clean and focuses an enabled field",
  async (page) => {
    const state = await setup(page);
    await selectMainSlide(page, 0);
    await page.locator("#addSlideBtn").click();
    await page.locator("#editorSaveBtn").click();
    await expectToast(page, "슬라이드가 저장되었습니다");
    assert.equal(state.counts.slidePost, 1);

    await page.locator("#slideFontSize").selectOption("48");
    await page.locator("#editorResetBtn:not([disabled])").waitFor();
    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    await page.locator("#slideResetModal").waitFor({ state: "hidden" });

    assert.equal(await page.locator("#slideFontSize").inputValue(), "40");
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
    assert.equal(await page.locator("#editorCancelBtn").isDisabled(), true);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "slideName",
      "a clean reset must focus an enabled editor field"
    );
    await expectToast(page, "저장된 초기 상태로 돌아왔습니다");
    assert.equal(
      await page
        .locator("#appToastRegion .app-toast", { hasText: "저장하기 전에는" })
        .count(),
      0,
      "clean reset feedback must not claim there are changes to save or cancel"
    );
  }
);

await runScenario(
  "async custom reset exposes a polite busy status and keeps focus",
  async (page) => {
    await setup(page, {
      slides: loadingCustomCanvasSlides,
      customResetGate: true,
    });
    await selectMainSlide(page, 0);
    const editorStatus = page
      .locator("#customSlideEditor [data-custom-editor='status']")
      .first();
    await editorStatus.filter({ hasText: "슬라이드를 불러왔습니다" }).waitFor();

    await page
      .locator("#customSlideEditor [data-custom-editor='background']")
      .first()
      .fill("#000000");
    const undoButton = page.locator(
      "#customSlideEditor [data-editor-action='undo']"
    ).first();
    await undoButton.waitFor({ state: "visible" });
    await page.locator(
      "#customSlideEditor [data-editor-action='undo']:not([disabled])"
    ).first().waitFor();
    await undoButton.click();
    await page.waitForFunction(() => globalThis.__customResetImageBlocked);

    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    await page.locator("#slideResetModal[aria-busy='true']").waitFor();
    const resetStatus = page.locator("#slideResetStatus");
    assert.equal(await resetStatus.isVisible(), true);
    assert.equal(await resetStatus.textContent(), "초기화하는 중입니다…");
    assert.equal(await resetStatus.getAttribute("role"), "status");
    assert.equal(await resetStatus.getAttribute("aria-live"), "polite");
    assert.equal(await page.locator("#slideResetBackBtn").isDisabled(), true);
    assert.equal(await page.locator("#slideResetConfirmBtn").isDisabled(), true);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "slideResetCard"
    );
    assert.equal(
      await page.locator("#slideResetCard").getAttribute("tabindex"),
      "-1"
    );

    await page.evaluate(() => globalThis.__releaseCustomResetImage());
    await page.locator("#slideResetModal").waitFor({ state: "hidden" });
    assert.equal(await resetStatus.isHidden(), true);
    assert.equal(await resetStatus.textContent(), "");
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  }
);

await runScenario(
  "reset draft media stays cleared across type changes",
  async (page) => {
    const scriptureWithImage = slide(
      "scripture-image",
      "이미지 말씀",
      "scripture",
      {
        customImageData: "data:image/png;base64,saved",
        customImageSize: 5,
      }
    );
    await setup(page, { slides: [scriptureWithImage] });
    await selectMainSlide(page, 0);
    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    assert.equal(await page.locator("#scriptureTestament").inputValue(), "");
    assert.equal(await page.locator("#scriptureBook").inputValue(), "");
    await page.locator("#slideType").selectOption("simple");
    await page.locator("#slideType").selectOption("scripture");
    assert.equal(await page.locator("#scriptureTestament").inputValue(), "");
    assert.equal(await page.locator("#scriptureBook").inputValue(), "");
    assert.equal(
      await page.locator("#scripturePptxImageStatus").textContent(),
      "선택한 이미지 없음"
    );
  }
);

await runScenario(
  "blank custom reset canvas does not reappear after type changes",
  async (page) => {
    await setup(page, { slides: customCanvasSlides });
    await selectMainSlide(page, 0);
    const status = page.locator(
      "#customSlideEditor [data-custom-editor='status']"
    ).first();
    await status.filter({ hasText: "슬라이드를 불러왔습니다" }).waitFor();
    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    await page.locator("#slideType").selectOption("simple");
    await page.locator("#slideType").selectOption("custom");
    await page.locator("#editorResetBtn[disabled]").waitFor();
    assert.equal(
      await page.locator("#editorResetBtn").isDisabled(),
      true,
      "type changes must reload the blank reset draft, not the stored canvas"
    );
  }
);

await runScenario(
  "closing reset returns focus to an enabled fallback",
  async (page) => {
    await setup(page);
    await selectMainSlide(page, 0);
    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetModal").waitFor({ state: "visible" });
    await page.evaluate(() => {
      const content = document.querySelector("#slideContent");
      content.value = "";
      content.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#editorResetBtn[disabled]").waitFor();

    await page.keyboard.press("Escape");
    await page.locator("#slideResetModal").waitFor({ state: "hidden" });

    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "slideName"
    );
  }
);

await runScenario("hymn reset applies its distinct defaults", async (page) => {
  await setup(page, { slides: [allTypeSlides[4]] });
  await selectMainSlide(page, 0);
  await page.locator("#editorResetBtn").click();
  await page.locator("#slideResetConfirmBtn").click();

  assert.equal(await page.locator("#slideType").inputValue(), "hymn");
  assert.equal(await page.locator("#slideName").inputValue(), "찬송");
  assert.equal(await page.locator("#hymnNumber").inputValue(), "");
  assert.equal(await page.locator("#hymnKorTitle").inputValue(), "");
  assert.equal(await page.locator("#hymnEngTitle").inputValue(), "");
  assert.equal(await page.locator("#hymnIncludeTitle").isChecked(), false);
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  assert.equal(await page.locator("#editorResetBtn").isDisabled(), true);
});

await runScenario("reset works inside a template workspace", async (page) => {
  const template = templateFixture();
  template.slides[0].content = "저장된 템플릿 본문";
  const state = await setup(page, { templates: [template] });
  await openTemplate(page);
  await page.locator("#slideContent").fill("초기화할 템플릿 초안");
  await page.locator("#editorResetBtn").click();
  await page.locator("#slideResetConfirmBtn").click();

  assert.equal(await page.locator("#slideContent").inputValue(), "");
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  assert.equal(state.templates[0].slides[0].content, "저장된 템플릿 본문");
  assert.equal(await page.locator("#templateWorkspaceBar").isVisible(), true);
});

await runScenario("reset keeps a new unsaved slide selected", async (page) => {
  const state = await setup(page);
  await selectMainSlide(page, 0);
  await page.locator("#addSlideBtn").click();
  const newSlideId = await page
    .locator(".slide-card.active")
    .getAttribute("data-slide-id");
  await page.locator("#slideContent").fill("신규 초안");
  await page.locator("#editorResetBtn").click();
  await page.locator("#slideResetConfirmBtn").click();

  assert.equal(await page.locator("#slideContent").inputValue(), "");
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  assert.equal(await page.locator("#editorCancelBtn").isEnabled(), true);
  assert.equal(
    await page.locator(".slide-card.active").getAttribute("data-slide-id"),
    newSlideId
  );
  assert.equal(state.counts.slidePost, 0);
});

await runScenario(
  "custom reset makes a blank draft and cancel restores the saved canvas",
  async (page) => {
    const state = await setup(page, { slides: customCanvasSlides });
    await selectMainSlide(page, 0);
    const status = page.locator(
      "#customSlideEditor [data-custom-editor='status']"
    ).first();
    await status.filter({ hasText: "슬라이드를 불러왔습니다" }).waitFor();

    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    await status.filter({ hasText: "편집 내용을 초기화했습니다" }).waitFor();

    assert.equal(await page.locator("#slideName").inputValue(), "커스텀 캔버스");
    assert.equal(await page.locator("#slideType").inputValue(), "custom");
    assert.equal(
      await page.locator(".slide-card.active").getAttribute("data-slide-id"),
      "custom-canvas"
    );
    assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
    assert.equal(await page.locator("#editorResetBtn").isDisabled(), true);
    assert.equal(state.slides[0].customSlide.elements.length, 1);
    assert.equal(state.slides[0].customSlide.background.color, "#1e293b");

    await page.locator("#editorCancelBtn").click();
    await status.filter({ hasText: "슬라이드를 불러왔습니다" }).waitFor();
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
    assert.equal(state.slides[0].customSlide.elements.length, 1);

    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    await status.filter({ hasText: "편집 내용을 초기화했습니다" }).waitFor();
    await page.locator("#editorSaveBtn").click();
    await page.locator("#editorSaveBtn[disabled]").waitFor();

    assert.equal(state.counts.slidePost, 1);
    assert.deepEqual(state.slides[0].customSlide.elements, []);
    assert.equal(state.slides[0].customSlide.background.color, "#ffffff");
  }
);

await runScenario(
  "custom reset reports loading and leaves the slide intact",
  async (page) => {
    const imageGate = createGate();
    const state = await setup(page, {
      slides: loadingCustomCanvasSlides,
      customImageGate: imageGate,
    });
    const imageRequest = page.waitForRequest(
      (request) => request.url().endsWith("/uploads/slow-reset.png")
    );

    await selectMainSlide(page, 0);
    await imageRequest;
    await page.locator("#editorResetBtn").click();
    await page.locator("#slideResetConfirmBtn").click();
    await expectToast(page, "커스텀 슬라이드를 불러오는 중입니다");

    assert.equal(state.counts.slidePost, 0);
    assert.equal(state.slides[0].customSlide.elements.length, 1);
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
    assert.equal(
      await page.locator(".slide-card.active").getAttribute("data-slide-id"),
      "custom-loading"
    );

    imageGate.release();
    await page
      .locator("#customSlideEditor [data-custom-editor='status']")
      .first()
      .filter({ hasText: "슬라이드를 불러왔습니다" })
      .waitFor();
    assert.equal(state.slides[0].customSlide.elements.length, 1);
    assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  }
);

await browser.close();
if (server) {
  server.kill();
}

await fs.writeFile(
  path.join(artifactDir, "ledger.json"),
  JSON.stringify(ledger, null, 2)
);

const failures = ledger.filter((entry) => entry.status === "FAIL");
console.log(`artifacts: ${artifactDir}`);
console.log(`RESULT ${ledger.length - failures.length}/${ledger.length} scenarios passed`);
if (failures.length > 0) {
  process.exitCode = 1;
}
