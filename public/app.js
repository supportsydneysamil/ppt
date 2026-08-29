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
const previewBtn = document.getElementById("previewBtn");
const preview2Btn = document.getElementById("preview2Btn");
const webViewBtn = document.getElementById("webViewBtn");
const exportToPptGeneratorBtn = document.getElementById(
  "exportToPptGeneratorBtn"
);
const resetBtn = document.getElementById("resetBtn");
const koVersionSelect = document.getElementById("koVersionSelect");
const enVersionSelect = document.getElementById("enVersionSelect");
const stepperButtons = document.querySelectorAll(".stepper-btn");
const uiThemeSelect = document.getElementById("uiThemeSelect");
const pptxThemeSelect = document.getElementById("pptxThemeSelect");
const pptxImageInput = document.getElementById("pptxImageInput");
const pptxImageClearBtn = document.getElementById("pptxImageClearBtn");
const pptxImageStatus = document.getElementById("pptxImageStatus");
const settingsAccordion = document.getElementById("settingsAccordion");
const appSettingsBtn = document.getElementById("appSettingsBtn");
const appSettingsModal = document.getElementById("appSettingsModal");
const appSettingsCloseBtn = document.getElementById("appSettingsCloseBtn");
const currentAppThemeLabel = document.getElementById("currentAppThemeLabel");
const appThemeOptionButtons = document.querySelectorAll("[data-theme-value]");
const scriptureExportModal = document.getElementById("scriptureExportModal");
const scriptureExportForm = document.getElementById("scriptureExportForm");
const scriptureExportCancelBtn = document.getElementById(
  "scriptureExportCancelBtn"
);
const scriptureExportCloseBtn = document.getElementById(
  "scriptureExportCloseBtn"
);
const scriptureExportConfirmBtn = document.getElementById(
  "scriptureExportConfirmBtn"
);
const exportSlideNameInput = document.getElementById("exportSlideName");
const exportIncludeTitleSlideInput = document.getElementById(
  "exportIncludeTitleSlide"
);
const titleSlideTypeGroup = document.getElementById("titleSlideTypeGroup");

let dataCache = null;
let lastVersePayload = null;
let lastVerseRequest = null;
let lastPreviewSessionId = null;
let lastPreviewSignature = "";

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
    params.set("enVersion", enVersionSelect.value);
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
  lastVersePayload = null;
  lastVerseRequest = null;
  lastPreviewSessionId = null;
  lastPreviewSignature = "";

  if (!koVersionSelect.value && !enVersionSelect.value) {
    outputText.textContent = "번역을 하나 이상 선택하세요.";
    return;
  }

  try {
    const params = buildParams();
    const requestSnapshot = buildVerseRequestSnapshot(params);
    const resp = await fetch(`/api/verses?${params.toString()}`);
    const payload = await resp.json();

    if (!resp.ok) {
      outputText.textContent = payload.error || "오류가 발생했습니다.";
      return;
    }

    outputText.textContent = formatOutput(payload.lines);
    source.textContent = formatSources(payload.sourceUrl);
    lastVersePayload = payload;
    lastVerseRequest = requestSnapshot;
    setDownloadState(Boolean(outputText.textContent.trim()));
  } catch (err) {
    outputText.textContent = "네트워크 오류가 발생했습니다.";
  }
}

