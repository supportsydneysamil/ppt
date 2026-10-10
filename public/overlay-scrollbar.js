const MIN_THUMB_SIZE = 24;

export function computeThumb({
  scrollTop = 0,
  scrollHeight = 0,
  clientHeight = 0,
  trackLength = clientHeight,
  minSize = MIN_THUMB_SIZE,
} = {}) {
  const range = scrollHeight - clientHeight;
  if (range < 1 || trackLength <= 0) {
    return null;
  }
  const size = Math.min(
    trackLength,
    Math.max(minSize, (trackLength * clientHeight) / scrollHeight)
  );
  const travel = trackLength - size;
  return { size, offset: clamp((travel * scrollTop) / range, 0, travel) };
}

export function scrollTopForDrag({
  startScrollTop = 0,
  deltaY = 0,
  trackLength = 0,
  thumbSize = 0,
  scrollHeight = 0,
  clientHeight = 0,
} = {}) {
  const range = Math.max(0, scrollHeight - clientHeight);
  const travel = trackLength - thumbSize;
  if (travel <= 0) {
    return clamp(startScrollTop, 0, range);
  }
  return clamp(startScrollTop + (deltaY * range) / travel, 0, range);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
