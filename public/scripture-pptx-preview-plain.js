const slideImage = document.getElementById("slideImage");
const stateMessage = document.getElementById("stateMessage");
const slideIndicator = document.getElementById("slideIndicator");
const leftHotspot = document.getElementById("leftHotspot");
const rightHotspot = document.getElementById("rightHotspot");

let slides = [];
let currentIndex = 0;

function setMessage(text) {
  stateMessage.textContent = text;
  stateMessage.style.display = "grid";
  slideImage.removeAttribute("src");
  slideImage.style.display = "none";
  slideIndicator.textContent = "0 / 0";
}

function updateIndicator() {
  slideIndicator.textContent = `${
    slides.length === 0 ? 0 : currentIndex + 1
  } / ${slides.length}`;
}

function showSlide(index) {
  if (!slides.length || index < 0 || index >= slides.length) {
    return;
  }

  currentIndex = index;
  stateMessage.style.display = "none";
  slideImage.src = slides[currentIndex];
  slideImage.style.display = "block";
  updateIndicator();
}

function moveSlide(offset) {
  showSlide(currentIndex + offset);
}

async function loadSession() {
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get("session");

  if (!sessionId) {
    setMessage("PPTX Preview 2 세션 정보가 없습니다.");
    return;
  }

  setMessage("PPTX Preview 2를 불러오는 중...");

  try {
    const resp = await fetch(
      `/api/scripture/pptx-preview-session/${encodeURIComponent(sessionId)}`
    );
    const payload = await resp.json();

    if (!resp.ok) {
      throw new Error(payload.error || "PPTX Preview 2 데이터를 불러오지 못했습니다.");
    }

    slides = Array.isArray(payload.slides) ? payload.slides : [];
    currentIndex = 0;

    if (slides.length === 0) {
      throw new Error("렌더링된 슬라이드 이미지가 없습니다.");
    }

    showSlide(0);
  } catch (err) {
    setMessage(err?.message || "PPTX Preview 2를 불러오는 중 오류가 발생했습니다.");
  }
}

leftHotspot.addEventListener("click", () => moveSlide(-1));
rightHotspot.addEventListener("click", () => moveSlide(1));
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    moveSlide(-1);
  } else if (event.key === "ArrowRight" || event.key === " ") {
    event.preventDefault();
    moveSlide(1);
  }
});

loadSession();
