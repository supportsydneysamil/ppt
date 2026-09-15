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

export function createWidthReflowCoordinator({
  measure,
  reflow,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
} = {}) {
  let frameId = null;
  let lastWidth = 0;
  let forceNext = false;

  function run() {
    frameId = null;
    const width = Math.round(Number(measure?.()) || 0);
    const forced = forceNext;
    forceNext = false;
    if (width <= 0 || (!forced && width === lastWidth)) {
      return;
    }
    lastWidth = width;
    reflow?.(width);
  }

  return {
    schedule({ force = false } = {}) {
      forceNext ||= force;
      if (frameId !== null) {
        return;
      }
      if (typeof requestFrame !== "function") {
        run();
        return;
      }
      frameId = requestFrame(run);
    },
    disconnect() {
      if (frameId !== null && typeof cancelFrame === "function") {
        cancelFrame(frameId);
      }
      frameId = null;
      forceNext = false;
    },
  };
}
