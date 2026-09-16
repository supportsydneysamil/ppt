# Image Fill and Crop Controls Design

**Date:** 2026-09-16
**Status:** Approved for autonomous implementation

## Scope

Extend the native image inspector with explicit display labels, Stretch Fill,
and stable Cover positioning controls.

## Display modes

- `contain`: **전체 보기** — preserve aspect ratio and show the whole image.
- `cover`: **프레임 채우기** — preserve aspect ratio, fill the box, and crop
  overflow.
- `stretch`: **늘여서 채우기** — fill the box by scaling width and height
  independently; the UI warns that distortion can occur.

New images continue to default to `contain`.

## Cover controls

Cover mode exposes:

- a 3×3 focal-position grid;
- zoom from 100% to 300%;
- horizontal focal position from 0% to 100%;
- vertical focal position from 0% to 100%;
- `자르기 초기화`, restoring center/center and 100%.

The 3×3 grid writes the same focal values as the sliders: 0, 0.5, or 1.
Sliders provide fine adjustment. Controls are visible only in Cover mode.

## Model

Image elements add backward-compatible fields:

```js
{
  fit: "contain",
  focalX: 0.5,
  focalY: 0.5,
  imageZoom: 1
}
```

- `fit` accepts `contain`, `cover`, or `stretch`.
- focal values clamp to 0–1.
- zoom clamps to 1–3.

## Fabric geometry

Cover first computes the largest aspect-ratio-preserving crop window that fits
the authored box. Zoom divides both crop-window dimensions. Focal position
places that window inside the remaining natural-image extent:

```js
cropX = (naturalWidth - cropWidth) * focalX;
cropY = (naturalHeight - cropHeight) * focalY;
```

Contain and Stretch preserve focal and zoom metadata without applying crop.
Switching back to Cover restores the previous crop settings.

## PPTX parity

PptxGenJS native `sizing.type = "crop"` receives crop coordinates scaled into
the authored output box. The outer image dimensions use the same scale, so
crop percentages and final box dimensions match Fabric.

Stretch uses native image stretching with the authored `x/y/w/h` and no sizing
helper. No rasterization or custom OOXML is used.

## UX

- The segmented control uses the explicit labels above.
- Cover displays the warning `프레임을 채우기 위해 이미지 일부가 잘립니다.`
- Stretch displays `이미지 비율이 달라져 왜곡될 수 있습니다.`
- Crop sliders show percentage readouts.
- Changes use normal undo/redo and dirty-state behavior.

## Testing

Tests cover model normalization, Fabric crop math, all focal corners, zoom,
mode round trips, PPTX crop XML, Stretch export, inspector synchronization,
undo/redo, pop-out compatibility, browser controls, and existing regressions.

## Out of scope

Direct canvas crop mode, filters, masks, background removal, and automatic face
detection remain deferred.