function buildVerseRequestSnapshot(params) {
  const snapshot = Object.fromEntries(params.entries());
  snapshot.koVersion = koVersionSelect.value || "";
  snapshot.enVersion = enVersionSelect.value || "";
  return snapshot;
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

function parsePositiveNumber(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function syncVerseRange(changedInput) {
  const startValue = parsePositiveNumber(startInput.value);
  const endValue = parsePositiveNumber(endInput.value);

  if (changedInput === startInput && startValue !== null) {
    if (endValue !== null && endValue < startValue) {
      endInput.value = String(startValue);
    }
    return;
  }

  if (changedInput === endInput && endValue !== null) {
    if (startValue !== null && endValue < startValue) {
      startInput.value = String(endValue);
    }
  }
}

function normalizeNumberInput(input) {
  const value = parsePositiveNumber(input.value);
  if (input.value.trim() === "") {
    return;
  }
  if (value === null) {
    input.value = input.min || "1";
  } else {
    input.value = String(value);
  }

  if (input === startInput || input === endInput) {
    syncVerseRange(input);
  }
}

function handleStepperButtonClick(event) {
  const button = event.currentTarget;
  const targetId = button.dataset.stepTarget;
  const direction = button.dataset.stepDirection;
  const input = document.getElementById(targetId);
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const currentValue = parsePositiveNumber(input.value) ?? parsePositiveNumber(input.min) ?? 1;
  const nextValue = direction === "down" ? Math.max(1, currentValue - 1) : currentValue + 1;
  input.value = String(nextValue);

  if (input === startInput || input === endInput) {
    syncVerseRange(input);
  }

  input.focus();
  input.select();
}

testamentSelect.addEventListener("change", renderBooks);
form.addEventListener("submit", handleSubmit);
downloadBtn.addEventListener("click", handleDownload);
downloadPptxBtn.addEventListener("click", handlePptxDownload);
previewBtn.addEventListener("click", handleOpenPptxPreview);
preview2Btn.addEventListener("click", handleOpenPptxPreview2);
webViewBtn.addEventListener("click", handleOpenWebView);
exportToPptGeneratorBtn.addEventListener("click", openScriptureExportModal);
resetBtn.addEventListener("click", handleReset);
pptxImageInput.addEventListener("change", handleImageFileChange);
pptxImageClearBtn.addEventListener("click", clearImageSelection);
uiThemeSelect.addEventListener("change", handleThemeChange);
pptxThemeSelect.addEventListener("change", handlePptxThemeChange);
settingsAccordion.addEventListener("toggle", handleSettingsToggle);
appSettingsBtn.addEventListener("click", openAppSettingsModal);
appSettingsCloseBtn.addEventListener("click", closeAppSettingsModal);
appSettingsModal.addEventListener("click", handleAppSettingsBackdropClick);
appThemeOptionButtons.forEach((button) => {
  button.addEventListener("click", handleAppThemeOptionClick);
});
scriptureExportForm.addEventListener("submit", handleExportToPptGenerator);
scriptureExportCancelBtn.addEventListener("click", closeScriptureExportModal);
scriptureExportCloseBtn.addEventListener("click", closeScriptureExportModal);
exportIncludeTitleSlideInput.addEventListener("change", () => {
  titleSlideTypeGroup.classList.toggle("hidden", !exportIncludeTitleSlideInput.checked);
});
stepperButtons.forEach((button) => {
  button.addEventListener("click", handleStepperButtonClick);
});
[chapterInput, startInput, endInput].forEach((input) => {
  input.addEventListener("change", () => normalizeNumberInput(input));
  input.addEventListener("blur", () => normalizeNumberInput(input));
});

loadBooks().catch(() => {
  outputText.textContent = "도서 목록을 불러오지 못했습니다.";
});
setDownloadState(false);
initTheme();
initPptxTheme();
handleSettingsToggle();
syncImageSelectionUI();

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
  clearImageSelection();
  outputText.textContent = "원하는 범위를 입력하고 실행하세요.";
  source.textContent = "";
  lastVersePayload = null;
  lastVerseRequest = null;
  lastPreviewSessionId = null;
  lastPreviewSignature = "";
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
    const signature = JSON.stringify(payload);

    if (lastPreviewSessionId && lastPreviewSignature === signature) {
      const resp = await fetch(
        `/api/scripture/pptx-preview-file/${encodeURIComponent(
          lastPreviewSessionId
        )}?download=1`
      );
      if (!resp.ok) {
        throw new Error("기존 preview 파일을 가져오지 못했습니다.");
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
      return;
    }

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
  const bookLabel =
    lastVersePayload?.meta?.bookEntry?.name ||
    bookSelect.selectedOptions[0]?.textContent ||
    "bible";
  const chapter = lastVerseRequest?.chapter || chapterInput.value.trim() || "chapter";
  const start = lastVerseRequest?.start || startInput.value.trim();
  const end = lastVerseRequest?.end || endInput.value.trim();
  const langLabel = buildLanguageLabel();
  const range = start && end ? `${start}-${end}` : start || end || "all";
  const ext = extension || "txt";
  const raw = `${bookLabel}_${chapter}_${range}_${langLabel}.${ext}`;

  return sanitizeFilename(raw);
}

function buildLanguageLabel() {
  const activeLangs = (lastVerseRequest?.lang || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (activeLangs.includes("ko") && activeLangs.includes("en")) {
    return "KO-EN";
  }
  if (activeLangs.includes("ko")) {
    return "KO";
  }
  if (activeLangs.includes("en")) {
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
  previewBtn.disabled = !enabled;
  preview2Btn.disabled = !enabled;
  webViewBtn.disabled = !enabled;
  exportToPptGeneratorBtn.disabled = !enabled;
}

function initTheme() {
  const saved = localStorage.getItem("biblics-theme");
  const theme = saved || uiThemeSelect.value || "dark";
  applyTheme(theme);
}

function handleThemeChange() {
  applyTheme(uiThemeSelect.value);
}

function initPptxTheme() {
  const saved = localStorage.getItem("biblics-pptx-theme");
  const theme = saved || pptxThemeSelect.value || "dark";
  pptxThemeSelect.value = theme;
}

function handlePptxThemeChange() {
  localStorage.setItem("biblics-pptx-theme", pptxThemeSelect.value);
}

function syncImageSelectionUI() {
  const file = pptxImageInput.files?.[0];
  pptxImageStatus.textContent = file
    ? `선택된 이미지: ${file.name}`
    : "선택한 이미지 없음";
  pptxImageClearBtn.hidden = !file;
}

function clearImageSelection() {
  pptxImageInput.value = "";
  syncImageSelectionUI();
}

function handleImageFileChange() {
  syncImageSelectionUI();
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

function openAppSettingsModal() {
  appSettingsModal.showModal();
}

function closeAppSettingsModal() {
  appSettingsModal.close();
}

function handleAppSettingsBackdropClick(event) {
  if (event.target === appSettingsModal) {
    closeAppSettingsModal();
  }
}

function handleAppThemeOptionClick(event) {
  const theme = event.currentTarget.dataset.themeValue;
  if (!theme) {
    return;
  }
  uiThemeSelect.value = theme;
  applyTheme(theme);
}

function applyTheme(theme) {
  uiThemeSelect.value = theme;
  document.body.dataset.theme = theme;
  localStorage.setItem("biblics-theme", theme);
  syncThemePickerUI(theme);
}

function syncThemePickerUI(theme) {
  appThemeOptionButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themeValue === theme);
  });
  if (currentAppThemeLabel) {
    currentAppThemeLabel.textContent = getThemeLabel(theme);
  }
}

function getThemeLabel(theme) {
  const option = uiThemeSelect.querySelector(`option[value="${theme}"]`);
  return option ? option.textContent : "다크 (시그니처)";
}

async function buildPptxPayload() {
  if (!lastVerseRequest) {
    throw new Error("먼저 텍스트를 불러오세요.");
  }

  const payload = {
    ...lastVerseRequest,
    koVersion: lastVerseRequest.koVersion || "",
    enVersion: lastVerseRequest.enVersion || "",
  };
  payload.themeId = pptxThemeSelect.value;
  payload.useCustomImage = Boolean(pptxImageInput.files?.[0]);

  if (payload.useCustomImage) {
    const file = pptxImageInput.files?.[0];
    if (!file) {
      throw new Error("배경 이미지를 선택하세요.");
    }
    payload.customImageData = await readFileAsDataUrl(file);
  }

  return payload;
}

function openScriptureExportModal() {
  if (!lastVerseRequest) {
    alert("먼저 성경 텍스트를 불러오세요.");
    return;
  }

  exportSlideNameInput.value = buildFilename("pptx").replace(/\.pptx$/i, "");
  exportIncludeTitleSlideInput.checked = true;
  titleSlideTypeGroup.classList.remove("hidden");

  if (typeof scriptureExportModal.showModal === "function") {
    scriptureExportModal.showModal();
  } else {
    scriptureExportModal.setAttribute("open", "open");
  }
}

function closeScriptureExportModal() {
  if (typeof scriptureExportModal.close === "function") {
    scriptureExportModal.close();
  } else {
    scriptureExportModal.removeAttribute("open");
  }
}

async function handleOpenWebView() {
  let popup = null;

  try {
    popup = window.open("", "_blank", "width=1440,height=900");
    if (!popup) {
      throw new Error("새 창을 열 수 없습니다. 팝업 차단을 확인하세요.");
    }

    popup.document.write(
      "<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>Web View 준비 중...</title></head><body style='margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0f16;color:#f3f0ea;font-family:Work Sans, sans-serif;'>Web View를 준비하고 있습니다...</body></html>"
    );
    popup.document.close();

    const payload = await buildPptxPayload();
    const resp = await fetch("/api/scripture/web-view-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const sessionPayload = await resp.json();

    if (!resp.ok) {
      throw new Error(sessionPayload.error || "Web View 생성에 실패했습니다.");
    }

    popup.location = `/scripture-web-view.html?session=${encodeURIComponent(
      sessionPayload.sessionId
    )}`;
  } catch (err) {
    if (popup && !popup.closed) {
      popup.close();
    }
    alert(err?.message || "Web View를 여는 중 오류가 발생했습니다.");
  }
}

async function handleOpenPptxPreview() {
  let popup = null;

  try {
    popup = window.open("", "_blank", "width=1440,height=960");
    if (!popup) {
      throw new Error("새 창을 열 수 없습니다. 팝업 차단을 확인하세요.");
    }

    popup.document.write(
      "<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>PPTX Preview 준비 중...</title></head><body style='margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0f16;color:#f3f0ea;font-family:Work Sans, sans-serif;'>PPTX Preview를 준비하고 있습니다...</body></html>"
    );
    popup.document.close();

    const sessionId = await ensurePptxPreviewSession();
    popup.location = `/scripture-pptx-preview.html?session=${encodeURIComponent(
      sessionId
    )}`;
  } catch (err) {
    if (popup && !popup.closed) {
      popup.close();
    }
    alert(err?.message || "PPTX Preview를 여는 중 오류가 발생했습니다.");
  }
}

async function handleOpenPptxPreview2() {
  let popup = null;

  try {
    popup = window.open("", "_blank", "width=1440,height=960");
    if (!popup) {
      throw new Error("새 창을 열 수 없습니다. 팝업 차단을 확인하세요.");
    }

    popup.document.write(
      "<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>PPTX Preview 2 준비 중...</title></head><body style='margin:0;display:grid;place-items:center;min-height:100vh;background:#000;color:#f3f0ea;font-family:Work Sans, sans-serif;'>PPTX Preview 2를 준비하고 있습니다...</body></html>"
    );
    popup.document.close();

    const sessionId = await ensurePptxPreviewSession();
    popup.location = `/scripture-pptx-preview-plain.html?session=${encodeURIComponent(
      sessionId
    )}`;
  } catch (err) {
    if (popup && !popup.closed) {
      popup.close();
    }
    alert(err?.message || "PPTX Preview 2를 여는 중 오류가 발생했습니다.");
  }
}

async function ensurePptxPreviewSession() {
  const payload = await buildPptxPayload();
  const signature = JSON.stringify(payload);

  if (lastPreviewSessionId && lastPreviewSignature === signature) {
    return lastPreviewSessionId;
  }

  const resp = await fetch("/api/scripture/pptx-preview-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const sessionPayload = await resp.json();

  if (!resp.ok) {
    throw new Error(sessionPayload.error || "PPTX Preview 생성에 실패했습니다.");
  }

  lastPreviewSessionId = sessionPayload.sessionId;
  lastPreviewSignature = signature;
  return sessionPayload.sessionId;
}

async function handleExportToPptGenerator(event) {
  event.preventDefault();

  const requestedName = exportSlideNameInput.value.trim();
  if (!requestedName) {
    alert("슬라이드 제목을 입력하세요.");
    exportSlideNameInput.focus();
    return;
  }

  scriptureExportConfirmBtn.disabled = true;
  scriptureExportConfirmBtn.textContent = "Export 중...";

  try {
    const payload = await buildPptxPayload();
    payload.slideName = requestedName;
    payload.includeTitleSlide = exportIncludeTitleSlideInput.checked;
    const selectedType = document.querySelector('input[name="titleSlideType"]:checked');
    payload.titleSlideType = selectedType ? selectedType.value : "말씀";

    const resp = await fetch("/api/scripture/export-slide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responsePayload = await resp.json();

    if (!resp.ok) {
      throw new Error(responsePayload.error || "슬라이드 export에 실패했습니다.");
    }

    mainSlides.push(cloneSlide(responsePayload.slide));
    closeScriptureExportModal();
    switchView("ppt");
    activeTemplateId = null;
    loadWorkspaceSlides(mainSlides);
    selectSlide(responsePayload.slide.id);
    alert(`슬라이드가 추가되었습니다: ${responsePayload.slide.name}`);
  } catch (err) {
    alert(err?.message || "슬라이드 export 중 오류가 발생했습니다.");
  } finally {
    scriptureExportConfirmBtn.disabled = false;
    scriptureExportConfirmBtn.textContent = "Export";
  }
}

const navExtractor = document.getElementById("navExtractor");
const navPpt = document.getElementById("navPpt");
const viewExtractor = document.getElementById("view-extractor");
const viewPpt = document.getElementById("view-ppt");

const slideListContainer = document.getElementById("slideListContainer");
const selectAllSlidesCheckbox = document.getElementById("selectAllSlidesCheckbox");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const selectedCountBadge = document.getElementById("selectedCountBadge");
const slideModeBtn = document.getElementById("slideModeBtn");
const templateMenuBtn = document.getElementById("templateMenuBtn");
const templateMenuDropdown = document.getElementById("templateMenuDropdown");
const templateMenuList = document.getElementById("templateMenuList");
const bulkActionMenuBtn = document.getElementById("bulkActionMenuBtn");
const bulkActionDropdown = document.getElementById("bulkActionDropdown");
const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
const bulkTemplateBtn = document.getElementById("bulkTemplateBtn");
const bulkDownloadBtn = document.getElementById("bulkDownloadBtn");
const templateSaveBtn = document.getElementById("templateSaveBtn");
const templateDeleteBtn = document.getElementById("templateDeleteBtn");
const slideEditor = document.getElementById("slideEditor");
const emptyEditorState = document.getElementById("emptyEditorState");
const addSlideBtn = document.getElementById("addSlideBtn");
const slideListTitle = document.getElementById("slideListTitle");
const editorSaveBtn = document.getElementById("editorSaveBtn");
const editorResetBtn = document.getElementById("editorResetBtn");
const editorCancelBtn = document.getElementById("editorCancelBtn");

const editorDeleteBtn = document.getElementById("editorDeleteBtn");

const slideFontSizeSelect = document.getElementById("slideFontSize");
const editorDownloadBtn = document.getElementById("editorDownloadBtn");

const slideNameInput = document.getElementById("slideName");
const slideTypeSelect = document.getElementById("slideType");
const slideContentInput = document.getElementById("slideContent");
const slideFontSelect = document.getElementById("slideFont");
const slideBgSelect = document.getElementById("slideBg");
const slideAlignSelect = document.getElementById("slideAlign");
const slidePreview = document.getElementById("slidePreview");
const bgTabs = document.querySelectorAll(".bg-tab");
const alignTabs = document.querySelectorAll(".align-tab");
const bgTabsContainer = document.querySelector(".bg-tabs");
const sourceRadios = document.querySelectorAll('input[name="sourceType"]');
const basicSettingsMode = document.getElementById("basicSettingsMode");
const uploadSettingsMode = document.getElementById("uploadSettingsMode");
const simpleSlideSettings = document.getElementById("simpleSlideSettings");
const hymnSlideSettings = document.getElementById("hymnSlideSettings");
const hymnNumberInput = document.getElementById("hymnNumber");
const hymnLoadBtn = document.getElementById("hymnLoadBtn");
const hymnIncludeTitle = document.getElementById("hymnIncludeTitle");
const hymnTitleFields = document.getElementById("hymnTitleFields");
const hymnKorTitleInput = document.getElementById("hymnKorTitle");
const hymnEngTitleInput = document.getElementById("hymnEngTitle");
const userPptxFile = document.getElementById("userPptxFile");
const adContentSettings = document.getElementById("adContentSettings");
const adTitleInput = document.getElementById("adTitle");
const adTitleSizeSelect = document.getElementById("adTitleSize");
const adTitleAlignSelect = document.getElementById("adTitleAlign");
const adBodyContent = document.getElementById("adBodyContent");
const adBodyFont = document.getElementById("adBodyFont");
const adBodyFontSize = document.getElementById("adBodyFontSize");
const adBodyAlign = document.getElementById("adBodyAlign");
const adTextColor = document.getElementById("adTextColor");
const adTextColorTabs = document.querySelectorAll(".ad-text-tab");
const adBgSourceRadios = document.querySelectorAll('input[name="adBgSource"]');
const adBgImageFile = document.getElementById("adBgImageFile");
const adBgImageUrl = document.getElementById("adBgImageUrl");
const adBgOpacity = document.getElementById("adBgOpacity");
const adBgOpacityValue = document.getElementById("adBgOpacityValue");
const bgSettings = document.getElementById("bgSettings");
const dimOverlayRow = document.getElementById("dimOverlayRow");

// State
let slides = [];
let mainSlides = [];
let templates = [];
let activeTemplateId = null;
let hasPendingTemplateChanges = false;
let currentSlideId = null;
let hasUnsavedChanges = false;
let selectedSlideIds = new Set();
let draggedSlideId = null;

function generateClientId(prefix = "slide") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSlide(slide, options = {}) {
  const { regenerateId = false } = options;
  const cloned = {
    ...buildSerializableSlide(slide),
  };

  if (regenerateId || !cloned.id) {
    cloned.id = generateClientId("slide");
  }

  return cloned;
}

function cloneTemplate(template) {
  return {
    ...template,
    slides: Array.isArray(template?.slides)
      ? template.slides.map((slide) => cloneSlide(slide))
      : [],
    slideCount: Array.isArray(template?.slides)
      ? template.slides.length
      : template?.slideCount || 0,
  };
}

function isTemplateMode() {
  return Boolean(activeTemplateId);
}

function getActiveTemplate() {
  return templates.find((template) => template.id === activeTemplateId) || null;
}

function syncWorkingSlidesToState() {
  if (isTemplateMode()) {
    const templateIndex = templates.findIndex((template) => template.id === activeTemplateId);
    if (templateIndex !== -1) {
      templates[templateIndex] = {
        ...templates[templateIndex],
        slides: slides.map((slide) => cloneSlide(slide)),
        slideCount: slides.length,
      };
    }
    return;
  }

  mainSlides = slides.map((slide) => cloneSlide(slide));
}

function markTemplateDirty() {
  if (!isTemplateMode()) {
    return;
  }
  syncWorkingSlidesToState();
  hasPendingTemplateChanges = true;
  updateTemplateManagementUi();
}

function resetEditorSelection() {
  currentSlideId = null;
  hasUnsavedChanges = false;
  emptyEditorState.style.display = "flex";
  slideEditor.style.display = "none";
}

function confirmLeavingDirtyWorkspace() {
  if (isTemplateMode() && hasPendingTemplateChanges) {
    if (!confirm("템플릿에 저장되지 않은 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?")) {
      return false;
    }
  }

  if (!currentSlideId) {
    return true;
  }

  const currentSlide = slides.find((slide) => slide.id === currentSlideId);
  if (currentSlide && !currentSlide.saved) {
    if (!confirm("이 슬라이드는 저장되지 않았습니다. 이동하면 삭제됩니다. 계속하시겠습니까?")) {
      return false;
    }
  } else if (hasUnsavedChanges) {
    if (!confirm("저장하지 않은 변경사항이 있습니다. 무시하고 이동하시겠습니까?")) {
      return false;
    }
  }

  return true;
}

function loadWorkspaceSlides(nextSlides) {
  slides = (Array.isArray(nextSlides) ? nextSlides : []).map((slide) => cloneSlide(slide));
  selectedSlideIds.clear();
  resetEditorSelection();
  renderSlideList();
}

function updateTemplateManagementUi() {
  const activeTemplate = getActiveTemplate();

  if (slideListTitle) {
    slideListTitle.textContent = activeTemplate ? activeTemplate.name : "슬라이드 목록";
    slideListTitle.classList.toggle("is-template-title", Boolean(activeTemplate));
    slideListTitle.title = activeTemplate ? "클릭해서 템플릿 이름 수정" : "";
  }

  if (slideModeBtn) {
    slideModeBtn.classList.toggle("active", !activeTemplate);
  }

  if (templateMenuBtn) {
    templateMenuBtn.classList.toggle("active", Boolean(activeTemplate) || !templateMenuDropdown.hidden);
  }

  if (templateSaveBtn) {
    templateSaveBtn.hidden = !activeTemplate;
    templateSaveBtn.disabled = !activeTemplate || !hasPendingTemplateChanges;
  }

  if (templateDeleteBtn) {
    templateDeleteBtn.hidden = !activeTemplate;
  }
}

function renderTemplateSubmenu() {
  const templateListTargets = [templateMenuList].filter(Boolean);
  if (templateListTargets.length === 0) {
    return;
  }

  templateListTargets.forEach((target) => {
    target.innerHTML = "";
  });

  templates.forEach((template) => {
    templateListTargets.forEach((target) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bulk-dropdown-item${template.id === activeTemplateId ? " is-active-template" : ""}`;
      button.textContent = `${template.name} (${(template.slides || []).length})`;
      button.addEventListener("click", () => {
        closeBulkDropdown();
        openTemplateWorkspace(template.id);
      });
      target.appendChild(button);
    });
  });
}

function openMainSlidesWorkspace() {
  if (!confirmLeavingDirtyWorkspace()) {
    return;
  }

  activeTemplateId = null;
  hasPendingTemplateChanges = false;
  loadWorkspaceSlides(mainSlides);
  updateTemplateManagementUi();
}

function openTemplateWorkspace(templateId) {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    return;
  }

  if (!confirmLeavingDirtyWorkspace()) {
    return;
  }

  activeTemplateId = templateId;
  hasPendingTemplateChanges = false;
  loadWorkspaceSlides(template.slides || []);
  updateTemplateManagementUi();
}

function cleanupPreviewResources() {
  const state = slidePreview.__pptxPreviewState;
  if (!state) return;

  if (state.fitInterval) clearInterval(state.fitInterval);
  if (state.resizeObserver) state.resizeObserver.disconnect();
  if (state.rafId) cancelAnimationFrame(state.rafId);
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);

  slidePreview.__pptxPreviewState = null;
}

// --- Event Listeners for Hymn Type ---
slideTypeSelect.addEventListener('change', () => {
  updateSettingsVisibility();
  hasUnsavedChanges = true;
  renderPreview();
});

hymnLoadBtn.addEventListener('click', async () => {
  const number = hymnNumberInput.value;
  if (!number) return alert("찬송가 장수를 입력하세요.");

  hymnLoadBtn.disabled = true;
  hymnLoadBtn.textContent = "다운로드 중...";

  try {
    const res = await fetch('/api/hymn/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Download failed");

    // Update current slide data (in memory)
    const current = slides.find(s => s.id === currentSlideId);
    if (current) {
      current.hymnNumber = number;
      current.serverFilePath = data.path;
      current.fileName = data.originalName;
      current.originalUrl = data.originalUrl;
      current.thumbnail = null;
      current.type = 'hymn';
      current.sourceType = 'upload'; // Vital for renderPreview logic
    }

    // Fetch title BEFORE rendering so title slide is included
    if (hymnIncludeTitle.checked) {
      await fetchAndFillHymnTitle(number);
    }

    if (current) {
      // Sync title fields into current so renderPreview(current) has full data
      current.includeTitle = hymnIncludeTitle.checked;
      current.hymnKorTitle = hymnKorTitleInput.value.trim();
      current.hymnEngTitle = hymnEngTitleInput.value.trim();

      // Clear URL cache so title slide is re-rendered
      if (slidePreview) {
        slidePreview.dataset.lastRenderedUrl = '';
        slidePreview.dataset.lastRenderedPath = '';
      }

      renderPreview(current);
      hasUnsavedChanges = true;
      updateButtonsState(current);
    }
  } catch (e) {
    alert("다운로드 실패: " + e.message);
  } finally {
    hymnLoadBtn.disabled = false;
    hymnLoadBtn.textContent = "로드";
  }
});

async function fetchAndFillHymnTitle(number) {
  if (!number) return;
  try {
    const res = await fetch(`/api/hymn/title/${number}`);
    if (!res.ok) return;
    const data = await res.json();
    hymnKorTitleInput.value = data.kor || '';
    hymnEngTitleInput.value = data.eng || '';
  } catch (e) {
    // silently ignore
  }
}

hymnNumberInput.addEventListener('change', () => {
  if (hymnIncludeTitle.checked && hymnNumberInput.value) {
    fetchAndFillHymnTitle(hymnNumberInput.value);
  }
});

hymnIncludeTitle.addEventListener('change', async () => {
  hymnTitleFields.style.display = hymnIncludeTitle.checked ? 'block' : 'none';
  if (hymnIncludeTitle.checked && hymnNumberInput.value) {
    await fetchAndFillHymnTitle(hymnNumberInput.value);
  }
  // Force preview re-render by clearing cache
  if (slidePreview) {
    slidePreview.dataset.lastRenderedUrl = '';
    slidePreview.dataset.lastRenderedPath = '';
  }
  renderPreview();
  hasUnsavedChanges = true;
});

// --- Navigation ---
function switchView(viewName) {
  if (hasUnsavedChanges) {
    if (!confirm("저장하지 않은 변경사항이 있습니다. 정말 이동하시겠습니까?")) {
      return;
    }
    hasUnsavedChanges = false;
  }

  if (viewName === "extractor") {
    viewExtractor.style.display = "block";
    viewPpt.style.display = "none";
    navExtractor.classList.add("active");
    navPpt.classList.remove("active");
  } else {
    viewExtractor.style.display = "none";
    viewPpt.style.display = "grid";
    navExtractor.classList.remove("active");
    navPpt.classList.add("active");
    renderSlideList();
  }
}

navExtractor.addEventListener("click", () => switchView("extractor"));
navPpt.addEventListener("click", () => switchView("ppt"));
slideModeBtn.addEventListener("click", () => {
  closeBulkDropdown();
  openMainSlidesWorkspace();
});
slideListTitle.addEventListener("click", () => {
  if (!isTemplateMode()) {
    return;
  }
  renameActiveTemplate();
});

// --- Storage (Server Side) ---

async function saveSlidesToServer() {
  try {
    const resp = await fetch("/api/slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slides),
    });
    if (!resp.ok) {
      console.error("Failed to save slides");
      return false;
    }
    mainSlides = slides.map((slide) => cloneSlide(slide));
    return true;
  } catch (e) {
    console.error("Network error saving slides", e);
    return false;
  }
}

async function saveActiveTemplateToServer() {
  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) {
    return false;
  }

  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(activeTemplate.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activeTemplate.name,
        slides: slides.map(buildSerializableSlide),
      }),
    });

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.error || "템플릿 저장에 실패했습니다.");
    }

    const nextTemplate = cloneTemplate(payload.template);
    templates = templates.map((template) =>
      template.id === nextTemplate.id ? nextTemplate : template
    );
    hasPendingTemplateChanges = false;
    updateTemplateManagementUi();
    renderTemplateSubmenu();
    return true;
  } catch (e) {
    console.error("Failed to save template", e);
    alert(e.message || "템플릿 저장에 실패했습니다.");
    return false;
  }
}

async function persistCurrentWorkspace() {
  return saveSlidesToServer();
}

async function loadSlidesFromServer() {
  try {
    const resp = await fetch("/api/slides");
    if (resp.ok) {
      mainSlides = await resp.json();
      if (!Array.isArray(mainSlides)) mainSlides = [];
    }
  } catch (e) {
    console.error("Failed to load slides", e);
    mainSlides = [];
  }
}

async function loadTemplatesFromServer() {
  try {
    const resp = await fetch("/api/templates");
    if (resp.ok) {
      const payload = await resp.json();
      templates = Array.isArray(payload) ? payload.map(cloneTemplate) : [];
    }
  } catch (e) {
    console.error("Failed to load templates", e);
    templates = [];
  }
}

async function loadPptDataFromServer() {
  await Promise.all([loadSlidesFromServer(), loadTemplatesFromServer()]);
  hasPendingTemplateChanges = false;

  const activeTemplate = getActiveTemplate();
  if (activeTemplate) {
    loadWorkspaceSlides(activeTemplate.slides || []);
  } else {
    loadWorkspaceSlides(mainSlides);
  }

  renderTemplateSubmenu();
  updateTemplateManagementUi();
}

function syncSelectedSlideIds() {
  const validIds = new Set(slides.map((slide) => slide.id));
  selectedSlideIds = new Set(
    [...selectedSlideIds].filter((id) => validIds.has(id))
  );
}

function getSelectedSlides() {
  return slides.filter((slide) => selectedSlideIds.has(slide.id));
}

function hasPendingSelectionEdits() {
  return getSelectedSlides().some((slide) => !slide.saved);
}

function updateSlideListControls() {
  const total = slides.length;
  const selectedCount = selectedSlideIds.size;
  const allSelected = total > 0 && selectedCount === total;
  const someSelected = selectedCount > 0 && selectedCount < total;
  const hasSelection = selectedCount > 0;

  if (selectAllSlidesCheckbox) {
    selectAllSlidesCheckbox.checked = allSelected;
    selectAllSlidesCheckbox.indeterminate = someSelected;
    selectAllSlidesCheckbox.disabled = total === 0;
  }

  if (selectedCountBadge) {
    selectedCountBadge.textContent = `${selectedCount}개 선택`;
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.hidden = !hasSelection;
  }

  if (bulkActionMenuBtn) {
    if (hasSelection) {
      bulkActionMenuBtn.removeAttribute("disabled");
    } else {
      bulkActionMenuBtn.setAttribute("disabled", "");
      closeBulkDropdown();
    }
  }
}

function closeBulkDropdown() {
  if (bulkActionDropdown) bulkActionDropdown.hidden = true;
  if (bulkActionMenuBtn) bulkActionMenuBtn.classList.remove("open");
  if (templateMenuDropdown) templateMenuDropdown.hidden = true;
  updateTemplateManagementUi();
}

function toggleSlideSelection(id, forceValue) {
  const shouldSelect =
    typeof forceValue === "boolean"
      ? forceValue
      : !selectedSlideIds.has(id);

  if (shouldSelect) {
    selectedSlideIds.add(id);
  } else {
    selectedSlideIds.delete(id);
  }
  renderSlideList();
}

function setAllSlidesSelected(checked) {
  if (checked) {
    selectedSlideIds = new Set(slides.map((slide) => slide.id));
  } else {
    selectedSlideIds.clear();
  }
  renderSlideList();
}

function clearSlideSelection() {
  if (selectedSlideIds.size === 0) {
    return;
  }
  selectedSlideIds.clear();
  renderSlideList();
}

function moveSlideToIndex(slideId, targetIndex) {
  const fromIndex = slides.findIndex((slide) => slide.id === slideId);
  if (fromIndex === -1) {
    return false;
  }

  const boundedIndex = Math.max(0, Math.min(targetIndex, slides.length - 1));
  if (fromIndex === boundedIndex) {
    return false;
  }

  const [movedSlide] = slides.splice(fromIndex, 1);
  slides.splice(boundedIndex, 0, movedSlide);
  renderSlideList();
  if (isTemplateMode()) {
    markTemplateDirty();
  } else {
    syncWorkingSlidesToState();
    persistCurrentWorkspace();
  }
  return true;
}

function moveSlideByOffset(slideId, offset) {
  const fromIndex = slides.findIndex((slide) => slide.id === slideId);
  if (fromIndex === -1) {
    return;
  }
  moveSlideToIndex(slideId, fromIndex + offset);
}

function getSlideTypeLabel(slide) {
  if (slide.type === "hymn") {
    return "찬송가";
  }
  if (slide.type === "ad") {
    return slide.sourceType === "upload" ? "광고 업로드" : "광고";
  }
  return slide.sourceType === "upload" ? "업로드 슬라이드" : "단순 슬라이드";
}

// ... (loadSlidesFromStorage) ...

// --- Slide Management ---

function createSlide() {
  const newSlide = {
    id: Date.now().toString(),
    name: "새 슬라이드",
    type: "simple",
    sourceType: "basic",
    content: "",
    font: "Malgun Gothic",
    fontSize: "40",
    bg: "black",
    align: "center",
    file: null,      // File object (runtime only)
    fileData: null,  // Base64 string (persistent)
    fileName: null,  // string
    fileSaved: false,// boolean (persisted status)
    saved: false,
    // Ad slide properties
    adTitle: "",
    adTitleSize: "medium",
    adTitleAlign: "center",
    adBgSource: "none",
    adBgImagePath: null,
    adBgImageUrl: null,
    adBgOpacity: 30,
  };
  slides.push(newSlide);
  // Do NOT save to storage yet
  selectSlide(newSlide.id);
  hasUnsavedChanges = true;
  renderSlideList();
}

// ... (selectSlide, populateEditor, toggleSettingsMode) ...

// Helpers
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64, mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
  const arr = base64.split(',');
  const data = arr[1] ? arr[1] : arr[0]; // handle with or without prefix
  const byteString = atob(data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
}

// ... (resetCurrentSlide, updateButtonsState, deleteCurrentSlide, cancelEdit) ...

// ... (renderSlideList) ...

function buildHymnTitleSlidePreview(hymnNumber, korTitle, engTitle) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;margin-bottom:8px;border-radius:4px;';

  // Dark background
  const bg = document.createElement('div');
  bg.style.cssText = `position:absolute;inset:0;background:url('/assets/hymn-title-bg.png') center/cover no-repeat;`;
  wrap.appendChild(bg);

  // Navy bottom band (~23% height)
  const band = document.createElement('div');
  band.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:23%;background:url('/assets/hymn-title-band.png') center/cover no-repeat;display:flex;align-items:center;justify-content:center;`;
  wrap.appendChild(band);

  // 찬/송 decorative characters
  const chanEl = document.createElement('div');
  chanEl.textContent = '찬';
  chanEl.style.cssText = 'position:absolute;left:41%;top:27%;font-family:Batang,serif;font-size:6.5cqi;font-weight:bold;color:#fff;text-shadow:2px 2px 8px rgba(0,0,0,0.5);container-type:inline-size;';
  wrap.appendChild(chanEl);

  const songEl = document.createElement('div');
  songEl.textContent = '송';
  songEl.style.cssText = 'position:absolute;left:51%;top:33%;font-family:Batang,serif;font-size:6.5cqi;font-weight:bold;color:#fff;text-shadow:2px 2px 8px rgba(0,0,0,0.5);';
  wrap.appendChild(songEl);

  // Decorative line
  const line = document.createElement('div');
  line.style.cssText = 'position:absolute;left:39%;top:54%;width:24%;height:1px;background:#fff;';
  wrap.appendChild(line);

  // HYMN label
  const hymnLabel = document.createElement('div');
  hymnLabel.textContent = 'H Y M N';
  hymnLabel.style.cssText = 'position:absolute;left:39%;top:57%;width:24%;text-align:center;font-family:Arial,sans-serif;font-size:1.2cqi;font-weight:bold;color:#fff;letter-spacing:0.3em;';
  wrap.appendChild(hymnLabel);

  // Title text in band
  const titleEl = document.createElement('div');
  let titleText = hymnNumber ? `${hymnNumber}.` : '';
  if (korTitle) titleText += ` ${korTitle}`;
  if (engTitle) titleText += `\n(${engTitle})`;
  titleEl.style.cssText = 'text-align:center;font-family:"Malgun Gothic",sans-serif;font-size:1.6cqi;font-weight:bold;color:#fff;white-space:pre-line;line-height:1.3;padding:0 8px;';
  titleEl.textContent = titleText.trim();
  band.appendChild(titleEl);

  // container-type for cqi units
  wrap.style.containerType = 'inline-size';

  return wrap;
}

function renderPreview(slideOverride) {
  if (!slidePreview) return;

  let data = slideOverride;

  if (!data) {
    const type = slideTypeSelect.value;
    if (type === 'hymn') {
      data = {
        ...((slides.find(s => s.id === currentSlideId) || {})),
        type: 'hymn',
        hymnNumber: hymnNumberInput.value,
        includeTitle: hymnIncludeTitle.checked,
        hymnKorTitle: hymnKorTitleInput.value.trim(),
        hymnEngTitle: hymnEngTitleInput.value.trim(),
      };
      data.sourceType = 'upload';
    } else if (type === 'ad') {
      data = {
        name: slideNameInput.value,
        type: 'ad',
        sourceType: document.querySelector('input[name="sourceType"]:checked').value,
        content: adBodyContent.value,
        font: adBodyFont.value,
        fontSize: adBodyFontSize.value,
        bg: adTextColor.value,
        align: adBodyAlign.value,
        adTitle: adTitleInput.value,
        adTitleSize: adTitleSizeSelect.value,
        adTitleAlign: adTitleAlignSelect.value,
        adBgSource: document.querySelector('input[name="adBgSource"]:checked').value,
        adBgImageUrl: adBgImageUrl.value,
        adBgOpacity: parseInt(adBgOpacity.value),
        file: userPptxFile.files[0],
        adBgImageFile: adBgImageFile.files[0]
      };
    } else {
      data = {
        name: slideNameInput.value,
        type: 'simple',
        sourceType: document.querySelector('input[name="sourceType"]:checked').value,
        content: slideContentInput.value,
        font: slideFontSelect.value,
        fontSize: slideFontSizeSelect.value,
        bg: adTextColor.value,
        align: slideAlignSelect.value,
        adBgSource: document.querySelector('input[name="adBgSource"]:checked').value,
        adBgImageUrl: adBgImageUrl.value,
        adBgImageFile: adBgImageFile.files[0],
        adBgOpacity: parseInt(adBgOpacity.value),
        file: userPptxFile.files[0]
      };
    }

    // If we are editing an EXISTING slide
    if (currentSlideId) {
      const current = slides.find(s => s.id === currentSlideId);
      if (current) {
        // Essential: Attach serverFilePath if available (for .ppt conversion preview)
        if (current.serverFilePath) {
          data.serverFilePath = current.serverFilePath;
        }

        // If no NEW file picked, restore saved metadata
        if (!data.file) {
          if (data.sourceType === 'upload') {
            if (current.fileName || current.serverFilePath) {
              data.currentFileName = current.fileName || (current.serverFilePath ? current.serverFilePath.split('/').pop() : 'Unknown File');
              data.currentFileSaved = current.fileSaved || Boolean(current.serverFilePath);
              data.currentThumbnail = current.thumbnail;
            }
          }
        }
      }
    }
  }

  // Optimization: Prevent iframe reload on name change (Comprehensive)
  let skipRender = false;

  // Case 1: Legacy PPT URL Cache
  let potentialPptUrl = null;
  if (data.type === 'hymn' || (data.sourceType === 'upload' && (data.originalUrl || data.type === 'hymn'))) {
    potentialPptUrl = data.originalUrl;
    if (!potentialPptUrl && data.type === 'hymn' && data.hymnNumber) {
      potentialPptUrl = `https://www.rickc.online/uploads/1/0/9/7/109730685/nhymn${data.hymnNumber}.ppt`;
    }
  }
  if (potentialPptUrl && slidePreview.dataset.lastRenderedUrl === potentialPptUrl) {
    skipRender = true;
  }

  // Case 2: File object (Blob) Cache
  if (data.file) {
    const fileId = data.file.name + ':' + data.file.size + ':' + data.file.lastModified;
    if (slidePreview.dataset.lastRenderedFile === fileId) {
      skipRender = true;
    }
  }

  // Case 3: Server File Path Cache
  // Only use this if not overridden by a new file upload
  if (data.serverFilePath && !data.file) {
    if (slidePreview.dataset.lastRenderedPath === data.serverFilePath) {
      skipRender = true;
    }
  }

  if (skipRender) {
    return;
  }

  cleanupPreviewResources();

  // Clear caches before render
  slidePreview.dataset.lastRenderedUrl = "";
  slidePreview.dataset.lastRenderedFile = "";
  slidePreview.dataset.lastRenderedPath = "";

  slidePreview.innerHTML = "";

  if (data.sourceType === 'upload') {
    slidePreview.classList.add('preview-scroll-mode'); // Enable scroll layout

    const ph = document.createElement('div');
    ph.className = 'preview-placeholder';
    ph.style.display = 'block'; // Block for stacking
    ph.style.width = '100%';
    ph.style.minHeight = '100%';
    ph.style.padding = '0'; // No padding

    // Container for PPTXjs
    const pptxContainerId = "pptx-renderer-" + Date.now();
    const pptxContainer = document.createElement('div');
    pptxContainer.id = pptxContainerId;
    pptxContainer.className = "pptx-renderer";

    let fileUrl = null;

    if (data.file) {
      // If local file is .ppt (unsupported by viewer) but we have converted .pptx server file, use server file
      if (data.file.name.toLowerCase().endsWith('.ppt') &&
        data.serverFilePath &&
        typeof data.serverFilePath === 'string' &&
        data.serverFilePath.toLowerCase().endsWith('.pptx')) {
        fileUrl = data.serverFilePath;
      } else {
        fileUrl = URL.createObjectURL(data.file);
      }
    } else if (data.serverFilePath) {
      fileUrl = data.serverFilePath;
    } else if (data.currentFileName) {
      // Fallback
    }

    const isLegacyPpt = fileUrl && fileUrl.toLowerCase().endsWith('.ppt');

    if (isLegacyPpt) {
      // Check for public URL for iframe viewer
      let publicUrl = data.originalUrl;

      if (!publicUrl && data.type === 'hymn' && data.hymnNumber) {
        publicUrl = `https://www.rickc.online/uploads/1/0/9/7/109730685/nhymn${data.hymnNumber}.ppt`;
      }

      if (publicUrl) {
        const viewerSrc = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
        ph.innerHTML = `
            <iframe src="${viewerSrc}" width="100%" height="500px" frameborder="0" style="border:none;background:white;"></iframe>
            <div style="text-align:center;margin-top:8px;font-size:12px;color:#666;">
                ⚠️ 미리보기가 보이지 않나요? <a href="${viewerSrc}" target="_blank" style="color:#007bff;text-decoration:underline;">새 창에서 열기</a>
            </div>
        `;
        slidePreview.dataset.lastRenderedUrl = publicUrl;
      } else {
        ph.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:#888;gap:15px;text-align:center;">
              <div style="font-size:48px;">⚠️</div>
              <div style="font-weight:bold;font-size:16px;">미리보기 불가 (.ppt)</div>
              <div style="font-size:13px;color:#aaa;">로컬 업로드된 .ppt 파일은 미리보기를 지원하지 않습니다.<br>외부 링크 파일만 지원됩니다.</div>
          </div>`;
      }
    } else if (fileUrl && window.jQuery && window.jQuery.fn.pptxToHtml) {
      ph.appendChild(pptxContainer);

      const previewState = {
        fitInterval: null,
        objectUrl: data.file && !data.file.name.toLowerCase().endsWith('.ppt') ? fileUrl : null,
        rafId: 0,
        resizeObserver: null
      };
      slidePreview.__pptxPreviewState = previewState;

      // Update Cache State
      if (data.file) {
        slidePreview.dataset.lastRenderedFile = data.file.name + ':' + data.file.size + ':' + data.file.lastModified;
      }
      if (data.serverFilePath) {
        slidePreview.dataset.lastRenderedPath = data.serverFilePath;
      }

      // Render
      setTimeout(() => {
        if (slidePreview.__pptxPreviewState !== previewState) return;

        try {
          window.jQuery(`#${pptxContainerId}`).pptxToHtml({
            pptxFileUrl: fileUrl,
            slidesScale: "50%", // Render at 50% of native
            slideMode: false,
            keyBoardShortCut: false
          });

          // Zoom State
          let manualZoomMultiplier = 1.0;

          const ensureSlideFrame = (slide) => {
            let frame = slide.parentElement;
            if (frame && frame.classList.contains('pptx-slide-frame')) {
              return frame;
            }

            frame = document.createElement('div');
            frame.className = 'pptx-slide-frame';
            slide.parentNode.insertBefore(frame, slide);
            frame.appendChild(slide);
            return frame;
          };

          const scheduleScale = () => {
            if (slidePreview.__pptxPreviewState !== previewState) return;
            if (previewState.rafId) cancelAnimationFrame(previewState.rafId);
            previewState.rafId = requestAnimationFrame(() => {
              previewState.rafId = 0;
              applyScale();
            });
          };

          // Helper: Apply stable scale without feeding layout changes back into ResizeObserver
          const applyScale = () => {
            const container = document.getElementById(pptxContainerId);
            if (!container) return;

            const slides = container.querySelectorAll('.slide');
            if (slides.length === 0) return;

            const styles = window.getComputedStyle(container);
            const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
            const availableWidth = (container.offsetWidth - paddingX) || 400;

            slides.forEach(slide => {
              const frame = ensureSlideFrame(slide);
              const naturalWidth = parseFloat(slide.dataset.naturalWidth || "0") || slide.offsetWidth || slide.scrollWidth || 500;
              const naturalHeight = parseFloat(slide.dataset.naturalHeight || "0") || slide.offsetHeight || slide.scrollHeight || 281;
              slide.dataset.naturalWidth = String(naturalWidth);
              slide.dataset.naturalHeight = String(naturalHeight);

              const baseScale = (availableWidth / naturalWidth) * 0.99;
              const finalScale = Math.max(0.2, baseScale * manualZoomMultiplier);

              frame.style.width = `${naturalWidth * finalScale}px`;
              frame.style.height = `${naturalHeight * finalScale}px`;
              slide.style.transform = `scale(${finalScale})`;
              slide.style.transformOrigin = 'top left';
              slide.style.margin = '0';
              slide.style.borderRadius = "4px";
              slide.style.overflow = "hidden";
            });

            // Update display text
            const display = document.getElementById('zoom-val-' + pptxContainerId);
            if (display) display.textContent = Math.round(manualZoomMultiplier * 100) + '%';
          };

          // Create Zoom Controls
          const controls = document.createElement('div');
          controls.className = 'zoom-controls';
          controls.innerHTML = `
            <button class="zoom-btn" id="zoom-out-${pptxContainerId}">-</button>
            <span class="zoom-display" id="zoom-val-${pptxContainerId}">100%</span>
            <button class="zoom-btn" id="zoom-in-${pptxContainerId}">+</button>
            <button class="zoom-btn" id="zoom-reset-${pptxContainerId}" title="Reset">⟲</button>
          `;
          slidePreview.appendChild(controls); // Fixed position, not inside scroll area

          // Event Listeners for Zoom
          const btnIn = document.getElementById(`zoom-in-${pptxContainerId}`);
          const btnOut = document.getElementById(`zoom-out-${pptxContainerId}`);
          const btnReset = document.getElementById(`zoom-reset-${pptxContainerId}`);

          if (btnIn) btnIn.onclick = (e) => {
            e.stopPropagation();
            manualZoomMultiplier = Math.min(manualZoomMultiplier + 0.1, 3.0);
            scheduleScale();
          };
          if (btnOut) btnOut.onclick = (e) => {
            e.stopPropagation();
            manualZoomMultiplier = Math.max(manualZoomMultiplier - 0.1, 0.2);
            scheduleScale();
          };
          if (btnReset) btnReset.onclick = (e) => {
            e.stopPropagation();
            manualZoomMultiplier = 1.0;
            scheduleScale();
          };

          // Post-render: poll for slides and apply zoom to fit container
          let checks = 0;
          previewState.fitInterval = setInterval(() => {
            checks++;
            const container = document.getElementById(pptxContainerId);
            if (!container || slidePreview.__pptxPreviewState !== previewState) {
              clearInterval(previewState.fitInterval);
              previewState.fitInterval = null;
              return;
            }

            const slides = container.querySelectorAll('.slide');
            if (slides.length > 0) {
              scheduleScale();
            }
            if (checks > 30) {
              clearInterval(previewState.fitInterval);
              previewState.fitInterval = null;
            }
          }, 100);

          // Observe the stable outer shell, not transformed slide nodes.
          previewState.resizeObserver = new ResizeObserver(() => {
            scheduleScale();
          });
          previewState.resizeObserver.observe(slidePreview);

        } catch (e) {
          console.error("PPTXjs error:", e);
          pptxContainer.textContent = "미리보기 로딩 실패";
        }
      }, 50);

    } else {
      // Fallback Logic
      const containerFallback = document.createElement('div');
      containerFallback.style.display = 'flex';
      containerFallback.style.flexDirection = 'column';
      containerFallback.style.alignItems = 'center';
      containerFallback.style.justifyContent = 'center';
      containerFallback.style.height = '100%';
      containerFallback.style.minHeight = '300px';

      const icon = document.createElement('div');
      icon.textContent = "📄";
      icon.style.fontSize = "48px";

      let thumbnailSrc = data.currentThumbnail || data.thumbnail;
      if (thumbnailSrc) {
        const img = document.createElement('img');
        img.src = thumbnailSrc;
        img.style.maxWidth = "100%";
        containerFallback.appendChild(img);
      } else {
        containerFallback.appendChild(icon);
      }

      const text = document.createElement('div');
      text.style.marginTop = "10px";
      const name = data.file ? data.file.name : (data.fileName || data.currentFileName);
      text.innerHTML = name ? `파일: ${name}` : "파일을 선택하세요";
      containerFallback.appendChild(text);

      ph.appendChild(containerFallback);
    }

    slidePreview.style.background = '#222';
    slidePreview.style.position = 'relative'; // Ensure overlays can be positioned
    slidePreview.innerHTML = "";

    // Hymn title slide preview — inserted AFTER final innerHTML clear
    if (data.type === 'hymn' && data.includeTitle) {
      const titleEl = buildHymnTitleSlidePreview(
        data.hymnNumber,
        data.hymnKorTitle,
        data.hymnEngTitle
      );
      slidePreview.appendChild(titleEl);
    }

    // Add filename badge at end of scrollable content (for sticky positioning)
    const displayName = data.file ? data.file.name : (data.fileName || data.currentFileName);
    if (displayName) {
      const badge = document.createElement('div');
      badge.className = 'preview-filename-badge';
      badge.textContent = displayName;
      ph.appendChild(badge); // Inside scrollable content for sticky to work
    }

    slidePreview.appendChild(ph);
    return;
  }

  // Ad + Simple Slide Render
  if ((data.type === 'ad' || data.type === 'simple') && data.sourceType === 'basic') {
    slidePreview.classList.remove('preview-scroll-mode');
    const previewWidth = slidePreview.offsetWidth || 400;
    const scale = previewWidth / 960;

    const container = document.createElement("div");
    container.className = "preview-content";
    container.style.position = "relative";
    container.style.overflow = "hidden";
    container.style.fontFamily = data.font;

    const applyBg = () => {
      if (data.adBgSource === 'file' && data.adBgImageFile) {
        const reader = new FileReader();
        reader.onload = (e) => {
          container.style.backgroundImage = `url(${e.target.result})`;
          container.style.backgroundSize = "cover";
          container.style.backgroundPosition = "center";
        };
        reader.readAsDataURL(data.adBgImageFile);
      } else if (data.adBgSource === 'file' && data.adBgImagePath) {
        container.style.backgroundImage = `url(${data.adBgImagePath})`;
        container.style.backgroundSize = "cover";
        container.style.backgroundPosition = "center";
      } else if (data.adBgSource === 'url' && data.adBgImageUrl) {
        container.style.backgroundImage = `url(${data.adBgImageUrl})`;
        container.style.backgroundSize = "cover";
        container.style.backgroundPosition = "center";
      } else {
        container.style.backgroundColor = data.bg === "white" ? "white" : "black";
      }
    };
    applyBg();

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
    overlay.style.backgroundColor = `rgba(0,0,0,${(data.adBgOpacity ?? 30) / 100})`;
    container.appendChild(overlay);

    const contentWrapper = document.createElement("div");
    contentWrapper.style.cssText = "position:relative;z-index:1;height:100%;display:flex;flex-direction:column;padding:5%;box-sizing:border-box;";

    const textColor = data.bg === "white" ? "black" : "white";

    if (data.adTitle) {
      const titleSizePt = { large: 60, medium: 40, small: 24 };
      const titlePx = Math.round((titleSizePt[data.adTitleSize] || 40) * 1.333 * scale);
      const title = document.createElement("div");
      title.textContent = data.adTitle;
      title.style.fontWeight = "bold";
      title.style.color = textColor;
      title.style.textAlign = data.adTitleAlign || "center";
      title.style.fontSize = `${titlePx}px`;
      title.style.lineHeight = "1.2";
      title.style.marginBottom = `${Math.round(10 * scale)}px`;
      title.style.flexShrink = "0";
      contentWrapper.appendChild(title);
    }

    const bodyPx = Math.round((Number(data.fontSize) || 40) * 1.333 * scale);
    const content = document.createElement("div");
    content.style.flex = "1";
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.width = "100%";
    content.style.color = textColor;

    const align = data.align || "center";
    if (align === "top") {
      content.style.justifyContent = "flex-start";
      content.style.alignItems = "flex-start";
    } else if (align === "left") {
      content.style.justifyContent = "center";
      content.style.alignItems = "flex-start";
    } else if (align === "right") {
      content.style.justifyContent = "center";
      content.style.alignItems = "flex-end";
    } else {
      content.style.justifyContent = "center";
      content.style.alignItems = "center";
    }

    const textBlock = document.createElement("div");
    textBlock.textContent = data.content || "내용을 입력하세요";
    textBlock.style.fontSize = `${bodyPx}px`;
    textBlock.style.lineHeight = "1.3";
    textBlock.style.whiteSpace = "pre-wrap";
    textBlock.style.textAlign = align === "top" ? "left" : align;
    textBlock.style.width = "100%";
    content.appendChild(textBlock);

    contentWrapper.appendChild(content);
    container.appendChild(contentWrapper);
    slidePreview.appendChild(container);
    return;
  }

  // Basic Render
  slidePreview.classList.remove('preview-scroll-mode'); // Reset
  const container = document.createElement("div");
  container.className = "preview-content";

  // Apply styles
  container.style.backgroundColor = data.bg === "black" ? "black" : "white";
  container.style.color = data.bg === "black" ? "white" : "black";
  container.style.fontFamily = data.font;
  container.style.textAlign = data.align;

  // Vertical align
  if (data.align === 'top') {
    container.style.justifyContent = 'flex-start';
  } else {
    container.style.justifyContent = 'center';
  }

  const previewWidth = slidePreview.offsetWidth || 400;
  const scaleFactor = previewWidth / 960;
  const bodyPx = Math.round((Number(data.fontSize) || 40) * 1.333 * scaleFactor);

  const lines = data.content ? data.content.split('\n') : ["내용을 입력하세요"];
  lines.forEach(line => {
    const p = document.createElement("div");
    p.textContent = line;
    p.style.fontSize = `${bodyPx}px`;
    p.style.lineHeight = "1.3";
    p.style.whiteSpace = "pre-wrap";
    container.appendChild(p);
  });

  slidePreview.appendChild(container);
}

function selectSlide(id) {
  if (currentSlideId === id) return;

  if (currentSlideId) {
    const prevSlide = slides.find(s => s.id === currentSlideId);
    // If previous slide was unsaved (never saved), we should discard/delete it if user navigates away
    if (prevSlide && !prevSlide.saved) {
      if (!confirm("이 슬라이드는 저장되지 않았습니다. 이동하면 삭제됩니다. 계속하시겠습니까?")) {
        return;
      }
      // Remove the unsaved slide
      slides = slides.filter(s => s.id !== currentSlideId);
      hasUnsavedChanges = false;
    } else if (hasUnsavedChanges) {
      // Saved slide but has pending edits
      if (!confirm("저장하지 않은 변경사항이 있습니다. 무시하고 이동하시겠습니까?")) {
        return;
      }
      hasUnsavedChanges = false;
    }
  }

  currentSlideId = id;
  const slide = slides.find((s) => s.id === id);

  if (slide) {
    emptyEditorState.style.display = "none";
    slideEditor.style.display = "flex";
    populateEditor(slide);
    renderPreview(slide);
    updateButtonsState(slide);
    renderSlideList();
  } else {
    // If id not found (e.g. after delete), show empty
    currentSlideId = null;
    emptyEditorState.style.display = "flex";
    slideEditor.style.display = "none";
    renderSlideList();
  }
}

function populateEditor(slide) {
  slideNameInput.value = slide.name;
  slideTypeSelect.value = slide.type;

  hymnNumberInput.value = slide.hymnNumber || '';
  hymnIncludeTitle.checked = !!slide.includeTitle;
  hymnTitleFields.style.display = slide.includeTitle ? 'block' : 'none';
  hymnKorTitleInput.value = slide.hymnKorTitle || '';
  hymnEngTitleInput.value = slide.hymnEngTitle || '';

  if (slide.type === 'hymn') {
    simpleSlideSettings.style.display = 'none';
    hymnSlideSettings.style.display = 'block';
  } else if (slide.type === 'ad') {
    simpleSlideSettings.style.display = 'block';
    hymnSlideSettings.style.display = 'none';

    sourceRadios.forEach(r => {
      r.checked = r.value === slide.sourceType;
    });
    toggleSettingsMode(slide.sourceType);

    // Ad title panel
    adTitleInput.value = slide.adTitle || '';
    adTitleSizeSelect.value = slide.adTitleSize || 'medium';
    adTitleAlignSelect.value = slide.adTitleAlign || 'center';
    syncRteSizeBtns('adTitleSize', adTitleSizeSelect.value);
    syncRteAlignBtns('adTitleAlign', adTitleAlignSelect.value);

    // Ad body panel
    adBodyContent.value = slide.content || '';
    adBodyFont.value = slide.font || 'Malgun Gothic';
    adBodyFontSize.value = slide.fontSize || '40';
    adBodyAlign.value = slide.align || 'center';
    syncRteAlignBtns('adBodyAlign', adBodyAlign.value);

    // Ad background settings
    adTextColor.value = slide.bg || 'black';
    syncAdTextColorTabs(adTextColor.value);
    adBgOpacity.value = slide.adBgOpacity ?? 30;
    adBgOpacityValue.textContent = `${slide.adBgOpacity ?? 30}%`;

    adBgSourceRadios.forEach(r => {
      r.checked = r.value === (slide.adBgSource || 'none');
    });
    toggleBgMode(slide.adBgSource || 'none');

    adBgImageUrl.value = slide.adBgImageUrl || '';
    adBgImageFile.value = '';
  } else {
    simpleSlideSettings.style.display = 'block';
    hymnSlideSettings.style.display = 'none';

    slideContentInput.value = slide.content;
    slideFontSelect.value = slide.font;
    slideFontSizeSelect.value = slide.fontSize || "40";
    slideAlignSelect.value = slide.align;
    syncAlignTabs(slide.align);

    // bgSettings (shared with ad)
    adTextColor.value = slide.bg || 'black';
    syncAdTextColorTabs(adTextColor.value);
    adBgOpacity.value = slide.adBgOpacity ?? 30;
    adBgOpacityValue.textContent = `${slide.adBgOpacity ?? 30}%`;
    adBgSourceRadios.forEach(r => {
      r.checked = r.value === (slide.adBgSource || 'none');
    });
    toggleBgMode(slide.adBgSource || 'none');
    adBgImageUrl.value = slide.adBgImageUrl || '';
    adBgImageFile.value = '';

    sourceRadios.forEach(r => {
      r.checked = r.value === slide.sourceType;
    });
    toggleSettingsMode(slide.sourceType);
  }

  // Clear file input to avoid showing stale filename from previous slide
  userPptxFile.value = '';
}

function syncBgTabs(value) {
  bgTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.value === value);
  });
  if (bgTabsContainer) {
    bgTabsContainer.dataset.active = value;
  }
}

function syncAlignTabs(value) {
  alignTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.value === value);
  });
}

