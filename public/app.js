const testamentSelect = document.getElementById("testament");
const bookSelect = document.getElementById("book");
const chapterInput = document.getElementById("chapter");
const startInput = document.getElementById("startVerse");
const endInput = document.getElementById("endVerse");
const form = document.getElementById("verseForm");
const outputText = document.getElementById("outputText");
const source = document.getElementById("source");
const downloadBtn = document.getElementById("downloadBtn");
const downloadPptxBtn = document.getElementById("downloadPptxBtn");
const resetBtn = document.getElementById("resetBtn");
const koVersionSelect = document.getElementById("koVersionSelect");
const enVersionSelect = document.getElementById("enVersionSelect");
const uiThemeSelect = document.getElementById("uiThemeSelect");
const pptxThemeSelect = document.getElementById("pptxThemeSelect");
const pptxImageToggle = document.getElementById("pptxImageToggle");
const pptxImageInput = document.getElementById("pptxImageInput");
const settingsAccordion = document.getElementById("settingsAccordion");

let dataCache = null;

async function loadBooks() {
  const resp = await fetch("/api/books");
  if (!resp.ok) {
    throw new Error("failed to load books");
  }
  dataCache = await resp.json();
  renderTestaments();
}

function renderTestaments() {
  testamentSelect.innerHTML = "";
  dataCache.testaments.forEach((testament) => {
    const option = document.createElement("option");
    option.value = testament.id;
    option.textContent = testament.label;
    testamentSelect.appendChild(option);
  });

  testamentSelect.value = dataCache.testaments[0]?.id || "";
  renderBooks();
}

function renderBooks() {
  const selected = dataCache.testaments.find(
    (testament) => testament.id === testamentSelect.value
  );
  bookSelect.innerHTML = "";
  if (!selected) {
    return;
  }

  selected.books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book.slugKo;
    option.textContent = book.name;
    bookSelect.appendChild(option);
  });
}

function buildParams() {
  const params = new URLSearchParams();
  params.set("testament", testamentSelect.value);
  params.set("book", bookSelect.value);
  params.set("chapter", chapterInput.value.trim());

  const languages = [];
  if (koVersionSelect.value) {
    languages.push("ko");
    params.set("koVersion", koVersionSelect.value);
  }
  if (enVersionSelect.value) {
    languages.push("en");
  }
  if (languages.length > 0) {
    params.set("lang", languages.join(","));
  }

  if (startInput.value.trim()) {
    params.set("start", startInput.value.trim());
  }
  if (endInput.value.trim()) {
    params.set("end", endInput.value.trim());
  }

  return params;
}

async function handleSubmit(event) {
  event.preventDefault();
  outputText.textContent = "불러오는 중...";
  source.textContent = "";
  setDownloadState(false);

  if (!koVersionSelect.value && !enVersionSelect.value) {
    outputText.textContent = "번역을 하나 이상 선택하세요.";
    return;
  }

  try {
    const params = buildParams();
    const resp = await fetch(`/api/verses?${params.toString()}`);
    const payload = await resp.json();

    if (!resp.ok) {
      outputText.textContent = payload.error || "오류가 발생했습니다.";
      return;
    }

    outputText.textContent = formatOutput(payload.lines);
    source.textContent = formatSources(payload.sourceUrl);
    setDownloadState(Boolean(outputText.textContent.trim()));
  } catch (err) {
    outputText.textContent = "네트워크 오류가 발생했습니다.";
  }
}

function formatOutput(linesByLang) {
  const sections = [];
  if (linesByLang.ko && linesByLang.ko.length) {
    sections.push(`[한글 (${getKoLabel()})]`);
    sections.push(linesByLang.ko.join("\n"));
  }
  if (linesByLang.en && linesByLang.en.length) {
    sections.push("[NIV]");
    sections.push(linesByLang.en.join("\n"));
  }
  return sections.join("\n\n");
}

function formatSources(sourceUrls) {
  if (!sourceUrls) {
    return "";
  }
  const parts = [];
  if (sourceUrls.ko) {
    parts.push(`KO: ${sourceUrls.ko}`);
  }
  if (sourceUrls.en) {
    parts.push(`EN: ${sourceUrls.en}`);
  }
  return parts.join(" | ");
}

function getKoLabel() {
  switch (koVersionSelect.value) {
    case "개역한글":
      return "KRV";
    case "현대인의-성경":
      return "KLB";
    case "새번역":
    default:
      return "RNKSV";
  }
}

testamentSelect.addEventListener("change", renderBooks);
form.addEventListener("submit", handleSubmit);
downloadBtn.addEventListener("click", handleDownload);
downloadPptxBtn.addEventListener("click", handlePptxDownload);
resetBtn.addEventListener("click", handleReset);
pptxImageToggle.addEventListener("change", handleImageToggle);
uiThemeSelect.addEventListener("change", handleThemeChange);
pptxThemeSelect.addEventListener("change", handlePptxThemeChange);
settingsAccordion.addEventListener("toggle", handleSettingsToggle);

