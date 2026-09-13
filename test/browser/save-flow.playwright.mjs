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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
    await dialog.accept();
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
      templatePut: 0,
      templateDelete: 0,
      uploadPost: 0,
      scriptureGenerate: 0,
    },
  };

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
    if (/^\/api\/templates\/[^/]+$/.test(url.pathname) && method === "PUT") {
      state.counts.templatePut += 1;
      const payload = request.postDataJSON();
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const nextTemplate = {
        ...(state.templates.find((entry) => entry.id === id) || {}),
        id,
        name: payload.name,
        slideCount: payload.slides.length,
        slides: clone(payload.slides),
      };
      const response = options.onTemplatePut
        ? await options.onTemplatePut({
            count: state.counts.templatePut,
            payload,
            nextTemplate,
            state,
          })
        : { status: 200, json: { success: true, template: nextTemplate } };
      if (response.status < 400) {
        state.templates = state.templates.map((entry) =>
          entry.id === id ? clone(nextTemplate) : entry
        );
      }
      return route.fulfill(response);
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

await runScenario("template two-stage save buttons, hint and toasts", async (page) => {
  const state = await setup(page);
  await openTemplate(page);
  await fillName(page, "템플릿 수정 1");
  assert.equal(await page.locator("#editorSaveBtn").isEnabled(), true);
  assert.equal(await page.locator("#templateSaveBtn").isDisabled(), true);
  // The two-stage rule is the one disabled reason a user cannot guess.
  await page.locator("#templateSaveHint").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#templateSaveHint").textContent(),
    /슬라이드 변경사항을 먼저 저장/
  );
  assert.equal(
    await page.locator("#templateSaveBtn").getAttribute("aria-describedby"),
    "templateSaveHint"
  );
  assert.equal(
    await page.locator("#templateSaveHint").getAttribute("aria-live"),
    "polite",
    "the hint has to be announced when it appears"
  );

  await page.locator("#editorSaveBtn").click();
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  assert.equal(await page.locator("#templateSaveBtn").isEnabled(), true);
  assert.equal(await page.locator("#templateSaveHint").isHidden(), true);
  await expectToastOnce(
    page,
    "슬라이드 변경사항이 반영되었습니다 · 템플릿 저장 필요"
  );
  assert.equal(state.counts.slidePost, 0);

  await page.locator("#templateSaveBtn").click();
  assert.equal(await page.locator("#editorSaveBtn").isDisabled(), true);
  assert.equal(await page.locator("#templateSaveBtn").isDisabled(), true);
  await expectToastOnce(page, "템플릿이 저장되었습니다");
  assert.equal(state.counts.templatePut, 1);
});

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

