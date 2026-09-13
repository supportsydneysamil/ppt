import {
  createSnapshot,
  deriveSaveButtonState,
  getPendingChangeScopes,
  getSaveSequence,
  getUnsavedChangesMessage,
  isSnapshotDirty,
  isTemplateDirty,
  selectTransientPreviewFiles,
  shouldRecaptureSlideBaseline,
  toFileMetadata,
  withTransientFiles,
} from "/lib/save-state.js";

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

async function loadBooks() {
  const resp = await fetch("/api/books");
  if (!resp.ok) {
    throw new Error("failed to load books");
  }
  dataCache = await resp.json();
  renderTestaments();
  fillScriptureBookSelects();
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

function fillScriptureBookSelects(preferred = {}) {
  const testamentEl = document.getElementById("scriptureTestament");
  const bookEl = document.getElementById("scriptureBook");
  if (!testamentEl || !bookEl || !dataCache) {
    return;
  }

  const previousTestament = preferred.testament || testamentEl.value;
  const previousBook = preferred.book || bookEl.value;

  testamentEl.innerHTML = "";
  dataCache.testaments.forEach((testament) => {
    const option = document.createElement("option");
    option.value = testament.id;
    option.textContent = testament.label;
    testamentEl.appendChild(option);
  });

  testamentEl.value =
    previousTestament || dataCache.testaments[0]?.id || "";

  fillScriptureBooks(previousBook);
}

function fillScriptureBooks(preferredBook) {
  const testamentEl = document.getElementById("scriptureTestament");
  const bookEl = document.getElementById("scriptureBook");
  if (!testamentEl || !bookEl || !dataCache) {
    return;
  }

  const selected = dataCache.testaments.find(
    (testament) => testament.id === testamentEl.value
  );
  bookEl.innerHTML = "";
  if (!selected) {
    return;
  }

  selected.books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book.slugKo;
    option.textContent = book.name;
    bookEl.appendChild(option);
  });

  if (preferredBook) {
    bookEl.value = preferredBook;
  }
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
  const pairs = [
    [startInput, endInput],
    [
      document.getElementById("scriptureStartVerse"),
      document.getElementById("scriptureEndVerse"),
    ],
  ];

  pairs.forEach(([startEl, endEl]) => {
    if (changedInput !== startEl && changedInput !== endEl) {
      return;
    }
    if (!(startEl instanceof HTMLInputElement) || !(endEl instanceof HTMLInputElement)) {
      return;
    }
    const startValue = parsePositiveNumber(startEl.value);
    const endValue = parsePositiveNumber(endEl.value);
    if (changedInput === startEl && startValue !== null) {
      if (endValue !== null && endValue < startValue) {
        endEl.value = String(startValue);
      }
    }
    if (changedInput === endEl && endValue !== null) {
      if (startValue !== null && endValue < startValue) {
        startEl.value = String(endValue);
      }
    }
  });
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

  if (
    input === startInput ||
    input === endInput ||
    input.id === "scriptureStartVerse" ||
    input.id === "scriptureEndVerse"
  ) {
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

  if (
    input === startInput ||
    input === endInput ||
    input.id === "scriptureStartVerse" ||
    input.id === "scriptureEndVerse"
  ) {
    syncVerseRange(input);
  }

  if (
    targetId === "scriptureChapter" ||
    targetId === "scriptureStartVerse" ||
    targetId === "scriptureEndVerse"
  ) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  input.focus();
  input.select();
}

testamentSelect.addEventListener("change", renderBooks);
form.addEventListener("submit", handleSubmit);
downloadBtn.addEventListener("click", handleDownload);
downloadPptxBtn.addEventListener("click", handlePptxDownload);
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
      "<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>웹 뷰 준비 중...</title></head><body style='margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0f16;color:#f3f0ea;font-family:Work Sans, sans-serif;'>웹 뷰를 준비하고 있습니다...</body></html>"
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
      throw new Error(sessionPayload.error || "웹 뷰 생성에 실패했습니다.");
    }

    popup.location = `/scripture-web-view.html?session=${encodeURIComponent(
      sessionPayload.sessionId
    )}`;
  } catch (err) {
    if (popup && !popup.closed) {
      popup.close();
    }
    alert(err?.message || "웹 뷰를 여는 중 오류가 발생했습니다.");
  }
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
  scriptureExportConfirmBtn.textContent = "보내는 중...";

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
      throw new Error(responsePayload.error || "슬라이드를 보내지 못했습니다.");
    }

    mainSlides.push(cloneSlide(responsePayload.slide));
    closeScriptureExportModal();
    // The slide is already stored on the server, so this jump must not be
    // interrupted by the unsaved-changes guard.
    applyViewChange("ppt");
    pptTab = "slides";
    activeTemplateId = null;
    hasPendingTemplateChanges = false;
    templateBaselineSnapshot = null;
    loadWorkspaceSlides(mainSlides);
    renderPptScreen();
    applySlideSelection(responsePayload.slide.id);
    showToast(`슬라이드가 추가되었습니다: ${responsePayload.slide.name}`);
  } catch (err) {
    alert(err?.message || "슬라이드를 보내는 중 오류가 발생했습니다.");
  } finally {
    scriptureExportConfirmBtn.disabled = false;
    scriptureExportConfirmBtn.textContent = "보내기";
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
const tabSlidesBtn = document.getElementById("tabSlidesBtn");
const tabTemplatesBtn = document.getElementById("tabTemplatesBtn");
const templateCountBadge = document.getElementById("templateCountBadge");
const pptTabbarActions = document.getElementById("pptTabbarActions");
const pptWorkspace = document.getElementById("pptWorkspace");
const templateGallery = document.getElementById("templateGallery");
const templateGalleryGrid = document.getElementById("templateGalleryGrid");
const templateGalleryEmpty = document.getElementById("templateGalleryEmpty");
const templateGalleryGoSlidesBtn = document.getElementById("templateGalleryGoSlidesBtn");
const templateWorkspaceBar = document.getElementById("templateWorkspaceBar");
const templateBackBtn = document.getElementById("templateBackBtn");
const templateNameDisplay = document.getElementById("templateNameDisplay");
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
const scriptureSlideSettings = document.getElementById("scriptureSlideSettings");
const scriptureTestamentSelect = document.getElementById("scriptureTestament");
const scriptureBookSelect = document.getElementById("scriptureBook");
const scriptureKoVersionSelect = document.getElementById("scriptureKoVersion");
const scriptureEnVersionSelect = document.getElementById("scriptureEnVersion");
const scriptureChapterInput = document.getElementById("scriptureChapter");
const scriptureStartInput = document.getElementById("scriptureStartVerse");
const scriptureEndInput = document.getElementById("scriptureEndVerse");
const scripturePptxThemeSelect = document.getElementById("scripturePptxTheme");
const scripturePptxImageInput = document.getElementById("scripturePptxImage");
const scripturePptxImageClearBtn = document.getElementById("scripturePptxImageClear");
const scripturePptxImageStatus = document.getElementById("scripturePptxImageStatus");
const scriptureSettingsAccordion = document.getElementById("scriptureSettingsAccordion");
const scriptureIncludeTitle = document.getElementById("scriptureIncludeTitle");
const scriptureTitleSlideTypeGroup = document.getElementById("scriptureTitleSlideTypeGroup");
const scriptureGenerateBtn = document.getElementById("scriptureGenerateBtn");
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
const titleSlideSettings = document.getElementById("titleSlideSettings");
const titleDesignGrid = document.getElementById("titleDesignGrid");
const titleDesignSelect = document.getElementById("titleDesign");
const titleChurchNameInput = document.getElementById("titleChurchName");
const titleServiceDateSelect = document.getElementById("titleServiceDate");
const titleSubtitleInput = document.getElementById("titleSubtitle");
const titleSeasonSuggestBtn = document.getElementById("titleSeasonSuggestBtn");
const customTitleSlideSettings = document.getElementById("customTitleSlideSettings");
const customTitleDesignGrid = document.getElementById("customTitleDesignGrid");
const customTitleDesignSelect = document.getElementById("customTitleDesign");
const customTitleKoInput = document.getElementById("customTitleKo");
const customTitleEnInput = document.getElementById("customTitleEn");
const unsavedChangesModal = document.getElementById("unsavedChangesModal");
const unsavedChangesMessage = document.getElementById("unsavedChangesMessage");
const unsavedSaveBtn = document.getElementById("unsavedSaveBtn");
const unsavedDiscardBtn = document.getElementById("unsavedDiscardBtn");
const unsavedCancelBtn = document.getElementById("unsavedCancelBtn");
const appToastRegion = document.getElementById("appToastRegion");

// State
let slides = [];
let mainSlides = [];
let templates = [];
// "slides" or "templates". activeTemplateId is only ever set while on the
// templates tab, so isTemplateMode() stays a simple truthiness check.
let pptTab = "slides";
let activeTemplateId = null;
let hasPendingTemplateChanges = false;
let templateBaselineSnapshot = null;
let currentSlideId = null;
let slideBaselineSnapshot = null;
let slideRuntimeDraft = {};
let slideDirty = false;
let slideSaving = false;
let templateSaving = false;
// Depth > 0 means a guarded transition is already running, so nested helpers
// must not raise a second unsaved-changes popup.
let guardedTransitionDepth = 0;
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
  refreshTemplateDirtyState();
}

function collectActiveTemplateDraft() {
  const template = getActiveTemplate();
  return template
    ? {
        id: template.id,
        name: template.name,
        slides: slides.map(buildSerializableSlide),
      }
    : null;
}

function captureTemplateBaseline(template = getActiveTemplate(), templateSlides = slides) {
  const draft = template
    ? {
        id: template.id,
        name: template.name,
        slides: templateSlides.map(buildSerializableSlide),
      }
    : null;
  templateBaselineSnapshot = draft ? createSnapshot(draft) : null;
}

function refreshTemplateDirtyState() {
  const draft = collectActiveTemplateDraft();
  hasPendingTemplateChanges = Boolean(
    draft &&
      templateBaselineSnapshot &&
      isTemplateDirty(draft, templateBaselineSnapshot)
  );
  updateTemplateManagementUi();
}

