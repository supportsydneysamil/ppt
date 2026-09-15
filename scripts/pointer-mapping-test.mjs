// Quantifies the screen-pixel -> canvas-coordinate error in the custom slide
// editor at different devicePixelRatios. Nothing is saved.
import { chromium } from "playwright";

const baseURL = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();

async function run(deviceScaleFactor) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor,
  });
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

  const info = await page.evaluate(() => {
    const canvas = globalThis.__fabricCanvas;
    const el = canvas.lowerCanvasEl;
    const upper = canvas.upperCanvasEl;
    const rect = el.getBoundingClientRect();
    globalThis.__hits = [];
    canvas.on("mouse:down", (options) => {
      const scene = canvas.getScenePoint(options.e);
      globalThis.__hits.push({ x: scene.x, y: scene.y });
    });
    return {
      dpr: globalThis.devicePixelRatio,
      retinaScaling: canvas.getRetinaScaling(),
      lower: { backing: el.width, cssRect: rect.width },
      upper: { backing: upper.width, cssWidth: upper.style.width, clientWidth: upper.clientWidth },
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
  });

  // Click a grid of known scene coordinates and see where Fabric thinks they are.
  const scale = info.rect.width / 1280;
  const targets = [
    { x: 100, y: 100 },
    { x: 640, y: 360 },
    { x: 1180, y: 620 },
  ];
  for (const target of targets) {
    await page.mouse.click(
      info.rect.left + target.x * scale,
      info.rect.top + target.y * scale
    );
  }
  const hits = await page.evaluate(() => globalThis.__hits);

  console.log(`\n== deviceScaleFactor ${deviceScaleFactor} ==`);
  console.log(`devicePixelRatio=${info.dpr} fabricRetinaScaling=${info.retinaScaling}`);
  console.log(`lower canvas backing=${info.lower.backing}px cssRect=${info.rect.width}px`);
  console.log(`upper canvas backing=${info.upper.backing}px style.width=${info.upper.cssWidth} clientWidth=${info.upper.clientWidth}`);
  targets.forEach((target, index) => {
    const hit = hits[index];
    if (!hit) {
      console.log(`  scene target (${target.x},${target.y}) -> NO EVENT`);
      return;
    }
    console.log(
      `  scene target (${target.x},${target.y}) -> fabric saw (${hit.x.toFixed(1)},${hit.y.toFixed(1)}) error (${(hit.x - target.x).toFixed(1)},${(hit.y - target.y).toFixed(1)})`
    );
  });

  await page.close();
}

await run(1);
await run(2);
await browser.close();
