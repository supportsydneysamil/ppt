const BASE_WIDTH = 1333;
const BASE_HEIGHT = 750;

const deckTitle = document.getElementById("deckTitle");
const slideCounter = document.getElementById("slideCounter");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const stageViewport = document.getElementById("stageViewport");
const stageCanvas = document.getElementById("stageCanvas");
const singleSlideTemplate = document.getElementById("singleSlideTemplate");
const bilingualSlideTemplate = document.getElementById("bilingualSlideTemplate");

let deckData = null;
let currentIndex = 0;

function normalizeColor(value, fallback) {
  if (!value) {
    return fallback;
  }
  return value.startsWith("#") ? value : `#${value}`;
}

function ptToPx(value) {
  return Math.round(Number(value || 0) * 1.333);
}

function setMessage(text) {
  stageCanvas.innerHTML = "";
  const message = document.createElement("div");
  message.className = "state-message";
  message.textContent = text;
  stageCanvas.appendChild(message);
}

function applyScale() {
  const rect = stageViewport.getBoundingClientRect();
  const scale = Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT);
  stageCanvas.style.transform = `scale(${Math.max(scale, 0.1)})`;
}

function applyBackground(frame, theme) {
  const bg = frame.querySelector(".slide-bg");
  const overlay = frame.querySelector(".slide-overlay");
  const backgroundColor = normalizeColor(theme.bgColor, "#000000");

  bg.style.backgroundColor = backgroundColor;
  bg.style.backgroundImage = theme.bgImageData ? `url(${theme.bgImageData})` : "none";

  if (theme.overlayColor && typeof theme.overlayTransparency === "number") {
    const opacity = Math.max(0, Math.min(1, (100 - theme.overlayTransparency) / 100));
    overlay.style.backgroundColor = normalizeColor(theme.overlayColor, "#000000");
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
  text.style.fontFamily = slide.lang === "en" ? "Calibri, Arial, sans-serif" : "\"Malgun Gothic\", sans-serif";
  text.style.fontSize = `${ptToPx(slide.fontSize)}px`;

  return node;
}

function renderBilingualSlide(slide, theme) {
  const node = bilingualSlideTemplate.content.firstElementChild.cloneNode(true);
  const label = node.querySelector(".slide-label");
  const koText = node.querySelector(".slide-text-ko");
  const enText = node.querySelector(".slide-text-en");

  applyBackground(node, theme);
  label.textContent = slide.labelText || "";
  label.style.color = normalizeColor(theme.labelColor, "#f3f0ea");
  label.style.fontSize = "26px";

  koText.textContent = slide.koText || "";
  koText.style.color = normalizeColor(theme.textColor, "#ffffff");
  koText.style.fontFamily = "\"Malgun Gothic\", sans-serif";
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
  updateControls();
}

function moveSlide(offset) {
  if (!deckData) {
    return;
  }

  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= deckData.slides.length) {
    return;
  }

  currentIndex = nextIndex;
  renderSlide();
}

async function loadSession() {
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get("session");

  if (!sessionId) {
    setMessage("Web View 세션 정보가 없습니다.");
    return;
  }

  setMessage("슬라이드를 불러오는 중...");

  try {
    const resp = await fetch(`/api/scripture/web-view-session/${encodeURIComponent(sessionId)}`);
    const payload = await resp.json();

    if (!resp.ok) {
      throw new Error(payload.error || "Web View 데이터를 불러오지 못했습니다.");
    }

    deckData = payload;
    deckTitle.textContent = payload.title || "성경말씀";
    currentIndex = 0;
    renderSlide();
    applyScale();
  } catch (err) {
    setMessage(err?.message || "Web View를 불러오는 중 오류가 발생했습니다.");
  }
}

prevBtn.addEventListener("click", () => moveSlide(-1));
nextBtn.addEventListener("click", () => moveSlide(1));
window.addEventListener("resize", applyScale);
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    moveSlide(-1);
  } else if (event.key === "ArrowRight" || event.key === " ") {
    event.preventDefault();
    moveSlide(1);
  }
});

loadSession();
