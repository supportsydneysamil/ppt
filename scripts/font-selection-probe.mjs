// Reports which physical font the browser picks for an aliased Office family,
// and the content-area height that results. If a local() entry in the same
// @font-face wins, the Noto-derived size-adjust/overrides are being applied to
// the wrong font, which invalidates the correction.
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://localhost:3311';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
// Loading the preview CSS is what registers the aliased families.
await page.addStyleTag({ url: '/pptx-font-fallbacks.css' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);

await page.evaluate(() => {
  const host = document.createElement('div');
  host.id = 'probeHost';
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff';
  for (const family of ['Malgun Gothic', 'Batang', 'Calibri', 'Arial']) {
    const el = document.createElement('div');
    el.className = 'probe';
    el.dataset.family = family;
    el.style.cssText =
      `font-family:'${family}';font-size:72px;line-height:normal;white-space:nowrap;width:max-content`;
    el.textContent = family === 'Calibri' || family === 'Arial' ? 'Wg' : '가';
    host.appendChild(el);
  }
  document.body.appendChild(host);
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

const cdp = await page.context().newCDPSession(page);
await Promise.all([cdp.send('DOM.enable'), cdp.send('CSS.enable')]);
const { root } = await cdp.send('DOM.getDocument');

const probes = await page.$$eval('.probe', (els) =>
  els.map((el, i) => ({
    i,
    family: el.dataset.family,
    contentAreaEm: +(el.getBoundingClientRect().height / 72).toFixed(4),
    advanceEm: +(el.getBoundingClientRect().width / 72).toFixed(4),
  }))
);

console.log('family           content area(em)  advance(em)  실제 사용 폰트');
for (const p of probes) {
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `.probe:nth-child(${p.i + 1})`,
  });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  const names = fonts.map((f) => `${f.familyName}${f.isCustomFont ? ' (webfont)' : ' (로컬)'}`).join(', ');
  console.log(
    `${p.family.padEnd(16)} ${String(p.contentAreaEm).padEnd(17)} ${String(p.advanceEm).padEnd(12)} ${names}`
  );
}

console.log('\n기대값: Malgun Gothic -> content area 1.3301em, 가 advance 1.0em (webfont Noto)');
await browser.close();
