// Exercises the browser's composition-event path used by Korean input methods.
// The slide remains an unsaved browser draft and never reaches the server.
import { chromium } from "playwright";

const baseURL = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1600 },
  deviceScaleFactor: Number(process.env.DSF || 2),
});

await page.route("**/custom-slide-editor.js*", async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  const anchor = "const view = root.ownerDocument?.defaultView ?? globalThis;";
  if (!body.includes(anchor)) {
    throw new Error("custom editor instrumentation anchor is missing");
  }
  await route.fulfill({
    response,
    body: body.replace(anchor, `globalThis.__fabricCanvas = canvas; ${anchor}`),
  });
});

await page.goto(baseURL, { waitUntil: "networkidle" });
await page.locator("#navPpt").click();
await page.locator("#addSlideBtn").click();
await page.locator("#slideType").selectOption("custom");
await page.waitForFunction(() => Boolean(globalThis.__fabricCanvas));
await page
  .locator("#customSlideEditor [data-editor-action='add-text']")
  .first()
  .click();

await page.evaluate(() => {
  const canvas = globalThis.__fabricCanvas;
  const box = canvas.getObjects().find((object) => object.elementType === "text");
  canvas.setActiveObject(box);
  box.enterEditing();
  box.set({ text: "" });
  box.initDimensions();
  box.selectionStart = 0;
  box.selectionEnd = 0;
  box.hiddenTextarea.value = "";
  box.hiddenTextarea.selectionStart = 0;
  box.hiddenTextarea.selectionEnd = 0;
  box.updateFromTextArea();
  box._updateTextarea();
  box.hiddenTextarea.focus();
  globalThis.__compositionEvents = [];
  for (const type of [
    "compositionstart",
    "compositionupdate",
    "compositionend",
    "input",
  ]) {
    box.hiddenTextarea.addEventListener(type, () => {
      globalThis.__compositionEvents.push({
        type,
        value: box.hiddenTextarea.value,
        selectionStart: box.hiddenTextarea.selectionStart,
        fabricSelection: box.selectionStart,
        composing: box.inCompositionMode,
      });
    });
  }
  canvas.requestRenderAll();
});

const cdp = await page.context().newCDPSession(page);
for (const text of ["ㅎ", "하", "한"]) {
  await cdp.send("Input.imeSetComposition", {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
}
await cdp.send("Input.insertText", { text: "한" });
await page.waitForTimeout(100);

async function assertAligned(label) {
  const result = await page.evaluate(() => {
    const canvas = globalThis.__fabricCanvas;
    const box = canvas.getActiveObject();
    const boundaries = box._getCursorBoundaries(box.selectionStart);
    const rendered = box.getCursorRenderingData(box.selectionStart, boundaries);
    const cursorCenter = rendered.left + rendered.width / 2;
    return {
      text: box.text,
      selectionStart: box.selectionStart,
      inCompositionMode: box.inCompositionMode,
      cursorDelta: Math.abs(
        cursorCenter - (boundaries.left + boundaries.leftOffset)
      ),
      events: globalThis.__compositionEvents,
    };
  });

  if (result.text !== "한") {
    throw new Error(`${label}: expected 한, got ${JSON.stringify(result.text)}`);
  }
  if (result.selectionStart !== 1 || result.inCompositionMode) {
    throw new Error(`${label}: composition did not settle ${JSON.stringify(result)}`);
  }
  if (result.cursorDelta > 1) {
    throw new Error(`${label}: caret drifted ${result.cursorDelta}px`);
  }
  if (!result.events.some(({ type }) => type === "compositionupdate")) {
    throw new Error(`${label}: browser emitted no compositionupdate event`);
  }
  console.log(
    `${label}: text=${result.text} selection=${result.selectionStart} ` +
      `caretDelta=${result.cursorDelta.toFixed(3)} events=${result.events.length}`
  );
}

await assertAligned("normal workspace");
await page.locator("#pptFocusModeBtn").click();
await page.waitForTimeout(150);
await assertAligned("focus mode");

await browser.close();
