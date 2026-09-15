// Checks whether the preview clips any rendered slide content, and reports
// elements whose ink extends past their own box or past the slide bounds.
// Usage: node scripts/pptx-clip-check.mjs <baseUrl> <pptxPath>
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://localhost:3311';
const pptxPath = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

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
await page.locator('#slidePreview [data-slide-index]').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(2500);

// Mount every slide so each one can be inspected.
const count = await page.evaluate(async () => {
  const wrappers = [...document.querySelectorAll('#slidePreview [data-slide-index]')];
  for (const wrapper of wrappers) {
    wrapper.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 250));
  }
  return wrappers.length;
});
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const wrappers = [...document.querySelectorAll('#slidePreview [data-slide-index]')];
  const clippedWrappers = [];
  const clippingAncestors = new Set();
  let inspected = 0;

  for (const wrapper of wrappers) {
    // Does the slide wrapper itself hide overflowing content?
    if (wrapper.scrollWidth > wrapper.clientWidth + 1 || wrapper.scrollHeight > wrapper.clientHeight + 1) {
      clippedWrappers.push({
        index: wrapper.dataset.slideIndex,
        clientW: wrapper.clientWidth,
        scrollW: wrapper.scrollWidth,
        clientH: wrapper.clientHeight,
        scrollH: wrapper.scrollHeight,
      });
    }

    // Any element inside whose own box hides overflowing ink.
    for (const el of wrapper.querySelectorAll('*')) {
      inspected += 1;
      const style = getComputedStyle(el);
      const hides = /hidden|clip/.test(style.overflow);
      if (!hides) continue;
      const overflowsSelf =
        el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      if (overflowsSelf) {
        clippingAncestors.add(
          `${el.tagName.toLowerCase()} overflow=${style.overflow} ` +
          `client=${el.clientWidth}x${el.clientHeight} scroll=${el.scrollWidth}x${el.scrollHeight} ` +
          `text="${(el.textContent || '').trim().slice(0, 30)}"`
        );
      }
    }
  }

  return {
    slides: wrappers.length,
    elementsInspected: inspected,
    slideWrappersClipping: clippedWrappers,
    innerElementsClipping: [...clippingAncestors].slice(0, 20),
  };
});

console.log('mounted slides:', count);
console.log(JSON.stringify(report, null, 2));
await browser.close();