function collectCurrentSlideDraft() {
  const savedSlide = slides.find((slide) => slide.id === currentSlideId);
  if (!savedSlide) return null;

  const draft = { ...cloneSlide(savedSlide), ...slideRuntimeDraft };
  draft.name = slideNameInput.value.trim();
  draft.type = slideTypeSelect.value;

  if (draft.type === "scripture") {
    Object.assign(draft, collectScriptureSlideFields());
    draft.sourceType = "upload";
  } else if (draft.type === "title") {
    Object.assign(draft, collectTitleSlideData());
    draft.sourceType = "basic";
  } else if (draft.type === "custom-title") {
    Object.assign(draft, collectCustomTitleSlideData());
    draft.sourceType = "basic";
  } else if (draft.type === "hymn") {
    draft.hymnNumber = hymnNumberInput.value;
    draft.includeTitle = hymnIncludeTitle.checked;
    draft.hymnKorTitle = hymnKorTitleInput.value.trim();
    draft.hymnEngTitle = hymnEngTitleInput.value.trim();
    draft.sourceType = "upload";
  } else {
    draft.sourceType =
      document.querySelector('input[name="sourceType"]:checked')?.value ||
      "basic";
    draft.content =
      draft.type === "ad" ? adBodyContent.value : slideContentInput.value;
    draft.font = draft.type === "ad" ? adBodyFont.value : slideFontSelect.value;
    draft.fontSize =
      draft.type === "ad" ? adBodyFontSize.value : slideFontSizeSelect.value;
    draft.align =
      draft.type === "ad" ? adBodyAlign.value : slideAlignSelect.value;
    draft.bg = adTextColor.value;
    draft.adBgSource =
      document.querySelector('input[name="adBgSource"]:checked')?.value ||
      "none";
    draft.adBgImageUrl = adBgImageUrl.value;
    draft.adBgOpacity = parseInt(adBgOpacity.value);

    if (draft.type === "ad") {
      draft.adTitle = adTitleInput.value;
      draft.adTitleSize = adTitleSizeSelect.value;
      draft.adTitleAlign = adTitleAlignSelect.value;
    }
  }

  draft.pendingFile = toFileMetadata(userPptxFile?.files?.[0]);
  draft.pendingBackgroundFile = toFileMetadata(adBgImageFile?.files?.[0]);
  draft.pendingScriptureImage = toFileMetadata(
    scripturePptxImageInput?.files?.[0]
  );
  return draft;
}

function collectCurrentSlidePreviewDraft(slideOverride) {
  const draft = slideOverride || collectCurrentSlideDraft();
  if (!draft) return null;
  return withTransientFiles(
    draft,
    selectTransientPreviewFiles(draft, {
      file: userPptxFile?.files?.[0],
      backgroundFile: adBgImageFile?.files?.[0],
    })
  );
}

function refreshSaveState() {
  const draft = collectCurrentSlideDraft();
  slideDirty = Boolean(
    draft &&
      (slideBaselineSnapshot === null ||
        isSnapshotDirty(draft, slideBaselineSnapshot))
  );

  const state = deriveSaveButtonState({
    hasSlide: Boolean(draft),
    hasTemplate: Boolean(getActiveTemplate()),
    slideDirty,
    templateDirty: hasPendingTemplateChanges,
    slideSaving,
    templateSaving,
  });
  editorSaveBtn.disabled = state.slideDisabled;
  templateSaveBtn.disabled = state.templateDisabled;
}

function resetEditorSelection() {
  currentSlideId = null;
  slideBaselineSnapshot = null;
  slideRuntimeDraft = {};
  slideDirty = false;
  clearTransientSlideFileInputs();
  emptyEditorState.style.display = "flex";
  slideEditor.style.display = "none";
  refreshSaveState();
}

// --- Unsaved changes: one popup, one guard, non-blocking notices ---

function showToast(message) {
  if (!appToastRegion) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = "app-toast";
  toast.textContent = message;
  appToastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function getPendingScopes() {
  return getPendingChangeScopes({
    slideDirty,
    templateDirty: hasPendingTemplateChanges,
  });
}

// Set while the dialog waits for a choice. Escape, the backdrop and the close
// button all resolve through it, so a stale click can never answer a newer
// question.
let unsavedDialogResolver = null;

function setUnsavedDialogBusy(busy) {
  unsavedSaveBtn.disabled = busy;
  unsavedDiscardBtn.disabled = busy;
  unsavedCancelBtn.disabled = busy;
  unsavedSaveBtn.textContent = busy ? "저장 중..." : "저장 후 이동";
}

function closeUnsavedChangesDialog() {
  unsavedDialogResolver = null;
  setUnsavedDialogBusy(false);
  if (unsavedChangesModal.open) {
    unsavedChangesModal.close();
  }
}

// Escape, the backdrop and "계속 편집" are the same answer. The dialog stays
// open between rounds so a failed save can be retried in place.
function showUnsavedChangesDialog(scopes) {
  unsavedChangesMessage.textContent = getUnsavedChangesMessage(scopes);
  setUnsavedDialogBusy(false);

  return new Promise((resolve) => {
    unsavedDialogResolver = resolve;
    const finish = (choice) => {
      if (unsavedDialogResolver !== resolve) {
        return;
      }
      unsavedDialogResolver = null;
      resolve(choice);
    };

    unsavedSaveBtn.onclick = () => finish("save");
    unsavedDiscardBtn.onclick = () => finish("discard");
    unsavedCancelBtn.onclick = () => finish("cancel");
    unsavedChangesModal.oncancel = (event) => {
      event.preventDefault();
      finish("cancel");
    };
    unsavedChangesModal.onclick = (event) => {
      if (event.target === unsavedChangesModal) {
        finish("cancel");
      }
    };

    if (!unsavedChangesModal.open) {
      unsavedChangesModal.showModal();
    }
  });
}

// Restores the exact saved baselines: a never-saved slide disappears, an
// edited slide falls back to its stored model, and template edits are replaced
// by the server copy.
async function discardPendingChanges() {
  const current = slides.find((slide) => slide.id === currentSlideId);

  if (slideDirty && current && current.saved === false) {
    slides = slides.filter((slide) => slide.id !== currentSlideId);
    resetEditorSelection();
    // The dropped draft must not survive inside the template working copy.
    syncWorkingSlidesToState();
    if (isTemplateMode()) {
      refreshTemplateDirtyState();
    }
    renderSlideList();
  } else if (slideDirty && current) {
    slideRuntimeDraft = {};
    populateEditor(current);
    slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft());
    renderPreview(current);
    updateButtonsState(current);
  }

  if (isTemplateMode() && hasPendingTemplateChanges) {
    const templateId = activeTemplateId;
    await loadTemplatesFromServer();
    const restored = templates.find((template) => template.id === templateId);
    activeTemplateId = restored ? templateId : null;
    loadWorkspaceSlides(restored ? restored.slides || [] : []);
    captureTemplateBaseline();
    refreshTemplateDirtyState();
    renderTemplateGallery();
  }

  refreshSaveState();
}

// Saving the slide draft is what creates the template change, so the sequence
// is recomputed after every step instead of being frozen up front.
async function savePendingChanges() {
  // Two scopes means at most two rounds; the extra round only exists so a
  // scope that refuses to go clean ends the loop instead of spinning.
  for (let round = 0; round < 3; round += 1) {
    const [scope] = getSaveSequence({
      slideDirty,
      templateDirty: hasPendingTemplateChanges,
    });
    if (!scope) {
      return true;
    }

    const saved =
      scope === "slide"
        ? await saveCurrentSlide({ silent: true })
        : await saveActiveTemplateToServer({ silent: true });
    if (!saved) {
      return false;
    }
  }

  return getPendingScopes().length === 0;
}

async function runTransition(transition) {
  guardedTransitionDepth += 1;
  try {
    await transition();
  } finally {
    guardedTransitionDepth -= 1;
  }
  return true;
}

// Every internal navigation funnels through here so only one popup can ever
// be on screen, even when a guarded transition calls another guarded helper.
async function guardTransition(transition) {
  if (guardedTransitionDepth > 0) {
    await transition();
    return true;
  }

  if (getPendingScopes().length === 0) {
    return runTransition(transition);
  }

  try {
    for (;;) {
      const scopes = getPendingScopes();
      if (scopes.length === 0) {
        break;
      }

      const choice = await showUnsavedChangesDialog(scopes);
      if (choice === "cancel") {
        return false;
      }

      if (choice === "discard") {
        await discardPendingChanges();
        break;
      }

      setUnsavedDialogBusy(true);
      let saved = false;
      try {
        saved = await savePendingChanges();
      } finally {
        setUnsavedDialogBusy(false);
      }
      if (saved) {
        showToast("변경사항을 저장했습니다");
        break;
      }
      // Keep the dialog and the workspace open so the draft and the picked
      // files survive for another attempt.
    }
  } finally {
    closeUnsavedChangesDialog();
  }

  return runTransition(transition);
}

function loadWorkspaceSlides(nextSlides) {
  slides = (Array.isArray(nextSlides) ? nextSlides : []).map((slide) => cloneSlide(slide));
  selectedSlideIds.clear();
  resetEditorSelection();
  renderSlideList();
}

function updateTemplateManagementUi() {
  const activeTemplate = getActiveTemplate();

  if (templateNameDisplay && activeTemplate) {
    templateNameDisplay.textContent = activeTemplate.name;
  }

  refreshSaveState();

  if (templateCountBadge) {
    templateCountBadge.textContent = String(templates.length);
  }
}

// Single source of truth for which of the three PPT screens is visible:
// the slide workspace, the template gallery, or a template's workspace.
function renderPptScreen() {
  const onTemplatesTab = pptTab === "templates";
  const inTemplateWorkspace = onTemplatesTab && Boolean(activeTemplateId);

  if (tabSlidesBtn) {
    tabSlidesBtn.classList.toggle("is-active", !onTemplatesTab);
    tabSlidesBtn.setAttribute("aria-selected", String(!onTemplatesTab));
  }

  if (tabTemplatesBtn) {
    tabTemplatesBtn.classList.toggle("is-active", onTemplatesTab);
    tabTemplatesBtn.setAttribute("aria-selected", String(onTemplatesTab));
  }

  if (templateGallery) {
    templateGallery.hidden = !onTemplatesTab || inTemplateWorkspace;
  }

  if (templateWorkspaceBar) {
    templateWorkspaceBar.hidden = !inTemplateWorkspace;
  }

  if (pptWorkspace) {
    pptWorkspace.hidden = onTemplatesTab && !inTemplateWorkspace;
  }

  // The bulk action menu acts on the slide list, so it has no meaning while
  // the gallery is showing.
  if (pptTabbarActions) {
    pptTabbarActions.hidden = onTemplatesTab && !inTemplateWorkspace;
  }

  updateTemplateManagementUi();
}

// By the time a transition body runs, the guard has already saved or
// discarded everything, so leaving only has to drop the template context.
function clearActiveWorkspace() {
  activeTemplateId = null;
  hasPendingTemplateChanges = false;
  templateBaselineSnapshot = null;
}

function setPptTab(tab) {
  const nextTab = tab === "templates" ? "templates" : "slides";
  if (nextTab === pptTab && !(nextTab === "templates" && activeTemplateId)) {
    return Promise.resolve(true);
  }

  return guardTransition(async () => {
    clearActiveWorkspace();
    pptTab = nextTab;

    if (pptTab === "slides") {
      loadWorkspaceSlides(mainSlides);
    } else {
      renderTemplateGallery();
    }

    renderPptScreen();
  });
}

function openTemplateWorkspace(templateId) {
  if (!templates.some((entry) => entry.id === templateId)) {
    return Promise.resolve(false);
  }

  if (activeTemplateId === templateId) {
    return Promise.resolve(true);
  }

  return guardTransition(async () => {
    clearActiveWorkspace();

    // The cache may have been refetched while discarding edits, so look the
    // template up again.
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      renderTemplateGallery();
      renderPptScreen();
      return;
    }

    pptTab = "templates";
    activeTemplateId = templateId;
    loadWorkspaceSlides(template.slides || []);
    captureTemplateBaseline();
    refreshTemplateDirtyState();
    renderPptScreen();
  });
}

function closeTemplateWorkspace() {
  if (!isTemplateMode()) {
    return Promise.resolve(true);
  }

  return guardTransition(async () => {
    clearActiveWorkspace();
    pptTab = "templates";
    loadWorkspaceSlides([]);
    renderTemplateGallery();
    renderPptScreen();
  });
}

function formatTemplateDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function closeTemplateCardMenus() {
  if (!templateGalleryGrid) {
    return;
  }
  templateGalleryGrid
    .querySelectorAll(".template-card-menu-dropdown:not([hidden])")
    .forEach((menu) => {
      menu.hidden = true;
    });
  templateGalleryGrid
    .querySelectorAll(".template-card-menu-btn.open")
    .forEach((button) => {
      button.classList.remove("open");
    });
}

function buildTemplateThumbStrip(template) {
  const strip = document.createElement("div");
  strip.className = "template-card-thumbs";

  const previewSlides = (template.slides || []).slice(0, 3);

  if (previewSlides.length === 0) {
    const empty = document.createElement("span");
    empty.className = "template-card-thumb is-empty";
    empty.textContent = "빈 템플릿";
    strip.appendChild(empty);
    return strip;
  }

  previewSlides.forEach((slide) => {
    const thumb = document.createElement("span");
    thumb.className = "template-card-thumb";
    const thumbSrc = slide.thumbnail || slide.adBgImagePath || null;

    if (thumbSrc) {
      const img = document.createElement("img");
      img.src = thumbSrc;
      img.alt = "";
      img.loading = "lazy";
      thumb.appendChild(img);
    } else {
      thumb.classList.add("is-placeholder");
      thumb.textContent = getSlideTypeLabel(slide);
    }

    strip.appendChild(thumb);
  });

  return strip;
}

function buildTemplateCard(template) {
  const card = document.createElement("article");
  card.className = "template-card";
  card.dataset.templateId = template.id;

  card.appendChild(buildTemplateThumbStrip(template));

  const body = document.createElement("div");
  body.className = "template-card-body";

  const title = document.createElement("h3");
  title.className = "template-card-title";

  // The title button stretches over the whole card via ::after, which keeps
  // the card clickable without nesting block content inside a <button>.
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "template-card-open";
  openBtn.textContent = template.name;
  openBtn.addEventListener("click", () => openTemplateWorkspace(template.id));
  title.appendChild(openBtn);
  body.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "template-card-meta";
  const slideCount = (template.slides || []).length;
  const createdAt = formatTemplateDate(template.createdAt);
  meta.textContent = createdAt
    ? `${slideCount}개 슬라이드 · ${createdAt}`
    : `${slideCount}개 슬라이드`;
  body.appendChild(meta);

  card.appendChild(body);

  const menuWrap = document.createElement("div");
  menuWrap.className = "template-card-menu";

  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "template-card-menu-btn";
  menuBtn.setAttribute("aria-label", `${template.name} 템플릿 메뉴`);
  menuBtn.textContent = "⋯";

  const menuDropdown = document.createElement("div");
  menuDropdown.className = "bulk-dropdown template-card-menu-dropdown";
  menuDropdown.hidden = true;

  const renameItem = document.createElement("button");
  renameItem.type = "button";
  renameItem.className = "bulk-dropdown-item";
  renameItem.textContent = "이름 변경";
  renameItem.addEventListener("click", (event) => {
    event.stopPropagation();
    closeTemplateCardMenus();
    renameTemplateById(template.id);
  });

  const deleteItem = document.createElement("button");
  deleteItem.type = "button";
  deleteItem.className = "bulk-dropdown-item danger";
  deleteItem.textContent = "삭제";
  deleteItem.addEventListener("click", (event) => {
    event.stopPropagation();
    closeTemplateCardMenus();
    deleteTemplateById(template.id);
  });

  menuDropdown.appendChild(renameItem);
  menuDropdown.appendChild(deleteItem);

  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const wasOpen = !menuDropdown.hidden;
    closeTemplateCardMenus();
    if (!wasOpen) {
      menuDropdown.hidden = false;
      menuBtn.classList.add("open");
    }
  });

  menuWrap.appendChild(menuBtn);
  menuWrap.appendChild(menuDropdown);
  card.appendChild(menuWrap);

  return card;
}

function renderTemplateGallery() {
  if (templateCountBadge) {
    templateCountBadge.textContent = String(templates.length);
  }

  if (!templateGalleryGrid) {
    return;
  }

  closeTemplateCardMenus();
  templateGalleryGrid.innerHTML = "";

  templates.forEach((template) => {
    templateGalleryGrid.appendChild(buildTemplateCard(template));
  });

  const isEmpty = templates.length === 0;
  templateGalleryGrid.hidden = isEmpty;
  if (templateGalleryEmpty) {
    templateGalleryEmpty.hidden = !isEmpty;
  }
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
  if (slideTypeSelect.value === 'title') {
    prepareTitleSlideFields();
  }
  if (slideTypeSelect.value === 'custom-title') {
    maybeAutoNameCustomTitleSlide();
  }
  if (slideTypeSelect.value === 'scripture') {
    fillScriptureBookSelects();
    if (scriptureIncludeTitle) scriptureIncludeTitle.checked = true;
    setScriptureTitleSlideType("말씀");
    syncScriptureTitleTypeUi();
    syncScriptureImageUI(slides.find((s) => s.id === currentSlideId));
  }
  updateSettingsVisibility();
  renderPreview();
  refreshSaveState();
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

    const current = collectCurrentSlideDraft();
    if (!current) return;
    Object.assign(current, {
      hymnNumber: number,
      serverFilePath: data.path,
      fileName: data.originalName,
      originalUrl: data.originalUrl,
      thumbnail: null,
      type: "hymn",
      sourceType: "upload",
    });

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

      slideRuntimeDraft = {
        ...slideRuntimeDraft,
        serverFilePath: current.serverFilePath,
        fileName: current.fileName,
        originalUrl: current.originalUrl,
        thumbnail: current.thumbnail,
      };
      renderPreview(current);
      refreshSaveState();
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
    renderPreview();
    refreshSaveState();
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
  hymnTitleFields.hidden = !hymnIncludeTitle.checked;
  if (hymnIncludeTitle.checked && hymnNumberInput.value) {
    await fetchAndFillHymnTitle(hymnNumberInput.value);
  }
  // Force preview re-render by clearing cache
  if (slidePreview) {
    slidePreview.dataset.lastRenderedUrl = '';
    slidePreview.dataset.lastRenderedPath = '';
  }
  renderPreview();
  refreshSaveState();
});

function getScriptureTitleSlideType() {
  const selected = document.querySelector(
    'input[name="scriptureTitleSlideType"]:checked'
  );
  return selected ? selected.value : "말씀";
}

function setScriptureTitleSlideType(value) {
  const radios = document.querySelectorAll(
    'input[name="scriptureTitleSlideType"]'
  );
  radios.forEach((radio) => {
    radio.checked = radio.value === (value || "말씀");
  });
}

function syncScriptureTitleTypeUi() {
  if (!scriptureTitleSlideTypeGroup || !scriptureIncludeTitle) {
    return;
  }
  scriptureTitleSlideTypeGroup.classList.toggle(
    "hidden",
    !scriptureIncludeTitle.checked
  );
}

function syncScriptureImageUI(slide) {
  if (!scripturePptxImageStatus || !scripturePptxImageClearBtn) {
    return;
  }
  const file = scripturePptxImageInput?.files?.[0];
  if (file) {
    scripturePptxImageStatus.textContent = `선택된 이미지: ${file.name}`;
    scripturePptxImageClearBtn.hidden = false;
    return;
  }
  if (slide?.customImageData) {
    scripturePptxImageStatus.textContent = "이전에 선택한 이미지 사용 중";
    scripturePptxImageClearBtn.hidden = false;
    return;
  }
  scripturePptxImageStatus.textContent = "선택한 이미지 없음";
  scripturePptxImageClearBtn.hidden = true;
}

function populateScriptureEditor(slide) {
  fillScriptureBookSelects(slide);
  scriptureKoVersionSelect.value =
    slide.koVersion !== undefined ? slide.koVersion : "새번역";
  scriptureEnVersionSelect.value =
    slide.enVersion !== undefined ? slide.enVersion : "web";
  scriptureChapterInput.value = slide.chapter || "";
  scriptureStartInput.value = slide.start || "";
  scriptureEndInput.value = slide.end || "";
  scripturePptxThemeSelect.value =
    slide.themeId || localStorage.getItem("biblics-pptx-theme") || "dark";
  scriptureIncludeTitle.checked =
    slide.includeTitle === undefined ? true : !!slide.includeTitle;
  setScriptureTitleSlideType(slide.titleSlideType || "말씀");
  syncScriptureTitleTypeUi();
  if (scripturePptxImageInput) {
    scripturePptxImageInput.value = "";
  }
  syncScriptureImageUI(slide);
}

function collectScriptureSlideFields() {
  return {
    testament: scriptureTestamentSelect.value,
    book: scriptureBookSelect.value,
    chapter: scriptureChapterInput.value.trim(),
    start: scriptureStartInput.value.trim(),
    end: scriptureEndInput.value.trim(),
    koVersion: scriptureKoVersionSelect.value || "",
    enVersion: scriptureEnVersionSelect.value || "",
    themeId: scripturePptxThemeSelect.value || "dark",
    includeTitle: scriptureIncludeTitle.checked,
    titleSlideType: getScriptureTitleSlideType(),
  };
}

function buildScriptureSignature(slide) {
  return JSON.stringify({
    testament: slide.testament,
    book: slide.book,
    chapter: slide.chapter,
    start: slide.start,
    end: slide.end,
    koVersion: slide.koVersion,
    enVersion: slide.enVersion,
    themeId: slide.themeId,
    includeTitle: !!slide.includeTitle,
    titleSlideType: slide.titleSlideType || "말씀",
    customImage: Boolean(slide.customImageData),
    customImageSize: slide.customImageData?.length || 0,
  });
}

async function generateScriptureSlideFile(slideName, slide) {
  const languages = [];
  if (slide.koVersion) languages.push("ko");
  if (slide.enVersion) languages.push("en");
  const body = {
    slideName,
    testament: slide.testament,
    book: slide.book,
    chapter: slide.chapter,
    start: slide.start,
    end: slide.end,
    koVersion: slide.koVersion,
    enVersion: slide.enVersion,
    lang: languages.join(","),
    themeId: slide.themeId,
    includeTitleSlide: slide.includeTitle,
    titleSlideType: slide.titleSlideType || "말씀",
  };
  if (slide.customImageData) {
    body.useCustomImage = true;
    body.customImageData = slide.customImageData;
  }
  const resp = await fetch("/api/scripture/generate-slide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "생성 실패");
  }
  return data;
}

async function applyScriptureSlideSettings(slide) {
  const fields = collectScriptureSlideFields();
  if (!fields.koVersion && !fields.enVersion) {
    alert("번역을 하나 이상 선택하세요.");
    return false;
  }
  if (!fields.testament || !fields.book || !fields.chapter) {
    alert("구분, 책, 장을 입력하세요.");
    return false;
  }

  Object.assign(slide, fields);
  slide.type = "scripture";
  slide.sourceType = "upload";

  const imageFile = scripturePptxImageInput?.files?.[0];
  if (imageFile) {
    slide.customImageData = await readFileAsDataUrl(imageFile);
  }

  return true;
}

