# Panel Collapse Affordance Design

**Date:** 2026-09-15
**Status:** Approved, ready for planning

## Problem

The two panel-collapse chevrons in the PPT workspace read as stickers pasted onto the
interface rather than controls that belong to the panels they operate.

### Slide list `<` button

`#slidePanelCollapseBtn` is absolutely positioned over the panel instead of living in the
panel header (`public/styles.css:1990-2005`):

```css
.slide-panel-collapse {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  width: 30px;
  height: 30px;
}
```

The header then dodges it with a hard-coded offset (`public/styles.css:2015-2017`):

```css
.slide-list-header {
  padding-right: 34px;
}
```

Three consequences:

1. `.slide-list-actions` is already a flex row of buttons (추가, 추가 위치, 복제). The
   chevron is the only control in that visual row that is not in the row, so it does not
   share the row's alignment.
2. The button is 30px while the project's small-control token is `--ctrl-h-sm: 34px`
   (`public/styles.css:19`), so it is 4px shorter than its neighbours.
3. `right: 12px` plus `width: 30px` occupies 42px from the right edge, but the header only
   reserves 34px. Long slide-list titles or wider action buttons overlap the chevron.

### Inspector `>` button

`#inspectorPanelCollapseBtn` is anchored to a boundary that does not visually exist
(`public/styles.css:2357-2362`):

```css
.inspector-panel-collapse {
  position: absolute;
  z-index: 30;
  top: 76px;
  right: calc(var(--inspector-width) + 8px);
}
```

`right` targets the seam between the stage and the inspector columns, but `.editor-form`
has no border and no background (`public/styles.css:2432-2440`) and `.preview-area` sets
`border-top: 0` (`public/styles.css:2510-2518`). There is no divider, so the chevron floats
in the middle of the panel.

`top: 76px` is also unanchored. Panel padding (`--sp-5: 24px`) plus the header action row
(34px) plus the header's `padding-bottom: var(--sp-4)` and 1px border place the header's
bottom rule near 83px, while the button spans 76-106px. It crosses that rule at an
arbitrary point and aligns to nothing.

Below 1280px the chevron is hidden and the text toggles `#pptSlidesPaneBtn` /
`#pptInspectorPaneBtn` take over (`public/styles.css:3671-3682`), so the same action has two
unrelated affordances depending on viewport.

## Constraint discovered during design

When a panel is collapsed, `applyPptWorkspaceUi()` marks the panel contents `inert`
(`public/app.js:1083-1101`): `.slide-list-header`, `.slide-list-toolbar`, `.slide-cards`,
`#slideForm`, and `#customSlideInspector`.

Moving a collapse button into `.slide-list-header` or into `#slideForm` therefore makes it
unclickable while collapsed. The design resolves this by splitting collapse and expand into
two controls: the in-header chevron collapses, and a dedicated rail button — outside every
inert region — expands.

## Design

### 1. Slide list chevron joins the header row

Move `#slidePanelCollapseBtn` to be the last child of `.slide-list-actions`, after the
복제 button. Drop `position: absolute` and the `.slide-list-header { padding-right: 34px }`
rule entirely. Size the button on `--ctrl-h-sm` so it matches its neighbours, reusing the
existing `ghost small icon-btn` pattern.

The button becomes collapse-only. It keeps `aria-controls="slideListPanel"` and
`aria-expanded`, and its label is always the collapse label.

### 2. Inspector gets its own header

Insert an `.inspector-header` row as the first child of `.editor-form`, containing a label
and `#inspectorPanelCollapseBtn`. The row is `position: sticky; top: 0` with the panel
background so it stays put while the form scrolls inside `max-height: var(--stage-max-h)`.

Like the slide-list chevron, this button becomes collapse-only.

### 3. The inspector gets a real boundary

Give `.editor-form` a `border-left: 1px solid var(--border)` and left padding so the
inspector is a visually distinct region. The chevron then sits on a boundary that exists.

Custom slides need the same treatment. In that layout the custom editor spans both columns
as its own grid and `.editor-form` is overlaid on the inspector area with `z-index: 2`,
while `.custom-editor-side` sits below it with `padding-top: 150px`
(`public/styles.css:3573-3613`). Apply the identical `border-left` to `.custom-editor-side`
so the two stacked elements read as one continuous divider.

### 4. Title ownership

`.editor-header h3` currently reads 상세 설정 but that header spans the stage as well as
the inspector. Once the inspector has its own header the name collides, so:

- `.editor-header h3` becomes 슬라이드 편집.
- The inspector header takes 상세 설정.

This matches how the panel is actually referred to in use.

### 5. Collapsed rail is a single button

Add `#slideListRailBtn` and `#inspectorRailBtn` as direct children of `.slide-list-panel`
and `.slide-editor-panel` respectively. They exist only in wide mode, where collapsing is
possible: hidden while the panel is open, and hidden outright in compact and mobile mode.
While collapsed each fills the full 44px rail as one click target and contains a chevron
plus a vertical label (슬라이드 목록 / 상세 설정), so the collapsed rail announces what it
holds.

Because they are outside the inert regions, they remain operable when collapsed. Their
`aria-expanded`, `aria-label`, and `title` are synchronised in `applyPptWorkspaceUi()`
alongside the existing buttons, and their clicks dispatch the same `toggle-slides` /
`toggle-inspector` reducer actions as the existing chevrons
(`public/app.js:2582-2592`).

The existing collapsed-rail overrides that keep the absolute chevron visible
(`public/styles.css:3634-3653`) are replaced by rules that hide the header chevron and show
the rail button.

### 6. Responsive behaviour

- **>= 1280px (wide):** header chevrons and rail buttons active; `border-left` on the
  inspector active.
- **900-1279px (compact):** rail buttons hidden, since nothing collapses to a rail here.
  Both header chevrons stay visible and now act as drawer close buttons — a role they can
  finally fill, because they sit in the drawer headers instead of at a seam. This lets the
  existing `@media (max-width: 1279px) { .inspector-panel-collapse { display: none } }`
  rule (`public/styles.css:3678-3682`) be deleted rather than extended. The drawers already
  carry their own border, radius, and background (`public/styles.css:3746-3784`), so
  `border-left` is dropped here.
- **< 900px (mobile):** header chevrons, rail buttons, and the divider are all hidden; the
  inspector returns to normal vertical flow. The inspector header's label stays visible as
  a plain section heading, which is useful as a divider in the stacked layout.

## Testing

- `test/ppt-workspace-ui.test.js`: update the source contracts that assert the current
  markup (`:152`, `:166`) to the new structure, and add contracts for the rail buttons, the
  inspector `border-left`, and the removal of `.slide-list-header { padding-right }`.
- `test/browser/save-flow.playwright.mjs`: the collapse scenario at `:977-:986` currently
  clicks `#slidePanelCollapseBtn` twice to collapse and re-expand. Split it: collapse via
  the header chevron, expand via `#slideListRailBtn`. Add the equivalent inspector path.
- Verify at 1440px that both panels collapse and re-expand, that keyboard focus reaches the
  rail button while collapsed, and that toggling never marks a clean slide dirty.

## Out of scope

- Unifying the chevron and the text-toggle affordances into one control across all
  breakpoints.
- Any change to the compact drawer or mobile layouts beyond disabling the new divider and
  buttons.
- The uncommitted work in `data/templates.json`, `public/styles.css` (preview stage height),
  and `scripts/upload-preview-check.mjs` must be preserved.
