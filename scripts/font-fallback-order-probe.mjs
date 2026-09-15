// The generated CSS needs two @font-face rules per family: an unadjusted one
// for the genuine Office font, and an adjusted one for the shipped substitute.
// This checks that Chrome prefers the later local() rule when that font exists
// and still falls back to the earlier webfont rule when it does not.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const chunk = 'node_modules/@fontsource-variable/noto-sans-kr/files/noto-sans-kr-119-wght-normal.woff2';
const fontUrl = `data:font/woff2;base64,${(await readFile(chunk)).toString('base64')}`;

// Noto Hangul advance is 0.92em; 108.6957% brings it to Malgun's 1.0em.
const adjusted = (family) => `
@font-face { font-family: ${family}; src: url("${fontUrl}");
  size-adjust: 108.6957%; ascent-override: 100.1309%; descent-override: 22.2363%; line-gap-override: 0%; }`;

const html = `<!DOCTYPE html><meta charset="utf-8"><style>
/* Substitute declared first, genuine font declared last. */
${adjusted('Missing')}
@font-face { font-family: Missing; src: local('NoSuchFontXYZ123'); }

${adjusted('Present')}
@font-face { font-family: Present; src: local('Apple SD Gothic Neo'); }

${adjusted('Alone')}
body { margin: 0 }
div { font-size: 100px; line-height: normal; white-space: nowrap; width: max-content }
</style>
<div class="p" style="font-family: Missing">가</div>
<div class="p" style="font-family: Present">가</div>
<div class="p" style="font-family: Alone">가</div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

const cdp = await page.context().newCDPSession(page);
await Promise.all([cdp.send('DOM.enable'), cdp.send('CSS.enable')]);
const { root } = await cdp.send('DOM.getDocument');

const labels = ['Missing (로컬 없음)', 'Present (로컬 있음)', 'Alone (웹폰트만)'];
const sizes = await page.$$eval('.p', (els) =>
  els.map((el) => ({
    advanceEm: +(el.getBoundingClientRect().width / 100).toFixed(4),
    contentEm: +(el.getBoundingClientRect().height / 100).toFixed(4),
  }))
);

console.log('case                   advance(em)  content(em)  사용 폰트');
for (let i = 0; i < labels.length; i += 1) {
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `.p:nth-of-type(${i + 1})`,
  });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  const used = fonts.map((f) => `${f.familyName}${f.isCustomFont ? ' (webfont)' : ' (로컬)'}`).join(', ');
  console.log(
    `${labels[i].padEnd(22)} ${String(sizes[i].advanceEm).padEnd(12)} ${String(sizes[i].contentEm).padEnd(12)} ${used}`
  );
}

console.log('\n판정');
console.log(`  로컬 없을 때 웹폰트로 폴백: ${Math.abs(sizes[0].advanceEm - 1) < 0.01 ? 'O' : 'X'} (advance 1.0 기대)`);
console.log(`  로컬 있을 때 로컬 우선   : ${Math.abs(sizes[1].advanceEm - 1) > 0.02 ? 'O' : 'X'} (조정 안 된 로컬 폭 기대)`);

await browser.close();