function setBgValue(value, markDirty = true) {
  if (slideBgSelect) slideBgSelect.value = value;
  syncBgTabs(value);
  if (markDirty) {
    hasUnsavedChanges = true;
    renderPreview();
  }
}

function setAlignValue(value, markDirty = true) {
  slideAlignSelect.value = value;
  syncAlignTabs(value);
  if (markDirty) {
    hasUnsavedChanges = true;
    renderPreview();
  }
}

// --- Ad content panel helpers ---

function syncRteSizeBtns(targetId, value) {
  document.querySelectorAll(`.rte-size-btn[data-target="${targetId}"]`).forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.value === value);
  });
}

function syncRteAlignBtns(targetId, value) {
  document.querySelectorAll(`.rte-align-btn[data-target="${targetId}"]`).forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.value === value);
  });
}

function syncAdTextColorTabs(value) {
  adTextColorTabs.forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.value === value);
  });
}

function toggleSettingsMode(mode) {
  updateSettingsVisibility(mode);
}

function updateSettingsVisibility(overrideMode) {
  const type = slideTypeSelect.value;
  const sourceType =
    overrideMode ||
    (document.querySelector('input[name="sourceType"]:checked') || {}).value ||
    "basic";

  if (type === "hymn") {
    simpleSlideSettings.style.display = "none";
    hymnSlideSettings.style.display = "block";
    return;
  }

  simpleSlideSettings.style.display = "block";
  hymnSlideSettings.style.display = "none";

  if (sourceType === "upload") {
    adContentSettings.style.display = "none";
    basicSettingsMode.style.display = "none";
    if (bgSettings) bgSettings.style.display = "none";
    uploadSettingsMode.style.display = "block";
    return;
  }

  uploadSettingsMode.style.display = "none";

  if (type === "ad") {
    adContentSettings.style.display = "grid";
    basicSettingsMode.style.display = "none";
  } else {
    adContentSettings.style.display = "none";
    basicSettingsMode.style.display = "block";
  }

  if (bgSettings) bgSettings.style.display = "block";
}