async function ensureScriptureSlideFile(slide, slideName, button, busyLabel) {
  const signature = buildScriptureSignature(slide);
  if (slide.serverFilePath && slide.scriptureSignature === signature) {
    return true;
  }

  const originalText = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = busyLabel;
  }

  try {
    const generated = await generateScriptureSlideFile(slideName, slide);
    slide.serverFilePath = generated.path;
    slide.fileName = generated.originalName;
    slide.thumbnail = generated.thumbnail || null;
    slide.scriptureSignature = signature;
    if (slidePreview) {
      slidePreview.dataset.lastRenderedUrl = "";
      slidePreview.dataset.lastRenderedPath = "";
    }
    renderPreview(slide);
    return true;
  } catch (e) {
    alert("성경 말씀 슬라이드 생성 실패: " + e.message);
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

if (scriptureGenerateBtn) {
  scriptureGenerateBtn.addEventListener("click", async () => {
    const slide = collectCurrentSlideDraft();
    if (!slide) {
      return;
    }

    if (!(await applyScriptureSlideSettings(slide))) {
      return;
    }

    const slideName = slideNameInput.value.trim() || slide.name || "성경말씀";
    const generated = await ensureScriptureSlideFile(
      slide,
      slideName,
      scriptureGenerateBtn,
      "생성 중..."
    );
    if (!generated) return;
    slideRuntimeDraft = {
      ...slideRuntimeDraft,
      serverFilePath: slide.serverFilePath,
      fileName: slide.fileName,
      thumbnail: slide.thumbnail,
      scriptureSignature: slide.scriptureSignature,
      customImageData: slide.customImageData,
    };
    refreshSaveState();
    updateButtonsState(slide);
  });
}

if (scriptureTestamentSelect) {
  scriptureTestamentSelect.addEventListener("change", () => {
    fillScriptureBooks();
    refreshSaveState();
  });
}

if (scriptureIncludeTitle) {
  scriptureIncludeTitle.addEventListener("change", () => {
    syncScriptureTitleTypeUi();
    renderPreview();
    refreshSaveState();
  });
}

if (scripturePptxImageInput) {
  scripturePptxImageInput.addEventListener("change", () => {
    if (scripturePptxImageInput.files?.[0]) {
      slideRuntimeDraft.customImageData = null;
    }
    const current = collectCurrentSlideDraft();
    syncScriptureImageUI(current);
    refreshSaveState();
  });
}

if (scripturePptxImageClearBtn) {
  scripturePptxImageClearBtn.addEventListener("click", () => {
    if (scripturePptxImageInput) scripturePptxImageInput.value = "";
    slideRuntimeDraft.customImageData = null;
    const current = collectCurrentSlideDraft();
    syncScriptureImageUI(current);
    refreshSaveState();
  });
}

if (scriptureSettingsAccordion) {
  scriptureSettingsAccordion.addEventListener("toggle", () => {
    const chevron = scriptureSettingsAccordion.querySelector(".chevron");
    if (chevron) {
      chevron.textContent = scriptureSettingsAccordion.open ? "▴" : "▾";
    }
  });
}

[
  scriptureBookSelect,
  scriptureKoVersionSelect,
  scriptureEnVersionSelect,
  scriptureChapterInput,
  scriptureStartInput,
  scriptureEndInput,
  scripturePptxThemeSelect,
].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", () => {
    refreshSaveState();
  });
  el.addEventListener("change", () => {
    refreshSaveState();
  });
});

document.querySelectorAll('input[name="scriptureTitleSlideType"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    renderPreview();
    refreshSaveState();
  });
});

[scriptureChapterInput, scriptureStartInput, scriptureEndInput].forEach((input) => {
  if (!input) return;
  const normalizeAndRefresh = () => {
    normalizeNumberInput(input);
    refreshSaveState();
  };
  input.addEventListener("change", normalizeAndRefresh);
  input.addEventListener("blur", normalizeAndRefresh);
});

// --- Navigation ---
function switchView(viewName) {
  const nextView = viewName === "extractor" ? "extractor" : "ppt";
  const currentView = navExtractor.classList.contains("active")
    ? "extractor"
    : "ppt";
  if (nextView === currentView) {
    return Promise.resolve(true);
  }

  return guardTransition(async () => {
    applyViewChange(nextView);
  });
}

function applyViewChange(viewName) {
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
tabSlidesBtn.addEventListener("click", () => {
  closeBulkDropdown();
  setPptTab("slides");
});
tabTemplatesBtn.addEventListener("click", () => {
  closeBulkDropdown();
  setPptTab("templates");
});
templateGalleryGoSlidesBtn.addEventListener("click", () => setPptTab("slides"));
templateBackBtn.addEventListener("click", () => {
  closeBulkDropdown();
  closeTemplateWorkspace();
});
templateNameDisplay.addEventListener("click", renameActiveTemplate);

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

async function saveActiveTemplateToServer({ silent = false } = {}) {
  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) {
    return false;
  }
  if (!hasPendingTemplateChanges) {
    return true;
  }
  if (templateSaving) {
    return false;
  }

  templateSaving = true;
  refreshSaveState();
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
    const recaptureSlideBaseline = shouldRecaptureSlideBaseline({
      slideDirty,
      currentSlideId,
      storedSlideIds: nextTemplate.slides.map((slide) => slide.id),
    });
    slides = nextTemplate.slides.map((slide) => cloneSlide(slide));
    captureTemplateBaseline(nextTemplate, nextTemplate.slides);
    if (recaptureSlideBaseline) {
      slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft());
    }
    refreshTemplateDirtyState();
    renderSlideList();
    renderTemplateGallery();
    if (!silent) {
      showToast("템플릿이 저장되었습니다");
    }
    return true;
  } catch (e) {
    console.error("Failed to save template", e);
    alert(e.message || "템플릿 저장에 실패했습니다.");
    return false;
  } finally {
    templateSaving = false;
    refreshSaveState();
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
  templateBaselineSnapshot = null;

  const activeTemplate = getActiveTemplate();
  if (activeTemplate) {
    loadWorkspaceSlides(activeTemplate.slides || []);
    captureTemplateBaseline();
    refreshTemplateDirtyState();
  } else {
    activeTemplateId = null;
    loadWorkspaceSlides(mainSlides);
  }

  renderTemplateGallery();
  renderPptScreen();
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
  if (slide.type === "scripture") {
    return "성경 말씀";
  }
  if (slide.type === "title") {
    return "타이틀";
  }
  if (slide.type === "custom-title") {
    return "타이틀 (Custom)";
  }
  if (slide.type === "ad") {
    return slide.sourceType === "upload" ? "광고 업로드" : "광고";
  }
  return slide.sourceType === "upload" ? "업로드 슬라이드" : "단순 슬라이드";
}

// ... (loadSlidesFromStorage) ...

// --- Slide Management ---

// Guarded before the draft exists so a cancelled popup cannot leave an
// orphan slide behind.
function createSlide() {
  return guardTransition(async () => {
    appendNewSlide();
  });
}

function appendNewSlide() {
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
    titleDesign: "chapel",
    churchName: "",
    serviceDate: "",
    titleSubtitle: "",
    customTitleDesign: "aurora",
    customTitleKo: "",
    customTitleEn: "",
  };
  slides.push(newSlide);
  // Do NOT save to storage yet
  applySlideSelection(newSlide.id);
  refreshSaveState();
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

  let data = collectCurrentSlidePreviewDraft(slideOverride);

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
    } else if (type === 'scripture') {
      const current = slides.find((s) => s.id === currentSlideId) || {};
      data = {
        ...current,
        type: 'scripture',
        name: slideNameInput.value,
        includeTitle: scriptureIncludeTitle.checked,
        titleSlideType: getScriptureTitleSlideType(),
        sourceType: current.serverFilePath ? 'upload' : 'basic',
      };
    } else if (type === 'title') {
      data = {
        name: slideNameInput.value,
        type: 'title',
        sourceType: 'basic',
        ...collectTitleSlideData(),
      };
    } else if (type === 'custom-title') {
      data = {
        name: slideNameInput.value,
        type: 'custom-title',
        sourceType: 'basic',
        ...collectCustomTitleSlideData(),
      };
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
  // Only use this if not overridden by a new file upload. Title slides are
  // drawn from their own fields, so a leftover file path must not freeze them.
  const isTitleType = data.type === 'title' || data.type === 'custom-title';
  if (data.serverFilePath && !data.file && !isTitleType) {
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

  if (data.type === 'scripture' && !data.serverFilePath) {
    slidePreview.classList.remove('preview-scroll-mode');
    const ph = document.createElement('div');
    ph.className = 'preview-placeholder';
    ph.textContent = '"생성 (미리보기)"를 누르면 슬라이드가 만들어지고 미리보기가 표시됩니다.';
    slidePreview.appendChild(ph);
    return;
  }

  if (data.type === 'title') {
    slidePreview.classList.remove('preview-scroll-mode');
    slidePreview.appendChild(
      buildTitleSlidePreview(data, slidePreview.offsetWidth || 400)
    );
    return;
  }

  if (data.type === 'custom-title') {
    slidePreview.classList.remove('preview-scroll-mode');
    slidePreview.appendChild(
      buildCustomTitleSlidePreview(data, slidePreview.offsetWidth || 400)
    );
    return;
  }

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
  if (currentSlideId === id) return Promise.resolve(true);

  return guardTransition(async () => {
    applySlideSelection(id);
  });
}

function applySlideSelection(id) {
  currentSlideId = id;
  const slide = slides.find((s) => s.id === id);

  if (slide) {
    emptyEditorState.style.display = "none";
    slideEditor.style.display = "flex";
    populateEditor(slide);
    slideRuntimeDraft = {};
    slideBaselineSnapshot = slide.saved
      ? createSnapshot(collectCurrentSlideDraft())
      : null;
    renderPreview(slide);
    updateButtonsState(slide);
    refreshSaveState();
    renderSlideList();
  } else {
    // If id not found (e.g. after delete), show empty
    currentSlideId = null;
    emptyEditorState.style.display = "flex";
    slideEditor.style.display = "none";
    slideBaselineSnapshot = null;
    slideRuntimeDraft = {};
    slideDirty = false;
    refreshSaveState();
    renderSlideList();
  }
}

function clearTransientSlideFileInputs() {
  if (userPptxFile) userPptxFile.value = "";
  if (adBgImageFile) adBgImageFile.value = "";
  if (scripturePptxImageInput) scripturePptxImageInput.value = "";
}

function populateEditor(slide) {
  clearTransientSlideFileInputs();
  slideNameInput.value = slide.name;
  slideTypeSelect.value = slide.type;

  hymnNumberInput.value = slide.hymnNumber || '';
  hymnIncludeTitle.checked = !!slide.includeTitle;
  if (hymnTitleFields) hymnTitleFields.hidden = !slide.includeTitle;
  hymnKorTitleInput.value = slide.hymnKorTitle || '';
  hymnEngTitleInput.value = slide.hymnEngTitle || '';

  updateSettingsVisibility(slide.sourceType);

  if (slide.type === 'scripture') {
    populateScriptureEditor(slide);
  } else if (slide.type === 'title') {

    titleDesignSelect.value = normalizeTitleDesign(slide.titleDesign);
    syncTitleDesignCards(titleDesignSelect.value);
    titleChurchNameInput.value = slide.churchName || rememberedChurchName();
    titleSubtitleInput.value = slide.titleSubtitle || '';
    ensureTitleServiceDateOptions(slide.serviceDate || defaultServiceDate());
    updateTitleSeasonSuggestion();
  } else if (slide.type === 'custom-title') {
    customTitleDesignSelect.value = normalizeCustomTitleDesign(
      slide.customTitleDesign
    );
    syncCustomTitleDesignCards(customTitleDesignSelect.value);
    customTitleKoInput.value = slide.customTitleKo || '';
    customTitleEnInput.value = slide.customTitleEn || '';
  } else if (slide.type === 'hymn') {
    // Hymn fields are filled above.
  } else if (slide.type === 'ad') {
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
    renderPreview();
    refreshSaveState();
  }
}

function setAlignValue(value, markDirty = true) {
  slideAlignSelect.value = value;
  syncAlignTabs(value);
  if (markDirty) {
    renderPreview();
    refreshSaveState();
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

// --- Title slide (Sunday worship cover) helpers ---

const TITLE_DESIGNS = ["chapel", "editorial", "glow"];
const TITLE_CHURCH_STORAGE_KEY = "ppt.titleChurchName";

// Loaded as a module, so it lands after this script's top-level run.
// Always reach for it from inside a function, never at load time.
function titleDateApi() {
  return window.TitleSlideDate || null;
}

function normalizeTitleDesign(value) {
  return TITLE_DESIGNS.includes(value) ? value : "chapel";
}

function formatTitleDateKo(isoDate) {
  const api = titleDateApi();
  return api ? api.formatServiceDateKo(isoDate) : "";
}

function formatTitleDateEn(isoDate) {
  const api = titleDateApi();
  return api ? api.formatServiceDateEn(isoDate) : "";
}

function defaultServiceDate() {
  const api = titleDateApi();
  return api ? api.upcomingSundays(1)[0] || "" : "";
}

function rememberedChurchName() {
  try {
    return localStorage.getItem(TITLE_CHURCH_STORAGE_KEY) || "";
  } catch (e) {
    return "";
  }
}

function rememberChurchName(value) {
  if (!value) return;
  try {
    localStorage.setItem(TITLE_CHURCH_STORAGE_KEY, value);
  } catch (e) {
    // Storage can be unavailable in private mode; the field still works.
  }
}

function syncTitleDesignCards(value) {
  if (!titleDesignGrid) return;
  titleDesignGrid.querySelectorAll("[data-title-design]").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.titleDesign === value);
  });
}

