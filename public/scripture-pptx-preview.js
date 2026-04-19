const deckTitle = document.getElementById("deckTitle");
const deckFilename = document.getElementById("deckFilename");
const slideCounter = document.getElementById("slideCounter");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const downloadLink = document.getElementById("downloadLink");
const slideImage = document.getElementById("slideImage");
const stateMessage = document.getElementById("stateMessage");

let slides = [];
let currentIndex = 0;

function setMessage(text) {
  stateMessage.textContent = text;
  stateMessage.style.display = "grid";
  slideImage.removeAttribute("src");
  slideImage.style.display = "none";
  slideImage.alt = text;
  slideCounter.textContent = "0 / 0";
  prevBtn.disabled = true;
  nextBtn.disabled = true;
}

function updateControls() {
  const total = slides.length;
  slideCounter.textContent = `${total === 0 ? 0 : currentIndex + 1} / ${total}`;
  prevBtn.disabled = total === 0 || currentIndex <= 0;
  nextBtn.disabled = total === 0 || currentIndex >= total - 1;
}

function showSlide(index) {
  if (!slides.length || index < 0 || index >= slides.length) {
    return;
  }

  currentIndex = index;
  stateMessage.style.display = "none";
  slideImage.src = slides[currentIndex];
  slideImage.style.display = "block";
  updateControls();
}

function moveSlide(offset) {
  showSlide(currentIndex + offset);
}

async function loadSession() {
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get("session");

  if (!sessionId) {
    setMessage("PPTX Preview 세션 정보가 없습니다.");
    return;
  }

  setMessage("PPTX 파일을 불러오는 중...");

  try {
    const resp = await fetch(
      `/api/scripture/pptx-preview-session/${encodeURIComponent(sessionId)}`
    );
    const payload = await resp.json();

    if (!resp.ok) {
      throw new Error(payload.error || "PPTX Preview 데이터를 불러오지 못했습니다.");
    }

    deckTitle.textContent = payload.title || "PPTX Preview";
    deckFilename.textContent = payload.filename || "";
    downloadLink.href = payload.downloadUrl || "#";
    slides = Array.isArray(payload.slides) ? payload.slides : [];
    currentIndex = 0;

    if (slides.length === 0) {
      throw new Error("렌더링된 슬라이드 이미지가 없습니다.");
    }

    showSlide(0);
  } catch (err) {
    setMessage(err?.message || "PPTX Preview를 불러오는 중 오류가 발생했습니다.");
  }
}

prevBtn.addEventListener("click", () => moveSlide(-1));
nextBtn.addEventListener("click", () => moveSlide(1));
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    moveSlide(-1);
  } else if (event.key === "ArrowRight" || event.key === " ") {
    event.preventDefault();
    moveSlide(1);
  }
});

loadSession();
