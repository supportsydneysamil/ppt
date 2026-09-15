# Native Image Controls Design

**Date:** 2026-09-16
**Status:** Approved
**Scope:** Stable first-phase image properties for custom slides

## Goal

Add a small, intuitive set of image controls using behavior natively supported
by Fabric and PptxGenJS, with matching editor, persistence, restore, and PPTX
results.

## Included features

1. Replace the selected image while preserving its authored box and effects.
2. Present the existing Contain/Fill behavior as a two-option segmented
   control.
3. Flip the image horizontally or vertically.
4. Store and export optional alternative text.

Existing common properties continue to provide opacity, rotation, visibility,
locking, and shadow.

## Excluded features

- custom crop coordinates, focal points, pan, or crop zoom;
- brightness, contrast, saturation, blur, or color filters;
- rounded masks and arbitrary clipping paths;
- background removal;
- expanded shadow controls;
- numeric X/Y/width/height inputs.

These require additional geometry or rendering work and are deferred until the
native first phase is stable.

## Library support

- Fabric images natively expose `cropX`, `cropY`, `flipX`, and `flipY`.
- PptxGenJS `ImageProps` natively exposes `flipH`, `flipV`, `altText`, and
  `sizing` with `contain`, `cover`, and `crop`.
- The current editor already implements Contain and centered Cover through
  Fabric crop fields and exports them through PptxGenJS sizing.

No image rasterization or custom OOXML is required for this phase.

## Data model

Image elements add:

```js
{
  flipH: false,
  flipV: false,
  altText: ""
}
```

- `flipH` and `flipV` normalize to booleans.
- `altText` normalizes to a trimmed string of at most 500 characters.
- Missing fields retain backward compatibility through the defaults above.

## Inspector UI

The Image panel contains:

1. **이미지:** `이미지 교체` button.
2. **표시 방식:** segmented `맞춤` and `채우기` radio controls.
3. **뒤집기:** horizontal and vertical icon chips.
4. **대체 텍스트:** optional textarea with a 500-character limit.

The current explanatory Fit/Fill hint remains, shortened to one line. Common
properties continue below the Image panel.

## Replace behavior

`이미지 교체` opens the existing image file picker in replacement mode.

On successful upload:

- replace only the selected image's source;
- preserve ID, x, y, width, height, rotation, opacity, z-index, fit, flips,
  alt text, visibility, lock, shadow, and theme metadata;
- refit the new bitmap inside the preserved authored box;
- keep the replacement selected;
- create one undo history entry;
- mark the slide dirty;
- announce `이미지를 교체했습니다.`

On upload or decode failure:

- leave the original image and selection untouched;
- show the existing error channel;
- do not create history or mark the slide dirty.

If the user changes slides or selection while replacement is pending, the
existing generation guard rejects the stale result.

The existing Add Image action continues to open the same file picker in add
mode.

## Fit behavior

The segmented controls use native radio inputs so keyboard behavior and form
semantics remain intact.

- `맞춤` maps to `contain`.
- `채우기` maps to `cover`.
- selection synchronization checks the matching radio.
- changing Fit preserves the authored image box, as it does today.

## Flip behavior

- Horizontal flip maps Fabric `flipX` to model `flipH` and PptxGenJS `flipH`.
- Vertical flip maps Fabric `flipY` to model `flipV` and PptxGenJS `flipV`.
- Flips operate inside the current authored box.
- Flips survive Fit changes, resize, save/load, undo/redo, copy/paste, and
  pop-out session transfer.

## Alternative text

- Empty text exports no `altText` option.
- Non-empty text passes directly to PptxGenJS `altText`.
- Alternative text has no visual canvas effect.
- Editing it creates normal history and dirty state.

## Testing

- Model tests cover defaults, boolean normalization, trimming, and the
  500-character limit.
- Fabric conversion tests cover build and serialization of both flips and alt
  text.
- Controller tests cover segmented Fit, replacement success/failure/staleness,
  selection preservation, history, and dirty state.
- PPTX tests cover `flipH`, `flipV`, and `altText`.
- Browser/source tests cover the new inspector controls, accessible labels,
  and file acceptance behavior.
- The full Node suite, production build, and browser suite remain green.

## Acceptance criteria

The phase is complete when users can replace, fit/fill, flip, and describe an
image through the inspector; all values survive save/load and pop-out editing;
the PPTX output matches the editor; failures preserve the original image; and
no deferred crop or filter behavior is introduced.
