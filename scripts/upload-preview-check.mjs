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
// Font detection and substitute loading sit on the path to first paint, so
// time the whole window from file pick to a mounted slide.
const startedAt = Date.now();
await page.locator('#userPptxFile').setInputFiles(pptxPath);

// The viewer mounts asynchronously; wait for a real slide wrapper to appear.
await page.locator('#slidePreview [data-slide-index]').first().waitFor({ timeout: 60000 });
console.log(`time to first mounted slide: ${Date.now() - startedAt}ms`);
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

const fontPlan = await page.evaluate(() => {
  const plan = window.__pptxFontPlan;
  if (!plan) return null;
  return {
    usedLocally: plan.available.map((e) => `${e.family} -> ${e.resolvedAs}`),
    substituted: plan.missing.map((e) => e.family),
  };
});
console.log('font plan:', fontPlan);

// Only the substituted families may pull a stylesheet over the wire.
const loadedSheets = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => n.includes('pptx-fonts/') && n.endsWith('.css'))
    .map((n) => n.split('/').pop())
);
console.log('loaded stylesheets:', loadedSheets);

// The point of detection is that an installed font is used untouched. Assert it
// rather than eyeball it: no stylesheet may load for an available family, and
// the browser must resolve that family to a local face, not a webfont.
if (fontPlan) {
  const { FONT_SUBSTITUTES } = await import('../public/pptx-fonts/manifest.js');
  const idOf = new Map(FONT_SUBSTITUTES.map((e) => [e.family, e.id]));
  const availableFamilies = fontPlan.usedLocally.map((line) => line.split(' -> ')[0]);

  for (const family of availableFamilies) {
    const sheet = `${idOf.get(family)}.css`;
    if (loadedSheets.includes(sheet)) {
      failures.push(`substitute loaded for an installed font: ${family} (${sheet})`);
    }
  }

  const cdp2 = await page.context().newCDPSession(page);
  await Promise.all([cdp2.send('DOM.enable'), cdp2.send('CSS.enable')]);
  const doc = await cdp2.send('DOM.getDocument');
  await page.evaluate((families) => {
    const host = document.createElement('div');
    host.id = 'localFontAssert';
    host.style.cssText = 'position:fixed;left:-9999px;top:0';
    for (const family of families) {
      const el = document.createElement('div');
      el.className = 'local-font-assert';
      el.style.cssText = `font-family:'${family}';font-size:48px`;
      el.textContent = 'Ag1';
      host.appendChild(el);
    }
    document.body.appendChild(host);
  }, availableFamilies);
  await page.waitForTimeout(300);

  for (let i = 0; i < availableFamilies.length; i += 1) {
    const { nodeId } = await cdp2.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: `.local-font-assert:nth-of-type(${i + 1})`,
    });
    const { fonts } = await cdp2.send('CSS.getPlatformFontsForNode', { nodeId });
    const webfont = fonts.find((f) => f.isCustomFont);
    console.log(
      `  ${availableFamilies[i]} -> ${fonts.map((f) => f.familyName).join(', ')}`
      + ` ${webfont ? '(WEBFONT!)' : '(local)'}`
    );
    if (webfont) {
      failures.push(`installed font rendered via webfont: ${availableFamilies[i]}`);
    }
  }
  await page.evaluate(() => document.getElementById('localFontAssert')?.remove());
}

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
