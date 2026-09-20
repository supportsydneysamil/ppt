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
      prefer: { slidesOpen: true, inspectorOpen: true },
    });
  });

  it("reopens a pane compact had no room for once the window grows", () => {
    // Compact shows one drawer at a time, so widening the slide list closes the
    // inspector. That is the width talking, not the user, and wide must not
    // read it back as a collapse they asked for.
    const wide = createPptWorkspaceUiState(1440);
    const compact = reducePptWorkspaceUi(wide, { type: "resize", width: 1024 });
    assert.equal(compact.inspectorOpen, false);
    assert.deepEqual(compact.prefer, { slidesOpen: true, inspectorOpen: true });

    const back = reducePptWorkspaceUi(compact, { type: "resize", width: 1440 });
    assert.equal(back.inspectorOpen, true);
    assert.equal(back.slidesOpen, true);
  });

  it("keeps a collapse the user asked for across a width round trip", () => {
    const collapsed = reducePptWorkspaceUi(createPptWorkspaceUiState(1440), {
      type: "toggle-inspector",
    });
    assert.equal(collapsed.inspectorOpen, false);
    assert.equal(collapsed.prefer.inspectorOpen, false);

    const compact = reducePptWorkspaceUi(collapsed, {
      type: "resize",
      width: 1024,
    });
    const back = reducePptWorkspaceUi(compact, { type: "resize", width: 1440 });
    assert.equal(back.inspectorOpen, false);
  });

  it("restores the panes a stored preference asked for", () => {
    // Older stored state has no `prefer` of its own, so the flat fields it does
    // have are the choice to carry forward.
    assert.deepEqual(
      createPptWorkspaceUiState(1440, { slidesOpen: false, inspectorOpen: true })
        .prefer,
      { slidesOpen: false, inspectorOpen: true }
    );
    assert.equal(
      createPptWorkspaceUiState(1440, { slidesOpen: false }).slidesOpen,
      false
    );
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
        prefer: { slidesOpen: true, inspectorOpen: true },
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
        prefer: { slidesOpen: false, inspectorOpen: false },
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
      prefer: { slidesOpen: true, inspectorOpen: true },
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
      prefer: { slidesOpen: true, inspectorOpen: true },
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
      prefer: { slidesOpen: true, inspectorOpen: true },
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
        prefer: { slidesOpen: true, inspectorOpen: true },
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
        prefer: { slidesOpen: true, inspectorOpen: true },
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

  // One bar, one scope. The tab bar owns what the workspace shows; the slide
  // list owns the list and its selection; the editor header owns the open
  // slide. A command placed a level away from its target reads as a different
  // command.
  it("gathers every view toggle in the tab bar", () => {
    const actions = html.slice(
      html.indexOf('id="pptTabbarActions"'),
      html.indexOf('<section id="templateGallery"')
    );
    assert.match(actions, /id="pptSlidesPaneBtn"/);
    assert.match(actions, /id="pptInspectorPaneBtn"/);
    assert.match(actions, /id="pptFocusModeBtn"/);
    assert.match(actions, /id="customEditorPopoutBtn"/);
    assert.doesNotMatch(actions, /id="bulkActionMenuBtn"/);
  });

  it("keeps selection actions beside the selection they act on", () => {
    const toolbar = html.slice(
      html.indexOf('<div class="slide-list-toolbar">'),
      html.indexOf('id="slideListContainer"')
    );
    assert.match(
      toolbar,
      /id="selectAllSlidesCheckbox"[\s\S]*id="bulkActionMenuBtn"[\s\S]*id="bulkActionDropdown"/
    );
  });

  // The list scrolls, so how many slides are selected cannot be read off the
  // cards. The number belongs on the button that acts on them rather than in a
  // badge that is secretly also the clear button.
  it("carries the selection count on the action button", () => {
    assert.doesNotMatch(html, /selection-clear-pill/);
    assert.doesNotMatch(html, /id="clearSelectionBtn"/);
    assert.match(
      html,
      /id="bulkActionMenuBtn"[\s\S]*?id="selectedCountBadge"/
    );
    assert.match(
      html,
      /id="bulkClearSelectionBtn"[^>]*role="menuitem"[^>]*>선택 해제</
    );
    assert.match(
      appSource,
      /selectedCountBadge\.textContent = String\(selectedCount\)/
    );
    assert.match(
      appSource,
      /bulkClearSelectionBtn\.addEventListener\([\s\S]*?clearSlideSelection/
    );
  });

  it("leaves the editor header holding slide actions only", () => {
    const header = html.slice(
      html.indexOf('<div class="editor-header">'),
      html.indexOf('<form id="slideForm"')
    );
    assert.doesNotMatch(header, /id="pptInspectorPaneBtn"/);
    assert.doesNotMatch(header, /id="pptFocusModeBtn"/);
    assert.doesNotMatch(header, /id="customEditorPopoutBtn"/);
    assert.match(header, /id="editorSaveBtn"/);
  });

  // Duplicating the open slide is a slide action, so it belongs with the other
  // slide actions rather than in the list's own toolbar.
  it("offers slide duplication from the card and the editor menu only", () => {
    assert.doesNotMatch(html, /id="duplicateSlideBtn"/);
    assert.doesNotMatch(appSource, /duplicateSlideBtn/);
    assert.match(html, /id="editorDuplicateBtn"/);
  });

  // Six near-identical open/close pairs each had to remember to close the
  // other five, so every new menu was a chance to leave one open.
  it("runs every popup menu through one controller", () => {
    assert.match(appSource, /let activePopupMenu = null/);
    assert.match(appSource, /function openPopupMenu\(/);
    assert.match(appSource, /function closePopupMenu\(/);

    for (const gone of [
      "closeBulkDropdown",
      "closeAddSlideDropdown",
      "openAddSlideDropdown",
      "closeEditorMoreMenu",
      "closeSlideCardMenu",
      "closeTemplateWorkspaceMenu",
      "closeTemplateCardMenus",
      "toggleEditorMoreMenu",
      "toggleTemplateWorkspaceMenu",
    ]) {
      assert.doesNotMatch(
        appSource,
        new RegExp(`function ${gone}\\(`),
        `${gone} should be replaced by the shared popup controller`
      );
    }
  });

  // One name per action. The header reverts the whole slide, the ribbon steps
  // the canvas back; calling both 되돌리기 made them read as one control.
  it("names each action the same way everywhere", () => {
    assert.doesNotMatch(html, /되돌리기/);
    assert.match(html, /data-editor-action="undo"[^>]*>실행 취소</);
    assert.match(html, /id="editorCancelBtn"[^>]*>변경 취소</);
    assert.match(html, /id="editorDuplicateBtn"[^>]*>슬라이드 복제</);
    assert.match(html, /id="editorDeleteBtn"[^>]*>슬라이드 삭제</);
    // Inside the selection menu the count beside it already says what is
    // affected, so the items do not repeat it.
    assert.match(html, /id="bulkDeleteBtn"[^>]*>삭제</);
    assert.match(html, /id="bulkDownloadBtn"[^>]*>묶음 다운로드</);
  });

  it("gives every popup menu the same semantics and Escape behaviour", () => {
    for (const trigger of [
      "addSlideMenuBtn",
      "bulkActionMenuBtn",
      "editorMoreBtn",
      "templateWorkspaceMenuBtn",
    ]) {
      const markup = html.slice(
        html.indexOf(`id="${trigger}"`),
        html.indexOf(`id="${trigger}"`) + 400
      );
      assert.match(markup, /aria-haspopup="menu"/, `${trigger} aria-haspopup`);
      assert.match(markup, /aria-expanded="false"/, `${trigger} aria-expanded`);
    }
    for (const menu of [
      "addSlideDropdown",
      "bulkActionDropdown",
      "editorMoreMenu",
      "templateWorkspaceMenu",
    ]) {
      const markup = html.slice(
        html.indexOf(`id="${menu}"`),
        html.indexOf(`id="${menu}"`) + 300
      );
      assert.match(markup, /role="menu"/, `${menu} role`);
    }
    // Card menus are built at render time, so their semantics live in code.
    assert.match(appSource, /menuBtn\.setAttribute\("aria-haspopup", "menu"\)/);
    assert.match(appSource, /moreBtn\.setAttribute\("aria-haspopup", "menu"\)/);
    assert.match(appSource, /closePopupMenu\(\{ restoreFocus: true \}\)/);
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
      /<form id="slideForm" class="editor-form">\s*<div class="inspector-header">\s*<h4>속성<\/h4>\s*<button\s*id="inspectorPanelCollapseBtn"/
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
      /\.editor-form\s*\{[^}]*?border-left:\s*1px solid var\(--border\)/
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

  it("keeps the scrolling panes from reserving a scrollbar gutter", () => {
    // A classic bar would take layout width from all three, shifting the rows
    // sideways and, on the stage, oscillating the canvas fit.
    const hides = css.match(/([^}]*?)\{\s*scrollbar-width:\s*none;?\s*\}/);
    const hidesWebkit = css.match(/([^}]*?)::-webkit-scrollbar\s*\{\s*width:\s*0;\s*height:\s*0/);
    assert.ok(hides && hidesWebkit, "the panes should share one hiding rule");
    for (const region of [
      ".slide-cards",
      ".editor-form",
      ".custom-editor-stage",
      ".custom-title-category-group",
      ".preview-stage",
      ".custom-editor-body",
      "#view-extractor",
      ".template-gallery",
    ]) {
      assert.ok(
        hides[1].includes(region),
        `${region} is missing from the scrollbar-width rule`
      );
      assert.ok(
        hidesWebkit[1].includes(region),
        `${region} is missing from the webkit rule`
      );
    }
    // The chip row used to keep a thin bar, which reserved a gutter inside the
    // inspector and shifted its rows.
    assert.doesNotMatch(
      css,
      /\.custom-title-category-group\s*\{[^}]*scrollbar-width:\s*thin/
    );
    // An inline canvas leaves a descender under itself, which scrolls the stage
    // by those few pixels no matter how well the canvas is fitted.
    assert.match(
      css,
      /\.custom-editor-stage \.canvas-container canvas\s*\{\s*display:\s*block/
    );
  });

  it("gives every view the same shell so the page never scrolls", () => {
    // A document view and a shell view disagree about the page's scrollbar, and
    // that disagreement shifted the centred layout on every view switch.
    assert.match(css, /@media \(min-width: 900px\) \{\s*html,\s*body\s*\{\s*height:\s*100%;\s*overflow:\s*hidden/);
    assert.match(
      css,
      /\.page\s*\{\s*height:\s*100dvh;\s*grid-template-rows:\s*auto minmax\(0, 1fr\)/
    );
    // The surface rule keeps only what is specific to the editor now.
    assert.doesNotMatch(
      css,
      /\.page\[data-ppt-surface="editor"\]\s*\{[^}]*height:\s*100dvh/
    );
  });

  it("hands each view a region that scrolls in the page's place", () => {
    assert.match(css, /#view-extractor \{\s*max-width:\s*none;\s*overflow-y:\s*auto/);
    assert.match(css, /#view-extractor > \*\s*\{\s*max-width:\s*932px;\s*margin-inline:\s*auto/);
    assert.match(
      css,
      /\.page\[data-ppt-surface="gallery"\] \.template-gallery\s*\{[\s\S]*?overflow-y:\s*auto/
    );
  });

  it("holds the bar's width open where the page is still a document", () => {
    assert.match(
      css,
      /@media \(max-width: 899px\) \{\s*html\s*\{\s*scrollbar-gutter:\s*stable/
    );
  });

  it("renders the shell's chrome in one place for every view", () => {
    // Tighter page padding on the editor moved the nav 24px up whenever you
    // opened it, which read as the page jumping on every view switch.
    assert.doesNotMatch(
      css,
      /\.page\[data-ppt-surface="editor"\]\s*\{[^}]*padding-top/
    );
    assert.doesNotMatch(css, /\.page\[data-ppt-surface="editor"\]\s*\{[^}]*gap:/);
    // The regions carry the page's bottom margin inside themselves, so their
    // content scrolls to the window rather than stopping short of it.
    assert.match(css, /#view-extractor \{[\s\S]*?padding-bottom:\s*48px/);
  });

  it("scrolls the stage rather than shrinking or cutting the preview", () => {
    // The box takes its height from its width through the 16:9 ratio, so a
    // short window used to cut it off. It keeps that size — it is the thing
    // being judged — and the row around it scrolls when the shell runs short.
    assert.match(
      html,
      /<div class="preview-stage">\s*<div id="slidePreview" class="slide-preview-box">/
    );
    assert.match(
      css,
      /\.page\[data-ppt-surface="editor"\] \.preview-stage \{\s*overflow-y:\s*auto/
    );
    assert.match(
      css,
      /\.page\[data-ppt-surface="editor"\] \.custom-editor-body \{[\s\S]*?overflow-y:\s*auto/
    );
    assert.match(css, /\.slide-preview-box \{[\s\S]*?width:\s*100%;\s*aspect-ratio:\s*16 \/ 9/);
  });

  it("keeps the shell's rules in the breakpoint that needs them", () => {
    // Inserting a rule between the two blocks once swallowed the whole editor
    // shell into the narrow one, which left the panes measuring themselves
    // against the document cap and running off the bottom of the window.
    const shell = css.match(
      /App shell: every view owns the viewport[\s\S]*?@media \(min-width: 900px\) \{([\s\S]*?)\n\}/
    );
    const narrow = css.match(/@media \(max-width: 899px\) \{([\s\S]*?)\n\}/);
    assert.ok(shell && narrow, "both breakpoint blocks should exist");
    assert.match(shell[1], /\.page\[data-ppt-surface="editor"\] \.slide-editor-panel/);
    assert.match(shell[1], /--stage-max-h:\s*none/);
    assert.doesNotMatch(narrow[1], /data-ppt-surface/);
  });

  it("keeps the tab row one height whether or not its actions are there", () => {
    // The bulk actions show on the slide list only and stand taller than the
    // tabs, so the bottom-aligned row shrank on the gallery tab and nudged the
    // tabs and the content under them.
    assert.match(
      css,
      /\.ppt-tabbar \{[\s\S]*?min-height:\s*calc\(var\(--ctrl-h-sm\) \+ var\(--sp-2\) \+ 1px\)/
    );
  });

  it("lets the visible view decide the page's layout state", () => {
    // renderPptScreen runs at startup while the extractor is showing, so
    // naming the view there left the page wearing the editor's layout — and
    // its scrollbar — under the extractor until the first trip through the tabs.
    assert.doesNotMatch(appSource, /syncWorkspaceLayoutState\("ppt"\)/);
    assert.match(
      appSource,
      /const currentView =\s*viewName \?\?\s*\(navExtractor\.classList\.contains\("active"\) \? "extractor" : "ppt"\)/
    );
  });

  it("names the theme to the browser so it draws its own parts to match", () => {
    assert.match(css, /:root \{[\s\S]*?color-scheme:\s*dark/);
    assert.match(css, /body\[data-theme="light"\] \{\s*color-scheme:\s*light/);
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
    // The design and tool bands now share one ribbon row. Only the stage may
    // absorb free height, so revealing property panels cannot grow the ribbon.
    assert.match(
      css,
      /\[data-slide-type="custom"\] \.custom-editor\[data-react-chrome="true"\]:not\(\[hidden\]\)\s*\{[^}]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/
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
      /<div\s+id="customEditorInspectorHost"\s+class="custom-editor-inspector-host"\s+hidden\s*>/
    );
    // Hiding the editor section no longer hides the panels with it, so the
    // slot has to follow the same visibility switch every other type-specific
    // group does. Otherwise every slide type grows a layers panel.
    assert.match(
      appSource,
      /setHidden\(\s*customEditorInspectorHost,\s*!customVisibility\.showCustomWorkspace\s*\)/
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
    assert.match(html, /<div class="inspector-header">\s*<h4>속성<\/h4>/);
    assert.match(
      html,
      /id="inspectorRailBtn"[\s\S]*?<span class="panel-rail-label">속성<\/span>/
    );
  });

  it("stacks inspector fields as identity, source, content, then appearance", () => {
    const form = html.slice(
      html.indexOf('<form id="slideForm"'),
      html.indexOf("</form>", html.indexOf('<form id="slideForm"'))
    );
    assert.match(
      form,
      /id="slideName"[\s\S]*?id="slideType"[\s\S]*?id="simpleSlideSettings"/
    );

    const simple = form.slice(
      form.indexOf('id="simpleSlideSettings"'),
      form.indexOf('id="hymnSlideSettings"')
    );
    assert.match(
      simple,
      /소스 선택[\s\S]*?id="adContentSettings"[\s\S]*?id="basicSettingsMode"[\s\S]*?id="bgSettings"[\s\S]*?id="uploadSettingsMode"/
    );
    assert.match(
      simple,
      /id="uploadSettingsMode"[\s\S]*?class="rte-panel"[\s\S]*?rte-panel-label">파일/
    );

    const hymn = form.slice(
      form.indexOf('id="hymnSlideSettings"'),
      form.indexOf('id="scriptureSlideSettings"')
    );
    assert.match(
      hymn,
      /rte-panel-label">내용[\s\S]*?id="hymnNumber"[\s\S]*?rte-panel-label">제목 슬라이드[\s\S]*?id="hymnKorTitle"/
    );
    assert.match(
      hymn,
      /rte-row-label" for="hymnKorTitle">한국어 제목[\s\S]*?rte-row-label" for="hymnEngTitle">영어 제목/
    );

    const scripture = form.slice(
      form.indexOf('id="scriptureSlideSettings"'),
      form.indexOf('id="titleSlideSettings"')
    );
    const contentAt = scripture.indexOf('id="scriptureTestament"');
    const titleAt = scripture.indexOf('rte-panel-label">제목 슬라이드');
    const themeAt = scripture.indexOf("테마와 배경");
    const generateAt = scripture.indexOf('id="scriptureGenerateBtn"');
    assert.ok(contentAt > -1 && titleAt > contentAt);
    assert.ok(themeAt > titleAt);
    assert.ok(generateAt > themeAt);
    assert.doesNotMatch(scripture, /<span>상세 설정<\/span>/);
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

  it("scrolls a newly added slide card into the list's view", () => {
    // The list scrolls, so a card added below the fold looked like the 추가
    // button had done nothing and invited a second press.
    assert.match(appSource, /function revealSlideCard\(/);
    assert.match(
      appSource,
      /renderSlideList\(\);\s*revealSlideCard\(newSlide\.id\)/
    );
    assert.match(
      appSource,
      /function finishDuplicate\([\s\S]*revealSlideCard\(duplicate\.id\)/
    );
    // "nearest" leaves an already visible card alone instead of recentering.
    assert.match(appSource, /scrollIntoView\(\{\s*block: "nearest"/);
    assert.match(appSource, /prefers-reduced-motion: reduce/);
  });

  it("builds a Word-style ribbon with stable named categories", () => {
    assert.match(chromeSource, /role="tablist"/);
    assert.match(chromeSource, /role="tab"/);
    assert.match(chromeSource, /role="tabpanel"/);
    assert.match(chromeSource, /CUSTOM_EDITOR_RIBBON_TABS\.map/);
    assert.match(chromeSource, /ribbonTabIndexForKey/);
    assert.match(chromeSource, /custom-editor-ribbon-quick-access/);
    assert.doesNotMatch(chromeSource, /RibbonOverflowMenu/);
    assert.doesNotMatch(chromeSource, /MoreHorizontal/);
    assert.doesNotMatch(chromeSource, /label="정렬·배치"/);
    assert.match(
      chromeSource,
      /action="align-middle"[\s\S]{0,80}AlignVerticalJustifyCenter/
    );
    for (const label of [
      "템플릿",
      "테마 및 배경",
      "보기",
      "콘텐츠",
      "도형",
      "슬라이드에 맞춤",
      "선택 개체에 맞춤",
      "쌓는 순서",
      "개체 관리",
    ]) {
      assert.match(chromeSource, new RegExp(`label="${label}"`));
    }
    assert.match(css, /\.custom-editor-ribbon-tablist\s*\{/);
    assert.match(css, /\.custom-editor-ribbon-panel\s*\{/);
    assert.match(css, /\.custom-editor-ribbon-group-label\s*\{/);
    assert.match(
      css,
      /\.custom-editor-ribbon-field select,\s*\.custom-editor-ribbon-panel \.custom-color-picker-value\s*\{[^}]*?border:\s*1px solid var\(--border\)[^}]*?border-radius:\s*9px[^}]*?background:\s*var\(--panel\)/
    );
    assert.match(
      css,
      /\.custom-editor-ribbon-field select:focus-visible,\s*\.custom-editor-ribbon-panel \.custom-color-picker-value:focus-visible\s*\{[^}]*?box-shadow:\s*var\(--focus-ring\)/
    );
    assert.match(
      css,
      /\.custom-editor-ribbon-panel \.pickr \.pcr-button\s*\{[^}]*?border-radius:\s*9px/
    );
    assert.equal(
      (chromeSource.match(/<ColorPicker[\s\S]*?background/g) ?? []).length,
      1
    );
  });

  it("leaves the first-band editor header outside the custom ribbon", () => {
    const headerEnd = html.indexOf('<form id="slideForm"');
    const header = html.slice(html.indexOf('<div class="editor-header">'), headerEnd);
    assert.match(header, /<h3>슬라이드 편집<\/h3>/);
    assert.match(header, /id="editorSaveBtn"/);
    assert.doesNotMatch(header, /custom-editor-ribbon/);
  });

  it("orders the editor header as revert, download, save, then more", () => {
    const headerEnd = html.indexOf('<form id="slideForm"');
    const header = html.slice(html.indexOf('<div class="editor-header">'), headerEnd);
    const docGroup = header.indexOf('aria-label="슬라이드 작업"');
    assert.ok(docGroup > -1);

    const doc = header.slice(docGroup);
    assert.match(doc, /id="editorCancelBtn"[^>]*>변경 취소</);
    assert.match(
      doc,
      /id="editorDownloadBtn"[\s\S]*?id="editorSaveBtn"[\s\S]*?id="editorMoreBtn"/
    );
  });

  it("keeps saving from rearranging the editor command bar", () => {
    const headerEnd = html.indexOf('<form id="slideForm"');
    const header = html.slice(html.indexOf('<div class="editor-header">'), headerEnd);
    // A button that appears only after a save would shift its neighbours and
    // read as a different toolbar, so availability is the only thing that moves.
    assert.doesNotMatch(header, /id="editorDownloadBtn"[^>]*style="display:none;"/);
    assert.doesNotMatch(header, /id="editorDeleteBtn"[^>]*style="display:none;"/);
    assert.doesNotMatch(appSource, /editorDownloadBtn\.style\.display/);
    assert.doesNotMatch(appSource, /editorDeleteBtn\.style\.display/);
    assert.doesNotMatch(appSource, /editorCancelBtn\.style\.display/);
    assert.match(appSource, /editorDownloadBtn\.disabled = unsaved/);
  });

  it("keeps save feedback inside a stable button shell", () => {
    assert.match(
      html,
      /id="editorSaveBtn"[^>]*class="cta small"[\s\S]*?class="save-label">저장/
    );
    assert.match(
      html,
      /id="editorSaveStatus"[^>]*class="visually-hidden"[^>]*aria-live="polite"/
    );
    assert.doesNotMatch(css, /#editorSaveBtn\.is-dirty::after/);
    // Reserving room for a spinner left visible dead space beside the label,
    // so the busy state may not claim layout the idle button does not need.
    assert.doesNotMatch(html, /save-progress-slot/);
    assert.doesNotMatch(css, /#editorSaveBtn\s*\{[^}]*min-width/);
    assert.doesNotMatch(
      appSource,
      /editorSaveBtn\.classList\.toggle\("is-dirty"/
    );
    assert.doesNotMatch(appSource, /editorSaveBtn\.textContent\s*=/);
    assert.match(
      appSource,
      /editorSaveBtn\.setAttribute\("aria-busy", "true"\)/
    );
    assert.match(appSource, /editorSaveBtn\.removeAttribute\("aria-busy"\)/);
  });

  it("puts duplicate, reset, and delete in editor overflow order", () => {
    assert.match(
      html,
      /id="editorMoreBtn"[\s\S]*?aria-haspopup="menu"[\s\S]*?id="editorMoreMenu"[\s\S]*?id="editorDuplicateBtn"[\s\S]*?id="editorResetBtn"[\s\S]*?id="editorDeleteBtn"/
    );
    assert.match(
      appSource,
      /editorDuplicateBtn\.addEventListener\("click",[\s\S]*?duplicateCurrentSlide/
    );
    assert.match(
      appSource,
      /openPopupMenu\(editorMoreBtn, editorMoreMenu\)/
    );
  });

  it("reverts only to a saved record and discards new slides through delete", () => {
    assert.match(appSource, /function discardUnsavedSlide\(/);
    // Revert with no saved record behind it would silently delete the slide.
    assert.match(
      appSource,
      /function cancelEdit\(\)[\s\S]*?if \(isSlideUnsaved\(slide\)\) return;/
    );
    assert.match(
      appSource,
      /async function deleteSlideById\(slideId\)[\s\S]*?isSlideUnsaved\(slide\)/
    );
  });

  it("addresses deletion by slide id without forcing current selection", () => {
    assert.match(
      appSource,
      /async function deleteSlideById\(slideId\)[\s\S]*?slides\.find\(\(entry\) => entry\.id === slideId\)/
    );
    assert.match(appSource, /const deletesCurrent = slideId === currentSlideId/);
    assert.match(
      appSource,
      /const neighborId = deletesCurrent\s*\?\s*resolveAdjacentSlideId/
    );
    assert.match(
      appSource,
      /function deleteCurrentSlide\(\)\s*\{\s*return deleteSlideById\(currentSlideId\)/
    );
  });

  it("renders an accessible per-card duplicate and delete menu", () => {
    assert.match(appSource, /function renderSlideList\(\)[\s\S]*slide-card-more-btn/);
    assert.match(appSource, /`\$\{slide\.name\} 작업 메뉴`/);
    assert.match(
      appSource,
      /duplicateSlideById\(slide\.id,\s*\{\s*selectDuplicate:\s*false\s*\}\)/
    );
    assert.match(appSource, /deleteSlideById\(slide\.id\)/);
    assert.match(appSource, /card\.draggable = false/);
    assert.match(css, /\.slide-card-menu\s*\{/);
  });

  it("closes card menus on outside click and Escape", () => {
    assert.match(appSource, /openPopupMenu\(moreBtn, cardMenu/);
    assert.match(
      appSource,
      /if \(!activePopupMenu\) return;[\s\S]*?closePopupMenu\(\)/
    );
    assert.match(
      appSource,
      /if \(e\.key !== "Escape"\) return;\s*closePopupMenu\(\{ restoreFocus: true \}\)/
    );
    // A card that stays draggable while its menu is open drags the two apart.
    assert.match(appSource, /onOpen: \(\) => \{\s*card\.draggable = false/);
    assert.match(appSource, /onClose: \(\) => \{\s*card\.draggable = true/);
  });

  it("keeps the ribbon in one column in compact and mobile layouts", () => {
    const compactRule =
      /@media\s*\(min-width:\s*900px\)\s*and\s*\(max-width:\s*1279px\)[\s\S]*?\.slide-editor-panel\[data-slide-type="custom"\][\s\S]*?grid-template-areas:\s*"ribbon"\s*"stage"\s*"status"/;
    const mobileRule =
      /@media\s*\(max-width:\s*899px\)[\s\S]*?\.slide-editor-panel\[data-slide-type="custom"\][\s\S]*?grid-template-areas:\s*"ribbon"\s*"stage"\s*"status"/;
    assert.match(css, compactRule);
    assert.match(css, mobileRule);
    assert.doesNotMatch(
      css,
      /grid-template-areas:\s*"bar"\s*"tools"\s*"stage"\s*"status"/
    );
  });

  it("keeps a functional category fallback when React chrome is unavailable", () => {
    assert.match(
      html,
      /custom-editor-ribbon--fallback[\s\S]*?role="tablist"[\s\S]*?>디자인<[\s\S]*?>삽입<[\s\S]*?>정렬<[\s\S]*?>배치</
    );
    assert.match(html, /data-fallback-ribbon-panel="design"/);
    assert.match(html, /data-fallback-ribbon-panel="insert"/);
    assert.match(html, /data-fallback-ribbon-panel="align"/);
    assert.match(html, /data-fallback-ribbon-panel="arrange"/);
    assert.match(
      css,
      /\.custom-editor-ribbon--fallback:has\(#fallbackRibbonInsert:checked\)[\s\S]*?data-fallback-ribbon-panel="insert"/
    );
  });

  it("exposes native image controls with accessible inspector fields", () => {
    assert.match(chromeSource, /data-editor-action="replace-image"/);
    assert.match(
      chromeSource,
      /type="radio"[\s\S]*?value="contain"[\s\S]*?data-editor-field="fit"/
    );
    assert.match(
      chromeSource,
      /type="radio"[\s\S]*?value="cover"[\s\S]*?data-editor-field="fit"/
    );
    assert.match(
      chromeSource,
      /type="radio"[\s\S]*?value="stretch"[\s\S]*?data-editor-field="fit"/
    );
    assert.match(chromeSource, />전체 보기</);
    assert.match(chromeSource, />프레임 채우기</);
    assert.match(chromeSource, />늘여서 채우기</);
    assert.match(chromeSource, /data-editor-field="focalX"/);
    assert.match(chromeSource, /data-editor-field="focalY"/);
    assert.match(chromeSource, /data-editor-field="imageZoom"/);
    assert.match(chromeSource, /data-editor-action="image-focal-0-1"/);
    assert.match(chromeSource, /data-editor-action="reset-image-crop"/);
    assert.match(chromeSource, /field="flipH"/);
    assert.match(chromeSource, /field="flipV"/);
    assert.match(
      chromeSource,
      /maxLength=\{500\}[\s\S]*?data-editor-field="altText"/
    );
    assert.match(html, /data-editor-action="replace-image"/);
    assert.match(html, /data-editor-field="flipH"/);
    assert.match(html, /data-editor-field="flipV"/);
    assert.match(html, /data-editor-field="altText"/);
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