function ensureTitleServiceDateOptions(selectedIso) {
  const api = titleDateApi();
  if (!api || !titleServiceDateSelect) return;

  const sundays = api.upcomingSundays(12);
  const values =
    selectedIso && !sundays.includes(selectedIso)
      ? [selectedIso, ...sundays]
      : sundays;
  const signature = values.join(",");

  if (titleServiceDateSelect.dataset.signature !== signature) {
    titleServiceDateSelect.innerHTML = "";
    values.forEach((iso) => {
      const option = document.createElement("option");
      option.value = iso;
      option.textContent = api.formatServiceDateKo(iso);
      titleServiceDateSelect.appendChild(option);
    });
    titleServiceDateSelect.dataset.signature = signature;
  }

  titleServiceDateSelect.value = selectedIso || values[0] || "";
}

function updateTitleSeasonSuggestion() {
  if (!titleSeasonSuggestBtn) return;

  const api = titleDateApi();
  const suggestion = api
    ? api.suggestSeasonLabel(titleServiceDateSelect.value)
    : "";

  if (!suggestion || titleSubtitleInput.value.trim() === suggestion) {
    titleSeasonSuggestBtn.hidden = true;
    return;
  }

  titleSeasonSuggestBtn.hidden = false;
  titleSeasonSuggestBtn.textContent = `${suggestion} 넣기`;
  titleSeasonSuggestBtn.dataset.suggestion = suggestion;
}

function collectTitleSlideData() {
  const isoDate = titleServiceDateSelect.value;
  return {
    titleDesign: normalizeTitleDesign(titleDesignSelect.value),
    churchName: titleChurchNameInput.value.trim(),
    serviceDate: isoDate,
    titleSubtitle: titleSubtitleInput.value.trim(),
  };
}

function buildTitleSlideName(isoDate) {
  const compact = isoDate ? isoDate.slice(5).replace("-", "") : "";
  return compact ? `주일예배 ${compact}` : "주일예배";
}

// --- Title slide preview (mirrors lib/title-slide.js coordinates) ---

const TITLE_SANS = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
const TITLE_SERIF = "Batang,'Nanum Myeongjo',serif";
const TITLE_LATIN = "Arial,Helvetica,sans-serif";

function titlePreviewNode(cssText, text) {
  const node = document.createElement("div");
  node.style.cssText = cssText;
  if (text) node.textContent = text;
  return node;
}

function buildChapelPreview(container, content, unit) {
  const { inch, pt } = unit;
  const gold = "#D6B36A";
  const bracket = Math.max(1, inch(0.014));

  [["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].forEach(
    ([vertical, horizontal]) => {
      container.appendChild(
        titlePreviewNode(
          `position:absolute;${vertical}:${inch(0.38)}px;${horizontal}:${inch(0.38)}px;` +
            `width:${inch(0.52)}px;height:${inch(0.52)}px;opacity:0.7;` +
            `border-${vertical}:${bracket}px solid ${gold};border-${horizontal}:${bracket}px solid ${gold};`
        )
      );
    }
  );

  const stack = titlePreviewNode(
    "position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;"
  );
  const rule = (marginTop) =>
    titlePreviewNode(
      `width:${inch(2.9)}px;height:${Math.max(1, inch(0.009))}px;background:${gold};` +
        `opacity:0.55;margin-top:${inch(marginTop)}px;flex-shrink:0;`
    );

  stack.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_SANS};font-weight:700;font-size:${pt(18)}px;` +
        `letter-spacing:${pt(18) * 0.22}px;padding-left:${pt(18) * 0.22}px;color:${gold};`,
      content.church
    )
  );
  stack.appendChild(rule(0.28));
  stack.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_SERIF};font-weight:700;font-size:${pt(96)}px;line-height:1.1;` +
        `letter-spacing:${inch(0.1)}px;padding-left:${inch(0.1)}px;color:#FFFFFF;` +
        `margin-top:${inch(0.3)}px;`,
      "주일예배"
    )
  );
  if (content.subtitle) {
    stack.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-weight:600;font-size:${pt(22)}px;color:#E8E2D4;` +
          `margin-top:${inch(0.2)}px;`,
        content.subtitle
      )
    );
  }
  stack.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_LATIN};font-weight:700;font-size:${pt(16)}px;` +
        `letter-spacing:${pt(16) * 0.6}px;padding-left:${pt(16) * 0.6}px;color:${gold};` +
        `margin-top:${inch(0.28)}px;`,
      "SUNDAY WORSHIP"
    )
  );
  stack.appendChild(rule(0.3));
  if (content.koDate) {
    stack.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-size:${pt(24)}px;color:#DCD6C8;margin-top:${inch(0.26)}px;`,
        content.koDate
      )
    );
  }

  container.style.background = "#0E1117";
  container.appendChild(stack);
}

function buildEditorialPreview(container, content, unit) {
  const { inch, pt } = unit;
  const ink = "#17150F";
  const muted = "#8A7659";
  const hair = "#C6BAA4";

  container.style.background = "#F5F0E7";
  container.appendChild(
    titlePreviewNode(
      `position:absolute;top:0;left:0;width:${inch(0.16)}px;height:100%;background:${ink};`
    )
  );

  const frame = titlePreviewNode(
    `position:relative;height:100%;box-sizing:border-box;display:flex;flex-direction:column;` +
      `padding:${inch(0.78)}px ${inch(0.9)}px ${inch(0.7)}px ${inch(1.05)}px;`
  );

  const head = titlePreviewNode(
    `display:flex;align-items:flex-start;justify-content:space-between;gap:${inch(0.3)}px;`
  );
  head.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_SANS};font-weight:700;font-size:${pt(18)}px;` +
        `letter-spacing:${pt(18) * 0.18}px;color:${muted};`,
      content.church
    )
  );
  if (content.subtitle) {
    head.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-weight:600;font-size:${pt(15)}px;color:${ink};` +
          `white-space:nowrap;`,
        content.subtitle
      )
    );
  }
  frame.appendChild(head);

  const middle = titlePreviewNode(
    "flex:1;display:flex;flex-direction:column;justify-content:center;"
  );
  middle.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_SANS};font-weight:800;font-size:${pt(112)}px;line-height:1;color:${ink};`,
      "주일예배"
    )
  );
  middle.appendChild(
    titlePreviewNode(
      `width:${inch(4.4)}px;height:${Math.max(1, inch(0.009))}px;background:${hair};` +
        `margin-top:${inch(0.36)}px;`
    )
  );
  middle.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_LATIN};font-weight:700;font-size:${pt(14)}px;` +
        `letter-spacing:${pt(14) * 0.55}px;color:${muted};margin-top:${inch(0.2)}px;`,
      "SUNDAY WORSHIP SERVICE"
    )
  );
  frame.appendChild(middle);

  if (content.koDate) {
    const dateBlock = titlePreviewNode("align-self:flex-end;text-align:right;");
    dateBlock.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_LATIN};font-weight:700;font-size:${pt(11)}px;` +
          `letter-spacing:${pt(11) * 0.5}px;color:${muted};`,
        "DATE"
      )
    );
    dateBlock.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-weight:700;font-size:${pt(28)}px;color:${ink};` +
          `margin-top:${inch(0.06)}px;`,
        content.koDate
      )
    );
    dateBlock.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_LATIN};font-size:${pt(13)}px;letter-spacing:${pt(13) * 0.28}px;` +
          `color:${muted};margin-top:${inch(0.05)}px;`,
        content.enDate
      )
    );
    frame.appendChild(dateBlock);
  }

  container.appendChild(frame);
}

function buildGlowPreview(container, content, unit) {
  const { inch, pt } = unit;
  const gold = "#F2C15B";
  const bandHeight = inch(1.74);

  container.style.background =
    "radial-gradient(58% 68% at 80% 14%, rgba(242,193,91,0.22), rgba(242,193,91,0) 72%)," +
    "linear-gradient(135deg, #0B1A33 0%, #1C2F52 100%)";

  const upper = titlePreviewNode(
    `position:relative;height:calc(100% - ${bandHeight}px);display:flex;flex-direction:column;` +
      `align-items:center;justify-content:center;`
  );

  if (content.subtitle) {
    upper.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-weight:600;font-size:${pt(18)}px;` +
          `letter-spacing:${pt(18) * 0.2}px;padding-left:${pt(18) * 0.2}px;color:${gold};` +
          `margin-bottom:${inch(0.22)}px;`,
        content.subtitle
      )
    );
  }

  const letters = titlePreviewNode(
    `display:flex;align-items:flex-start;gap:${inch(0.06)}px;`
  );
  ["주", "일", "예", "배"].forEach((letter, index) => {
    letters.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SERIF};font-weight:700;font-size:${pt(88)}px;line-height:1.05;` +
          `color:#FFFFFF;width:${inch(1.3)}px;text-align:center;` +
          `margin-top:${index % 2 === 1 ? inch(0.34) : 0}px;`,
        letter
      )
    );
  });
  upper.appendChild(letters);

  const rule = titlePreviewNode(
    `position:relative;width:${inch(4.6)}px;height:${Math.max(1, inch(0.011))}px;` +
      `background:${gold};opacity:0.85;margin-top:${inch(0.36)}px;`
  );
  [`left:${-inch(0.05)}px`, `right:${-inch(0.05)}px`].forEach((side) => {
    rule.appendChild(
      titlePreviewNode(
        `position:absolute;${side};top:${-inch(0.045)}px;width:${inch(0.1)}px;` +
          `height:${inch(0.1)}px;border-radius:50%;background:${gold};`
      )
    );
  });
  upper.appendChild(rule);

  upper.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_LATIN};font-weight:700;font-size:${pt(17)}px;` +
        `letter-spacing:${pt(17) * 0.62}px;padding-left:${pt(17) * 0.62}px;color:#F3E6C8;` +
        `margin-top:${inch(0.24)}px;`,
      "SUNDAY WORSHIP"
    )
  );
  container.appendChild(upper);

  const band = titlePreviewNode(
    `position:absolute;left:0;bottom:0;width:100%;height:${bandHeight}px;box-sizing:border-box;` +
      `background:rgba(4,10,22,0.55);border-top:${Math.max(1, inch(0.008))}px solid rgba(242,193,91,0.5);` +
      `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${inch(0.12)}px;`
  );
  band.appendChild(
    titlePreviewNode(
      `font-family:${TITLE_SANS};font-weight:700;font-size:${pt(26)}px;color:#FFFFFF;`,
      content.church
    )
  );
  if (content.koDate) {
    band.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-size:${pt(17)}px;color:#E9DFC8;`,
        content.koDate
      )
    );
  }
  container.appendChild(band);
}

