// Measures advances the way the layout engine actually does, by differencing
// DOM text widths. Canvas measureText resolves unicode-range faces differently
// and disagrees with layout, so it cannot be used to check the generated CSS.
import { chromium } from 'playwright';
import { FONT_SUBSTITUTES } from '../public/pptx-fonts/manifest.js';

const baseURL = process.argv[2] || 'http://localhost:3311';
const FAMILY = process.argv[3] || 'Malgun Gothic';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
// Substitutes now ship one stylesheet per family, loaded on demand.
for (const entry of FONT_SUBSTITUTES) {
  await page.addStyleTag({ url: `/pptx-fonts/${entry.id}.css` });
}
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);

const measureAll = async (family, weight) => page.evaluate(async ({ family, weight }) => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden';
  document.body.appendChild(host);

  const widthOf = async (text) => {
    const el = document.createElement('div');
    el.style.cssText =
      `font-family:'${family}';font-weight:${weight};font-size:100px;line-height:normal;` +
      'white-space:pre;width:max-content;display:inline-block';
    el.textContent = text;
    host.appendChild(el);
    await document.fonts.ready;
    const w = el.getBoundingClientRect().width / 100;
    host.removeChild(el);
    return +w.toFixed(4);
  };

  // Differencing cancels side bearings and any leading/trailing trim.
  const base = await widthOf('가가');
  const out = {
    hangul: +((await widthOf('가가가')) - base).toFixed(4),
    space: +((await widthOf('가 가')) - base).toFixed(4),
    digit1: +((await widthOf('가1가')) - base).toFixed(4),
    period: +((await widthOf('가.가')) - base).toFixed(4),
    quote: +((await widthOf('가“가')) - base).toFixed(4),
    sentence: await widthOf('17. 그 때에 주님께서 말씀하셨다'),
  };
  host.remove();
  return out;
}, { family, weight });

console.log('굵기별 비교 (원본 맑은 고딕 공백 0.3516em, 마침표 0.2188em)\n');
console.log('  family                weight  한글      공백      마침표    따옴표');
for (const family of ['Malgun Gothic', 'Noto Sans KR Variable']) {
  for (const weight of [400, 700]) {
    const m = await measureAll(family, weight);
    console.log(
      `  ${family.padEnd(21)} ${String(weight).padEnd(7)} ${String(m.hangul).padEnd(9)} ` +
      `${String(m.space).padEnd(9)} ${String(m.period).padEnd(9)} ${m.quote}`
    );
  }
}
console.log('');

const result = await measureAll(FAMILY, 700);

// Advances read from malgun.ttf.
const MALGUN = { hangul: 1.0, space: 0.3516, digit1: 0.5508, period: 0.2188, quote: 0.3286 };

console.log(`[${FAMILY}] 레이아웃 실측 vs 맑은 고딕 원본\n`);
console.log('  char       원본(em)   미리보기(em)  비율');
for (const [key, orig] of Object.entries(MALGUN)) {
  const got = result[key];
  console.log(`  ${key.padEnd(10)} ${String(orig).padEnd(10)} ${String(got).padEnd(13)} ${(got / orig).toFixed(4)}`);
}

const expected = MALGUN.digit1 * 2 + MALGUN.period + MALGUN.space * 4 + 12;
console.log(`\n  문장 "17. 그 때에 주님께서 말씀하셨다"`);
console.log(`    맑은 고딕 계산   ${expected.toFixed(4)}em`);
console.log(`    PowerPoint 실측 ${(800.6 / 54).toFixed(4)}em`);
console.log(`    미리보기 실측   ${result.sentence}em`);
console.log(`    폭 한계         ${(801.6 / 54).toFixed(4)}em`);
console.log(`\n  => 미리보기 문장이 한계보다 ${result.sentence > 801.6 / 54 ? '넓어 줄이 일찍 끊김' : '좁아 한 줄에 들어감'}`);

await browser.close();
