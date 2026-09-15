// Measures rendered line boxes of an uploaded deck's slide and prints them in
// slide-relative units, so they can be compared against a PowerPoint PDF export.
// Usage: node scripts/pptx-text-metrics.mjs <baseUrl> <pptxPath> <slideIndex1Based>
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://localhost:3311';
const pptxPath = process.argv[3];
const slideNo = Number(process.argv[4] || 2);

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
await page.waitForTimeout(3000);

// Scroll the target slide into view so the windowed list mounts it.
await page.evaluate((n) => {
  const wrapper = document.querySelectorAll('#slidePreview [data-slide-index]')[n - 1];
  wrapper?.scrollIntoView({ block: 'center' });
}, slideNo);
await page.waitForTimeout(2000);

const result = await page.evaluate((n) => {
  const wrapper = document.querySelectorAll('#slidePreview [data-slide-index]')[n - 1];
  if (!wrapper) return { error: 'slide wrapper missing' };
  const slideBox = wrapper.getBoundingClientRect();

  // Walk to the deepest element that still holds the whole body text, so the
  // computed line-height reported is the one the browser actually lays out with
  // rather than an outer container's.
  let host = wrapper;
  for (;;) {
    const next = [...host.children].find(
      (child) => child.textContent.trim().length >= host.textContent.trim().length - 2
        && child.textContent.trim().length > 15
    );
    if (!next) break;
    host = next;
  }
  if (host === wrapper) return { error: 'no text element found' };

  const style = getComputedStyle(host);
  const chain = [];
  for (let el = host; el && el !== wrapper.parentElement; el = el.parentElement) {
    const s = getComputedStyle(el);
    chain.unshift(`${el.tagName.toLowerCase()} font:${s.fontSize} lh:${s.lineHeight}`);
  }

  // Walk text nodes and split into visual lines using per-character rects.
  const lines = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent;
    for (let i = 0; i < text.length; i += 1) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - rect.top) < 2) {
        last.text += text[i];
        last.right = rect.right;
      } else {
        lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, text: text[i] });
      }
    }
  }

  const toPt = (px) => (px / slideBox.width) * 960;
  const fontSizePt = toPt(parseFloat(style.fontSize));
  const lineHeightPt = parseFloat(style.lineHeight);
  return {
    slidePx: { w: Math.round(slideBox.width), h: Math.round(slideBox.height) },
    ancestorChain: chain,
    fontFamily: style.fontFamily,
    fontSizePx: style.fontSize,
    fontSizePt: +fontSizePt.toFixed(2),
    lineHeightRaw: style.lineHeight,
    lineHeightPt: Number.isNaN(lineHeightPt) ? null : +toPt(lineHeightPt).toFixed(2),
    lineHeightPerFontSize: Number.isNaN(lineHeightPt)
      ? null
      : +(lineHeightPt / parseFloat(style.fontSize)).toFixed(4),
    glyphBoxHeightEm: null,
    lines: lines.map((l) => ({
      text: l.text,
      xMinPt: +toPt(l.left - slideBox.left).toFixed(2),
      xMaxPt: +toPt(l.right - slideBox.left).toFixed(2),
      yTopPt: +toPt(l.top - slideBox.top).toFixed(2),
      glyphBoxEm: +((l.bottom - l.top) / parseFloat(style.fontSize)).toFixed(4),
    })),
    pitchPt: lines.length > 1 ? +toPt(lines[1].top - lines[0].top).toFixed(2) : null,
    pitchPerFontSize: lines.length > 1
      ? +((lines[1].top - lines[0].top) / parseFloat(style.fontSize)).toFixed(4)
      : null,
  };
}, slideNo);

console.log(JSON.stringify(result, null, 2));
await browser.close();
