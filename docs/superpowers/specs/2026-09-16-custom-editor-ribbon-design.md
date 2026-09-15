# Custom Editor Ribbon Design

**Date:** 2026-09-16
**Status:** Approved
**Scope:** The custom editor's second and third control bands only

## Problem

The custom slide editor currently places two unrelated-looking control bands
between the editor header and canvas:

1. a plain wrapping row for template, theme, background, and zoom controls;
2. a bordered toolbar containing 23 object commands.

Their heights, spacing, grouping, surfaces, and responsive behavior do not
match. The object toolbar separates groups with right borders, so wrapped rows
can end with stray divider lines. Zoom uses `margin-left: auto` and can fall
onto an awkward new row. At narrower widths, every tool remains visible and
the toolbar grows vertically, taking space from the canvas.

## Goal

Present the second and third bands as one professional, compact two-row ribbon
whose hierarchy remains stable as the editor width changes.

## Constraints

- Do not change the first-band editor header or its buttons.
- Preserve every existing command and its behavior.
- Preserve existing `data-editor-action`, `data-custom-editor`, and
  accessibility hooks.
- Keep the ribbon at no more than two rows at supported desktop widths.
- Do not change the canvas, inspector, slide data, save flow, or export logic.
- Preserve the static HTML controls as a functional fallback when React chrome
  does not mount.

## Design

### Ribbon container

Replace the visual separation between `.custom-editor-bar` and
`.custom-editor-toolbar` with one bordered ribbon surface. The React chrome
renders both rows inside that surface:

- row one is the slide-design row;
- row two is the object-tools row.

The ribbon uses the existing panel, border, radius, spacing, control-height,
brand, and focus-ring tokens. It is visually independent from the editor
header above it.

### Row one: slide design and view

Controls appear in this order:

1. template picker;
2. template apply button;
3. theme picker;
4. background color;
5. flexible space;
6. zoom out, fit, and zoom in.

Template application is visually attached to its picker. Theme and background
color form a second group. Zoom remains pinned to the right edge and never
becomes a detached row.

Labels are available to assistive technology and through control titles, but
the visual row does not stack labels above controls. This keeps all controls
on one baseline and gives the row a consistent height.

### Row two: object tools

Object commands retain their existing logical groups:

- Add: text, image, rectangle, rounded rectangle, ellipse, line.
- History: undo and redo.
- Align to slide: left, horizontal center, right, top, vertical center, bottom.
- Align selection: selected-object alignment and distribution commands.
- Layer: front, forward, backward, back.
- Object: duplicate and delete.

Each group is a subtle rounded cluster with a short visible group label. A
cluster background replaces the current right-border separators, preventing
stray divider lines after reflow. Icon buttons remain square and use their
current accessible names and tooltips. Delete keeps danger coloring.

### Responsive behavior

At wide widths, both ribbon rows show all controls.

The custom editor establishes an inline-size containment context. At a ribbon
container width of 1080px or less:

- Add, History, Duplicate, and Delete remain directly visible.
- Align-to-slide, align-selection, and layer commands move into one
  `정렬·배치` overflow menu.
- The overflow trigger occupies one stable slot instead of allowing those
  groups to wrap.
- The design row keeps template, apply, theme, background, and zoom directly
  visible; flexible select widths absorb the first reduction.

The transition uses a container query so an open inspector or slide list
produces the same result as a narrower browser. A viewport media query with the
same effective threshold is the fallback for browsers without container-query
support. It changes presentation only and does not modify slide state or dirty
state.

At a ribbon container width of 560px or less, theme, background color, zoom
out, and zoom in move into a second `디자인·보기` overflow menu. Template,
Apply, and Fit remain directly visible. Both menus use the behavior described
below. This keeps the ribbon at two rows and prevents document-level
horizontal overflow at the existing mobile workspace breakpoint.

### Overflow menu behavior

The `정렬·배치` and `디자인·보기` triggers expose keyboard-operable menus
containing their hidden commands in the existing group order.

- Each trigger reports expanded state with `aria-expanded`.
- Escape closes the open menu and returns focus to its trigger.
- Clicking outside closes the menu.
- Selecting a command invokes the same existing editor action as its direct
  ribbon control and then closes the menu.
- Disabled state mirrors the corresponding direct control.

No editor action is duplicated at the controller layer; direct buttons and
menu items dispatch through the same action path.

## Implementation boundaries

Expected production files:

- `public/custom-editor-chrome.jsx`: ribbon structure, group labels, and
  responsive overflow menu.
- `public/styles.css`: ribbon surface, rows, clusters, sizing, and responsive
  presentation.
- `public/index.html`: equivalent fallback grouping for all ribbon sections
  and commands.

Expected tests:

- `test/ppt-workspace-ui.test.js`: source and structure contracts for the
  two-row ribbon, group labels, overflow control, and unchanged first band.
- `test/custom-slide-editor.test.js`: action availability and disabled-state
  regressions for direct and overflow command presentations.

No changes are expected in the custom slide model, templates, themes, Fabric
controller, persistence, PPTX generation, or server routes.

## Testing

Automated checks cover:

- every existing editor action remains present;
- the first-band header markup remains unchanged;
- direct and overflow commands use the same action identifiers;
- the overflow trigger exposes correct accessibility state;
- hidden and disabled commands cannot be accidentally activated;
- existing custom-editor and workspace tests remain green.

Browser verification covers 1440px, 1024px, 800px, 560px, and 390px viewport
widths:

- the ribbon never exceeds two rows;
- no group leaves a stray divider;
- zoom stays aligned to the right;
- no document-level horizontal overflow appears;
- opening or closing the overflow menu does not resize the canvas;
- keyboard focus and Escape behavior work;
- changing viewport width does not mark a clean slide dirty.

## Out of scope

- Any hierarchy or styling change to the first-band editor header.
- Inspector, layers, context toolbar, or canvas redesign.
- Adding, removing, or renaming editor commands.
- Changing template, theme, background, zoom, selection, or history behavior.
- Broader PPT workspace or non-custom-slide toolbar redesign.

## Acceptance criteria

The design is complete when the second and third bands read as one independent
two-row ribbon, controls share one baseline and sizing system, object groups
remain legible without separator artifacts, lower-priority layout tools
collapse into an accessible overflow menu when needed, and the first-band
header and all editor behavior remain unchanged.
