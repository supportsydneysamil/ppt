// Layout probe for the custom slide editor's inspector column.
//
//   node test/browser/custom-editor-layout-probe.mjs
//
// The bugs it measures are pure CSS layout, so it serves public/ as-is and
// stands the editor up by hand instead of booting the app: no bundle, no
// server routes, no data. React chrome is injected as static markup that
// mirrors custom-editor-chrome.jsx, because that is the DOM the CSS targets.
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const port = await findFreePort();
const app = express();
app.use(express.static(path.join(repoRoot, "public")));
const server = await new Promise((resolve) => {
  const handle = app.listen(port, "127.0.0.1", () => resolve(handle));
});

const browser = await chromium.launch();
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

// Mirrors the grid areas custom-editor-chrome.jsx renders into.
const chromeMarkup = `
  <div class="custom-editor-chrome">
    <div class="custom-editor-bar">
      <label class="custom-editor-field"><span class="field-label">템플릿</span><select><option>t</option></select></label>
      <label class="custom-editor-field"><span class="field-label">테마</span><select><option>t</option></select></label>
    </div>
    <div class="custom-editor-toolbar" role="toolbar">
      <div class="custom-editor-tool-group"><button type="button" class="custom-editor-tool">텍스트</button></div>
      <div class="custom-editor-tool-group"><button type="button" class="custom-editor-tool">정렬</button></div>
    </div>
    <div class="custom-editor-side" id="customSlideInspector">
      <aside class="custom-editor-layers"><div class="custom-editor-panel-label">레이어</div><ol class="custom-editor-layer-list" data-probe="layers"></ol></aside>
      <aside class="custom-editor-props" data-probe="props"></aside>
    </div>
  </div>
`;

async function openEditor(page, { width, height, slideType }) {
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
  await page.evaluate(
    ({ slideType, chromeMarkup }) => {
      const page = document.querySelector(".page");
      page.dataset.workspace = "ppt";
      page.dataset.pptSurface = "editor";
      // applyViewChange() sets these two inline; the app shell's height chain
      // depends on them, so the probe is only honest if it does the same.
      document.getElementById("view-ppt").style.display = "flex";
      document.getElementById("emptyEditorState").style.display = "none";

      const workspace = document.getElementById("pptWorkspace");
      workspace.dataset.layoutMode = window.innerWidth >= 1280 ? "wide" : window.innerWidth >= 900 ? "compact" : "mobile";
      workspace.dataset.slidesOpen = "true";
      workspace.dataset.inspectorOpen = "true";
      workspace.dataset.focusMode = "false";

      const editor = document.getElementById("slideEditor");
      editor.style.display = "grid";
      editor.dataset.slideType = slideType;

      const custom = document.getElementById("customSlideEditor");
      const preview = document.querySelector(".preview-area");
      if (slideType === "custom") {
        custom.hidden = false;
        custom.dataset.reactChrome = "true";
        custom.querySelector(".custom-editor-react-root").innerHTML = chromeMarkup;
        preview.hidden = true;
      } else {
        custom.hidden = true;
        preview.hidden = false;
      }
    },
    { slideType, chromeMarkup }
  );
  // Two frames: one for the style/attribute writes, one for the grid to settle.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function rows(n, label) {
  return Array.from({ length: n })
    .map(
      (_, i) =>
        `<label class="custom-editor-row"><span class="field-label">${label}${i}</span><input type="number" /></label>`
    )
    .join("");
}

