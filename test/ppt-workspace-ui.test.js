import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createPptWorkspaceUiState,
  pptWorkspaceMode,
  reducePptWorkspaceUi,
} from "../public/ppt-workspace-ui.js";

const [html, appSource, chromeSource, css] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/custom-editor-chrome.jsx", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
]);

describe("PPT workspace UI state", () => {
  it("uses exact mobile, compact, and wide boundaries", () => {
    assert.equal(pptWorkspaceMode(899), "mobile");
    assert.equal(pptWorkspaceMode(900), "compact");
    assert.equal(pptWorkspaceMode(1279), "compact");
    assert.equal(pptWorkspaceMode(1280), "wide");
  });

  it("opens both persistent panes by default in wide mode", () => {
    assert.deepEqual(createPptWorkspaceUiState(1440), {
      mode: "wide",
      focusMode: false,
      slidesOpen: true,
      inspectorOpen: true,
    });
  });

  it("opens at most one drawer in compact mode", () => {
    assert.deepEqual(
      createPptWorkspaceUiState(1024, {
        slidesOpen: true,
        inspectorOpen: true,
      }),
      {
        mode: "compact",
        focusMode: false,
        slidesOpen: true,
        inspectorOpen: false,
      }
    );

    const inspector = reducePptWorkspaceUi(
      createPptWorkspaceUiState(1024, { slidesOpen: true }),
      { type: "toggle-inspector" }
    );
    assert.equal(inspector.slidesOpen, false);
    assert.equal(inspector.inspectorOpen, true);
  });

  it("keeps both regions in document flow on mobile", () => {
    assert.deepEqual(
      createPptWorkspaceUiState(700, {
        focusMode: true,
        slidesOpen: false,
        inspectorOpen: false,
      }),
      {
        mode: "mobile",
        focusMode: false,
        slidesOpen: true,
        inspectorOpen: true,
      }
    );
  });

  it("focus mode closes both panes and restores wide defaults", () => {
    const wide = createPptWorkspaceUiState(1440);
    const focused = reducePptWorkspaceUi(wide, { type: "toggle-focus" });
    assert.deepEqual(focused, {
      mode: "wide",
      focusMode: true,
      slidesOpen: false,
      inspectorOpen: false,
    });
    assert.deepEqual(reducePptWorkspaceUi(focused, { type: "toggle-focus" }), wide);
  });

  it("normalizes pane state when browser width changes", () => {
    const wide = createPptWorkspaceUiState(1440);
    const compact = reducePptWorkspaceUi(wide, {
      type: "resize",
      width: 1024,
    });
    assert.deepEqual(compact, {
      mode: "compact",
      focusMode: false,
      slidesOpen: true,
      inspectorOpen: false,
    });

    const mobile = reducePptWorkspaceUi(compact, {
      type: "resize",
      width: 899,
    });
    assert.deepEqual(mobile, {
      mode: "mobile",
      focusMode: false,
      slidesOpen: true,
      inspectorOpen: true,
    });
  });

  it("closes compact drawers without changing the current mode", () => {
    const compact = createPptWorkspaceUiState(1024, { inspectorOpen: true });
    assert.deepEqual(
      reducePptWorkspaceUi(compact, { type: "close-drawers" }),
      {
        mode: "compact",
        focusMode: false,
        slidesOpen: false,
        inspectorOpen: false,
      }
    );
  });

  it("opens the inspector after selecting a slide in compact mode", () => {
    const compact = createPptWorkspaceUiState(1024, { slidesOpen: true });
    assert.deepEqual(
      reducePptWorkspaceUi(compact, { type: "show-inspector" }),
      {
        mode: "compact",
        focusMode: false,
        slidesOpen: false,
        inspectorOpen: true,
      }
    );
  });
});

