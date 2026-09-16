function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

export function coverCropWindow(
  naturalWidth,
  naturalHeight,
  boxWidth,
  boxHeight,
  options = {}
) {
  const safeNaturalWidth = Math.max(1, Number(naturalWidth) || 1);
  const safeNaturalHeight = Math.max(1, Number(naturalHeight) || 1);
  const safeBoxWidth = Math.max(1, Number(boxWidth) || 1);
  const safeBoxHeight = Math.max(1, Number(boxHeight) || 1);
  const focalX = clamp(options.focalX, 0, 1, 0.5);
  const focalY = clamp(options.focalY, 0, 1, 0.5);
  const imageZoom = clamp(options.imageZoom, 1, 3, 1);
  const boxRatio = safeBoxWidth / safeBoxHeight;
  const naturalRatio = safeNaturalWidth / safeNaturalHeight;
  let width = safeNaturalWidth;
  let height = safeNaturalHeight;

  if (naturalRatio > boxRatio) {
    width = safeNaturalHeight * boxRatio;
  } else {
    height = safeNaturalWidth / boxRatio;
  }

  width /= imageZoom;
  height /= imageZoom;

  return {
    x: (safeNaturalWidth - width) * focalX,
    y: (safeNaturalHeight - height) * focalY,
    width,
    height,
    focalX,
    focalY,
    imageZoom,
  };
}