function toggleBgMode(source) {
  const adBgFileModeEl = document.getElementById("adBgFileMode");
  const adBgUrlModeEl = document.getElementById("adBgUrlMode");
  const adBgImageUrlInput = document.getElementById("adBgImageUrl");
  const hasImage = source === "file" || source === "url";
  if (source === "file") {
    adBgFileModeEl.style.display = "block";
    adBgUrlModeEl.style.display = "none";
    if (adBgImageUrlInput) adBgImageUrlInput.disabled = true;
  } else if (source === "url") {
    adBgFileModeEl.style.display = "none";
    adBgUrlModeEl.style.display = "block";
    if (adBgImageUrlInput) adBgImageUrlInput.disabled = false;
  } else {
    adBgFileModeEl.style.display = "none";
    adBgUrlModeEl.style.display = "none";
    if (adBgImageUrlInput) adBgImageUrlInput.disabled = true;
  }
  if (dimOverlayRow) dimOverlayRow.style.display = hasImage ? "block" : "none";
}

function resetCurrentSlide() {
  if (!currentSlideId) return;
  const slide = slides.find((s) => s.id === currentSlideId);
  // Reset fields to last saved state
  populateEditor(slide);
  renderPreview(slide);
  hasUnsavedChanges = false;
  updateButtonsState(slide);
}

