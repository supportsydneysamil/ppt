// Shows what the browser actually resolves a deck's font name to, for each of
// the three cases the preview can be in: the genuine font is installed, it is
// missing but we ship a substitute, or it is missing and unmapped.
import { chromium } from 'playwright';
import { FONT_SUBSTITUTES } from '../public/pptx-fonts/manifest.js';

const baseURL = process.argv[2] || 'http://localhost:3311';

const CASES = [
  { family: 'Arial', note: '설치됨 + 대체본 미로드' },
  { family: 'Malgun Gothic', note: '미설치 + 대체본 로드' },
  { family: '함초롬돋움', note: '미설치 + 매니페스트에 없음' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.goto(baseURL, { waitUntil: 'domcontentloaded' });

// Mirror the runtime decision: load a substitute only for a missing family.
const measured = await page.evaluate(async () => {
  const { createCanvasMeasurer, planFontSubstitutes } = await import('/pptx-font-availability.js');
  const { FONT_SUBSTITUTES } = await import('/pptx-fonts/manifest.js');
  const plan = planFontSubstitutes(FONT_SUBSTITUTES, createCanvasMeasurer());
  return { missing: plan.missing.map((e) => e.id), available: plan.available.map((e) => e.family) };
});

for (const id of measured.missing) {
  await page.addStyleTag({ url: `/pptx-fonts/${id}.css` });
}
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

await page.evaluate((cases) => {
  const host = document.createElement('div');
  host.id = 'chain';
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff';
  for (const c of cases) {
    const el = document.createElement('div');
    el.className = 'chain-probe';
    // Exactly how the renderer sets a run's font: the deck's name, nothing else.
    el.style.cssText = `font-family:'${c.family}';font-size:64px;white-space:nowrap;width:max-content`;
    el.textContent = '가나다 Abc';
    host.appendChild(el);
  }
  document.body.appendChild(host);
}, CASES);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const cdp = await page.context().newCDPSession(page);
await Promise.all([cdp.send('DOM.enable'), cdp.send('CSS.enable')]);
const { root } = await cdp.send('DOM.getDocument');

console.log(`대체본 로드 대상 ${measured.missing.length}개 / 로컬 사용 ${measured.available.length}개\n`);
console.log('덱이 지정한 폰트      상황                          브라우저가 실제로 쓴 폰트');
for (let i = 0; i < CASES.length; i += 1) {
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `.chain-probe:nth-of-type(${i + 1})`,
  });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  const used = fonts.map((f) => `${f.familyName}${f.isCustomFont ? ' (웹폰트)' : ' (로컬)'}`).join(', ');
  console.log(`${CASES[i].family.padEnd(21)} ${CASES[i].note.padEnd(29)} ${used || '(없음)'}`);
}

await browser.close();
