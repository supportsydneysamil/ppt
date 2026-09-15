# Adaptive PPT Workspace Design

**Date:** 2026-09-15  
**Status:** Approved  
**Scope:** App shell width policy, PPT workspace layout, focus mode, Korean IME caret correction, and a custom-editor pop-out window

## Context

The application began as a scripture text extractor and later gained the PPT generator. Both workspaces still share `.page { max-width: 980px }`. On a 1440×1000 browser viewport, that leaves a 932px content area and a 578×325 custom-slide canvas after the 280px slide list, grid gap, and editor padding.

The scripture extractor benefits from a constrained reading width. The PPT generator is a visual workspace and needs substantially more horizontal room. Applying one width policy to both products is therefore the wrong abstraction.

The custom-slide editor also has a reported Korean text-editing defect: the visible caret and the typed text do not stay aligned. Existing probes have ruled out ordinary click-to-caret mapping, browser zoom, Fabric viewport scaling, Retina device pixel ratio, scrolling, and a Chromium-versus-WebKit difference. The remaining investigation is the real Korean IME composition path.

## Goals

1. Keep the scripture extractor at its current readable width and behavior.
2. Let the PPT generator expand with the browser viewport up to a deliberate maximum.
3. Make the canvas or preview the dominant surface at every desktop width.
4. Provide collapsible panels and a focus mode for constrained browser windows.
5. Allow the custom canvas editor, and only that editor initially, to move into a separate browser window.
6. Preserve one authoritative unsaved draft and one editing owner across the main and pop-out windows.
7. Reproduce and fix the Korean IME caret defect at its source.
8. Preserve existing save, cancel, reset, template, upload, and unsaved-navigation behavior.

## Non-goals

- Rewriting the application as a new routed SPA.
- Widening the scripture extractor beyond its current reading width.
- Supporting simultaneous editing in the main and pop-out windows.
- Moving every slide type into a pop-out editor in this release.
- Changing slide records, template schemas, PPT export geometry, or server persistence APIs.
- Applying an unverified CSS offset or font substitution as a caret workaround.

## Architecture

### 1. Shared shell with workspace-specific width policies

The shared navigation and settings control remain in the existing app shell. `applyViewChange()` records the active workspace on the shell or `body` using `data-workspace="extractor|ppt"`. PPT tab and selection rendering additionally records `data-ppt-surface="gallery|editor"` so gallery and editing widths remain declarative. CSS custom properties derive the page width from those states.

- Extractor workspace: `min(980px, viewport minus safe gutters)`.
- PPT gallery: up to 1400px.
- PPT editor and template editor: up to 1600px.
- Custom canvas: up to its 1280px logical width; extra width becomes intentional stage breathing room.

The shell uses the browser viewport, not the physical monitor size. Resizing or moving the browser causes the workspace to reflow.

This change does not alter the extractor DOM, form behavior, or output layout. It replaces one global width assumption with a per-workspace contract.

### 2. PPT workspace layout

The PPT workspace has three semantic regions:

1. **Slides:** slide list, selection, add, duplicate, and reorder.
2. **Stage:** live preview or editable Fabric canvas.
3. **Inspector:** slide settings, selected-object properties, and layers.

For non-custom slide types, the stage shows `#slidePreview` and the inspector shows the existing type-specific form. For custom slides, the stage shows `#customEditorCanvas` and the inspector shows object properties and layers. IDs and form controls remain stable so existing controller code continues to target the same elements.

The editor header becomes a compact workspace command bar containing the slide name, undo/redo where applicable, fit/zoom, focus mode, pop-out, cancel, reset, download, delete, and save. Destructive commands remain visually separated from primary save actions.

### 3. Responsive behavior

- **1280px and wider:** persistent three-pane layout. Slides and inspector are independently collapsible.
- **900–1279px:** stage-first layout. Slides and inspector open as non-destructive drawers; only one drawer is open by default.
- **Below 900px:** vertical/mobile layout. The stage remains first, followed by tabbed slide and inspector controls.

The breakpoints are based on browser viewport width. They are layout transitions, not slide-data state, and do not make a slide dirty.

### 4. Focus mode

Focus mode collapses the slides and inspector regions to narrow rails and gives the stage the remaining width and height. It is available to all PPT slide types.

