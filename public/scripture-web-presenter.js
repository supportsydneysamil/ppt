export const CONTROL_HIDE_DELAY = 2500;

const INTERACTIVE_SELECTOR =
  "button, input, select, textarea, a, [contenteditable='true']";
const SWIPE_MINIMUM_DISTANCE = 48;

const ENTER_FULLSCREEN_LABEL = "전체화면";
const EXIT_FULLSCREEN_LABEL = "전체화면 종료";
const START_FULLSCREEN_MESSAGE = "전체화면으로 시작";
const UNSUPPORTED_MESSAGE = "이 브라우저에서는 전체화면을 지원하지 않습니다";

export function navigationFromKey(event) {
  if (event.target?.closest?.(INTERACTIVE_SELECTOR)) {
    return null;
  }
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
    return "next";
  }
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
    return "previous";
  }
  if (event.key === "Home") {
    return "first";
  }
  if (event.key === "End") {
    return "last";
  }
  return null;
}

export function navigationFromTap(clientX, width) {
  if (!Number.isFinite(width) || width <= 0) {
    return null;
  }
  return clientX < width / 2 ? "previous" : "next";
}

export function navigationFromSwipe(
  start,
  end,
  minimumDistance = SWIPE_MINIMUM_DISTANCE
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < minimumDistance || Math.abs(dx) <= Math.abs(dy)) {
    return null;
  }
  return dx < 0 ? "next" : "previous";
}

export function createScripturePresenter({
  document,
  window,
  onNavigate,
  hideDelay = CONTROL_HIDE_DELAY,
}) {
  const controls = document.getElementById("presenterControls");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const fullscreenStart = document.getElementById("fullscreenStart");
  const fullscreenStartBtn = document.getElementById("fullscreenStartBtn");
  const fullscreenMessage = document.getElementById("fullscreenMessage");
  const blackoutBtn = document.getElementById("blackoutBtn");
  const blackoutLayer = document.getElementById("blackoutLayer");
  const stageViewport = document.getElementById("stageViewport");

  const listeners = [];
  let hideTimer = null;
  let controlsHovered = false;
  let blackout = false;
  let swipeStart = null;
  let swipeNavigated = false;

  function on(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push([target, type, handler]);
  }

  function isFullscreen() {
    return Boolean(document.fullscreenElement);
  }

  function supportsFullscreen() {
    return typeof document.documentElement.requestFullscreen === "function";
  }

  // 안내 문구와 버튼 표시만 바꾸고 안내 영역의 나머지 마크업은 그대로 둔다.
  function showFallback(message, canRetry) {
    fullscreenMessage.textContent = message;
    fullscreenStartBtn.hidden = !canRetry;
    fullscreenStart.classList.toggle("is-unsupported", !canRetry);
    fullscreenStart.hidden = false;
  }

  function navigate(direction) {
    if (direction) {
      onNavigate?.(direction);
    }
  }

  function clearHideTimer() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      if (controlsHovered || controls.contains(document.activeElement)) {
        scheduleHide();
        return;
      }
      controls.classList.remove("controls-visible");
    }, hideDelay);
  }

  function showControls() {
    controls.classList.add("controls-visible");
    scheduleHide();
  }

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen({
        navigationUI: "hide",
      });
      return true;
    } catch {
      showFallback(START_FULLSCREEN_MESSAGE, true);
      return false;
    }
  }

  async function attemptAutoFullscreen() {
    if (!supportsFullscreen()) {
      showFallback(UNSUPPORTED_MESSAGE, false);
      return false;
    }
    return enterFullscreen();
  }

  async function requestFullscreen() {
    if (!supportsFullscreen()) {
      showFallback(UNSUPPORTED_MESSAGE, false);
      return false;
    }
    if (isFullscreen()) {
      try {
        await document.exitFullscreen?.();
      } catch {
        // 브라우저가 종료를 거절해도 fullscreenchange 상태를 그대로 따른다.
      }
      return false;
    }
    return enterFullscreen();
  }

  function toggleBlackout() {
    blackout = !blackout;
    document.body.classList.toggle("is-blackout", blackout);
    blackoutLayer.hidden = !blackout;
    blackoutBtn.setAttribute("aria-pressed", blackout ? "true" : "false");
    return blackout;
  }

  function handleFullscreenChange() {
    const fullscreen = isFullscreen();
    document.body.classList.toggle("is-presenting", fullscreen);
    fullscreenBtn.textContent = fullscreen
      ? EXIT_FULLSCREEN_LABEL
      : ENTER_FULLSCREEN_LABEL;
    clearHideTimer();
    controls.classList.remove("controls-visible");
    if (fullscreen) {
      fullscreenStart.hidden = true;
    }
  }

  function handleKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      requestFullscreen();
      return;
    }
    if (event.key === "b" || event.key === "B") {
      event.preventDefault();
      toggleBlackout();
      return;
    }
    const direction = navigationFromKey(event);
    if (!direction) {
      return;
    }
    event.preventDefault();
    navigate(direction);
  }

  function handlePointerDown(event) {
    swipeStart = { x: event.clientX, y: event.clientY };
    swipeNavigated = false;
  }

  function handlePointerCancel() {
    swipeStart = null;
    swipeNavigated = false;
  }

  function handlePointerUp(event) {
    if (!swipeStart) {
      return;
    }
    const direction = navigationFromSwipe(swipeStart, {
      x: event.clientX,
      y: event.clientY,
    });
    swipeStart = null;
    if (direction) {
      swipeNavigated = true;
      navigate(direction);
    }
  }

  function handleStageClick(event) {
    if (swipeNavigated) {
      swipeNavigated = false;
      return;
    }
    if (event.target?.closest?.(INTERACTIVE_SELECTOR)) {
      return;
    }
    const rect = stageViewport.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    navigate(navigationFromTap(event.clientX - rect.left, width));
  }

  function handlePointerMove() {
    if (isFullscreen()) {
      showControls();
    }
  }

  function handleControlsEnter() {
    controlsHovered = true;
  }

  function handleControlsLeave() {
    controlsHovered = false;
    scheduleHide();
  }

  on(document, "fullscreenchange", handleFullscreenChange);
  on(document, "keydown", handleKeydown);
  on(document, "pointermove", handlePointerMove);
  on(stageViewport, "pointerdown", handlePointerDown);
  // 스와이프가 스테이지 밖에서 끝나도 놓치지 않도록 문서에서 마무리한다.
  on(document, "pointerup", handlePointerUp);
  on(document, "pointercancel", handlePointerCancel);
  on(stageViewport, "click", handleStageClick);
  on(controls, "pointerenter", handleControlsEnter);
  on(controls, "pointerleave", handleControlsLeave);
  on(fullscreenBtn, "click", requestFullscreen);
  on(fullscreenStartBtn, "click", requestFullscreen);
  on(blackoutBtn, "click", toggleBlackout);

  function destroy() {
    clearHideTimer();
    for (const [target, type, handler] of listeners) {
      target.removeEventListener(type, handler);
    }
    listeners.length = 0;
  }

  return {
    attemptAutoFullscreen,
    requestFullscreen,
    toggleBlackout,
    showControls,
    destroy,
  };
}
