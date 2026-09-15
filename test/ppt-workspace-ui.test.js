import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createPptWorkspaceUiState,
  pptWorkspaceMode,
  reducePptWorkspaceUi,
} from "../public/ppt-workspace-ui.js";

const [html, appSource, chromeSource] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/custom-editor-chrome.jsx", import.meta.url), "utf8"),
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