- Panel state and focus-mode preference are stored as UI preferences.
- UI preferences are not included in slide or template persistence.
- Hidden panels are removed from keyboard navigation.
- Reopening a panel restores focus to the initiating control or the last focused control inside that panel.
- Escape closes an open drawer before affecting slide selection.

### 5. Explicit preview and canvas reflow

Layout changes must not rely on incidental resize events.

One workspace reflow coordinator observes the stage and performs type-specific updates:

- Re-render ordinary, title, custom-title, hymn-title, and simple previews using the new `#slidePreview` width.
- Ask the PPTX upload viewer to refit without adding horizontal padding to its measured container.
- Explicitly resize the Fabric canvas after hidden-to-visible transitions, panel changes, focus-mode changes, view switches, and pop-out restoration.
- Reposition the floating text toolbar after every stage geometry change.

Reflow work is batched to one animation frame and skipped when width and height have not changed.

## Custom Editor Pop-out

### 1. Scope

The first pop-out release supports only the custom Fabric editor. Other slide types receive the expanded in-app stage and focus mode. This keeps the cross-window protocol focused on one canonical custom-slide model.

### 2. Window lifecycle

The command bar exposes `새 창으로 열기`. It synchronously opens a same-origin pop-out route so browser popup blockers can be detected immediately.

On success:

1. The main window exports the active custom editor session.
2. The inline editor relinquishes edit ownership and displays a read-only connected placeholder.
3. The pop-out imports the session and becomes the only editing owner.
4. Both windows display the connection and save state.

On normal pop-out close:

1. The pop-out sends its final versioned session snapshot.
2. The main window acknowledges receipt.
3. The main window imports the model and history, restores the inline editor, and resumes edit ownership.

If the popup is blocked, the application shows a toast and leaves the inline editor unchanged.

### 3. State ownership

The main window remains authoritative for:

- selected slide and template context;
- dirty state and unsaved-navigation guards;
- save, cancel, reset, and delete orchestration;
- API persistence and slide-list updates.

The pop-out owns only the active custom editor interaction while connected. Two windows never accept edits at the same time.

### 4. Session protocol

Communication uses a same-origin `BroadcastChannel` scoped by a random session ID. A direct `window.postMessage` path is retained as a same-origin fallback.

Every message contains:

- protocol version;
- session ID;
- slide ID;
- monotonically increasing sequence number;
- message type;
- payload.

The protocol supports:

- `READY`
- `INITIALIZE_SESSION`
- `EDITOR_CHANGED`
- `SAVE_REQUEST`
- `SAVE_RESULT`
- `RESET_REQUEST`
- `RESET_RESULT`
- `CLOSE_REQUEST`
- `FINAL_SNAPSHOT`
- `FINAL_ACK`
- `CONNECTION_STATE`

`BroadcastChannel` is same-origin by construction. The `postMessage` fallback additionally validates `event.origin`. Receivers ignore messages with the wrong session, slide, protocol version, or a stale sequence number.

### 5. Transferable editor session

The custom editor and history modules expose serializable session-state interfaces:

- current normalized custom-slide model;
- undo and redo snapshots;
- saved baseline identity;
- dirty state;
- active element IDs where they can be restored safely.

DOM nodes, Fabric instances, image objects, and open file handles are never transferred. Images continue to use existing same-origin upload URLs.

### 6. Recovery

The main window mirrors the latest acknowledged snapshot in memory and in a short-lived browser recovery record keyed by session and slide ID. The record is removed after a successful save or clean close and expires automatically.

- Popup blocked: remain inline.
- Channel interruption: disable save in the pop-out, show a reconnecting state, and retain the local model.
- Stale or out-of-order message: ignore it.
- Pop-out close without final acknowledgement: restore the latest acknowledged snapshot and offer the newer recovery snapshot if present.
- Main-window navigation with unsaved pop-out work: use the existing unsaved-change guard.
- Main window forcibly closed: the recovery record protects the latest acknowledged draft for the next app session.

## Korean IME Caret Defect

### 1. Evidence boundary

The current automated evidence confirms:

- Fabric prefix measurement matches the rendered Korean glyph widths.
- Clicks resolve to the expected grapheme index.
- the mapping remains correct with device pixel ratios 1 and 2;
- the mapping remains correct after zoom and stage scrolling;
- Chromium and WebKit produce the same click-to-caret result.

The production fix therefore targets the actual IME composition lifecycle rather than generic canvas scaling or CSS positioning.

### 2. Diagnostic adapter

