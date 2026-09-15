// Drives the real editor: 단순 슬라이드 → PPTX 업로드 → 미리보기.
// Usage: node scripts/upload-preview-check.mjs <baseUrl> <pptxPath>
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseURL = process.argv[2] || 'http://localhost:3311';
const pptxPath = process.argv[3];
const outDir = 'tmp-pptx-compare';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });

const failures = [];
page.on('pageerror', (err) => failures.push('pageerror: ' + err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') failures.push('console: ' + msg.text().slice(0, 300));
});
page.on('requestfailed', (req) => failures.push('requestfailed: ' + req.url().slice(0, 160)));
page.on('response', (resp) => {
  if (resp.status() >= 400) failures.push(`http ${resp.status()}: ${resp.url().slice(0, 160)}`);
});

await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
await page.locator('#navPpt').click();
await page.locator('body[data-ppt-ready]').waitFor();

await page.locator('#tabTemplatesBtn').click();
await page.locator('.template-card-open').first().click();
await page.locator('#templateWorkspaceBar').waitFor({ state: 'visible' });

await page.locator('#slideListContainer .slide-card').first().click();
await page.locator('#slideEditor').waitFor({ state: 'visible' });

await page.locator('#slideType').selectOption('simple');
await page.locator('input[name="sourceType"][value="upload"]').check();
await page.locator('#userPptxFile').setInputFiles(pptxPath);

// The viewer mounts asynchronously; wait for a real slide wrapper to appear.
await page.locator('#slidePreview [data-slide-index]').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(2500);

const cdp = await page.context().newCDPSession(page);
await Promise.all([cdp.send('DOM.enable'), cdp.send('CSS.enable')]);
const { root } = await cdp.send('DOM.getDocument');
const { nodeId: textNodeId } = await cdp.send('DOM.querySelector', {
  nodeId: root.nodeId,
  selector: '#slidePreview [data-slide-index] span',
});
const platformFonts = textNodeId
  ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId: textNodeId })).fonts
  : [];

const report = await page.evaluate(() => {
  const box = document.getElementById('slidePreview');
  const deck = box.querySelector('.pptx-deck');
  const wrappers = [...box.querySelectorAll('[data-slide-index]')];
  return {
    scrollMode: box.classList.contains('preview-scroll-mode'),
    deckPresent: Boolean(deck),
    mountedSlides: wrappers.length,
    firstWrapper: wrappers[0]
      ? { w: Math.round(wrappers[0].getBoundingClientRect().width), h: Math.round(wrappers[0].getBoundingClientRect().height) }
      : null,
    deckWidth: deck ? Math.round(deck.getBoundingClientRect().width) : null,
    overflowsContainer: deck ? deck.scrollWidth > box.clientWidth + 2 : null,
    zoomControls: Boolean(box.querySelector('.zoom-controls')),
    zoomLabel: box.querySelector('.zoom-display')?.textContent ?? null,
    textSample: wrappers[0]?.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) ?? null,
    requestedFonts: [...new Set(
      [...box.querySelectorAll('[data-slide-index] *')]
        .map((node) => getComputedStyle(node).fontFamily)
        .filter(Boolean)
    )],
    malgunLoaded: document.fonts.check('16px "Malgun Gothic"', '주님께서 말씀하셨다'),
  };
});
console.log('preview state:', report);
console.log('platform fonts:', platformFonts);

await page.locator('#slidePreview').screenshot({ path: `${outDir}/app-upload-preview.png` });
if (report.mountedSlides > 1) {
  await page.locator('#slidePreview [data-slide-index]').nth(1).screenshot({
    path: `${outDir}/app-upload-preview-slide-2.png`,
  });
}

// Zoom controls should drive the viewer, not a local transform.
// Button order is [-, +, reset]; the label span is not a .zoom-btn.
await page.locator('.zoom-controls .zoom-btn').nth(1).click();
await page.locator('.zoom-controls .zoom-btn').nth(1).click();
await page.waitForTimeout(800);
const zoomed = await page.evaluate(() => ({
  label: document.querySelector('#slidePreview .zoom-display')?.textContent,
  width: Math.round(document.querySelector('#slidePreview [data-slide-index]')?.getBoundingClientRect().width ?? 0),
}));
console.log('after +20%:', zoomed);
await page.locator('#slidePreview').screenshot({ path: `${outDir}/app-upload-preview-zoomed.png` });

// Switching away must tear the viewer down without leaking errors.
await page.locator('input[name="sourceType"][value="basic"]').check();
await page.waitForTimeout(1000);
const afterSwitch = await page.evaluate(() => ({
  deckPresent: Boolean(document.querySelector('#slidePreview .pptx-deck')),
  viewerState: window.__previewStateProbe ?? null,
}));
console.log('after switching to basic:', afterSwitch);

console.log(failures.length ? 'PROBLEMS:\n' + failures.join('\n') : 'no page errors');
await browser.close();