function buildTitleSlidePreview(data, previewWidth) {
  const width = previewWidth || 400;
  const perInch = width / 13.333;
  const unit = {
    inch: (value) => value * perInch,
    pt: (value) => (value / 72) * perInch,
  };
  const content = {
    church: (data.churchName || "").trim() || "교회 이름",
    subtitle: (data.titleSubtitle || "").trim(),
    koDate: formatTitleDateKo(data.serviceDate),
    enDate: formatTitleDateEn(data.serviceDate),
  };

  const container = document.createElement("div");
  container.style.cssText =
    `position:relative;width:${width}px;height:${width * 0.5625}px;overflow:hidden;`;

  const design = normalizeTitleDesign(data.titleDesign);
  if (design === "editorial") {
    buildEditorialPreview(container, content, unit);
  } else if (design === "glow") {
    buildGlowPreview(container, content, unit);
  } else {
    buildChapelPreview(container, content, unit);
  }

  return container;
}

// --- Title (Custom) slide helpers ---

const CUSTOM_TITLE_DESIGNS = ["aurora", "monolith", "ivory", "marquee"];

function normalizeCustomTitleDesign(value) {
  return CUSTOM_TITLE_DESIGNS.includes(value) ? value : "aurora";
}

// Loaded as a module, so it lands after this script's top-level run.
function customTitleTextApi() {
  return window.CustomTitleText || null;
}

function customTitleKoSize(text) {
  const api = customTitleTextApi();
  return api ? api.koTitleFontSize(text) : 70;
}

function customTitleEnSize(text) {
  const api = customTitleTextApi();
  return api ? api.enTitleFontSize(text) : 19;
}

function syncCustomTitleDesignCards(value) {
  if (!customTitleDesignGrid) return;
  customTitleDesignGrid
    .querySelectorAll("[data-custom-title-design]")
    .forEach((card) => {
      card.classList.toggle(
        "is-active",
        card.dataset.customTitleDesign === value
      );
    });
}

function collectCustomTitleSlideData() {
  return {
    customTitleDesign: normalizeCustomTitleDesign(customTitleDesignSelect.value),
    customTitleKo: customTitleKoInput.value.trim(),
    customTitleEn: customTitleEnInput.value.trim(),
  };
}

// --- Title (Custom) preview (mirrors lib/custom-title-slide.js coordinates) ---

const CUSTOM_TITLE_THEMES = {
  aurora: {
    background:
      "radial-gradient(72% 72% at 78% 8%, rgba(139,92,246,0.46), rgba(139,92,246,0) 72%)," +
      "radial-gradient(78% 78% at 10% 96%, rgba(45,212,191,0.34), rgba(45,212,191,0) 72%)," +
      "linear-gradient(135deg, #170E33 0%, #2C1A63 52%, #0C3A52 100%)",
    koFont: TITLE_SANS,
    koWeight: 700,
    koColor: "#FFFFFF",
    koTracking: 0.02,
    koGap: 0.34,
    dividerGap: 0.3,
    ruleWidth: 3.4,
    ruleWeight: 0.024,
    ruleColor: "#8B6BFF",
    enColor: "#C4B2FF",
    enWeight: 700,
    enTracking: 0.42,
  },
  monolith: {
    background:
      "radial-gradient(62% 62% at 50% 0%, rgba(255,255,255,0.12), rgba(255,255,255,0) 70%)," +
      "linear-gradient(90deg, #0A0B0D 25%, #15171B 50%, #0A0B0D 75%)",
    koFont: TITLE_SERIF,
    koWeight: 700,
    koColor: "#F4F1EA",
    koTracking: 0.06,
    koGap: 0.36,
    dividerGap: 0.28,
    ruleWidth: 1.1,
    ruleWeight: 0.014,
    ruleColor: "#9A9689",
    enColor: "#9A9689",
    enWeight: 400,
    enTracking: 0.5,
    hairline: "#2C2E33",
  },
  ivory: {
    background: "#FAF6EF",
    koFont: TITLE_SERIF,
    koWeight: 700,
    koColor: "#1F1B16",
    koTracking: 0.04,
    koGap: 0.32,
    dividerGap: 0.28,
    ruleWidth: 2.2,
    ruleWeight: 0.017,
    ruleColor: "#C2A87A",
    enColor: "#907A52",
    enWeight: 700,
    enTracking: 0.45,
    frame: "#C2A87A",
    frameWeight: 0.021,
  },
  marquee: {
    background: "#2A0F16",
    koFont: TITLE_SERIF,
    koWeight: 700,
    koColor: "#F7EBDA",
    koTracking: 0.05,
    koGap: 0.34,
    dividerGap: 0.3,
    ruleWidth: 3.6,
    ruleWeight: 0.014,
    ruleColor: "#D9B376",
    enColor: "#D9B376",
    enWeight: 700,
    enTracking: 0.48,
    frame: "#D9B376",
    frameWeight: 0.024,
    diamonds: true,
  },
};

function customTitleDiamond(cssText, size, color) {
  return titlePreviewNode(
    `position:absolute;${cssText}width:${size}px;height:${size}px;` +
      `background:${color};transform:rotate(45deg);`
  );
}

function addCustomTitleFrame(container, theme, unit) {
  const { inch } = unit;

  if (theme.hairline) {
    [`top:${inch(0.45)}px`, `bottom:${inch(0.45)}px`].forEach((edge) => {
      container.appendChild(
        titlePreviewNode(
          `position:absolute;${edge};left:${inch(0.45)}px;right:${inch(0.45)}px;` +
            `height:1px;background:${theme.hairline};`
        )
      );
    });
  }

  if (!theme.frame) return;

  const inset = theme.diamonds ? 0.44 : 0.42;
  container.appendChild(
    titlePreviewNode(
      `position:absolute;inset:${inch(inset)}px;border:${Math.max(
        1,
        inch(theme.frameWeight)
      )}px solid ${theme.frame};`
    )
  );

  if (theme.diamonds) {
    const size = inch(0.11);
    const offset = inch(inset) - size / 2;
    [
      `top:${offset}px;left:${offset}px;`,
      `top:${offset}px;right:${offset}px;`,
      `bottom:${offset}px;left:${offset}px;`,
      `bottom:${offset}px;right:${offset}px;`,
    ].forEach((position) => {
      container.appendChild(customTitleDiamond(position, size, theme.frame));
    });
    return;
  }

  container.appendChild(
    titlePreviewNode(
      `position:absolute;inset:${inch(0.56)}px;border:1px solid ${theme.frame};`
    )
  );
}

