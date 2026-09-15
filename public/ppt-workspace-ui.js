export function pptWorkspaceMode(width) {
  const value = Number(width) || 0;
  if (value >= 1280) return "wide";
  if (value >= 900) return "compact";
  return "mobile";
}

/* What the user last asked for, kept apart from what the current width can
   actually show. Compact has room for one drawer and mobile shows everything
   stacked, so both of them overrule the panes on their own; recording that as a
   choice would make a narrow window look like a collapse the user requested,
   and the pane would stay shut after the window grew back. Older stored state
   predates this split, so its flat fields stand in for it. */
function preferredPanes(preference) {
  const prefer = preference.prefer ?? {};
  return {
    slidesOpen: prefer.slidesOpen ?? preference.slidesOpen !== false,
    inspectorOpen: prefer.inspectorOpen ?? preference.inspectorOpen !== false,
  };
}

export function createPptWorkspaceUiState(width, preference = {}) {
  const mode = pptWorkspaceMode(width);
  const focusMode = mode !== "mobile" && Boolean(preference.focusMode);
  const prefer = preferredPanes(preference);

  if (mode === "mobile") {
    return {
      mode,
      focusMode: false,
      slidesOpen: true,
      inspectorOpen: true,
      prefer,
    };
  }
  if (focusMode) {
    return {
      mode,
      focusMode: true,
      slidesOpen: false,
      inspectorOpen: false,
      prefer,
    };
  }
  if (mode === "compact") {
    // Drawers are transient overlays rather than panes, so they follow whatever
    // was on screen a moment ago, not the standing preference.
    return {
      mode,
      focusMode: false,
      slidesOpen: Boolean(preference.slidesOpen),
      inspectorOpen:
        !preference.slidesOpen && Boolean(preference.inspectorOpen),
      prefer,
    };
  }
  return {
    mode,
    focusMode: false,
    slidesOpen: prefer.slidesOpen,
    inspectorOpen: prefer.inspectorOpen,
    prefer,
  };
}

export function reducePptWorkspaceUi(state, action = {}) {
  if (action.type === "resize") {
    return createPptWorkspaceUiState(action.width, state);
  }
  if (action.type === "toggle-focus" && state.mode !== "mobile") {
    return state.focusMode
      ? createPptWorkspaceUiState(state.mode === "wide" ? 1280 : 900, {
          prefer: state.prefer,
        })
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
      // Only the pane that was reached for records a choice. The other one is
      // closing to free the single drawer compact has, which is not one.
      prefer: { ...state.prefer, slidesOpen },
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
      prefer: { ...state.prefer, inspectorOpen },
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