function updateButtonsState(slide) {
  if (slide.saved) {
    editorDownloadBtn.style.display = "inline-flex";
    editorDeleteBtn.style.display = "inline-flex";
    editorCancelBtn.style.display = "inline-flex";
  } else {
    editorDownloadBtn.style.display = "none";
    editorDeleteBtn.style.display = "none";
    editorCancelBtn.style.display = "inline-flex";
  }
}

function renderSlideList() {
  syncSelectedSlideIds();
  renderTemplateSubmenu();
  updateTemplateManagementUi();
  slideListContainer.innerHTML = "";
  slides.forEach((slide, index) => {
    const card = document.createElement("div");
    const isActive = slide.id === currentSlideId;
    const isSelected = selectedSlideIds.has(slide.id);

    card.className = `slide-card${isActive ? " active" : ""}${isSelected ? " selected" : ""}`;
    card.draggable = true;
    card.dataset.slideId = slide.id;
    card.onclick = () => selectSlide(slide.id);
    card.addEventListener("dragstart", (event) => {
      draggedSlideId = slide.id;
      card.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", slide.id);
      }
    });
    card.addEventListener("dragend", () => {
      draggedSlideId = null;
      card.classList.remove("dragging", "drag-over-top", "drag-over-bottom");
      slideListContainer
        .querySelectorAll(".slide-card")
        .forEach((item) =>
          item.classList.remove("drag-over-top", "drag-over-bottom")
        );
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!draggedSlideId || draggedSlideId === slide.id) {
        return;
      }
      const rect = card.getBoundingClientRect();
      const placeAfter = event.clientY - rect.top > rect.height / 2;
      card.classList.toggle("drag-over-top", !placeAfter);
      card.classList.toggle("drag-over-bottom", placeAfter);
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over-top", "drag-over-bottom");
    });
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("drag-over-top", "drag-over-bottom");
      if (!draggedSlideId || draggedSlideId === slide.id) {
        return;
      }
      const draggedIndex = slides.findIndex((item) => item.id === draggedSlideId);
      const rect = card.getBoundingClientRect();
      const placeAfter = event.clientY - rect.top > rect.height / 2;
      const targetIndex = slides.findIndex((item) => item.id === slide.id);
      let nextIndex = targetIndex;

      if (placeAfter) {
        nextIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
      } else if (draggedIndex < targetIndex) {
        nextIndex = targetIndex - 1;
      }

      moveSlideToIndex(draggedSlideId, nextIndex);
    });

    const header = document.createElement("div");
    header.className = "slide-card-header";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "slide-card-select";
    checkbox.checked = isSelected;
    checkbox.setAttribute("aria-label", `${slide.name} 선택`);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      toggleSlideSelection(slide.id, checkbox.checked);
    });

    const main = document.createElement("div");
    main.className = "slide-card-main";

    const title = document.createElement("h4");
    title.textContent = slide.name;
    const desc = document.createElement("p");
    desc.textContent = `${index + 1}. ${getSlideTypeLabel(slide)}`;
    main.appendChild(title);
    main.appendChild(desc);

    const actions = document.createElement("div");
    actions.className = "slide-card-actions";

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "slide-card-handle";
    handle.title = "드래그해서 순서 바꾸기";
    handle.textContent = "⋮⋮";
    handle.addEventListener("click", (event) => event.stopPropagation());

    const moveUpBtn = document.createElement("button");
    moveUpBtn.type = "button";
    moveUpBtn.className = "slide-move-btn";
    moveUpBtn.title = "위로 이동";
    moveUpBtn.disabled = index === 0;
    moveUpBtn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6l-6 6h12z"></path></svg>';
    moveUpBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      moveSlideByOffset(slide.id, -1);
    });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.type = "button";
    moveDownBtn.className = "slide-move-btn";
    moveDownBtn.title = "아래로 이동";
    moveDownBtn.disabled = index === slides.length - 1;
    moveDownBtn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18l6-6H6z"></path></svg>';
    moveDownBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      moveSlideByOffset(slide.id, 1);
    });

    actions.appendChild(handle);
    actions.appendChild(moveUpBtn);
    actions.appendChild(moveDownBtn);

    header.appendChild(checkbox);
    header.appendChild(main);
    header.appendChild(actions);

    const meta = document.createElement("div");
    meta.className = "slide-card-meta";

    const typeBadge = document.createElement("span");
    typeBadge.className = "slide-type-badge";
    typeBadge.textContent = slide.type === "ad" ? "AD" : slide.sourceType === "upload" ? "PPT/PPTX" : "TEXT";

    const saveBadge = document.createElement("span");
    saveBadge.className = `slide-save-badge${slide.saved ? "" : " unsaved"}`;
    saveBadge.textContent = slide.saved ? "저장됨" : "미저장";

    meta.appendChild(typeBadge);
    meta.appendChild(saveBadge);

    card.appendChild(header);
    card.appendChild(meta);
    slideListContainer.appendChild(card);
  });
  updateSlideListControls();
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const resp = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  if (!resp.ok) {
    throw new Error("File upload failed");
  }
  return await resp.json();
}

