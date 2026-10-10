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

// The thumb is drawn over a pane whose native bar is hidden, so it takes no
// layout width. It lives in `host` rather than the pane: a pane that replaces
// its children wholesale would otherwise take the thumb with it.
export function attachOverlayScrollbar(
  pane,
  { host = pane?.parentElement, hideDelay = 800 } = {}
) {
  if (!pane || !host) {
    return null;
  }
  const doc = pane.ownerDocument;
  const track = doc.createElement("div");
  track.className = "overlay-scrollbar";
  track.setAttribute("aria-hidden", "true");
  const thumb = doc.createElement("div");
  thumb.className = "overlay-scrollbar-thumb";
  track.append(thumb);
  host.append(track);

  let geometry = null;
  let frame = null;
  let hideTimer = null;
  let hovered = false;
  let drag = null;

  function update() {
    frame = null;
    const trackLength = pane.clientHeight;
    geometry = computeThumb({
      scrollTop: pane.scrollTop,
      scrollHeight: pane.scrollHeight,
      clientHeight: pane.clientHeight,
      trackLength,
    });
    track.hidden = !geometry;
    if (!geometry) {
      track.classList.remove("is-visible");
      return;
    }
    track.style.top = `${pane.offsetTop}px`;
    track.style.height = `${trackLength}px`;
    thumb.style.height = `${geometry.size}px`;
    thumb.style.transform = `translateY(${geometry.offset}px)`;
  }

  function schedule() {
    if (frame === null) {
      frame = requestAnimationFrame(update);
    }
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!hovered && !drag) {
        track.classList.remove("is-visible");
      }
    }, hideDelay);
  }

  function onScroll() {
    schedule();
    track.classList.add("is-visible");
    scheduleHide();
  }

  function endDrag(event) {
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    drag = null;
    track.classList.remove("is-dragging");
    scheduleHide();
  }

  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !geometry) {
      return;
    }
    event.preventDefault();
    thumb.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: pane.scrollTop,
    };
    track.classList.add("is-dragging");
  });
  thumb.addEventListener("pointermove", (event) => {
    if (drag?.pointerId !== event.pointerId || !geometry) {
      return;
    }
    pane.scrollTop = scrollTopForDrag({
      startScrollTop: drag.startScrollTop,
      deltaY: event.clientY - drag.startY,
      trackLength: pane.clientHeight,
      thumbSize: geometry.size,
      scrollHeight: pane.scrollHeight,
      clientHeight: pane.clientHeight,
    });
  });
  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);
  thumb.addEventListener("pointerenter", () => {
    hovered = true;
  });
  thumb.addEventListener("pointerleave", () => {
    hovered = false;
    scheduleHide();
  });

  pane.addEventListener("scroll", onScroll, { passive: true });
  // Cards coming and going change the content height but not the pane's box,
  // which is all a ResizeObserver sees.
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(pane);
  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(pane, { childList: true });
  update();

  return {
    update: schedule,
    destroy() {
      pane.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      clearTimeout(hideTimer);
      track.remove();
    },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