loadBooks().catch(() => {
  outputText.textContent = "도서 목록을 불러오지 못했습니다.";
});
setDownloadState(false);
initTheme();
initPptxTheme();
handleSettingsToggle();

function handleReset() {
  if (!dataCache) {
    return;
  }
  testamentSelect.value = dataCache.testaments[0]?.id || "";
  renderBooks();
  chapterInput.value = "";
  startInput.value = "";
  endInput.value = "";
  koVersionSelect.value = "새번역";
  enVersionSelect.value = "";
  pptxThemeSelect.value = "dark";
  localStorage.setItem("biblics-pptx-theme", "dark");
  pptxImageToggle.checked = false;
  pptxImageInput.value = "";
  pptxImageInput.disabled = true;
  outputText.textContent = "원하는 범위를 입력하고 실행하세요.";
  source.textContent = "";
  setDownloadState(false);
}

function handleDownload() {
  const content = outputText.textContent.trim();
  if (!content) {
    return;
  }

  const blob = new Blob([content + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildFilename("txt");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function handlePptxDownload() {
  outputText.textContent = outputText.textContent.trim()
    ? outputText.textContent
    : "불러오는 중...";

  try {
    const payload = await buildPptxPayload();
    const resp = await fetch("/api/pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const payload = await resp.json();
      outputText.textContent = payload.error || "PPTX 생성에 실패했습니다.";
      return;
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      getFilenameFromDisposition(resp.headers.get("content-disposition")) ||
      buildFilename("pptx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    outputText.textContent =
      err?.message || "PPTX 다운로드 중 오류가 발생했습니다.";
  }
}

function buildFilename(extension) {
  const bookLabel = bookSelect.selectedOptions[0]?.textContent || "bible";
  const chapter = chapterInput.value.trim() || "chapter";
  const start = startInput.value.trim();
  const end = endInput.value.trim();
  const langLabel = buildLanguageLabel();
  const range = start && end ? `${start}-${end}` : start || end || "all";
  const ext = extension || "txt";
  const raw = `${bookLabel}_${chapter}_${range}_${langLabel}.${ext}`;

  return sanitizeFilename(raw);
}

function buildLanguageLabel() {
  if (koVersionSelect.value && enVersionSelect.value) {
    return "KO-EN";
  }
  if (koVersionSelect.value) {
    return "KO";
  }
  if (enVersionSelect.value) {
    return "EN";
  }
  return "LANG";
}

function getFilenameFromDisposition(value) {
  if (!value) {
    return "";
  }
  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch (err) {
      return "";
    }
  }
  const match = value.match(/filename=\"?([^\";]+)\"?/i);
  return match ? match[1] : "";
}

function sanitizeFilename(value) {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, "_");
}

function setDownloadState(enabled) {
  downloadBtn.disabled = !enabled;
  downloadPptxBtn.disabled = !enabled;
}

function initTheme() {
  const saved = localStorage.getItem("biblics-theme");
  const theme = saved || uiThemeSelect.value || "dark";
  uiThemeSelect.value = theme;
  document.body.dataset.theme = theme;
}

function handleThemeChange() {
  const theme = uiThemeSelect.value;
  document.body.dataset.theme = theme;
  localStorage.setItem("biblics-theme", theme);
}

function initPptxTheme() {
  const saved = localStorage.getItem("biblics-pptx-theme");
  const theme = saved || pptxThemeSelect.value || "dark";
  pptxThemeSelect.value = theme;
}

function handlePptxThemeChange() {
  localStorage.setItem("biblics-pptx-theme", pptxThemeSelect.value);
}

function handleImageToggle() {
  pptxImageInput.disabled = !pptxImageToggle.checked;
  if (!pptxImageToggle.checked) {
    pptxImageInput.value = "";
  }
}

function handleSettingsToggle() {
  if (!settingsAccordion) {
    return;
  }
  const chevron = settingsAccordion.querySelector(".chevron");
  if (chevron) {
    chevron.textContent = settingsAccordion.open ? "▴" : "▾";
  }
}

async function buildPptxPayload() {
  const params = buildParams();
  const payload = Object.fromEntries(params.entries());
  payload.themeId = pptxThemeSelect.value;
  payload.useCustomImage = pptxImageToggle.checked;
  payload.koVersion = koVersionSelect.value || "";
  payload.enVersion = enVersionSelect.value || "";

  if (pptxImageToggle.checked) {
    const file = pptxImageInput.files?.[0];
    if (!file) {
      throw new Error("배경 이미지를 선택하세요.");
    }
    payload.customImageData = await readFileAsDataUrl(file);
  }

  return payload;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지 읽기에 실패했습니다."));
    reader.readAsDataURL(file);
  });
}