async function saveCurrentSlide() {
  if (!currentSlideId) {
    console.error("No currentSlideId!");
    return;
  }

  const name = slideNameInput.value.trim();

  if (!name) {
    alert("슬라이드 이름을 입력하세요.");
    return;
  }

  // Check duplicate name
  const existing = slides.find((s) => s.name === name && s.id !== currentSlideId);
  if (existing) {
    alert("이미 존재하는 슬라이드 이름입니다.");
    return;
  }

  const slide = slides.find((s) => s.id === currentSlideId);
  if (!slide) {
    console.error("Slide object not found for id:", currentSlideId);
    return;
  }

  try {
    slide.name = name;
    slide.type = slideTypeSelect.value;

    if (slide.type === 'hymn') {
      const number = hymnNumberInput.value;
      if (!number) {
        alert("찬송가 장수를 입력하세요.");
        return;
      }

      // Explicitly check if we need to download (if number changed or no file)
      // slide.hymnNumber tracks what's currently loaded/saved. 
      if (!slide.serverFilePath || slide.hymnNumber != number) {
        const saveBtnMsg = document.getElementById('editorSaveBtn');
        const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
        if (saveBtnMsg) saveBtnMsg.textContent = "다운로드 중...";

        try {
          const res = await fetch('/api/hymn/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Download failed");

          slide.serverFilePath = data.path;
          slide.fileName = data.originalName;
          slide.originalUrl = data.originalUrl;
          slide.hymnNumber = number;
          slide.thumbnail = null;
        } catch (e) {
          alert("자동 다운로드 실패: " + e.message);
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          return; // Stop save if download fails
        } finally {
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
        }
      } else {
        // Ensure it is synced
        slide.hymnNumber = number;
      }
      slide.sourceType = 'upload';
      slide.includeTitle = hymnIncludeTitle.checked;
      slide.hymnKorTitle = hymnKorTitleInput.value.trim();
      slide.hymnEngTitle = hymnEngTitleInput.value.trim();
      slide.saved = true;

    } else if (slide.type === 'ad') {
      // Ad Slide Logic
      slide.adTitle = adTitleInput.value;
      slide.adTitleSize = adTitleSizeSelect.value;
      slide.adTitleAlign = adTitleAlignSelect.value;

      slide.content = adBodyContent.value;
      slide.font = adBodyFont.value;
      slide.fontSize = adBodyFontSize.value;
      slide.align = adBodyAlign.value;
      slide.bg = adTextColor.value;

      slide.adBgOpacity = parseInt(adBgOpacity.value);

      const bgSource = document.querySelector('input[name="adBgSource"]:checked').value;
      slide.adBgSource = bgSource;

      // Handle background image file upload
      if (bgSource === 'file' && adBgImageFile.files[0]) {
        const saveBtnMsg = document.getElementById('editorSaveBtn');
        const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
        if (saveBtnMsg) saveBtnMsg.textContent = "업로드 중...";
        
        try {
          const uploadResult = await uploadFile(adBgImageFile.files[0]);
          slide.adBgImagePath = uploadResult.path;
          slide.adBgImageUrl = null; // Clear URL if file is uploaded
        } catch (e) {
          alert("배경 이미지 업로드 실패: " + e.message);
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          return;
        } finally {
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
        }
      } else if (bgSource === 'url') {
        slide.adBgImageUrl = adBgImageUrl.value;
        slide.adBgImagePath = null; // Clear file path if URL is used
      } else {
        // No background
        slide.adBgImagePath = null;
        slide.adBgImageUrl = null;
      }
      
      const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
      slide.sourceType = sourceType;
      
      if (sourceType === 'upload' && userPptxFile.files[0]) {
        // Handle PPTX file upload (same as simple slide)
        const file = userPptxFile.files[0];
        if (file.size > 50 * 1024 * 1024) {
          alert("파일 크기가 50MB를 초과합니다.");
          return;
        }
        
        const saveBtnMsg = document.getElementById('editorSaveBtn');
        const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
        if (saveBtnMsg) saveBtnMsg.textContent = "업로드 중...";
        
        try {
          const uploadResult = await uploadFile(file);
          slide.fileName = file.name;
          slide.serverFilePath = uploadResult.path;
          slide.fileSaved = true;
        } catch (e) {
          alert("파일 업로드 실패: " + e.message);
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          return;
        } finally {
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
        }
      }
      
      slide.saved = true;

    } else {
      // Simple Slide Logic
      const sourceRadio = document.querySelector('input[name="sourceType"]:checked');
      if (!sourceRadio) {
        console.error("No source radio checked");
        return;
      }
      slide.sourceType = sourceRadio.value;
      slide.content = slideContentInput.value;
      slide.font = slideFontSelect.value;
      slide.fontSize = slideFontSizeSelect.value;
      slide.bg = adTextColor.value;
      slide.align = slideAlignSelect.value;
      slide.adBgOpacity = parseInt(adBgOpacity.value);

      const bgSrc = document.querySelector('input[name="adBgSource"]:checked').value;
      slide.adBgSource = bgSrc;
      if (bgSrc === 'file' && adBgImageFile.files[0]) {
        const saveBtnMsg = document.getElementById('editorSaveBtn');
        const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
        if (saveBtnMsg) saveBtnMsg.textContent = "업로드 중...";
        try {
          const uploadResult = await uploadFile(adBgImageFile.files[0]);
          slide.adBgImagePath = uploadResult.path;
          slide.adBgImageUrl = null;
        } catch (e) {
          alert("배경 이미지 업로드 실패: " + e.message);
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          return;
        } finally {
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
        }
      } else if (bgSrc === 'url') {
        slide.adBgImageUrl = adBgImageUrl.value;
        slide.adBgImagePath = null;
      } else {
        slide.adBgImagePath = null;
        slide.adBgImageUrl = null;
      }
      slide.saved = true;

      // Handle File Upload
      if (slide.sourceType === 'upload') {
        if (userPptxFile.files.length > 0) {
          const file = userPptxFile.files[0];
          // Upload to server
          try {
            const result = await uploadFile(file);
            // Update slide with server file info
            slide.serverFilePath = result.path; // e.g. /uploads/xxx-name.pptx
            slide.fileName = result.originalName;
            slide.thumbnail = result.thumbnail; // Save thumbnail path
            slide.fileSaved = true;

            // Clear transient file obj
            slide.file = null;
            slide.fileData = null;
          } catch (err) {
            console.error("Upload Error:", err);
            alert("파일 업로드 실패");
            return;
          }
        } else if (!slide.fileName && !slide.serverFilePath) {
          alert("PPTX 파일을 업로드해주세요.");
          return;
        }
      }
    }

    if (isTemplateMode()) {
      markTemplateDirty();
    } else {
      const saved = await persistCurrentWorkspace();
      if (!saved) {
        return;
      }
      syncWorkingSlidesToState();
    }

    hasUnsavedChanges = false;
    updateButtonsState(slide);
    renderSlideList();
    alert("저장되었습니다.");
  } catch (e) {
    console.error("Error in saveCurrentSlide:", e);
    alert("저장 중 오류 발생: " + e.message);
  }
}

async function downloadSlide() {
  if (!currentSlideId) return;
  const slide = slides.find(s => s.id === currentSlideId);
  if (!slide || !slide.saved) return;

  // Ad slide download
  if (slide.type === 'ad' && slide.sourceType === 'basic') {
    try {
      const payload = {
        content: slide.content,
        font: slide.font,
        fontSize: slide.fontSize,
        bg: slide.bg,
        align: slide.align,
        adTitle: slide.adTitle,
        adTitleSize: slide.adTitleSize,
        adTitleAlign: slide.adTitleAlign,
        adBgSource: slide.adBgSource,
        adBgImagePath: slide.adBgImagePath,
        adBgImageUrl: slide.adBgImageUrl,
        adBgOpacity: slide.adBgOpacity
      };

      const resp = await fetch('/api/create-ad-slide-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json();
        alert("다운로드 실패: " + (err.error || "Unknown Error"));
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ad_slide_${slide.adTitle || slide.name || 'untitled'}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch (e) {
      alert("다운로드 중 오류가 발생했습니다.");
      console.error(e);
      return;
    }
  }

  if (slide.sourceType === 'basic') {
    try {
      const resp = await fetch("/api/create-slide-pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: slide.content,
          font: slide.font,
          fontSize: slide.fontSize,
          bg: slide.bg,
          align: slide.align,
          adBgSource: slide.adBgSource,
          adBgImagePath: slide.adBgImagePath,
          adBgImageUrl: slide.adBgImageUrl,
          adBgOpacity: slide.adBgOpacity,
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        alert("다운로드 실패: " + (err.error || "Unknown Error"));
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slide.name}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (e) {
      alert("다운로드 중 오류가 발생했습니다.");
      console.error(e);
    }
  } else {
    // Upload Mode
    // Priority: 1. Runtime File Object, 2. Base64 Data, 3. Server File Path
    let blobToDownload = null;
    let filename = slide.fileName || "slide.pptx";

    if (slide.file) {
      blobToDownload = slide.file;
    } else if (slide.fileData) {
      blobToDownload = base64ToBlob(slide.fileData);
    } else if (slide.serverFilePath) {
      // If file is on server, fetch it
      try {
        const resp = await fetch(slide.serverFilePath);
        if (!resp.ok) {
          throw new Error(`Failed to fetch file from server: ${resp.statusText}`);
        }
        blobToDownload = await resp.blob();
      } catch (e) {
        alert("서버에서 파일을 가져오는 데 실패했습니다.");
        console.error(e);
        return;
      }
    }

    if (!blobToDownload) {
      alert("파일을 찾을 수 없습니다. 다시 업로드해주세요.");
      return;
    }

    const url = URL.createObjectURL(blobToDownload);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function buildSerializableSlide(slide) {
  return {
    id: slide.id,
    name: slide.name,
    type: slide.type,
    sourceType: slide.sourceType,
    content: slide.content,
    font: slide.font,
    fontSize: slide.fontSize,
    bg: slide.bg,
    align: slide.align,
    fileName: slide.fileName,
    fileSaved: slide.fileSaved,
    saved: slide.saved,
    serverFilePath: slide.serverFilePath,
    thumbnail: slide.thumbnail,
    hymnNumber: slide.hymnNumber,
    includeTitle: slide.includeTitle,
    hymnKorTitle: slide.hymnKorTitle,
    hymnEngTitle: slide.hymnEngTitle,
    originalUrl: slide.originalUrl,
    adTitle: slide.adTitle,
    adTitleSize: slide.adTitleSize,
    adTitleAlign: slide.adTitleAlign,
    adBgSource: slide.adBgSource,
    adBgImagePath: slide.adBgImagePath,
    adBgImageUrl: slide.adBgImageUrl,
    adBgOpacity: slide.adBgOpacity,
  };
}

function getBulkActionSlides() {
  const selectedSlides = getSelectedSlides();
  if (selectedSlides.length === 0) {
    alert("슬라이드를 하나 이상 선택하세요.");
    return [];
  }

  if (hasPendingSelectionEdits()) {
    alert("선택한 슬라이드 중 저장되지 않은 항목이 있습니다. 먼저 저장한 뒤 다시 시도하세요.");
    return [];
  }

  return selectedSlides;
}

async function deleteSelectedSlides() {
  const selectedSlides = getSelectedSlides();
  if (selectedSlides.length === 0) {
    alert("삭제할 슬라이드를 선택하세요.");
    return;
  }

  if (!confirm(`선택한 ${selectedSlides.length}개 슬라이드를 삭제하시겠습니까?`)) {
    return;
  }

  const selectedIds = selectedSlides.map((slide) => slide.id);

  try {
    if (isTemplateMode()) {
      slides = slides.filter((slide) => !selectedIds.includes(slide.id));
      selectedSlideIds.clear();

      if (currentSlideId && selectedIds.includes(currentSlideId)) {
        resetEditorSelection();
      }

      markTemplateDirty();
      renderSlideList();
      return;
    }

    const resp = await fetch("/api/slides/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: selectedIds,
        slides: selectedSlides.map(buildSerializableSlide),
      }),
    });

    if (!resp.ok) {
      const payload = await resp.json().catch(() => ({}));
      throw new Error(payload.error || "삭제에 실패했습니다.");
    }

    slides = slides.filter((slide) => !selectedSlideIds.has(slide.id));
    selectedSlideIds.clear();
    syncWorkingSlidesToState();

    if (currentSlideId && selectedIds.includes(currentSlideId)) {
      resetEditorSelection();
    }

    renderSlideList();
  } catch (err) {
    alert(err.message || "선택 삭제 중 오류가 발생했습니다.");
  }
}

async function createTemplateFromSelection() {
  const selectedSlides = getBulkActionSlides();
  if (selectedSlides.length === 0) {
    return;
  }

  const defaultName =
    selectedSlides.length === 1
      ? `${selectedSlides[0].name} 템플릿`
      : `선택 슬라이드 ${selectedSlides.length}개 템플릿`;
  const templateName = prompt("템플릿 이름을 입력하세요.", defaultName);

  if (!templateName) {
    return;
  }

  try {
    const resp = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: templateName.trim(),
        slides: selectedSlides.map(buildSerializableSlide),
      }),
    });

    const payload = await resp.json();
    if (!resp.ok) {
      throw new Error(payload.error || "템플릿 저장에 실패했습니다.");
    }

    templates.push(cloneTemplate(payload.template));
    renderTemplateSubmenu();
    openTemplateWorkspace(payload.template.id);
    alert(`템플릿이 저장되었습니다: ${payload.template.name}`);
  } catch (err) {
    alert(err.message || "템플릿 저장 중 오류가 발생했습니다.");
  }
}