Text editing is routed through a small custom-editor IME adapter that records test-observable state at:

- `compositionstart`;
- `compositionupdate`;
- `input`;
- `compositionend`;
- selection changes;
- Fabric cursor rendering.

The adapter compares DOM UTF-16 selection offsets, grapheme offsets, Fabric selection offsets, the calculated cursor rectangle, and the rendered glyph endpoint. Production logging remains disabled; tests use an injected observer.

### 3. Fix gate

No production correction is applied until an automated or instrumented manual run demonstrates the first divergent boundary. The correction is implemented at that boundary:

- DOM-string offsets are converted to grapheme offsets before Fabric cursor or selection calculations when offset domains diverge.
- Fabric dimensions and font caches are refreshed only when evidence shows stale font metrics.
- Canvas scaling is changed only when screen-to-scene mapping diverges.

This rule prevents a visual offset patch from masking a model, selection, or IME defect.

### 4. Acceptance behavior

The editor must keep text, composition underline, selection, and caret aligned during and after Korean composition. It must also place the caret at the selected grapheme after mouse clicks and arrow-key movement.

The behavior is verified:

- in the normal in-app editor;
- in focus mode;
- in the restored inline editor after closing the pop-out;
- in the pop-out editor;
- at 25%, 50%, 100%, and 200% editor zoom;
- at device pixel ratios 1 and 2;
- with left, center, and right alignment;
- with Korean-only and mixed Korean/Latin text;
- with single-line, wrapped, and explicit multiline text.

## Accessibility

- Pane, drawer, focus-mode, and pop-out controls have visible labels or accessible names.
- Toggle controls expose `aria-expanded` and `aria-controls`.
- Connection, save, and recovery messages use polite status regions; destructive failures use alerts.
- Focus never moves into collapsed or inert regions.
- The pop-out receives an explicit document title containing the slide name.
- Keyboard shortcuts do not override text editing or Korean IME composition.
- Existing contrast and focus-ring theme tokens are reused.

## Testing

### Unit and DOM tests

- Workspace width policy selection.
- Focus mode and panel preference state.
- Pop-out message validation, sequence rejection, and ownership transitions.
- Editor-session history export and import.
- Recovery record expiration and cleanup.
- IME offset conversion and diagnostic snapshots.

### Browser tests

Run at 900, 1024, 1280, 1440, and 1920px browser widths:

- extractor remains within its readable width;
- PPT workspace expands without document-level horizontal overflow;
- the correct pane or drawer mode is active;
- slide list sticky behavior and dropdown placement remain correct;
- ordinary, title, custom-title, simple, and PPTX upload previews refit after every width transition;
- custom canvas resizes after view switches, drawer changes, focus mode, and pop-out restoration;
- floating text toolbar remains attached to the selected text;
- Korean caret and composition behavior passes the acceptance matrix;
- popup blocked, pop-out open, live edit mirroring, save, cancel, reset, close, disconnect, and recovery paths work;
- template gallery and template editing use the same width policy without changing template state.

### Regression gate

- Existing Node test suite passes.
- Existing save-flow browser suite passes.
- Vite production build passes.
- Layout probes report no preview clipping or horizontal overflow.
- `git diff --check` passes.

## Delivery Order

The work is delivered as four independently verifiable milestones:

1. Workspace-specific shell widths and reflow coordinator.
2. Three-pane PPT layout, responsive drawers, and focus mode.
3. Korean IME reproduction and root-cause fix.
4. Custom-editor pop-out, session transfer, recovery, and two-window tests.

Each milestone must pass the regression gate before the next begins. The adaptive shell and focus mode can ship without the pop-out if two-window recovery does not meet the acceptance criteria.

## Acceptance Criteria

The design is complete when:

1. The extractor retains its current readable layout.
2. The PPT workspace expands with browser width up to its maximum.
3. At a 1440×1000 viewport, the custom canvas is at least 720×405 in the persistent three-pane layout and at least 960×540 in focus mode, subject to browser chrome reducing the viewport below that size.
4. Preview and canvas geometry remain correct after all layout transitions.
5. Focus mode and responsive drawers are keyboard and screen-reader operable.
6. Korean IME text and caret remain aligned across the stated matrix.
7. The custom editor can move to a separate window without losing draft, history, or save semantics.
8. Popup failure and abnormal close recover safely.
9. Existing save, cancel, reset, template, upload, and navigation behavior remains intact.
