// Measures click-to-caret accuracy in the custom slide editor.
// Nothing is saved: it works on a new, unsaved draft slide.
import { chromium, firefox, webkit } from "playwright";

const baseURL = process.env.BASE_URL || "http://localhost:3000";
const SAMPLE = "가나다라마바사아자차";

const engines = { chromium, firefox, webkit };
const engineName = process.env.ENGINE || "chromium";
const engine = engines[engineName];
if (!engine) {
  throw new Error(`unknown ENGINE: ${engineName}`);
}
console.log("engine", engineName);
const browser = await engine.launch();
const deviceScaleFactor = Number(process.env.DSF || 1);
const page = await browser.newPage({
  viewport: { width: 1600, height: 1100 },
  deviceScaleFactor,
});
console.log("deviceScaleFactor", deviceScaleFactor);
page.on("pageerror", (error) => console.log("[pageerror]", error.message));

await page.route("**/custom-slide-editor.js*", async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  const anchor = "const view = root.ownerDocument?.defaultView ?? globalThis;";
  await route.fulfill({
    response,
    body: body.replace(anchor, `globalThis.__fabricCanvas = canvas; ${anchor}`),
  });
});

await page.goto(baseURL, { waitUntil: "networkidle" });
await page.locator("#navPpt").click();
await page.locator("#tabSlidesBtn").click();
await page.locator("#addSlideBtn").click();
await page.locator("#slideType").selectOption("custom");
await page.waitForFunction(() => Boolean(globalThis.__fabricCanvas), { timeout: 20000 });
await page.locator("#customSlideEditor [data-editor-action='add-text']").first().click();
await page.waitForFunction(
  () => globalThis.__fabricCanvas.getObjects().some((o) => o.elementType === "text"),
  { timeout: 10000 }
);

await page.evaluate((sample) => {
  const canvas = globalThis.__fabricCanvas;
  const box = canvas.getObjects().find((o) => o.elementType === "text");
  box.set({ text: sample, textAlign: "left" });
  box.initDimensions();
  box.setCoords();
  canvas.setActiveObject(box);
  box.enterEditing();
  canvas.requestRenderAll();
}, SAMPLE);

async function measure(label) {
  const layout = await page.evaluate(() => {
    const canvas = globalThis.__fabricCanvas;
    const box = canvas.getActiveObject();
    const rect = canvas.lowerCanvasEl.getBoundingClientRect();
    const stage = document.querySelector("#customSlideEditor .custom-editor-stage");
    const prefixes = [];
    for (let i = 0; i <= box.text.length; i += 1) {
      prefixes.push(box._getCursorBoundariesOffsets(i, true).left);
    }
    return {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      // Scene width, not the backing store: on retina the backing store is
      // scene * devicePixelRatio and would halve every computed click point.
      sceneWidth: canvas.getWidth(),
      backing: canvas.lowerCanvasEl.width,
      scroll: { left: stage.scrollLeft, top: stage.scrollTop },
      textLeft: box.left - box.width / 2,
      textTop: box.top,
      prefixes,
    };
  });

  const scale = layout.rect.width / layout.sceneWidth;
  const rows = [];
  for (let i = 0; i < SAMPLE.length; i += 1) {
    // 30% into glyph i: the nearest caret boundary is unambiguously i.
    const sceneX = layout.textLeft + layout.prefixes[i] + (layout.prefixes[i + 1] - layout.prefixes[i]) * 0.3;
    const screenX = layout.rect.left + sceneX * scale;
    const screenY = layout.rect.top + layout.textTop * scale;
    await page.mouse.click(screenX, screenY);
    const got = await page.evaluate(() => {
      const canvas = globalThis.__fabricCanvas;
      let box = canvas.getActiveObject();
      if (!box) {
        box = canvas.getObjects().find((o) => o.elementType === "text");
        canvas.setActiveObject(box);
        return { selectionStart: null, lostSelection: true };
      }
      return { selectionStart: box.selectionStart, lostSelection: false };
    });
    rows.push({
      expected: i,
      got: got.selectionStart,
      lostSelection: got.lostSelection,
      driftChars: got.selectionStart === null ? null : got.selectionStart - i,
    });
    if (got.lostSelection) {
      await page.evaluate(() => {
        const canvas = globalThis.__fabricCanvas;
        const box = canvas.getObjects().find((o) => o.elementType === "text");
        canvas.setActiveObject(box);
        box.enterEditing();
        canvas.requestRenderAll();
      });
    }
  }

  const wrong = rows.filter((r) => r.driftChars !== 0);
  console.log(`\n== ${label} ==`);
  console.log(`canvasRect=${layout.rect.width.toFixed(0)}x${layout.rect.height.toFixed(0)} scene=${layout.sceneWidth} backing=${layout.backing} scale=${scale.toFixed(3)} stageScroll=${layout.scroll.left},${layout.scroll.top}`);
  console.log(`clicks=${rows.length} wrong=${wrong.length}`);
  for (const row of rows) {
    const outcome = row.lostSelection
      ? "SELECTION LOST"
      : `caret index ${row.got} (drift ${row.driftChars})`;
    console.log(`  click over char ${row.expected} -> ${outcome}`);
  }
}

await measure("zoom fit (stage not scrolled)");

// Zoom in until the stage has to scroll, then scroll it.
await page.locator("#customSlideEditor [data-editor-action='zoom-in']").first().click();
await page.locator("#customSlideEditor [data-editor-action='zoom-in']").first().click();
await page.waitForTimeout(200);
await page.evaluate(() => {
  const stage = document.querySelector("#customSlideEditor .custom-editor-stage");
  stage.scrollLeft = 120;
  stage.scrollTop = 60;
});
await page.waitForTimeout(200);
await page.evaluate(() => {
  const canvas = globalThis.__fabricCanvas;
  const box = canvas.getObjects().find((o) => o.elementType === "text");
  canvas.setActiveObject(box);
  box.enterEditing();
  canvas.requestRenderAll();
});

await measure("zoomed in + stage scrolled 120,60");

await browser.close();