async function deleteActiveTemplate() {
  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) {
    return;
  }

  if (!confirm(`'${activeTemplate.name}' 템플릿을 삭제하시겠습니까?`)) {
    return;
  }

  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(activeTemplate.id)}`, {
      method: "DELETE",
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.error || "템플릿 삭제에 실패했습니다.");
    }

    templates = templates.filter((template) => template.id !== activeTemplate.id);
    activeTemplateId = null;
    hasPendingTemplateChanges = false;
    loadWorkspaceSlides(mainSlides);
    renderTemplateSubmenu();
    updateTemplateManagementUi();
  } catch (err) {
    alert(err.message || "템플릿 삭제 중 오류가 발생했습니다.");
  }
}

async function renameActiveTemplate() {
  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) {
    return;
  }

  const nextName = prompt("템플릿 이름을 입력하세요.", activeTemplate.name);
  if (!nextName) {
    return;
  }

  const trimmedName = nextName.trim();
  if (!trimmedName || trimmedName === activeTemplate.name) {
    return;
  }

  templates = templates.map((template) =>
    template.id === activeTemplate.id
      ? { ...template, name: trimmedName }
      : template
  );
  hasPendingTemplateChanges = true;
  updateTemplateManagementUi();
  renderTemplateSubmenu();
}

async function downloadSelectedSlidesBundle() {
  const selectedSlides = getBulkActionSlides();
  if (selectedSlides.length === 0) {
    return;
  }

  try {
    const resp = await fetch("/api/slides/export-pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slides: selectedSlides.map(buildSerializableSlide),
      }),
    });

    if (!resp.ok) {
      const payload = await resp.json().catch(() => ({}));
      throw new Error(payload.error || "선택 슬라이드 묶음 생성에 실패했습니다.");
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      getFilenameFromDisposition(resp.headers.get("content-disposition")) ||
      `selected_slides_${selectedSlides.length}.pptx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message || "선택 슬라이드 다운로드 중 오류가 발생했습니다.");
  }
}