await runScenario("both dirty scopes show one popup", async (page) => {
  await setup(page);
  await openTemplate(page);
  await fillName(page, "stage one");
  await page.locator("#editorSaveBtn").click();
  await fillName(page, "both dirty");
  await installDialogCounter(page);
  await page.locator("#templateBackBtn").click();
  await assertDialogOpenCount(page, 1);
  assert.match(
    await page.locator("#unsavedChangesMessage").textContent(),
    /슬라이드 편집과 템플릿 변경사항/
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

await runScenario("discard restores template server copy", async (page) => {
  const original = templateFixture();
  await setup(page, {
    templates: [original],
    onTemplatesGet: () => [clone(original)],
  });
  await openTemplate(page);
  await fillName(page, "로컬 템플릿 수정");
  await page.locator("#editorSaveBtn").click();
  assert.equal(await page.locator("#templateSaveBtn").isEnabled(), true);
  await page.locator("#templateBackBtn").click();
  await page.locator("#unsavedDiscardBtn").click();
  await page.locator(".template-card-open").waitFor({ state: "visible" });
  await page.locator(".template-card-open").click();
  await selectMainSlide(page, 0);
  assert.equal(
    await page.locator("#slideName").inputValue(),
    "템플릿 첫 슬라이드"
  );
  assert.equal(await page.locator("#templateSaveBtn").isDisabled(), true);
});

await runScenario(
  "discard of a deleted template returns to the gallery",
  async (page, diagnostics) => {
    // The template exists when the gallery loads and is gone by the time the
    // discard refetches it.
    let templateGets = 0;
    await setup(page, {
      onTemplatesGet: ({ state }) => {
        templateGets += 1;
        return templateGets === 1 ? state.templates : [];
      },
    });
    await openTemplate(page);
    await fillName(page, "삭제된 템플릿 수정");
    await page.locator("#editorSaveBtn").click();
    await page.locator("#templateBackBtn").click();
    await page.locator("#unsavedDiscardBtn").click();
    await waitForAlert(diagnostics, "템플릿이 서버에서 삭제되어");
    await page.locator("#templateGallery").waitFor({ state: "visible" });
    assert.equal(await page.locator("#templateWorkspaceBar").isHidden(), true);
  }
);

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

await runScenario("save then move template persists both scopes once", async (page) => {
  const state = await setup(page);
  await openTemplate(page);
  await fillName(page, "첫 단계");
  await page.locator("#editorSaveBtn").click();
  await fillName(page, "가드 두 번째 단계");
  await page.locator("#templateBackBtn").click();
  await page.locator("#unsavedSaveBtn").click();
  await page.locator("#unsavedChangesModal").waitFor({ state: "hidden" });
  await page.locator(".template-card-open").waitFor({ state: "visible" });
  assert.equal(state.counts.slidePost, 0);
  assert.equal(state.counts.templatePut, 1);
  assert.equal(
    state.templates[0].slides[0].name,
    "가드 두 번째 단계",
    "template PUT body must include the slide scope committed by the guard"
  );
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
  "PUT template failure preserves draft and retry",
  async (page, diagnostics) => {
    const state = await setup(page, {
      onTemplatePut: ({ count, nextTemplate }) =>
        count === 1
          ? { status: 500, json: { error: "injected template failure" } }
          : { status: 200, json: { success: true, template: nextTemplate } },
    });
    await openTemplate(page);
    await fillName(page, "PUT 실패 초안");
    await page.locator("#editorSaveBtn").click();
    await page.locator("#templateBackBtn").click();
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "visible" });
    await waitForAlert(diagnostics, "injected template failure");
    assert.equal(await page.locator("#slideName").inputValue(), "PUT 실패 초안");
    assert.equal(await page.locator("#templateSaveBtn").isEnabled(), true);
    assert.equal(
      await page.locator("#templateSaveBtn").textContent(),
      "템플릿 저장",
      "the progress label must be restored after a failure"
    );
    assert.equal(
      await page.locator(".slide-card.active .slide-save-badge").textContent(),
      "저장됨"
    );
    await page.locator("#unsavedSaveBtn").click();
    await page.locator("#unsavedChangesModal").waitFor({ state: "hidden" });
    assert.equal(state.counts.templatePut, 2);
    await page.locator(".template-card-open").waitFor({ state: "visible" });
  },
  { expectedConsole: [/500/, "Failed to save template"] }
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
      buffer: Buffer.from("fixture"),
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
  "a running template save blocks rename and delete",
  async (page, diagnostics) => {
    const gate = createGate();
    const state = await setup(page, {
      onTemplatePut: async ({ nextTemplate }) => {
        await gate.promise;
        return { status: 200, json: { success: true, template: nextTemplate } };
      },
    });

    await openTemplate(page);
    await fillName(page, "템플릿 저장 중 초안");
    await page.locator("#editorSaveBtn").click();
    await page.locator("#templateSaveBtn:not([disabled])").waitFor();
    await page.locator("#templateSaveBtn").click();
    await page.locator("#templateSaveBtn[disabled]").waitFor();

    // A rename accepted here would be overwritten by the in-flight PUT, and a
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
    assert.equal(state.counts.templatePut, 1, "no extra PUT during a save");

    gate.release();
    await expectToastOnce(page, "템플릿이 저장되었습니다");
    assert.equal(state.counts.templatePut, 1);
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
