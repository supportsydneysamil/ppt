import { createScripturePresenter } from "./scripture-web-presenter.js";

const BASE_WIDTH = 1333;
const BASE_HEIGHT = 750;

export function createScriptureWebView({
  document,
  window,
  fetch: fetchImpl = (...args) => window.fetch(...args),
  createPresenter: presenterFactory = createScripturePresenter,
}) {
  const deckTitle = document.getElementById("deckTitle");
  const slideCounter = document.getElementById("slideCounter");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const stageViewport = document.getElementById("stageViewport");
  const stageCanvas = document.getElementById("stageCanvas");
  const singleSlideTemplate = document.getElementById("singleSlideTemplate");
  const bilingualSlideTemplate = document.getElementById(
    "bilingualSlideTemplate",
  );

  let deckData = null;
  let currentIndex = 0;
  let blackout = false;

  function normalizeColor(value, fallback) {
    if (!value) {
      return fallback;
    }
    return value.startsWith("#") ? value : `#${value}`;
  }

  function ptToPx(value) {
    return Math.round(Number(value || 0) * 1.333);
  }

  function setMessage(text, { closeable = false } = {}) {
    stageCanvas.innerHTML = "";
    const message = document.createElement("div");
    message.className = "state-message";
    if (closeable) {
      message.classList.add("is-error");
      const label = document.createElement("span");
      label.textContent = text;
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "state-close-button";
      closeButton.textContent = "창 닫기";
      closeButton.addEventListener("click", () => window.close());
      message.append(label, closeButton);
    } else {
      message.textContent = text;
    }
    stageCanvas.appendChild(message);
  }

  let scale = 1;

  // The viewport paints the slide inside its padding and rounded corners, so
  // the fit has to be measured against the content box, not the border box.
  function measureStage() {
    const rect = stageViewport.getBoundingClientRect();
    const style = window.getComputedStyle?.(stageViewport);
    const inset = (...edges) =>
      edges.reduce((total, edge) => total + (parseFloat(style?.[edge]) || 0), 0);

    return {
      width:
        rect.width -
        inset(
          "paddingLeft",
          "paddingRight",
          "borderLeftWidth",
          "borderRightWidth",
        ),
      height:
        rect.height -
        inset(
          "paddingTop",
          "paddingBottom",
          "borderTopWidth",
          "borderBottomWidth",
        ),
    };
  }

  function applyFrameScale() {
    const frame = stageCanvas.querySelector(".slide-frame");
    if (frame) {
      frame.style.transform = `scale(${scale})`;
    }
  }

  // The canvas carries the scaled slide's real size while the frame inside it
  // stays at design size, so nothing overflows and grid centring still works.
  function applyScale() {
    const { width, height } = measureStage();
    // The floor only keeps the scale positive; a tiny window should still get
    // a slide that fits rather than one clipped by the viewport.
    scale = Math.max(
      Math.min(width / BASE_WIDTH, height / BASE_HEIGHT) || 0,
      0.01,
    );
    stageCanvas.style.width = `${BASE_WIDTH * scale}px`;
    stageCanvas.style.height = `${BASE_HEIGHT * scale}px`;
    applyFrameScale();
  }

  let resizeObserver = null;
  let pendingFrame = null;

  function cancelPendingFrame() {
    if (pendingFrame !== null) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
  }

  // Safari can fire fullscreenchange before the viewport box settles and may
  // never follow up with resize, so rescale again once layout has caught up.
  function scheduleRescale() {
    if (resizeObserver || typeof window.requestAnimationFrame !== "function") {
      return;
    }
    cancelPendingFrame();
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = null;
        applyScale();
      });
    });
  }

  if (typeof window.ResizeObserver === "function") {
    resizeObserver = new window.ResizeObserver(() => applyScale());
    resizeObserver.observe(stageViewport);
  }

  function handleFullscreenChange() {
    applyScale();
    scheduleRescale();
  }

  function applyBackground(frame, theme) {
    const bg = frame.querySelector(".slide-bg");
    const overlay = frame.querySelector(".slide-overlay");
    const backgroundColor = normalizeColor(theme.bgColor, "#000000");

    bg.style.backgroundColor = backgroundColor;
    bg.style.backgroundImage = theme.bgImageData
      ? `url(${theme.bgImageData})`
      : "none";

    if (theme.overlayColor && typeof theme.overlayTransparency === "number") {
      const opacity = Math.max(
        0,
        Math.min(1, (100 - theme.overlayTransparency) / 100),
      );
      overlay.style.backgroundColor = normalizeColor(
        theme.overlayColor,
        "#000000",
      );
      overlay.style.opacity = `${opacity}`;
    } else {
      overlay.style.backgroundColor = "transparent";
      overlay.style.opacity = "0";
    }
  }

  function renderSingleSlide(slide, theme) {
    const node = singleSlideTemplate.content.firstElementChild.cloneNode(true);
    const label = node.querySelector(".slide-label");
    const text = node.querySelector(".slide-text-single");

    applyBackground(node, theme);
    label.textContent = slide.labelText || "";
    label.style.color = normalizeColor(theme.labelColor, "#f3f0ea");
    label.style.fontSize = "26px";

    text.textContent = slide.text || "";
    text.style.color = normalizeColor(theme.textColor, "#ffffff");
    text.style.fontFamily =
      slide.lang === "en"
        ? "Calibri, Arial, sans-serif"
        : '"Malgun Gothic", sans-serif';
    text.style.fontSize = `${ptToPx(slide.fontSize)}px`;

    return node;
  }

  function renderBilingualSlide(slide, theme) {
    const node =
      bilingualSlideTemplate.content.firstElementChild.cloneNode(true);
    const label = node.querySelector(".slide-label");
    const koText = node.querySelector(".slide-text-ko");
    const enText = node.querySelector(".slide-text-en");

    applyBackground(node, theme);
    label.textContent = slide.labelText || "";
    label.style.color = normalizeColor(theme.labelColor, "#f3f0ea");
    label.style.fontSize = "26px";

    koText.textContent = slide.koText || "";
    koText.style.color = normalizeColor(theme.textColor, "#ffffff");
    koText.style.fontFamily = '"Malgun Gothic", sans-serif';
    koText.style.fontSize = `${ptToPx(slide.koFontSize)}px`;

    enText.textContent = slide.enText || "";
    enText.style.color = normalizeColor(theme.textColor, "#ffffff");
    enText.style.fontFamily = "Calibri, Arial, sans-serif";
    enText.style.fontSize = `${ptToPx(slide.enFontSize)}px`;

    return node;
  }

  function updateControls() {
    if (!deckData) {
      slideCounter.textContent = "0 / 0";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    slideCounter.textContent = `${currentIndex + 1} / ${deckData.slideCount}`;
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= deckData.slideCount - 1;
  }

  function renderSlide() {
    if (!deckData || !deckData.slides.length) {
      setMessage("표시할 슬라이드가 없습니다.");
      updateControls();
      return;
    }

    stageCanvas.innerHTML = "";
    const slide = deckData.slides[currentIndex];
    const node =
      slide.kind === "bilingual"
        ? renderBilingualSlide(slide, deckData.theme)
        : renderSingleSlide(slide, deckData.theme);

    stageCanvas.appendChild(node);
    applyFrameScale();
    updateControls();
  }

  function navigate(command) {
    if (blackout || !deckData?.slides.length) return;
    let nextIndex = currentIndex;
    if (command === "first") nextIndex = 0;
    if (command === "last") nextIndex = deckData.slides.length - 1;
    if (command === "next")
      nextIndex = Math.min(currentIndex + 1, deckData.slides.length - 1);
    if (command === "previous") nextIndex = Math.max(currentIndex - 1, 0);
    if (nextIndex === currentIndex) return;
    currentIndex = nextIndex;
    renderSlide();
  }

  const presenter = presenterFactory({
    document,
    window,
    onNavigate: navigate,
    onFullscreenChange: handleFullscreenChange,
    onBlackoutChange: (active) => {
      blackout = active;
    },
  });

  async function loadSession() {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session");

    // Messages fill the canvas, so it needs its box before the first one.
    applyScale();

    if (!sessionId) {
      setMessage("웹 뷰 세션 정보가 없습니다.", { closeable: true });
      return;
    }

    setMessage("슬라이드를 불러오는 중...");

    try {
      const resp = await fetchImpl(
        `/api/scripture/web-view-session/${encodeURIComponent(sessionId)}`,
      );
      const payload = await resp.json();

      if (!resp.ok) {
        throw new Error(payload.error || "웹 뷰 데이터를 불러오지 못했습니다.");
      }

      deckData = payload;
      deckTitle.textContent = payload.title || "성경말씀";
      currentIndex = 0;
      renderSlide();
      applyScale();
      await presenter.attemptAutoFullscreen();
    } catch (err) {
      setMessage(err?.message || "웹 뷰를 불러오는 중 오류가 발생했습니다.", {
        closeable: true,
      });
    }
  }

  prevBtn.addEventListener("click", () => navigate("previous"));
  nextBtn.addEventListener("click", () => navigate("next"));
  window.addEventListener("resize", applyScale);

  function destroy() {
    cancelPendingFrame();
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener("resize", applyScale);
  }

  return {
    applyScale,
    destroy,
    loadSession,
    navigate,
  };
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  createScriptureWebView({ document, window }).loadSession();
}
