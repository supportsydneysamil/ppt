export function pptWorkspaceMode(width) {
  const value = Number(width) || 0;
  if (value >= 1280) return "wide";
  if (value >= 900) return "compact";
  return "mobile";
}

export function createPptWorkspaceUiState(width, preference = {}) {
  const mode = pptWorkspaceMode(width);
  const focusMode = mode !== "mobile" && Boolean(preference.focusMode);

  if (mode === "mobile") {
    return {
      mode,
      focusMode: false,
      slidesOpen: true,
      inspectorOpen: true,
    };
  }
  if (focusMode) {
    return {
      mode,
      focusMode: true,
      slidesOpen: false,
      inspectorOpen: false,
    };
  }
  if (mode === "compact") {
    return {
      mode,
      focusMode: false,
      slidesOpen: Boolean(preference.slidesOpen),
      inspectorOpen:
        !preference.slidesOpen && Boolean(preference.inspectorOpen),
    };
  }
  return {
    mode,
    focusMode: false,
    slidesOpen: preference.slidesOpen !== false,
    inspectorOpen: preference.inspectorOpen !== false,
  };
}

export function reducePptWorkspaceUi(state, action = {}) {
  if (action.type === "resize") {
    return createPptWorkspaceUiState(action.width, state);
  }
  if (action.type === "toggle-focus" && state.mode !== "mobile") {
    return state.focusMode
      ? createPptWorkspaceUiState(state.mode === "wide" ? 1280 : 900)
      : {
          ...state,
          focusMode: true,
          slidesOpen: false,
          inspectorOpen: false,
        };
  }
  if (action.type === "toggle-slides" && state.mode !== "mobile") {
    const slidesOpen = !state.slidesOpen;
    return {
      ...state,
      focusMode: false,
      slidesOpen,
      inspectorOpen:
        state.mode === "compact" && slidesOpen
          ? false
          : state.inspectorOpen,
    };
  }
  if (action.type === "toggle-inspector" && state.mode !== "mobile") {
    const inspectorOpen = !state.inspectorOpen;
    return {
      ...state,
      focusMode: false,
      inspectorOpen,
      slidesOpen:
        state.mode === "compact" && inspectorOpen
          ? false
          : state.slidesOpen,
    };
  }
  if (action.type === "close-drawers" && state.mode === "compact") {
    return {
      ...state,
      slidesOpen: false,
      inspectorOpen: false,
    };
  }
  if (action.type === "show-inspector" && state.mode === "compact") {
    return {
      ...state,
      focusMode: false,
      slidesOpen: false,
      inspectorOpen: true,
    };
  }
  return state;
}
