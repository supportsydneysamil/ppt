import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyWorkspaceLayoutState,
  resolveWorkspaceLayoutState,
} from "../public/workspace-layout.js";

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
