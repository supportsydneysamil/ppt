export function resolveWorkspaceLayoutState({
  viewName,
  pptTab,
  activeTemplateId,
} = {}) {
  const workspace = viewName === "ppt" ? "ppt" : "extractor";
  if (workspace === "extractor") {
    return { workspace, pptSurface: null };
  }

  const isTemplateGallery = pptTab === "templates" && !activeTemplateId;
  return {
    workspace,
    pptSurface: isTemplateGallery ? "gallery" : "editor",
  };
}

export function applyWorkspaceLayoutState(element, state) {
  if (!element) {
    return state;
  }

  element.dataset.workspace = state.workspace;
  if (state.pptSurface) {
    element.dataset.pptSurface = state.pptSurface;
  } else {
    delete element.dataset.pptSurface;
  }
  return state;
}