function buildCustomTitleSlidePreview(data, previewWidth) {
  const width = previewWidth || 400;
  const perInch = width / 13.333;
  const unit = {
    inch: (value) => value * perInch,
    pt: (value) => (value / 72) * perInch,
  };
  const { inch, pt } = unit;

  const ko = (data.customTitleKo || "").trim() || "타이틀 이름";
  const en = (data.customTitleEn || "").trim();
  const theme =
    CUSTOM_TITLE_THEMES[normalizeCustomTitleDesign(data.customTitleDesign)];

  const container = document.createElement("div");
  container.style.cssText =
    `position:relative;width:${width}px;height:${width * 0.5625}px;overflow:hidden;`;
  container.style.background = theme.background;

  addCustomTitleFrame(container, theme, unit);

  const stack = titlePreviewNode(
    "position:relative;height:100%;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;"
  );

  const koSize = pt(customTitleKoSize(ko));
  stack.appendChild(
    titlePreviewNode(
      `font-family:${theme.koFont};font-weight:${theme.koWeight};font-size:${koSize}px;` +
        `line-height:1.22;color:${theme.koColor};white-space:nowrap;` +
        `letter-spacing:${koSize * theme.koTracking}px;` +
        `padding-left:${koSize * theme.koTracking}px;`,
      ko
    )
  );

  if (en) {
    const rule = titlePreviewNode(
      `position:relative;width:${inch(theme.ruleWidth)}px;` +
        `height:${Math.max(1, inch(theme.ruleWeight))}px;background:${theme.ruleColor};` +
        `margin-top:${inch(theme.koGap)}px;`
    );

    if (theme.diamonds) {
      // The renderer breaks the rule for a centre diamond.
      const size = inch(0.12);
      rule.appendChild(
        titlePreviewNode(
          `position:absolute;top:0;left:50%;width:${inch(0.26)}px;height:100%;` +
            `transform:translateX(-50%);background:${theme.background};`
        )
      );
      rule.appendChild(
        customTitleDiamond(
          `top:${-size / 2}px;left:calc(50% - ${size / 2}px);`,
          size,
          theme.ruleColor
        )
      );
    }

    stack.appendChild(rule);

    const enSize = pt(customTitleEnSize(en));
    stack.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_LATIN};font-weight:${theme.enWeight};font-size:${enSize}px;` +
          `line-height:1.5;color:${theme.enColor};white-space:nowrap;` +
          `letter-spacing:${enSize * theme.enTracking}px;` +
          `padding-left:${enSize * theme.enTracking}px;` +
          `margin-top:${inch(theme.dividerGap)}px;`,
        en.toUpperCase()
      )
    );
  }

  container.appendChild(stack);
  return container;
}

function toggleSettingsMode(mode) {
  updateSettingsVisibility(mode);
}

function setHidden(el, hidden) {
  if (el) el.hidden = !!hidden;
}

function updateSettingsVisibility(overrideMode) {
  const type = slideTypeSelect.value;
  const sourceType =
    overrideMode ||
    (document.querySelector('input[name="sourceType"]:checked') || {}).value ||
    "basic";

  const isTitle = type === "title";
  const isCustom = type === "custom-title";
  const isHymn = type === "hymn";
  const isScripture = type === "scripture";
  const isAd = type === "ad";
  const isSimpleFamily = type === "simple" || type === "ad";

  setHidden(titleSlideSettings, !isTitle);
  setHidden(customTitleSlideSettings, !isCustom);
  setHidden(scriptureSlideSettings, !isScripture);
  setHidden(hymnSlideSettings, !isHymn);
  setHidden(simpleSlideSettings, !isSimpleFamily);

  if (!isSimpleFamily) return;

  const isUpload = sourceType === "upload";
  setHidden(uploadSettingsMode, !isUpload);
  setHidden(adContentSettings, isUpload || !isAd);
  setHidden(basicSettingsMode, isUpload || isAd);
  setHidden(bgSettings, isUpload);
}

function toggleBgMode(source) {
  const adBgFileModeEl = document.getElementById("adBgFileMode");
  const adBgUrlModeEl = document.getElementById("adBgUrlMode");
  const adBgImageUrlInput = document.getElementById("adBgImageUrl");
  const hasImage = source === "file" || source === "url";
  if (source === "file") {
    setHidden(adBgFileModeEl, false);
    setHidden(adBgUrlModeEl, true);
    if (adBgImageUrlInput) adBgImageUrlInput.disabled = true;
  } else if (source === "url") {
    setHidden(adBgFileModeEl, true);
    setHidden(adBgUrlModeEl, false);
    if (adBgImageUrlInput) adBgImageUrlInput.disabled = false;
  } else {
    setHidden(adBgFileModeEl, true);
    setHidden(adBgUrlModeEl, true);
    if (adBgImageUrlInput) adBgImageUrlInput.disabled = true;
  }
  setHidden(dimOverlayRow, !hasImage);
}

function resetCurrentSlide() {
  if (!currentSlideId) return;
  const slide = slides.find((s) => s.id === currentSlideId);
  // Reset fields to last saved state
  populateEditor(slide);
  slideRuntimeDraft = {};
  renderPreview(slide);
  slideBaselineSnapshot = slide.saved
    ? createSnapshot(collectCurrentSlideDraft())
    : null;
  refreshSaveState();
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
    typeBadge.textContent = slide.type === "title" ? "TITLE" : slide.type === "custom-title" ? "TITLE+" : slide.type === "ad" ? "AD" : slide.type === "scripture" ? "말씀" : slide.sourceType === "upload" ? "PPT/PPTX" : "TEXT";

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

function rememberSlideRuntimeAssets(candidate, keys) {
  const assets = {};
  keys.forEach((key) => {
    assets[key] = candidate[key];
  });
  slideRuntimeDraft = { ...slideRuntimeDraft, ...assets };
}

function canReuseRuntimeUpload(candidate, markerKey, file, pathKey) {
  return Boolean(
    candidate[pathKey] &&
      candidate[markerKey] &&
      createSnapshot(candidate[markerKey]) ===
        createSnapshot(toFileMetadata(file))
  );
}

async function commitSlideCandidate(candidate) {
  const index = slides.findIndex((slide) => slide.id === candidate.id);
  if (index === -1) return false;

  candidate.saved = true;
  const nextSlides = slides.map((slide, i) =>
    i === index ? cloneSlide(candidate) : cloneSlide(slide)
  );

  if (!isTemplateMode()) {
    const resp = await fetch("/api/slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextSlides.map(buildSerializableSlide)),
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => ({}));
      throw new Error(payload.error || "슬라이드 저장에 실패했습니다.");
    }
  }

  slides = nextSlides;
  if (isTemplateMode()) {
    markTemplateDirty();
  } else {
    mainSlides = nextSlides.map(cloneSlide);
  }
  return true;
}

async function saveCurrentSlide({ silent = false } = {}) {
  if (!currentSlideId) {
    console.error("No currentSlideId!");
    return false;
  }

  const name = slideNameInput.value.trim();

  if (!name) {
    alert("슬라이드 이름을 입력하세요.");
    return false;
  }

  // Check duplicate name
  const existing = slides.find((s) => s.name === name && s.id !== currentSlideId);
  if (existing) {
    alert("이미 존재하는 슬라이드 이름입니다.");
    return false;
  }

  const slide = collectCurrentSlideDraft();
  if (!slide) {
    console.error("Slide object not found for id:", currentSlideId);
    return false;
  }

  slideSaving = true;
  refreshSaveState();
  try {
    if (slide.type === 'hymn') {
      const number = hymnNumberInput.value;
      if (!number) {
        alert("찬송가 장수를 입력하세요.");
        return false;
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
          rememberSlideRuntimeAssets(slide, [
            "serverFilePath",
            "fileName",
            "originalUrl",
            "hymnNumber",
            "thumbnail",
          ]);
        } catch (e) {
          alert("자동 다운로드 실패: " + e.message);
          if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          return false; // Stop save if download fails
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

    } else if (slide.type === 'scripture') {
      if (!(await applyScriptureSlideSettings(slide))) {
        return false;
      }

      const generated = await ensureScriptureSlideFile(
        slide,
        name,
        document.getElementById("editorSaveBtn"),
        "생성 중..."
      );
      if (!generated) {
        return false;
      }
      rememberSlideRuntimeAssets(slide, [
        "serverFilePath",
        "fileName",
        "thumbnail",
        "scriptureSignature",
        "customImageData",
      ]);
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
      const backgroundFile = adBgImageFile.files[0];
      if (bgSource === 'file') {
        if (
          backgroundFile &&
          !canReuseRuntimeUpload(
            slide,
            "uploadedBackgroundFile",
            backgroundFile,
            "adBgImagePath"
          )
        ) {
          const saveBtnMsg = document.getElementById('editorSaveBtn');
          const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
          if (saveBtnMsg) saveBtnMsg.textContent = "업로드 중...";

          try {
            const uploadResult = await uploadFile(backgroundFile);
            slide.adBgImagePath = uploadResult.path;
            slide.adBgImageUrl = null; // Clear URL if file is uploaded
            slide.uploadedBackgroundFile = toFileMetadata(backgroundFile);
            rememberSlideRuntimeAssets(slide, [
              "adBgImagePath",
              "adBgImageUrl",
              "uploadedBackgroundFile",
            ]);
          } catch (e) {
            alert("배경 이미지 업로드 실패: " + e.message);
            if (saveBtnMsg) saveBtnMsg.textContent = originalText;
            return false;
          } finally {
            if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          }
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
          return false;
        }
        
        if (
          !canReuseRuntimeUpload(
            slide,
            "uploadedFile",
            file,
            "serverFilePath"
          )
        ) {
          const saveBtnMsg = document.getElementById('editorSaveBtn');
          const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
          if (saveBtnMsg) saveBtnMsg.textContent = "업로드 중...";

          try {
            const uploadResult = await uploadFile(file);
            slide.fileName = file.name;
            slide.serverFilePath = uploadResult.path;
            slide.fileSaved = true;
            slide.uploadedFile = toFileMetadata(file);
            rememberSlideRuntimeAssets(slide, [
              "fileName",
              "serverFilePath",
              "fileSaved",
              "uploadedFile",
            ]);
          } catch (e) {
            alert("파일 업로드 실패: " + e.message);
            if (saveBtnMsg) saveBtnMsg.textContent = originalText;
            return false;
          } finally {
            if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          }
        }
      }
      
      slide.saved = true;

    } else if (slide.type === 'title') {
      const titleData = collectTitleSlideData();
      if (!titleData.churchName) {
        alert("교회 이름을 입력하세요.");
        return false;
      }
      if (!titleData.serviceDate) {
        alert("주일 날짜를 선택하세요.");
        return false;
      }

      Object.assign(slide, titleData);
      slide.sourceType = 'basic';
      slide.saved = true;

    } else if (slide.type === 'custom-title') {
      const customTitleData = collectCustomTitleSlideData();
      if (!customTitleData.customTitleKo) {
        alert("타이틀 이름(한글)을 입력하세요.");
        return false;
      }

      Object.assign(slide, customTitleData);
      slide.sourceType = 'basic';
      slide.saved = true;

    } else {
      // Simple Slide Logic
      const sourceRadio = document.querySelector('input[name="sourceType"]:checked');
      if (!sourceRadio) {
        console.error("No source radio checked");
        return false;
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
      const backgroundFile = adBgImageFile.files[0];
      if (bgSrc === 'file') {
        if (
          backgroundFile &&
          !canReuseRuntimeUpload(
            slide,
            "uploadedBackgroundFile",
            backgroundFile,
            "adBgImagePath"
          )
        ) {
          const saveBtnMsg = document.getElementById('editorSaveBtn');
          const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
          if (saveBtnMsg) saveBtnMsg.textContent = "업로드 중...";
          try {
            const uploadResult = await uploadFile(backgroundFile);
            slide.adBgImagePath = uploadResult.path;
            slide.adBgImageUrl = null;
            slide.uploadedBackgroundFile = toFileMetadata(backgroundFile);
            rememberSlideRuntimeAssets(slide, [
              "adBgImagePath",
              "adBgImageUrl",
              "uploadedBackgroundFile",
            ]);
          } catch (e) {
            alert("배경 이미지 업로드 실패: " + e.message);
            if (saveBtnMsg) saveBtnMsg.textContent = originalText;
            return false;
          } finally {
            if (saveBtnMsg) saveBtnMsg.textContent = originalText;
          }
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
          if (
            !canReuseRuntimeUpload(
              slide,
              "uploadedFile",
              file,
              "serverFilePath"
            )
          ) {
            // Upload to server
            try {
              const result = await uploadFile(file);
              // Update slide with server file info
              slide.serverFilePath = result.path; // e.g. /uploads/xxx-name.pptx
              slide.fileName = result.originalName;
              slide.thumbnail = result.thumbnail; // Save thumbnail path
              slide.fileSaved = true;
              slide.uploadedFile = toFileMetadata(file);
              rememberSlideRuntimeAssets(slide, [
                "serverFilePath",
                "fileName",
                "thumbnail",
                "fileSaved",
                "uploadedFile",
              ]);

              // Clear transient file obj
              slide.file = null;
              slide.fileData = null;
            } catch (err) {
              console.error("Upload Error:", err);
              alert("파일 업로드 실패");
              return false;
            }
          }
        } else if (!slide.fileName && !slide.serverFilePath) {
          alert("PPTX 파일을 업로드해주세요.");
          return false;
        }
      }
    }

    const committed = await commitSlideCandidate(slide);
    if (!committed) {
      return false;
    }

    if (slide.type === "title") {
      rememberChurchName(slide.churchName);
    }
    populateEditor(slide);
    slideRuntimeDraft = {};
    slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft());
    refreshSaveState();
    updateButtonsState(slide);
    renderSlideList();
    if (!silent) {
      showToast(
        isTemplateMode()
          ? "슬라이드 변경사항이 반영되었습니다 · 템플릿 저장 필요"
          : "슬라이드가 저장되었습니다"
      );
    }
    return true;
  } catch (e) {
    console.error("Error in saveCurrentSlide:", e);
    alert("저장 중 오류 발생: " + e.message);
    return false;
  } finally {
    slideSaving = false;
    refreshSaveState();
  }
}

async function downloadSlide() {
  if (!currentSlideId) return;
  const slide = slides.find(s => s.id === currentSlideId);
  if (!slide || !slide.saved) return;

  if (slide.type === 'title') {
    try {
      const resp = await fetch('/api/create-title-slide-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleDesign: slide.titleDesign,
          churchName: slide.churchName,
          serviceDate: slide.serviceDate,
          titleSubtitle: slide.titleSubtitle,
        })
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
      a.download = `${slide.name || buildTitleSlideName(slide.serviceDate)}.pptx`;
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

  if (slide.type === 'custom-title') {
    try {
      const resp = await fetch('/api/create-custom-title-slide-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customTitleDesign: slide.customTitleDesign,
          customTitleKo: slide.customTitleKo,
          customTitleEn: slide.customTitleEn,
        })
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
      a.download = `${slide.name || slide.customTitleKo || '타이틀'}.pptx`;
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

  // Hymn slide with a title slide: let the server merge the title deck in front.
  if (slide.type === 'hymn' && slide.includeTitle) {
    try {
      const resp = await fetch("/api/slides/export-pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides: [buildSerializableSlide(slide)] })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert("다운로드 실패: " + (err.error || "Unknown Error"));
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slide.name || `찬송가_${slide.hymnNumber || ''}`}.pptx`;
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
    titleDesign: slide.titleDesign,
    churchName: slide.churchName,
    serviceDate: slide.serviceDate,
    titleSubtitle: slide.titleSubtitle,
    customTitleDesign: slide.customTitleDesign,
    customTitleKo: slide.customTitleKo,
    customTitleEn: slide.customTitleEn,
    includeTitle: slide.includeTitle,
    titleSlideType: slide.titleSlideType,
    testament: slide.testament,
    book: slide.book,
    chapter: slide.chapter,
    start: slide.start,
    end: slide.end,
    koVersion: slide.koVersion,
    enVersion: slide.enVersion,
    themeId: slide.themeId,
    customImageData: slide.customImageData,
    scriptureSignature: slide.scriptureSignature,
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
    renderTemplateGallery();
    showToast(`템플릿이 저장되었습니다: ${payload.template.name}`);
    await openTemplateWorkspace(payload.template.id);
  } catch (err) {
    alert(err.message || "템플릿 저장 중 오류가 발생했습니다.");
  }
}

