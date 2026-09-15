# Word-Style Custom Editor Ribbon Design

**Date:** 2026-09-16
**Status:** Approved
**Scope:** Replace the custom editor's current adaptive two-row controls with a category-tab ribbon

## Problem

The current custom editor correctly unifies design and object controls inside
one card, but its responsive behavior weakens usability:

- the former Template, Theme, Background, and View labels are absent;
- the line between the two rows adds structure without conveying meaning;
- at the normal 1440px workspace width, an open inspector leaves about 641px
  for the stage, so the 1080px overflow threshold keeps layout tools collapsed
  almost all the time;
- generic ellipsis triggers hide the category and make the ribbon look
  incomplete;
- opening and closing the inspector changes which controls are visible,
  producing an unstable and unbalanced command layout.

The 641px stage width with the inspector open is the primary desktop design
target, not an edge case.

## Goal

Keep the existing unified card while reorganizing its controls as a
Microsoft Word-style ribbon: named category tabs above one active command
panel, with commands grouped and labelled inside that panel.

## Constraints

- Do not change the first-band editor header.
- Keep one ribbon card; do not return to separate second and third cards.
- Preserve all existing custom-editor commands and behavior.
- Preserve `data-editor-action`, `data-custom-editor`, controller delegation,
  saved data, dirty-state behavior, and keyboard shortcuts.
- Do not use generic ellipsis overflow triggers.
- Opening or closing the inspector must not change tab names, command order,
  or the active category.
- Apply the same ribbon to the inline and pop-out custom editors.

## Information architecture

The ribbon has four tabs in this fixed order:

1. **디자인**
2. **삽입**
3. **정렬**
4. **배치**

Undo and Redo form a quick-access group at the right edge of the tab strip and
remain available for every category.

### 디자인

- **템플릿:** template select and Apply.
- **테마 및 배경:** theme select, background swatch, and HEX value.
- **보기:** Zoom Out, Fit, and Zoom In.

### 삽입

- **콘텐츠:** Add Text and Add Image.
- **도형:** Add Rectangle, Rounded Rectangle, Ellipse, and Line.

### 정렬

- **슬라이드에 맞춤:** left, horizontal center, right, top, vertical center,
  and bottom.
- **선택 개체에 맞춤:** selected-object left alignment, horizontal
  distribution, and vertical distribution.

### 배치

- **쌓는 순서:** Front, Forward, Backward, and Back.
- **개체 관리:** Duplicate and Delete.

The ribbon no longer duplicates action buttons between direct and overflow
presentations. Each command has one DOM control in exactly one tab panel.

## Visual structure

The ribbon card contains:

1. a compact tab strip;
2. one active command panel.

There is no horizontal rule between the tab strip and command panel. Their
shared surface, spacing, and active-tab treatment establish the relationship.

Each command group:

- uses spacing rather than an enclosing pill for every icon;
- uses a subtle vertical separator between adjacent groups;
- carries a small centered group label at the bottom, following Word's ribbon
  pattern;
- keeps icon buttons on a shared square size;
- keeps Delete in danger color.

The active tab uses text color, a quiet background, and the existing brand
accent along its lower edge. Inactive tabs remain readable but visually
secondary.

## State behavior

- `디자인` is active when a custom editor instance first mounts.
- Selecting another tab changes UI presentation only.
- The active tab remains selected while the same editor instance is open,
  including inspector open/close and focus-mode changes.
- Tab state is not written to slide data, templates, local storage, recovery
  records, or dirty state.
- Inline and pop-out editors maintain independent active-tab UI state.

Changing tabs does not change selection, canvas state, history, or focus mode.

## Responsive behavior

### Ribbon width 560px and above

- All four tab names remain visible.
- Only the active category's groups render in the command panel.
- No commands collapse into generic overflow.
- The 641px primary desktop width fits every category without internal
  horizontal scrolling.

### Ribbon width below 560px

- All four tab names remain visible.
- The active command panel becomes horizontally scrollable inside the ribbon.
- Group labels and every command remain intact.
- A subtle edge fade indicates additional off-screen commands.
- The page and ribbon card do not overflow; only the active panel scrolls.
- No command is replaced by an ellipsis.

The tab strip itself becomes horizontally scrollable only when its four
Korean labels and Undo/Redo exceed its available width. Its scrollbar is
visually hidden while keyboard and touch scrolling remain available.

## Accessibility

- The tab strip uses `role="tablist"`.
- Each category uses `role="tab"`, `aria-selected`, and `aria-controls`.
- Each panel uses `role="tabpanel"` and `aria-labelledby`.
- Only the active panel is exposed and keyboard reachable.
- Left/Right arrows move between tabs.
- Home/End move to the first/last tab.
- Enter and Space activate the focused tab.
- Focus stays on the selected tab after keyboard navigation.
- Group labels supplement, but do not replace, every button's current
  accessible name and tooltip.
- Undo, Redo, disabled states, and focus rings retain existing behavior.

## Expected implementation boundaries

- `public/custom-editor-chrome.jsx`: tab state, keyboard navigation, category
  panels, quick-access history, and command regrouping.
- `public/styles.css`: tab strip, active tab, command panels, Word-style group
  labels, and narrow-panel scrolling.
- `public/custom-editor-popout.css`: confirm the ribbon remains in the pop-out
  stage column; no separate interaction implementation.
- `public/index.html`: static fallback with the same four category sections,
  with Design visible by default.
- `test/ppt-workspace-ui.test.js`: source contracts for categories, command
  ownership, ARIA relationships, and removal of generic overflow.
- `test/browser/save-flow.playwright.mjs`: tab interaction, action wiring,
  inspector stability, dirty-state neutrality, and narrow-width scrolling.

No changes are expected in the custom slide model, Fabric controller,
history implementation, persistence, PPTX generation, or server routes.

## Testing

Automated source tests verify:

- the exact four category names and order;
- every existing editor action appears exactly once in the React ribbon;
- Undo and Redo live outside category panels;
- generic `정렬·배치`, `보기`, and `추가` overflow triggers are absent;
- tab and panel ARIA relationships exist;
- the first-band header remains outside the ribbon.

Browser tests verify:

- Design is active by default;
- mouse and keyboard tab switching;
- tab changes do not mark a clean slide dirty;
- Add, Align, Layer, Duplicate, Delete, Undo, Redo, Theme, Background, and Zoom
  controls still use existing behavior;
- inspector open/close preserves the active tab and command arrangement;
- each category fits at the 641px desktop target;
- at 390px, the active panel scrolls internally without page overflow;
- inline and pop-out ribbons both expose the four categories.

## Out of scope

- First-band header hierarchy.
- Inspector, layer list, canvas, or context-toolbar redesign.
- New commands or removal of existing commands.
- Slide-specific contextual tabs.
- Persisting the selected ribbon tab.
- Recreating Microsoft Word's exact visual styling or animation.

## Acceptance criteria

The work is complete when the custom editor presents one stable Word-style
ribbon card with four named categories, one active grouped command panel,
always-available Undo/Redo, restored group labels, no generic ellipsis
overflow, unchanged editor behavior, and usable layouts at 641px and 390px
ribbon targets.
