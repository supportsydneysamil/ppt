import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  applyWorkspaceLayoutState,
  resolveWorkspaceLayoutState,
} from "../public/workspace-layout.js";

const [css, appSource] = await Promise.all([
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

describe("workspace layout state", () => {
  it("keeps the extractor on the reading-width surface", () => {
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "extractor",
        pptTab: "slides",
        activeTemplateId: null,
      }),
      { workspace: "extractor", pptSurface: null }
    );
  });

  it("uses gallery width only for the template gallery", () => {
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "ppt",
        pptTab: "templates",
        activeTemplateId: null,
      }),
      { workspace: "ppt", pptSurface: "gallery" }
    );
  });

  it("uses editor width for slides and an open template", () => {
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "ppt",
        pptTab: "slides",
        activeTemplateId: null,
      }),
      { workspace: "ppt", pptSurface: "editor" }
    );
    assert.deepEqual(
      resolveWorkspaceLayoutState({
        viewName: "ppt",
        pptTab: "templates",
        activeTemplateId: "template-1",
      }),
      { workspace: "ppt", pptSurface: "editor" }
    );
  });

  it("writes and removes the shell data attributes", () => {
    const element = { dataset: {} };
    applyWorkspaceLayoutState(element, {
      workspace: "ppt",
      pptSurface: "gallery",
    });
    assert.deepEqual(element.dataset, {
      workspace: "ppt",
      pptSurface: "gallery",
    });

    applyWorkspaceLayoutState(element, {
      workspace: "extractor",
      pptSurface: null,
    });
    assert.equal(element.dataset.workspace, "extractor");
    assert.equal("pptSurface" in element.dataset, false);
  });
});

describe("workspace shell wiring", () => {
  it("declares distinct extractor, gallery, and editor maximum widths", () => {
    assert.match(css, /--workspace-max:\s*980px/);
    assert.match(
      css,
      /\.page\[data-workspace="ppt"\]\[data-ppt-surface="gallery"\][\s\S]*--workspace-max:\s*1400px/
    );
    assert.match(
      css,
      /\.page\[data-workspace="ppt"\]\[data-ppt-surface="editor"\][\s\S]*--workspace-max:\s*1600px/
    );
  });

  it("syncs layout state from both view and PPT-surface transitions", () => {
    assert.match(appSource, /function syncWorkspaceLayoutState\(/);
    assert.match(
      appSource,
      /function applyViewChange\([\s\S]*syncWorkspaceLayoutState\(viewName\)/
    );
    assert.match(
      appSource,
      /function renderPptScreen\([\s\S]*syncWorkspaceLayoutState\("ppt"\)/
    );
  });
});