async function deleteTemplateById(templateId) {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    return;
  }

  if (!confirm(`'${template.name}' 템플릿을 삭제하시겠습니까?`)) {
    return;
  }

  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(template.id)}`, {
      method: "DELETE",
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.error || "템플릿 삭제에 실패했습니다.");
    }

    templates = templates.filter((entry) => entry.id !== template.id);
    const wasOpen = activeTemplateId === template.id;
    activeTemplateId = null;
    hasPendingTemplateChanges = false;
    templateBaselineSnapshot = null;

    if (wasOpen) {
      loadWorkspaceSlides([]);
    }

    renderTemplateGallery();
    renderPptScreen();
  } catch (err) {
    alert(err.message || "템플릿 삭제 중 오류가 발생했습니다.");
  }
}

function deleteActiveTemplate() {
  return deleteTemplateById(activeTemplateId);
}

function promptTemplateName(currentName) {
  const nextName = prompt("템플릿 이름을 입력하세요.", currentName);
  if (!nextName) {
    return null;
  }

  const trimmedName = nextName.trim();
  if (!trimmedName || trimmedName === currentName) {
    return null;
  }

  return trimmedName;
}

function renameActiveTemplate() {
  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) {
    return;
  }

  const trimmedName = promptTemplateName(activeTemplate.name);
  if (!trimmedName) {
    return;
  }

  templates = templates.map((template) =>
    template.id === activeTemplate.id
      ? { ...template, name: trimmedName }
      : template
  );
  refreshTemplateDirtyState();
}

// Renaming from the gallery has no "저장" button to fall back on, so persist
// immediately instead of leaving the change pending.
async function renameTemplateById(templateId) {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    return;
  }

  const trimmedName = promptTemplateName(template.name);
  if (!trimmedName) {
    return;
  }

  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(template.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        slides: (template.slides || []).map(buildSerializableSlide),
      }),
    });

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.error || "템플릿 이름 변경에 실패했습니다.");
    }

    const nextTemplate = cloneTemplate(payload.template);
    templates = templates.map((entry) =>
      entry.id === nextTemplate.id ? nextTemplate : entry
    );
    renderTemplateGallery();
    updateTemplateManagementUi();
  } catch (err) {
    alert(err.message || "템플릿 이름 변경 중 오류가 발생했습니다.");
  }
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

editorSaveBtn.addEventListener("click", () => saveCurrentSlide());
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

// Closing the editor is the same decision as leaving it, so it goes through
// the one guard instead of its own confirm.
function cancelEdit() {
  if (!currentSlideId) return Promise.resolve(true);

  return guardTransition(async () => {
    const slide = slides.find((s) => s.id === currentSlideId);
    if (slide && !slide.saved) {
      slides = slides.filter((s) => s.id !== currentSlideId);
      syncWorkingSlidesToState();
      if (isTemplateMode()) {
        refreshTemplateDirtyState();
      }
    }
    resetEditorSelection();
    renderSlideList();
  });
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

document.addEventListener("click", (e) => {
  if (bulkActionDropdown && !bulkActionDropdown.hidden) {
    if (!bulkActionMenuBtn.contains(e.target) && !bulkActionDropdown.contains(e.target)) {
      closeBulkDropdown();
    }
  }
  if (templateGalleryGrid && !templateGalleryGrid.contains(e.target)) {
    closeTemplateCardMenus();
  }
});

bulkDeleteBtn.addEventListener("click", () => { closeBulkDropdown(); deleteSelectedSlides(); });
bulkTemplateBtn.addEventListener("click", () => { closeBulkDropdown(); createTemplateFromSelection(); });
bulkDownloadBtn.addEventListener("click", () => { closeBulkDropdown(); downloadSelectedSlidesBundle(); });
templateSaveBtn.addEventListener("click", () => saveActiveTemplateToServer());
templateDeleteBtn.addEventListener("click", deleteActiveTemplate);

[
  slideNameInput,
  slideTypeSelect,
  slideContentInput,
  slideFontSelect,
  slideFontSizeSelect,
  slideAlignSelect,
].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", () => {
    renderPreview();
    refreshSaveState();
  });
});

sourceRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    toggleSettingsMode(e.target.value);
    renderPreview();
    refreshSaveState();
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
    toggleBgMode(e.target.value);
    renderPreview();
    refreshSaveState();
  });
});

// rte-size-btn: title size toggle
document.querySelectorAll('.rte-size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    document.getElementById(targetId).value = btn.dataset.value;
    syncRteSizeBtns(targetId, btn.dataset.value);
    renderPreview();
    refreshSaveState();
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
    renderPreview();
    refreshSaveState();
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
    renderPreview();
    refreshSaveState();
  });
});

// ad body inputs: live preview
[adBodyContent, adBodyFont, adBodyFontSize, adTitleInput].forEach(el => {
  el.addEventListener('input', () => {
    renderPreview();
    refreshSaveState();
  });
});

adBgImageUrl.addEventListener('input', () => {
  renderPreview();
  refreshSaveState();
});

adBgOpacity.addEventListener('input', () => {
  adBgOpacityValue.textContent = `${adBgOpacity.value}%`;
  renderPreview();
  refreshSaveState();
});

// --- Title slide listeners ---

// Only replaces names the user has not personalised yet.
function maybeAutoNameTitleSlide() {
  const current = slideNameInput.value.trim();
  const isUntouched =
    !current || /^새 슬라이드\d*$/.test(current) || /^주일예배( \d{4})?$/.test(current);
  if (isUntouched) {
    slideNameInput.value = buildTitleSlideName(titleServiceDateSelect.value);
  }
}

function prepareTitleSlideFields() {
  if (!titleChurchNameInput.value.trim()) {
    titleChurchNameInput.value = rememberedChurchName();
  }
  ensureTitleServiceDateOptions(
    titleServiceDateSelect.value || defaultServiceDate()
  );
  updateTitleSeasonSuggestion();
  maybeAutoNameTitleSlide();
}

if (titleDesignGrid) {
  titleDesignGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-title-design]');
    if (!card) return;
    titleDesignSelect.value = normalizeTitleDesign(card.dataset.titleDesign);
    syncTitleDesignCards(titleDesignSelect.value);
    renderPreview();
    refreshSaveState();
  });
}

titleChurchNameInput.addEventListener('input', () => {
  renderPreview();
  refreshSaveState();
});

titleServiceDateSelect.addEventListener('change', () => {
  updateTitleSeasonSuggestion();
  maybeAutoNameTitleSlide();
  renderPreview();
  refreshSaveState();
});

titleSubtitleInput.addEventListener('input', () => {
  updateTitleSeasonSuggestion();
  renderPreview();
  refreshSaveState();
});

titleSeasonSuggestBtn.addEventListener('click', () => {
  titleSubtitleInput.value = titleSeasonSuggestBtn.dataset.suggestion || '';
  updateTitleSeasonSuggestion();
  renderPreview();
  refreshSaveState();
});

// --- Title (Custom) slide listeners ---

// Only replaces names the user has not personalised yet.
function maybeAutoNameCustomTitleSlide() {
  const current = slideNameInput.value.trim();
  if (current && !/^새 슬라이드\d*$/.test(current)) return;

  const ko = customTitleKoInput.value.trim();
  if (ko) slideNameInput.value = ko;
}

if (customTitleDesignGrid) {
  customTitleDesignGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-custom-title-design]');
    if (!card) return;
    customTitleDesignSelect.value = normalizeCustomTitleDesign(
      card.dataset.customTitleDesign
    );
    syncCustomTitleDesignCards(customTitleDesignSelect.value);
    renderPreview();
    refreshSaveState();
  });
}

customTitleKoInput.addEventListener('input', () => {
  maybeAutoNameCustomTitleSlide();
  renderPreview();
  refreshSaveState();
});

customTitleEnInput.addEventListener('input', () => {
  renderPreview();
  refreshSaveState();
});

[
  hymnNumberInput,
  hymnKorTitleInput,
  hymnEngTitleInput,
  adTitleSizeSelect,
  adTitleAlignSelect,
  adBodyAlign,
].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", refreshSaveState);
  el.addEventListener("change", refreshSaveState);
});

if (adBgImageFile) {
  adBgImageFile.addEventListener("change", () => {
    renderPreview();
    refreshSaveState();
  });
}

userPptxFile.addEventListener('change', async () => {
  refreshSaveState();

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
        slideRuntimeDraft = {
          ...slideRuntimeDraft,
          serverFilePath: result.path,
          fileName: result.originalName || file.name,
          fileSaved: true,
          uploadedFile: toFileMetadata(file),
        };
        renderPreview(collectCurrentSlideDraft());
        refreshSaveState();
        return;
      } catch (e) {
        alert("PPT 변환 업로드 실패: " + e.message);
      }
    }
  }

  renderPreview();
  refreshSaveState();
});

// Closing the tab is the one navigation the in-app popup cannot own, so the
// browser prompt stands in for it — and only when something is really dirty.
window.addEventListener("beforeunload", (event) => {
  if (!slideDirty && !hasPendingTemplateChanges) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
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