// --- Bug 1: selecting an object must not move the stage -------------------
{
  const page = await browser.newPage();
  await openEditor(page, { width: 1600, height: 900, slideType: "custom" });

  async function stageBox(propsHtml) {
    await page.evaluate((html) => {
      document.querySelector('[data-probe="props"]').innerHTML = html;
    }, propsHtml);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => {
      const stage = document.querySelector(".custom-editor-body").getBoundingClientRect();
      return { top: Number(stage.top.toFixed(2)), height: Number(stage.height.toFixed(2)) };
    });
  }

  const before = await stageBox("");
  // What updatePropertyPanel() does on selection: reveal the text + common panels.
  const after = await stageBox(
    `<div class="custom-editor-panel"><div class="custom-editor-panel-label">텍스트</div>${rows(
      12,
      "text"
    )}</div><div class="custom-editor-panel"><div class="custom-editor-panel-label">공통</div>${rows(8, "common")}</div>`
  );
  // The bug was that the inspector's growth was distributed into the bar and
  // tool rows, so the shift scaled with how much was selected. A row track
  // resolving to a whole pixel instead of 444.375 is not that, so the check
  // that matters is that 10x the content does not move the stage 10x further.
  const after10x = await stageBox(`<div class="custom-editor-panel">${rows(200, "prop")}</div>`);

  console.log("\n[wide 1600x900] custom slide, selecting an object");
  console.log("  stage empty:  ", before);
  console.log("  stage selected:", after);
  console.log("  stage 200 rows:", after10x);
  check("selecting an object does not push the stage down", () => {
    assert.ok(
      Math.abs(after.top - before.top) <= 2,
      `stage top moved ${(after.top - before.top).toFixed(1)}px`
    );
  });
  check("selecting an object does not resize the stage", () => {
    assert.ok(
      Math.abs(after.height - before.height) <= 2,
      `stage height changed ${(after.height - before.height).toFixed(1)}px`
    );
  });
  check("the shift does not grow with the amount of inspector content", () => {
    assert.deepEqual(
      after10x,
      after,
      "10x the inspector content moved the stage further, so the rows still absorb it"
    );
  });

  const side = await page.evaluate(() => {
    const el = document.querySelector(".custom-editor-side");
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY };
  });
  console.log("  side:", side);
  check("custom-editor-side can scroll its own overflow", () => {
    assert.ok(
      side.overflowY === "auto" || side.overflowY === "scroll",
      `overflow-y is ${side.overflowY}`
    );
    assert.ok(side.clientHeight > 0, "side has no height");
  });
  check("the editor panel does not clip the inspector", () => {
    assert.ok(
      side.scrollHeight <= side.clientHeight || side.overflowY !== "visible",
      "inspector content is clipped with no way to reach it"
    );
  });
  await page.close();
}

// --- Bug 2: a tall inspector form must scroll ----------------------------
for (const [label, viewport] of [
  ["wide 1600x900", { width: 1600, height: 900 }],
  ["compact 1100x800", { width: 1100, height: 800 }],
]) {
  const page = await browser.newPage();
  await openEditor(page, { ...viewport, slideType: "hymn" });

  const probe = await page.evaluate(
    (html) => {
      const form = document.getElementById("slideForm");
      const filler = document.createElement("div");
      filler.className = "settings-section";
      filler.innerHTML = html;
      form.append(filler);
      const style = getComputedStyle(form);
      return {
        scrollHeight: form.scrollHeight,
        clientHeight: form.clientHeight,
        overflowY: style.overflowY,
        maxHeight: style.maxHeight,
        alignSelf: style.alignSelf,
        rect: form.getBoundingClientRect().height,
        viewportH: window.innerHeight,
        pageScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
      };
    },
    rows(40, "filler")
  );

  console.log(`\n[${label}] hymn slide, inspector taller than the screen`);
  console.log("  form:", probe);
  check(`[${label}] a tall inspector form scrolls`, () => {
    const scrollable = probe.scrollHeight > probe.clientHeight + 1;
    assert.ok(
      probe.overflowY === "auto" || probe.overflowY === "scroll",
      `overflow-y is ${probe.overflowY}`
    );
    assert.ok(
      !scrollable || probe.clientHeight > 0,
      "form has overflow but no height to scroll within"
    );
    assert.ok(
      probe.clientHeight <= probe.viewportH,
      `form is ${probe.clientHeight}px tall inside a ${probe.viewportH}px viewport, so its tail is unreachable`
    );
  });
  await page.close();
}

// --- Bug 3: a tall custom inspector must scroll --------------------------
{
  const page = await browser.newPage();
  await openEditor(page, { width: 1600, height: 900, slideType: "custom" });
  const probe = await page.evaluate(
    (html) => {
      document.querySelector('[data-probe="props"]').innerHTML = html;
      const side = document.querySelector(".custom-editor-side");
      const style = getComputedStyle(side);
      return {
        scrollHeight: side.scrollHeight,
        clientHeight: side.clientHeight,
        overflowY: style.overflowY,
        paddingTop: style.paddingTop,
        viewportH: window.innerHeight,
        lastRowBottom: (() => {
          const rowsEls = side.querySelectorAll(".custom-editor-row");
          const last = rowsEls[rowsEls.length - 1];
          return last ? last.getBoundingClientRect().bottom : null;
        })(),
      };
    },
    `<div class="custom-editor-panel">${rows(40, "prop")}</div>`
  );
  console.log("\n[wide 1600x900] custom slide, inspector taller than the screen");
  console.log("  side:", probe);
  check("a tall custom inspector stays inside the viewport", () => {
    assert.ok(
      probe.clientHeight <= probe.viewportH,
      `inspector is ${probe.clientHeight}px inside a ${probe.viewportH}px viewport`
    );
    assert.ok(
      probe.overflowY === "auto" || probe.overflowY === "scroll",
      `overflow-y is ${probe.overflowY}`
    );
  });
  await page.close();
}

await browser.close();
server.close();

console.log("");
if (failures.length) {
  console.log(`${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("all checks passed");
}
