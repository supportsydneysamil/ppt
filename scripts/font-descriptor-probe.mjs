// Determines how Chrome composes size-adjust with ascent-override/descent-override.
// Needed because the generated fallback CSS sets both, and if the overrides were
// scaled again by size-adjust the vertical correction would be wrong.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

// Inlined as a data URL: a file:// font on an about:blank document is blocked,
// which silently falls back to a system font and invalidates the measurement.
const notoChunk = 'node_modules/@fontsource-variable/noto-sans-kr/files/noto-sans-kr-119-wght-normal.woff2';
const fontUrl = `data:font/woff2;base64,${(await readFile(notoChunk)).toString('base64')}`;

// Noto Sans KR: ascent 1.1600em, descent 0.2880em -> normal line box 1.4480em.
// Malgun Gothic: ascent 1.0884em, descent 0.2417em -> normal line box 1.3301em.
const html = `<!DOCTYPE html><meta charset="utf-8"><style>
@font-face { font-family: Plain;      src: url("${fontUrl}"); }
@font-face { font-family: Adj;        src: url("${fontUrl}"); size-adjust: 108.6957%; }
@font-face { font-family: Ovr;        src: url("${fontUrl}"); ascent-override: 108.84%; descent-override: 24.17%; line-gap-override: 0%; }
@font-face { font-family: AdjOvr;     src: url("${fontUrl}"); size-adjust: 108.6957%; ascent-override: 108.84%; descent-override: 24.17%; line-gap-override: 0%; }
/* Overrides pre-divided by size-adjust: 1.0884/1.086957 and 0.2417/1.086957. */
@font-face { font-family: Fixed;      src: url("${fontUrl}"); size-adjust: 108.6957%; ascent-override: 100.133%; descent-override: 22.236%; line-gap-override: 0%; }
body { margin: 0; }
div { font-size: 100px; line-height: normal; white-space: nowrap; width: max-content; }
</style>
<div id="plain"  style="font-family: Plain">가</div>
<div id="adj"    style="font-family: Adj">가</div>
<div id="ovr"    style="font-family: Ovr">가</div>
<div id="adjovr" style="font-family: AdjOvr">가</div>
<div id="fixed"  style="font-family: Fixed">가</div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const measured = await page.evaluate(() =>
  ['plain', 'adj', 'ovr', 'adjovr', 'fixed'].map((id) => {
    const el = document.getElementById(id);
    const rect = el.getBoundingClientRect();
    return { id, lineBoxEm: +(rect.height / 100).toFixed(4), advanceEm: +(rect.width / 100).toFixed(4) };
  })
);

// A blocked webfont silently falls back to a system face, so confirm the real
// Noto advance (0.92em) before trusting anything below.
if (Math.abs(measured[0].advanceEm - 0.92) > 0.01) {
  console.error(`webfont did not load: plain advance ${measured[0].advanceEm}em, expected 0.92em`);
  await browser.close();
  process.exit(1);
}

console.log('font-size 100px, line-height normal, glyph 가\n');
console.log('  case     line box(em)  advance(em)');
for (const m of measured) {
  console.log(`  ${m.id.padEnd(8)} ${String(m.lineBoxEm).padEnd(13)} ${m.advanceEm}`);
}

const plain = measured[0];
const adj = measured[1];
const ovr = measured[2];
const adjOvr = measured[3];

console.log('\n해석');
console.log(`  size-adjust 가 advance 를 스케일: ${plain.advanceEm} -> ${adj.advanceEm}`
  + ` (기대 ${(plain.advanceEm * 1.086957).toFixed(4)})`);
console.log(`  override 만: line box ${plain.lineBoxEm} -> ${ovr.lineBoxEm} (맑은고딕 목표 1.3301)`);
const doubled = 1.3301 * 1.086957;
console.log(`  둘 다: ${adjOvr.lineBoxEm}  |  곱해지면 ${doubled.toFixed(4)}, 안 곱해지면 1.3301`);
console.log(`  => ${Math.abs(adjOvr.lineBoxEm - doubled) < 0.01 ? 'size-adjust 가 override 를 다시 스케일함' : 'override 는 size-adjust 와 독립'}`);

const fixed = measured[4];
console.log(`\n보정값을 size-adjust 로 미리 나눈 경우`);
console.log(`  line box ${fixed.lineBoxEm} (맑은고딕 1.3301 목표), advance ${fixed.advanceEm} (1.0 목표)`);
const ok = Math.abs(fixed.lineBoxEm - 1.3301) < 0.015 && Math.abs(fixed.advanceEm - 1.0) < 0.01;
console.log(`  => ${ok ? '가로/세로 모두 맑은 고딕과 일치' : '불일치'}`);

await browser.close();