// --- Event Listeners ---

addSlideBtn.addEventListener("click", createSlide);

editorSaveBtn.addEventListener("click", saveCurrentSlide);
editorResetBtn.addEventListener("click", resetCurrentSlide);
editorCancelBtn.addEventListener("click", cancelEdit);

async function deleteCurrentSlide() {
  if (!currentSlideId) return;

  if (!confirm("정말 이 슬라이드를 삭제하시겠습니까?")) {
    return;
  }

  // Call API
  try {
    if (isTemplateMode()) {
      slides = slides.filter((slide) => slide.id !== currentSlideId);
      markTemplateDirty();
      resetEditorSelection();
      renderSlideList();
      return;
    }

    await fetch(`/api/slides/${currentSlideId}`, { method: 'DELETE' });
    await loadSlidesFromServer();
    loadWorkspaceSlides(mainSlides);
    renderSlideList();
  } catch (e) {
    alert("삭제 실패");
    console.error(e);
  }
}

// ... cancelEdit (no server logic needed here usually, just discard local) ...
function cancelEdit() {
  if (!currentSlideId) return;
  const slide = slides.find(s => s.id === currentSlideId);

  if (slide && !slide.saved) {
    if (!confirm("작성 중인 슬라이드가 삭제됩니다. 취소하시겠습니까?")) {
      return;
    }
    slides = slides.filter(s => s.id !== currentSlideId);
    currentSlideId = null;
    hasUnsavedChanges = false;

    emptyEditorState.style.display = "flex";
    slideEditor.style.display = "none";
    renderSlideList();
  } else {
    currentSlideId = null;
    hasUnsavedChanges = false;
    emptyEditorState.style.display = "flex";
    slideEditor.style.display = "none";
    renderSlideList();
  }
}

editorDeleteBtn.addEventListener("click", deleteCurrentSlide);
editorDownloadBtn.addEventListener("click", downloadSlide);
selectAllSlidesCheckbox.addEventListener("change", () => {
  setAllSlidesSelected(selectAllSlidesCheckbox.checked);
});
clearSelectionBtn.addEventListener("click", clearSlideSelection);

bulkActionMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = !bulkActionDropdown.hidden;
  if (isOpen) {
    closeBulkDropdown();
  } else {
    closeBulkDropdown();
    bulkActionDropdown.hidden = false;
    bulkActionMenuBtn.classList.add("open");
  }
});

templateMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = !templateMenuDropdown.hidden;
  if (isOpen) {
    closeBulkDropdown();
  } else {
    closeBulkDropdown();
    templateMenuDropdown.hidden = false;
    templateMenuBtn.classList.add("active");
  }
});

document.addEventListener("click", (e) => {
  if (bulkActionDropdown && !bulkActionDropdown.hidden) {
    if (!bulkActionMenuBtn.contains(e.target) && !bulkActionDropdown.contains(e.target)) {
      closeBulkDropdown();
    }
  }
  if (templateMenuDropdown && !templateMenuDropdown.hidden) {
    if (!templateMenuBtn.contains(e.target) && !templateMenuDropdown.contains(e.target)) {
      closeBulkDropdown();
    }
  }
});

document.addEventListener("click", (e) => {
  if (!currentSlideId) return;
  if (e.target.closest(".slide-card")) return;
  if (e.target.closest(".slide-editor-panel")) return;
  if (e.target.closest(".sub-nav")) return;

  const currentSlide = slides.find(s => s.id === currentSlideId);
  if (currentSlide && !currentSlide.saved) {
    if (!confirm("이 슬라이드는 저장되지 않았습니다. 이동하면 삭제됩니다. 계속하시겠습니까?")) {
      e.stopPropagation();
      return;
    }
    slides = slides.filter(s => s.id !== currentSlideId);
  } else if (hasUnsavedChanges) {
    if (!confirm("저장하지 않은 변경사항이 있습니다. 무시하고 이동하시겠습니까?")) {
      e.stopPropagation();
      return;
    }
  }

  currentSlideId = null;
  hasUnsavedChanges = false;
  emptyEditorState.style.display = "flex";
  slideEditor.style.display = "none";
  renderSlideList();
}, true);

bulkDeleteBtn.addEventListener("click", () => { closeBulkDropdown(); deleteSelectedSlides(); });
bulkTemplateBtn.addEventListener("click", () => { closeBulkDropdown(); createTemplateFromSelection(); });
bulkDownloadBtn.addEventListener("click", () => { closeBulkDropdown(); downloadSelectedSlidesBundle(); });
templateSaveBtn.addEventListener("click", saveActiveTemplateToServer);
templateDeleteBtn.addEventListener("click", deleteActiveTemplate);

[
  slideNameInput,
  slideTypeSelect,
  slideContentInput,
  slideFontSelect,
  slideFontSizeSelect,
  slideAlignSelect,
].forEach((el) => {
  el.addEventListener("input", () => {
    hasUnsavedChanges = true;
    renderPreview();
  });
});

sourceRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    hasUnsavedChanges = true;
    toggleSettingsMode(e.target.value);
    renderPreview();
  })
});

bgTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setBgValue(tab.dataset.value);
  });
});

alignTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setAlignValue(tab.dataset.value);
  });
});

adBgSourceRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    hasUnsavedChanges = true;
    toggleBgMode(e.target.value);
    renderPreview();
  });
});

// rte-size-btn: title size toggle
document.querySelectorAll('.rte-size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    document.getElementById(targetId).value = btn.dataset.value;
    syncRteSizeBtns(targetId, btn.dataset.value);
    hasUnsavedChanges = true;
    renderPreview();
  });
});

// rte-align-btn: title/body align toggle
document.querySelectorAll('.rte-align-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.list) return; // handled by list button handler
    const targetId = btn.dataset.target;
    if (!targetId) return;
    document.getElementById(targetId).value = btn.dataset.value;
    syncRteAlignBtns(targetId, btn.dataset.value);
    hasUnsavedChanges = true;
    renderPreview();
  });
});

// list buttons: bullet / numbered
function applyListPrefix(textarea, type) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIdx = value.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;

  const selectedText = value.substring(lineStart, lineEnd);
  const lines = selectedText.split('\n');

  let newLines;
  if (type === 'bullet') {
    const allBulleted = lines.every(l => l.startsWith('• '));
    newLines = allBulleted
      ? lines.map(l => l.slice(2))
      : lines.map(l => '• ' + l.replace(/^• /, '').replace(/^\d+\.\s*/, ''));
  } else {
    const allNumbered = lines.every(l => /^\d+\.\s/.test(l));
    newLines = allNumbered
      ? lines.map(l => l.replace(/^\d+\.\s*/, ''))
      : lines.map((l, i) => `${i + 1}. ` + l.replace(/^• /, '').replace(/^\d+\.\s*/, ''));
  }

  const newSelected = newLines.join('\n');
  textarea.value = value.substring(0, lineStart) + newSelected + value.substring(lineEnd);
  textarea.selectionStart = lineStart;
  textarea.selectionEnd = lineStart + newSelected.length;
  textarea.dispatchEvent(new Event('input'));
}

document.querySelectorAll('[data-list]').forEach(btn => {
  btn.addEventListener('click', () => {
    const textarea = document.getElementById(btn.dataset.target);
    if (!textarea) return;
    applyListPrefix(textarea, btn.dataset.list);
  });
});

// ad text color tabs
adTextColorTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    adTextColor.value = tab.dataset.value;
    syncAdTextColorTabs(tab.dataset.value);
    hasUnsavedChanges = true;
    renderPreview();
  });
});

// ad body inputs: live preview
[adBodyContent, adBodyFont, adBodyFontSize, adTitleInput].forEach(el => {
  el.addEventListener('input', () => {
    hasUnsavedChanges = true;
    renderPreview();
  });
});

adBgImageUrl.addEventListener('input', () => {
  hasUnsavedChanges = true;
  renderPreview();
});

adBgOpacity.addEventListener('input', () => {
  adBgOpacityValue.textContent = `${adBgOpacity.value}%`;
  hasUnsavedChanges = true;
  renderPreview();
});

userPptxFile.addEventListener('change', async () => {
  hasUnsavedChanges = true;

  if (userPptxFile.files.length > 0) {
    const file = userPptxFile.files[0];
    // Auto-upload and convert .ppt files
    if (file.name.toLowerCase().endsWith(".ppt")) {
      slidePreview.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:#666;">
                 <div style="font-size:24px;margin-bottom:10px;">⏳</div>
                 <div>PPT 변환 및 업로드 중...</div>
                 <div style="font-size:12px;color:#aaa;">(잠시만 기다려주세요)</div>
             </div>`;

      try {
        const result = await uploadFile(file);
        const current = slides.find(s => s.id === currentSlideId);
        if (current) {
          current.serverFilePath = result.path;
          current.fileName = result.originalName || file.name;
        }
        renderPreview(); // Render using converted server file
        return;
      } catch (e) {
        alert("PPT 변환 업로드 실패: " + e.message);
      }
    }
  }

  renderPreview();
});

// Load slides on init
loadPptDataFromServer();

// Helpers
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지 읽기에 실패했습니다."));
    reader.readAsDataURL(file);
  });
}
