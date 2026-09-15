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
      /--inspector-width:\s*clamp\(360px,\s*27vw,\s*400px\)/
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

  it("gives a custom slide's editor the stage column and nothing else", () => {
    // The editor used to span both columns and rebuild the inspector column
    // inside itself, with the form overlaid on top of it. Its panels are
    // rendered into the form instead, so it keeps to the stage area and the
    // panel's own two columns are the only ones.
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.custom-editor\[data-react-chrome="true"\]:not\(\[hidden\]\)\s*\{[^}]*?grid-area:\s*stage/
    );
    assert.doesNotMatch(
      css,
      /\[data-slide-type="custom"\] \.custom-editor\[data-react-chrome="true"\]:not\(\[hidden\]\)\s*\{[^}]*?"bar side"/
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

describe("PPT panel collapse affordances", () => {
  it("expands a collapsed pane from a full-rail button", () => {
    assert.match(
      html,
      /id="slideListRailBtn"[\s\S]*?aria-controls="slideListPanel"/
    );
    assert.match(
      html,
      /id="inspectorRailBtn"[\s\S]*?aria-controls="slideForm customSlideInspector"/
    );
    assert.match(html, /id="slideListRailBtn"[\s\S]*?슬라이드 목록 열기/);
    assert.match(html, /id="inspectorRailBtn"[\s\S]*?속성 패널 열기/);
    assert.match(css, /\.panel-rail-btn\s*\{[\s\S]*?display:\s*none/);
    assert.match(
      css,
      /\[data-layout-mode="wide"\]\[data-slides-open="false"\]\s*#slideListRailBtn[\s\S]*?display:\s*flex/
    );
    assert.match(
      css,
      /\.panel-rail-label\s*\{[\s\S]*?writing-mode:\s*vertical-rl/
    );
    assert.match(appSource, /slideListRailBtn\?\.addEventListener/);
    assert.match(appSource, /inspectorRailBtn\?\.addEventListener/);
  });

  it("hides the collapse chevrons while collapsed so the rail owns the target", () => {
    assert.match(
      css,
      /\[data-slides-open="false"\]\s*#slidePanelCollapseBtn\s*\{[\s\S]*?display:\s*none/
    );
    assert.match(
      css,
      /\[data-inspector-open="false"\]\s*#inspectorPanelCollapseBtn\s*\{[\s\S]*?display:\s*none/
    );
  });

  it("seats the slide-list chevron in the header flow", () => {
    // Directly after the title, in normal flow — not absolutely positioned
    // over the panel with the header padded out of its way.
    assert.match(
      html,
      /<div class="slide-list-title-wrap">\s*<h3>슬라이드 목록<\/h3>\s*<\/div>\s*<button\s*id="slidePanelCollapseBtn"/
    );
    assert.match(
      html,
      /id="slidePanelCollapseBtn"[\s\S]*?class="ghost small icon-btn panel-collapse-btn"/
    );
    assert.doesNotMatch(css, /\.slide-panel-collapse/);
    assert.doesNotMatch(
      css,
      /\.slide-list-header\s*\{\s*padding-right:\s*34px/
    );
    assert.match(
      css,
      /\.panel-collapse-btn svg\s*\{[\s\S]*?stroke:\s*currentColor/
    );
  });

  it("gives the inspector its own header and its own card", () => {
    assert.match(
      html,
      /<form id="slideForm" class="editor-form">\s*<div class="inspector-header">\s*<h4>상세 설정<\/h4>\s*<button\s*id="inspectorPanelCollapseBtn"/
    );
    // Also proves the `@media (max-width: 1279px)` block that hid it is gone.
    assert.doesNotMatch(css, /\.inspector-panel-collapse/);
    assert.match(
      css,
      /\.inspector-header\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*0/
    );
    // A frame rather than a seam line, so the pane keeps an edge of its own
    // once it collapses and the stage is no longer next to it.
    assert.match(
      css,
      /\.editor-form\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?border-radius:\s*16px/
    );
    assert.doesNotMatch(
      css,
      /\.editor-form\s*\{[\s\S]*?border-left:\s*1px solid var\(--border\)/
    );
    // The sticky header pads the top, so scrolled rows cannot appear above it.
    assert.match(
      css,
      /\.editor-form\s*\{[\s\S]*?padding:\s*0 var\(--sp-4\) var\(--sp-4\)/
    );
    assert.match(
      css,
      /\.inspector-header\s*\{[\s\S]*?padding:\s*var\(--sp-4\) 0 var\(--sp-3\)/
    );
    // One divider for the whole column: the custom editor's panels are inside
    // the form now, so they no longer draw their own continuation of it.
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.editor-form > :not\(\.settings-section\):not\(\.inspector-header\):not\(\.custom-editor-inspector-host\)/
    );
    assert.match(
      css,
      /--inspector-header-h:\s*calc\(var\(--ctrl-h-sm\) \+ var\(--sp-3\) \+ 1px\)/
    );
  });

  it("keeps the inspector card stacked and unpins its header", () => {
    // Stacked, the card is the same card; only the pinned header would follow
    // the page scroll instead of the form's, so that is all mobile undoes.
    assert.doesNotMatch(
      css,
      /\[data-layout-mode="mobile"\] \.editor-form\s*\{[\s\S]*?border-left:\s*0/
    );
    assert.match(
      css,
      /@media\s*\(max-width:\s*899px\)[\s\S]*?\.inspector-header\s*\{\s*position:\s*static/
    );
  });

  it("frames the collapsed inspector rail like the pane it replaces", () => {
    // The slide list's rail sits inside a panel card. The inspector's form is
    // the card, and it is hidden while collapsed, so the rail draws its own.
    assert.match(
      css,
      /#inspectorRailBtn\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?border-radius:\s*16px/
    );
    assert.match(css, /#inspectorRailBtn:hover\s*\{[^}]*?background:\s*var\(--panel-soft\)/);
  });

  it("gives the compact custom drawer no clearance to pad", () => {
    // The panels ride inside the form's own drawer, so there is no second
    // drawer underneath an overlay that has to be padded clear of it.
    assert.doesNotMatch(
      css,
      /\[data-layout-mode="compact"\] \.custom-editor-side\s*\{/
    );
    assert.doesNotMatch(css, /padding:\s*calc\(164px \+ var\(--inspector-header-h\)/);
  });

  it("lets only the stage row absorb the custom editor's free height", () => {
    // The inspector column spans all four rows. While they were every one
    // `auto`, revealing the property panels on a selection grew the bar and
    // tool rows too, which pushed the stage down the screen.
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.custom-editor\[data-react-chrome="true"\]:not\(\[hidden\]\)\s*\{[^}]*?grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/
    );
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.custom-editor\[data-react-chrome="true"\]:not\(\[hidden\]\)\s*\{[^}]*?min-height:\s*0/
    );
  });

  it("scrolls a custom slide's whole inspector column as one stack", () => {
    // The name/type fields, the layers and the property panels used to be two
    // separately scrolling layers, so the fields stayed pinned while the
    // panels moved. The form is the one scroll container for all of them now.
    assert.match(
      html,
      /<div id="customEditorInspectorHost" class="custom-editor-inspector-host">/
    );
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.custom-editor-side\s*\{[^}]*?display:\s*grid/
    );
    assert.doesNotMatch(
      css,
      /\[data-slide-type="custom"\] \.custom-editor-side\s*\{[^}]*?overflow-y:\s*auto/
    );
  });

  it("no longer measures an overlaid form to offset the panels", () => {
    assert.doesNotMatch(appSource, /--custom-inspector-offset/);
    assert.doesNotMatch(appSource, /inspectorOffsetObserver/);
  });

  it("keeps the ppt view a flex column in the stylesheet", () => {
    // .ppt-interface claims the leftover height with `flex: 1 1 auto`, which
    // is inert unless this is a flex container. applyViewChange() also sets it
    // inline, and the whole app-shell height chain rests on that one line.
    assert.match(css, /#view-ppt\s*\{[^}]*?display:\s*flex/);
    assert.match(css, /#view-ppt\s*\{[^}]*?flex-direction:\s*column/);
  });

  it("names the panel and the inspector distinctly", () => {
    assert.match(html, /<div class="editor-header">\s*<h3>슬라이드 편집<\/h3>/);
    assert.match(html, /<div class="inspector-header">\s*<h4>상세 설정<\/h4>/);
  });

  it("keeps the collapse chevron's hover glow inside the inspector's clip", () => {
    // `.ghost:hover` lifts by 1px, but the chevron's top sits exactly on
    // `.editor-form`'s scroll clip edge, so the lift pushed the freshly
    // brand-coloured top border out of the scrollport and it vanished.
    assert.match(css, /\.panel-collapse-btn:hover\s*\{[^}]*?transform:\s*none/);
  });

  it("packs the inspector rows at the top instead of spreading them", () => {
    // The form is a grid stretched to the pane height in app-shell mode, so
    // the default stretch alignment hands the slack to every row: the header
    // grew from 47px to 162px and the fields drifted apart.
    // `[^}]` keeps the match inside the rule body; `[\s\S]*?` would happily
    // run past the closing brace and match `.preview-area`'s own start.
    assert.match(css, /\.editor-form\s*\{[^}]*?align-content:\s*start/);
  });

  it("leaves the slide-list header holding only its title and collapse icon", () => {
    assert.match(
      html,
      /<div class="slide-list-header">[\s\S]*?id="slidePanelCollapseBtn"[\s\S]*?<\/button>\s*<\/div>\s*<div class="slide-list-actions">/
    );
    assert.match(
      css,
      /\.slide-list-header\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--border\)/
    );
    // At 280px the title only fits once the action buttons leave the row.
    assert.match(
      css,
      /\.slide-list-header h3\s*\{[\s\S]*?white-space:\s*nowrap/
    );
    // 추가 is the primary action, so it takes the row's free space.
    assert.match(css, /\.add-slide-control\s*\{[\s\S]*?flex:\s*1 1 auto/);
    // The row left the header, so it needs its own inert coverage.
    assert.match(
      appSource,
      /"\.slide-list-header, \.slide-list-actions, \.slide-list-toolbar, \.slide-cards"/
    );
  });

  it("builds the custom toolbar out of one uniform icon set", () => {
    // Mixed icon and Korean-text buttons is what made the rows look ragged.
    assert.doesNotMatch(chromeSource, /<ToolButton[^>]*>\s*[가-힣]/);
    // Vertical-middle used the Layers glyph, which says nothing about align.
    assert.match(chromeSource, /action="align-middle"[\s\S]{0,80}AlignVerticalJustifyCenter/);
    assert.match(
      css,
      /\.custom-editor-chrome \.custom-editor-toolbar \.custom-editor-tool[\s\S]*?width:\s*var\(--ctrl-h-sm\)/
    );
    // A group wraps whole rather than splitting its own buttons across rows.
    assert.match(css, /\.custom-editor-tool-group\s*\{[^}]*?flex-wrap:\s*nowrap/);
  });

  it("gives the layer list rows instead of loose buttons", () => {
    assert.match(chromeSource, /data-editor-ui="layers"/);
    assert.match(chromeSource, /data-editor-ui="layers-empty"/);
    // A one-line answer to "what is this panel for".
    assert.match(chromeSource, /겹쳐서 클릭하기 어려운 개체를/);
    assert.match(
      css,
      /\.custom-editor-layer\s*\{[^}]*?grid-template-columns:\s*16px minmax\(0,\s*1fr\) auto auto/
    );
    assert.match(css, /\.custom-editor-layer-name\s*\{[^}]*?height:\s*var\(--ctrl-h-sm\)/);
    assert.match(css, /\.custom-editor-layer\.is-active\s*\{[^}]*?border-color:\s*var\(--brand-edge\)/);
    assert.match(css, /\.custom-editor-layer svg\s*\{[^}]*?stroke:\s*currentColor/);
  });

  it("states each toggle's label once, in the markup", () => {
    // The chevrons only ever collapse and the rails only ever expand, so every
    // label is constant and lives in the HTML. app.js syncs aria-expanded only.
    assert.match(html, /id="slidePanelCollapseBtn"[\s\S]*?슬라이드 목록 닫기/);
    assert.match(html, /id="inspectorPanelCollapseBtn"[\s\S]*?속성 패널 닫기/);
    for (const label of [
      "슬라이드 목록 닫기",
      "슬라이드 목록 열기",
      "속성 패널 닫기",
      "속성 패널 열기",
    ]) {
      assert.doesNotMatch(appSource, new RegExp(`"${label}"`));
    }
  });
});