describe("PPT three-pane layout", () => {
  it("gives the slide list a rail and the editor the remaining width", () => {
    assert.match(
      css,
      /\.ppt-interface\s*\{[\s\S]*grid-template-columns:\s*280px minmax\(0,\s*1fr\)/
    );
  });

  it("reserves readable Korean label width in the slide rail", () => {
    assert.match(
      css,
      /\.ppt-interface\s*\{[\s\S]*grid-template-columns:\s*280px minmax\(0,\s*1fr\)/
    );
    assert.match(css, /\.slide-card-main h4\s*\{[\s\S]*word-break:\s*keep-all/);
    assert.match(appSource, /meta\.appendChild\(actions\)/);
    assert.match(html, /id="slidePanelCollapseBtn"/);
  });

  it("uses the whole card as the drag affordance without a handle button", () => {
    assert.doesNotMatch(appSource, /slide-card-handle/);
    assert.match(css, /\.slide-card\s*\{[\s\S]*cursor:\s*grab/);
    assert.match(css, /\.slide-card\.dragging\s*\{[\s\S]*cursor:\s*grabbing/);
    assert.match(
      css,
      /\.slide-move-btn\s*\{[\s\S]*width:\s*26px[\s\S]*height:\s*26px/
    );
  });

  it("uses an edge icon and a wider commercial inspector", () => {
    assert.match(html, /id="inspectorPanelCollapseBtn"/);
    assert.match(
      css,
      /--inspector-width:\s*clamp\(320px,\s*24vw,\s*360px\)/
    );
    assert.match(
      css,
      /@media\s*\(min-width:\s*1280px\)[\s\S]*#pptInspectorPaneBtn[\s\S]*display:\s*none/
    );
  });

  it("places the stage and inspector in distinct editor columns", () => {
    assert.match(
      css,
      /\.slide-editor-panel\s*\{[\s\S]*grid-template-areas:\s*"header header"\s*"stage inspector"/
    );
    assert.match(css, /\.editor-form\s*\{[\s\S]*grid-area:\s*inspector/);
    assert.match(css, /\.preview-area\s*\{[\s\S]*grid-area:\s*stage/);
  });

  it("splits custom-editor stage and side chrome without moving its DOM", () => {
    assert.match(
      css,
      /\.slide-editor-panel\[data-slide-type="custom"\][\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) var\(--inspector-width\)/
    );
  });

  it("collapses both side regions in focus mode", () => {
    assert.match(
      css,
      /\.ppt-interface\[data-focus-mode="true"\][\s\S]*grid-template-columns:\s*44px minmax\(0,\s*1fr\)/
    );
    assert.match(
      css,
      /\.ppt-interface\[data-inspector-open="false"\][\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) 44px/
    );
  });
});

describe("PPT compact and mobile layouts", () => {
  it("uses overlay drawers only between 900px and 1279px", () => {
    assert.match(
      css,
      /@media\s*\(min-width:\s*900px\)\s*and\s*\(max-width:\s*1279px\)[\s\S]*\.slide-list-panel\s*\{[\s\S]*position:\s*absolute/
    );
    assert.match(
      css,
      /@media\s*\(min-width:\s*900px\)\s*and\s*\(max-width:\s*1279px\)[\s\S]*\.editor-form\s*\{[\s\S]*position:\s*absolute/
    );
  });

  it("returns panels to normal flow below 900px", () => {
    assert.match(
      css,
      /@media\s*\(max-width:\s*899px\)[\s\S]*\.slide-list-panel\s*\{[\s\S]*position:\s*static/
    );
    assert.match(
      css,
      /@media\s*\(max-width:\s*899px\)[\s\S]*\.editor-form\s*\{[\s\S]*position:\s*static/
    );
  });

  it("closes compact drawers from stage clicks and Escape", () => {
    assert.match(appSource, /function closeCompactWorkspaceDrawers\(/);
    assert.match(appSource, /type:\s*"close-drawers"/);
    assert.match(appSource, /event\.key\s*!={2}\s*"Escape"/);
  });
});

describe("PPT workspace controls", () => {
  it("exposes accessible slides, inspector, and focus controls", () => {
    assert.match(html, /id="pptSlidesPaneBtn"[\s\S]*aria-controls="slideListPanel"/);
    assert.match(html, /id="pptInspectorPaneBtn"[\s\S]*aria-controls="slideForm customSlideInspector"/);
    assert.match(html, /id="pptFocusModeBtn"[\s\S]*aria-pressed="false"/);
    assert.match(html, /id="slideListPanel"/);
    assert.match(chromeSource, /id="customSlideInspector"/);
  });

  it("persists UI state and forces stage reflow without changing slide data", () => {
    assert.match(appSource, /samil-ppt-workspace-ui-v1/);
    assert.match(appSource, /function applyPptWorkspaceUi\(/);
    assert.match(appSource, /workspaceReflow\?\.schedule\(\{ force: true \}\)/);
    assert.match(appSource, /slideEditor\.dataset\.slideType\s*=\s*type/);
    assert.match(appSource, /slideEditor\.style\.display\s*=\s*"grid"/);
  });
});
