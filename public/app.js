// The bundler roots at public/, so the shared lib is reached through the same
// alias main.jsx uses rather than a server URL path.
import {
  applyReorder,
  buildResetSlideDraft,
  canApplyResetDraft,
  createSnapshot,
  CUSTOM_RESET_RETRY_MESSAGE,
  deriveSaveButtonState,
  getBooksUnavailableMessage,
  getBusyBlockMessage,
  getResetDraftBlockMessage,
  isDiscardComplete,
  isSaveBusy,
  isSlideAtResetDefaults,
  isSlideUnsaved,
  isSnapshotDirty,
  planDiscard,
  planReorder,
  REORDER_FAILURE_MESSAGE,
  resolveAdjacentSlideId,
  resolveCurrentSlideSource,
  runGuardedTransition,
  selectTransientPreviewFiles,
  shouldWarnBeforeUnload,
  toFileMetadata,
  UNSAVED_CHANGES_MESSAGE,
  withTransientFiles,
  WORKSPACE_INIT_FAILED_MESSAGE,
} from "@lib/save-state.js";
import {
  createDuplicateSlideName,
  hasOwnedSlideAsset,
  insertSlideAfter,
} from "@lib/slide-duplicate.js";
import {
  createCustomTitleDesignPicker,
  restoreCustomTitleDesignEditor,
} from "./custom-title-design-picker.js";
import {
  buildCustomTitleSlidePreview as buildCatalogCustomTitleSlidePreview,
} from "./custom-title-preview.js";
import {
  applyWorkspaceLayoutState,
  createWidthReflowCoordinator,
  resolveWorkspaceLayoutState,
} from "./workspace-layout.js";
import {
  createPptWorkspaceUiState,
  reducePptWorkspaceUi,
} from "./ppt-workspace-ui.js";
import { buildHymnSubtitle } from "@lib/cover-title-content.js";
import {
  TEMPLATE_SCHEMA_ERROR,
  parseTemplateSchema,
  templateSchemaErrorMessage,
  templateSchemaFilename,
  toPortableTemplateSchema,
  unrestorableSlideNames,
} from "@lib/template-schema.js";

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
// The scripture editor reads its testament and book from this cache, so a
// slide may not be selected or baselined before it is filled.
let booksReady = false;

async function loadBooks() {
  const resp = await fetch("/api/books");
  if (!resp.ok) {
    throw new Error("failed to load books");
  }
  dataCache = await resp.json();
  booksReady = true;
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

  const hasPreferredTestament = Object.hasOwn(preferred, "testament");
  const hasPreferredBook = Object.hasOwn(preferred, "book");
  const previousTestament = hasPreferredTestament
    ? preferred.testament
    : testamentEl.value;
  const previousBook = hasPreferredBook ? preferred.book : bookEl.value;

  testamentEl.innerHTML = "";
  dataCache.testaments.forEach((testament) => {
    const option = document.createElement("option");
    option.value = testament.id;
    option.textContent = testament.label;
    testamentEl.appendChild(option);
  });

  if (hasPreferredTestament && !previousTestament) {
    ensureEmptySelectValue(testamentEl, "구분 선택");
  } else {
    testamentEl.value =
      previousTestament || dataCache.testaments[0]?.id || "";
  }

  fillScriptureBooks(previousBook, {
    allowEmpty: hasPreferredBook && !previousBook,
  });
}

function fillScriptureBooks(preferredBook, { allowEmpty = false } = {}) {
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
    if (allowEmpty) {
      ensureEmptySelectValue(bookEl, "책 선택");
    }
    return;
  }

  selected.books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book.slugKo;
    option.textContent = book.name;
    bookEl.appendChild(option);
  });

  if (allowEmpty) {
    ensureEmptySelectValue(bookEl, "책 선택");
  } else if (preferredBook) {
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

  // A programmatic value change fires nothing on its own, so every stepper
  // announces itself the same way a keystroke would.
  input.dispatchEvent(new Event("input", { bubbles: true }));

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

// Pinned so the PPT workspace can wait for it: a scripture slide selected
// before the book list exists would be baselined with an empty book.
const booksSettled = loadBooks().catch(() => {
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

  // This flow jumps into the PPT workspace and resets it, so pending slide or
  // template work has to be settled before the export starts. Cancelling here
  // aborts the export instead of silently zeroing that work later.
  if (!(await ensureNoPendingChanges())) {
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
    // The preflight guard already settled every pending change and the slide
    // is stored on the server, so the jump uses the unguarded helpers.
    applyViewChange("ppt");
    pptTab = "slides";
    activeTemplateId = null;
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

const appPage = document.querySelector(".page");
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
const pptSlidesPaneBtn = document.getElementById("pptSlidesPaneBtn");
const pptInspectorPaneBtn = document.getElementById("pptInspectorPaneBtn");
const pptFocusModeBtn = document.getElementById("pptFocusModeBtn");
const pptWorkspace = document.getElementById("pptWorkspace");
const slideListPanel = document.getElementById("slideListPanel");
const templateGallery = document.getElementById("templateGallery");
const templateGalleryGrid = document.getElementById("templateGalleryGrid");
const templateGalleryEmpty = document.getElementById("templateGalleryEmpty");
const templateGalleryGoSlidesBtn = document.getElementById("templateGalleryGoSlidesBtn");
const templateSchemaImportBtn = document.getElementById("templateSchemaImportBtn");
const templateSchemaFileInput = document.getElementById("templateSchemaFileInput");
const templateWorkspaceBar = document.getElementById("templateWorkspaceBar");
const templateBackBtn = document.getElementById("templateBackBtn");
const templateNameDisplay = document.getElementById("templateNameDisplay");
const bulkActionMenuBtn = document.getElementById("bulkActionMenuBtn");
const bulkActionDropdown = document.getElementById("bulkActionDropdown");
const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
const bulkTemplateBtn = document.getElementById("bulkTemplateBtn");
const bulkDownloadBtn = document.getElementById("bulkDownloadBtn");
const templateDeleteBtn = document.getElementById("templateDeleteBtn");
const slideEditor = document.getElementById("slideEditor");
const emptyEditorState = document.getElementById("emptyEditorState");
const addSlideBtn = document.getElementById("addSlideBtn");
const addSlideMenuBtn = document.getElementById("addSlideMenuBtn");
const addSlideDropdown = document.getElementById("addSlideDropdown");
const addSlideAfterBtn = document.getElementById("addSlideAfterBtn");
const addSlideBeforeBtn = document.getElementById("addSlideBeforeBtn");
const addSlideEndBtn = document.getElementById("addSlideEndBtn");
const duplicateSlideBtn = document.getElementById("duplicateSlideBtn");
const editorSaveBtn = document.getElementById("editorSaveBtn");
const editorResetBtn = document.getElementById("editorResetBtn");
const editorCancelBtn = document.getElementById("editorCancelBtn");
const slideResetModal = document.getElementById("slideResetModal");
const slideResetCard = document.getElementById("slideResetCard");
const slideResetBackBtn = document.getElementById("slideResetBackBtn");
const slideResetConfirmBtn = document.getElementById("slideResetConfirmBtn");
const slideResetStatus = document.getElementById("slideResetStatus");

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
const hymnTitleThemeGrid = document.getElementById("hymnTitleThemeGrid");
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
const scriptureTitleThemeGrid = document.getElementById("scriptureTitleThemeGrid");
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
const titleDesignCategoryGroup = document.getElementById(
  "titleDesignCategoryGroup"
);
const titleDesignGrid = document.getElementById("titleDesignGrid");
const titleDesignSelect = document.getElementById("titleDesign");
const titleChurchNameInput = document.getElementById("titleChurchName");
const titleKoInput = document.getElementById("titleKo");
const titleEnInput = document.getElementById("titleEn");
const titleShowDate = document.getElementById("titleShowDate");
const titleServiceDateInput = document.getElementById("titleServiceDate");
const titleSubtitleInput = document.getElementById("titleSubtitle");
const titleSeasonSuggestBtn = document.getElementById("titleSeasonSuggestBtn");
const customTitleSlideSettings = document.getElementById("customTitleSlideSettings");
const customTitleDesignCategories = document.getElementById("customTitleDesignCategories");
const customTitleDesignGrid = document.getElementById("customTitleDesignGrid");
const customTitleDesignSelect = document.getElementById("customTitleDesign");
const customTitleKoInput = document.getElementById("customTitleKo");
const customTitleEnInput = document.getElementById("customTitleEn");
const customTitleSubtitleInput = document.getElementById("customTitleSubtitle");
let customTitleDesignPicker = null;
const unsavedChangesModal = document.getElementById("unsavedChangesModal");
const unsavedChangesCard = document.getElementById("unsavedChangesCard");
const unsavedChangesMessage = document.getElementById("unsavedChangesMessage");
const unsavedSaveBtn = document.getElementById("unsavedSaveBtn");
const unsavedDiscardBtn = document.getElementById("unsavedDiscardBtn");
const unsavedCancelBtn = document.getElementById("unsavedCancelBtn");
const appToastRegion = document.getElementById("appToastRegion");
const customSlideEditorRoot = document.getElementById("customSlideEditor");
const slidePreviewArea = slidePreview ? slidePreview.closest(".preview-area") : null;

// State
let slides = [];
let mainSlides = [];
let templates = [];
// "slides" or "templates". activeTemplateId is only ever set while on the
// templates tab, so isTemplateMode() stays a simple truthiness check.
let pptTab = "slides";
let activeTemplateId = null;
let currentSlideId = null;
let slideBaselineSnapshot = null;
let slideRuntimeDraft = {};
// A confirmed reset is a replacement draft, not a mutation of the stored
// slide. Keeping it separate also lets Cancel restore the saved record.
let slideResetDraft = null;
let slideDirty = false;
// Canvas dirtiness for the custom slide the editor is currently attached to.
// The canvas tracks it against its own saved baseline, so it is kept beside
// the snapshot state rather than folded into it.
let customEditorDirty = false;
let slideSaving = false;
// Structure commands - reorder, add, delete, duplicate, rename - persist the
// moment they are given, so a request in flight counts as a save in flight:
// nothing may delete, reset or reorder again until it settles.
let structureSaving = false;
// Claimed for the whole duplicate request, including the preflight that runs
// before structureSaving is set. It is deliberately kept out of the shared
// busy state: isSaveBusy would make the preflight refuse its own guard.
let duplicateInProgress = false;
// Depth > 0 means a guarded transition is already running, so nested helpers
// must not raise a second unsaved-changes popup.
let guardedTransitionDepth = 0;
let selectedSlideIds = new Set();
let draggedSlideId = null;
let workspaceReflow = null;
let pptWorkspaceResizeFrame = null;
const PPT_WORKSPACE_UI_STORAGE_KEY = "samil-ppt-workspace-ui-v1";

function readPptWorkspacePreference() {
  try {
    return JSON.parse(localStorage.getItem(PPT_WORKSPACE_UI_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

let pptWorkspaceUi = createPptWorkspaceUiState(
  window.innerWidth,
  readPptWorkspacePreference()
);

function applyPptWorkspaceUi() {
  if (!pptWorkspace) {
    return;
  }

  pptWorkspace.dataset.layoutMode = pptWorkspaceUi.mode;
  pptWorkspace.dataset.focusMode = String(pptWorkspaceUi.focusMode);
  pptWorkspace.dataset.slidesOpen = String(pptWorkspaceUi.slidesOpen);
  pptWorkspace.dataset.inspectorOpen = String(pptWorkspaceUi.inspectorOpen);

  if (pptSlidesPaneBtn) {
    pptSlidesPaneBtn.setAttribute("aria-expanded", String(pptWorkspaceUi.slidesOpen));
    pptSlidesPaneBtn.textContent = pptWorkspaceUi.slidesOpen
      ? "슬라이드 닫기"
      : "슬라이드 열기";
  }
  if (pptInspectorPaneBtn) {
    pptInspectorPaneBtn.setAttribute(
      "aria-expanded",
      String(pptWorkspaceUi.inspectorOpen)
    );
    pptInspectorPaneBtn.textContent = pptWorkspaceUi.inspectorOpen
      ? "속성 닫기"
      : "속성 열기";
  }
  if (pptFocusModeBtn) {
    pptFocusModeBtn.hidden = pptWorkspaceUi.mode === "mobile";
    pptFocusModeBtn.setAttribute(
      "aria-pressed",
      String(pptWorkspaceUi.focusMode)
    );
    pptFocusModeBtn.textContent = pptWorkspaceUi.focusMode
      ? "집중 모드 종료"
      : "집중 모드";
  }

  if (slideListPanel) {
    slideListPanel.inert =
      pptWorkspaceUi.mode !== "mobile" && !pptWorkspaceUi.slidesOpen;
  }
  const inspectorInert =
    pptWorkspaceUi.mode !== "mobile" && !pptWorkspaceUi.inspectorOpen;
  const slideForm = document.getElementById("slideForm");
  const customInspector = document.getElementById("customSlideInspector");
  if (slideForm) {
    slideForm.inert = inspectorInert;
  }
  if (customInspector) {
    customInspector.inert = inspectorInert;
  }

  try {
    localStorage.setItem(
      PPT_WORKSPACE_UI_STORAGE_KEY,
      JSON.stringify({
        focusMode: pptWorkspaceUi.focusMode,
        slidesOpen: pptWorkspaceUi.slidesOpen,
        inspectorOpen: pptWorkspaceUi.inspectorOpen,
      })
    );
  } catch {
    // Private browsing can disable storage; layout controls still work.
  }
  workspaceReflow?.schedule({ force: true });
}

function dispatchPptWorkspaceUi(action) {
  pptWorkspaceUi = reducePptWorkspaceUi(pptWorkspaceUi, action);
  applyPptWorkspaceUi();
}

function closeCompactWorkspaceDrawers() {
  if (
    pptWorkspaceUi.mode !== "compact" ||
    (!pptWorkspaceUi.slidesOpen && !pptWorkspaceUi.inspectorOpen)
  ) {
    return false;
  }
  dispatchPptWorkspaceUi({ type: "close-drawers" });
  return true;
}

function syncWorkspaceLayoutState(viewName) {
  const currentView =
    viewName ??
    (navExtractor.classList.contains("active") ? "extractor" : "ppt");
  const state = applyWorkspaceLayoutState(
    appPage,
    resolveWorkspaceLayoutState({
      viewName: currentView,
      pptTab,
      activeTemplateId,
    })
  );
  workspaceReflow?.schedule({ force: true });
  return state;
}

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

// Every template write answers with the stored template, so the cache, the
// working slide list and the gallery are all rebuilt from that one response
// rather than patched locally. The server copy is the only truth.
function applyTemplateFromServer(nextTemplate) {
  const template = cloneTemplate(nextTemplate);
  templates = templates.map((entry) =>
    entry.id === template.id ? template : entry
  );
  if (activeTemplateId === template.id) {
    slides = template.slides.map((slide) => cloneSlide(slide));
  }
  return template;
}

// One shape for every template request, so each command below reads as a
// single call and surfaces the server's own reason when it fails.
async function requestTemplateWrite(templateId, route, { method, body } = {}) {
  const resp = await fetch(
    `/api/templates/${encodeURIComponent(templateId)}${route}`,
    {
      method,
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    }
  );

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(payload.error || "템플릿을 저장하지 못했습니다.");
  }
  return payload;
}

// Template level: membership. A slide that was never saved exists only in the
// browser, so it is dropped locally instead of being sent to the server.
async function removeTemplateSlideIds(ids) {
  const persistedIds = ids.filter((id) => {
    const slide = slides.find((entry) => entry.id === id);
    return slide && !isSlideUnsaved(slide);
  });

  if (persistedIds.length === 0) {
    slides = slides.filter((slide) => !ids.includes(slide.id));
    return;
  }

  structureSaving = true;
  refreshSaveState();
  try {
    const payload =
      persistedIds.length === 1
        ? await requestTemplateWrite(
            activeTemplateId,
            `/slides/${encodeURIComponent(persistedIds[0])}`,
            { method: "DELETE" }
          )
        : await requestTemplateWrite(activeTemplateId, "/slides/bulk-delete", {
            method: "POST",
            body: { ids: persistedIds },
          });
    applyTemplateFromServer(payload.template);
    showToast(
      persistedIds.length > 1
        ? `${persistedIds.length}개 슬라이드를 삭제했습니다`
        : "슬라이드를 삭제했습니다"
    );
  } finally {
    structureSaving = false;
    refreshSaveState();
  }
}

// Only the main slide list is mirrored here. A template's cached copy is
// replaced from server responses alone, so a local list that still holds a
// never-saved slide can never be written into it.
function syncWorkingSlidesToState() {
  if (isTemplateMode()) {
    return;
  }

  mainSlides = slides.map((slide) => cloneSlide(slide));
}

function collectCurrentSlideDraft() {
  const savedSlide = slides.find((slide) => slide.id === currentSlideId);
  if (!savedSlide) return null;

  const draftBase =
    slideResetDraft?.id === currentSlideId
      ? slideResetDraft.draft
      : savedSlide;
  const draft = { ...cloneSlide(draftBase), ...slideRuntimeDraft };
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
  } else if (draft.type === "custom") {
    // A custom slide has no form fields beyond its name: the artwork lives on
    // the canvas, which keeps its own baseline and is folded into the dirty
    // state by refreshSaveState(). The stored model is carried through
    // untouched so the projection never drops a saved slide's content.
    draft.sourceType = "basic";
  } else if (draft.type === "hymn") {
    draft.hymnNumber = hymnNumberInput.value;
    draft.includeTitle = hymnIncludeTitle.checked;
    draft.titleThemeId = getCoverThemePicker(hymnTitleThemeGrid);
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

function isCurrentSlideAtResetDefaults(draft) {
  if (!draft) return true;

  if (draft.type === "custom") {
    if (!customEditorModel) return false;
    return isSlideAtResetDefaults(draft, {
      customSlide: customEditorModel,
    });
  }
  return isSlideAtResetDefaults(draft);
}

function refreshSaveState() {
  const draft = collectCurrentSlideDraft();
  const recordDirty = Boolean(
    draft &&
      (slideBaselineSnapshot === null ||
        isSnapshotDirty(draft, slideBaselineSnapshot))
  );

  // The canvas keeps its own baseline, so an undo back to the saved artwork
  // reads as clean again while a pending rename or type switch still counts.
  slideDirty =
    draft?.type === "custom"
      ? resolveCustomDirtyState({
          slideSaved: slideBaselineSnapshot !== null,
          editorDirty: customEditorDirty,
          formDirty: recordDirty,
        })
      : recordDirty;

  const state = deriveSaveButtonState({
    hasSlide: Boolean(draft),
    slideDirty,
    slideSaving,
    structureSaving,
  });
  if (editorSaveBtn) {
    editorSaveBtn.disabled = state.slideDisabled;
    // Unsaved work is easy to miss on the canvas, where there is no form to
    // look at, so the button carries a dot as well as its enabled state.
    editorSaveBtn.classList.toggle("is-dirty", Boolean(slideDirty));
  }
  if (duplicateSlideBtn) {
    duplicateSlideBtn.disabled =
      !draft || duplicateInProgress || isSaveBusy(getSaveState());
  }
  if (editorCancelBtn) {
    editorCancelBtn.disabled = !slideDirty;
  }
  if (editorResetBtn) {
    editorResetBtn.disabled = !draft || isCurrentSlideAtResetDefaults(draft);
  }
}

function resetEditorSelection() {
  currentSlideId = null;
  slideBaselineSnapshot = null;
  slideRuntimeDraft = {};
  slideResetDraft = null;
  slideDirty = false;
  clearTransientSlideFileInputs();
  // Detach the canvas so a later stray change cannot touch the slide that was
  // just left; refreshSaveState() below recomputes the buttons.
  releaseCustomEditorSlide();
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

function getSaveState() {
  return { slideDirty, slideSaving, structureSaving };
}

// The one gate in front of every destructive or reordering action. A save in
// flight owns the drafts, the baselines and the files on the server, so these
// actions report why they were refused instead of racing it.
function blockedBySaveInProgress() {
  const message = getBusyBlockMessage(getSaveState());
  if (!message) {
    return false;
  }
  showToast(message);
  return true;
}

// Set by the save functions whenever they surface a failure reason, so the
// guard can add a generic fallback only for the paths that cannot name one.
let saveFailureReported = false;

function reportSaveFailure(message) {
  saveFailureReported = true;
  alert(message);
}

// Set while the dialog waits for a choice. Escape, the backdrop and the close
// button all resolve through it, so a stale click can never answer a newer
// question.
let unsavedDialogResolver = null;

// Both busy phases talk to the server on the user's behalf and neither can be
// abandoned without corrupting what it is doing - a half-applied save or a
// discard whose refetch is still in flight - so the cancel button is disabled
// rather than left focusable with nothing safe to do. The dialog itself
// carries aria-busy so assistive tech hears the wait.
function setUnsavedDialogBusy(busy, phase = "save") {
  const hadFocusInside =
    busy && unsavedChangesModal.contains(document.activeElement);
  unsavedSaveBtn.disabled = busy;
  unsavedDiscardBtn.disabled = busy;
  unsavedCancelBtn.disabled = busy;
  unsavedSaveBtn.textContent =
    busy && phase === "save" ? "저장 중..." : "저장 후 이동";
  unsavedDiscardBtn.textContent =
    busy && phase === "discard" ? "되돌리는 중..." : "저장하지 않고 이동";
  if (busy) {
    unsavedChangesModal.setAttribute("aria-busy", "true");
    // Disabling the buttons would drop focus out of the dialog, so the card
    // itself takes it for the duration of the uninterruptible phase.
    if (hadFocusInside && unsavedChangesCard) {
      unsavedChangesCard.focus();
    }
  } else {
    unsavedChangesModal.removeAttribute("aria-busy");
  }
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
function showUnsavedChangesDialog() {
  // A second request must never take over the resolver of a popup that is
  // already waiting for an answer.
  if (unsavedDialogResolver) {
    console.warn("Unsaved changes dialog is already awaiting a choice");
    return Promise.resolve("cancel");
  }

  unsavedChangesMessage.textContent = UNSAVED_CHANGES_MESSAGE;
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

// Restores the saved baseline: a never-saved slide disappears and an edited
// slide falls back to its stored model. Structure needs nothing here, because
// every structural command was already written when it was given.
async function discardPendingChanges() {
  const current = slides.find((slide) => slide.id === currentSlideId);
  const plan = planDiscard({
    slideDirty,
    slideUnsaved: isSlideUnsaved(current),
  });

  if (plan.dropSlide) {
    slides = slides.filter((slide) => slide.id !== currentSlideId);
    resetEditorSelection();
    syncWorkingSlidesToState();
    renderSlideList();
  } else if (plan.repopulateSlide && current) {
    slideRuntimeDraft = {};
    slideResetDraft = null;
    populateEditor(current);
    slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft());
    renderPreview(current);
    updateButtonsState(current);
  }

  refreshSaveState();
  // Only a verified-clean workspace may let the transition through.
  return isDiscardComplete(getSaveState());
}

// Guarantees the user sees why a save failed, without repeating a reason the
// save already reported.
async function saveDraftForGuard() {
  saveFailureReported = false;
  const saved = await saveCurrentSlide({ silent: true });

  if (!saved && !saveFailureReported) {
    alert("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return saved;
}

async function runTransition(transition) {
  guardedTransitionDepth += 1;
  try {
    await transition();
  } finally {
    guardedTransitionDepth -= 1;
  }
}

// True from the moment a guard opens until it settles, so a second guard
// cannot stack a popup or a save behind the one already in progress.
let unsavedGuardActive = false;

// Every internal navigation funnels through here so only one popup can ever
// be on screen, even when a guarded transition calls another guarded helper.
async function guardTransition(transition) {
  if (guardedTransitionDepth > 0) {
    await transition();
    return true;
  }

  if (unsavedGuardActive) {
    console.warn("Ignoring navigation while an unsaved-changes guard is open");
    showToast("저장 확인 창을 먼저 처리해 주세요.");
    return false;
  }

  unsavedGuardActive = true;
  // Held until the popup is closed: a toast raised behind an open modal is
  // never read out by the live region.
  let pendingGuardToast = null;
  try {
    return await runGuardedTransition({
      getState: getSaveState,
      showDialog: showUnsavedChangesDialog,
      save: saveDraftForGuard,
      discard: async () => {
        // The refetch it may run cannot be abandoned midway, so the dialog is
        // marked busy for the whole restore.
        setUnsavedDialogBusy(true, "discard");
        try {
          return await discardPendingChanges();
        } finally {
          setUnsavedDialogBusy(false);
        }
      },
      transition: async () => {
        // Close first so the destination is never rendered behind the popup.
        closeUnsavedChangesDialog();
        if (pendingGuardToast) {
          showToast(pendingGuardToast);
          pendingGuardToast = null;
        }
        await runTransition(transition);
      },
      setBusy: setUnsavedDialogBusy,
      onBlocked: () => showToast(getBusyBlockMessage(getSaveState())),
      onSaved: () => {
        pendingGuardToast = "변경사항을 저장했습니다";
      },
    });
  } finally {
    closeUnsavedChangesDialog();
    unsavedGuardActive = false;
  }
}

// Preflight for flows that jump into the PPT workspace on their own: settle
// pending work first, then apply the jump with the unguarded helpers.
function ensureNoPendingChanges() {
  return guardTransition(async () => {});
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
  syncWorkspaceLayoutState("ppt");
}

// By the time a transition body runs, the guard has already saved or
// discarded everything, so leaving only has to drop the template context.
function clearActiveWorkspace() {
  activeTemplateId = null;
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

    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      renderTemplateGallery();
      renderPptScreen();
      return;
    }

    pptTab = "templates";
    activeTemplateId = templateId;
    loadWorkspaceSlides(template.slides || []);
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

  const exportItem = document.createElement("button");
  exportItem.type = "button";
  exportItem.className = "bulk-dropdown-item";
  exportItem.textContent = "스키마 내보내기";
  exportItem.addEventListener("click", (event) => {
    event.stopPropagation();
    closeTemplateCardMenus();
    exportTemplateSchemaById(template.id);
  });

  menuDropdown.appendChild(renameItem);
  menuDropdown.appendChild(exportItem);
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

// Vite turns this into one lazily loadable chunk per family, so a machine that
// has the genuine Office fonts downloads none of them.
const pptxFontSheets = import.meta.glob('./pptx-fonts/*.css');
let missingDeckFontsPromise = null;

/**
 * Loads a substitute stylesheet for each Office font this machine lacks, and
 * leaves the rest alone so the genuine font renders untouched. Detection runs
 * once per session; installing a font mid-session is not worth tracking.
 */
function loadMissingDeckFonts() {
  if (!missingDeckFontsPromise) {
    missingDeckFontsPromise = (async () => {
      const [{ FONT_SUBSTITUTES }, availability] = await Promise.all([
        import('./pptx-fonts/manifest.js'),
        import('./pptx-font-availability.js'),
      ]);
      const { createCanvasMeasurer, planFontSubstitutes } = availability;
      const { available, missing } = planFontSubstitutes(
        FONT_SUBSTITUTES,
        createCanvasMeasurer()
      );
      previewFontPlan = { available, missing };

      await Promise.all(
        missing.map((entry) => {
          const load = pptxFontSheets[`./pptx-fonts/${entry.id}.css`];
          return load ? load() : null;
        })
      );
      // Substituted faces use font-display: block, so wait for them rather than
      // let the first paint measure a fallback and lay text out twice.
      if (missing.length && document.fonts?.ready) await document.fonts.ready;
    })();
  }
  return missingDeckFontsPromise;
}

// Exposed for the preview diagnostics script.
let previewFontPlan = null;
Object.defineProperty(window, '__pptxFontPlan', { get: () => previewFontPlan });

function cleanupPreviewResources() {
  const state = slidePreview.__pptxPreviewState;
  if (!state) return;

  if (state.viewer) state.viewer.destroy();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);

  slidePreview.__pptxPreviewState = null;
}

// --- Event Listeners for Hymn Type ---
function getCurrentTypeChangeSource() {
  return resolveCurrentSlideSource({
    currentSlideId,
    slides,
    resetDraft: slideResetDraft,
  });
}

slideTypeSelect.addEventListener('change', () => {
  const current = getCurrentTypeChangeSource();
  restoreCoverThemePickers(
    hymnTitleThemeGrid,
    scriptureTitleThemeGrid,
    current?.titleThemeId
  );
  if (slideTypeSelect.value === 'title') {
    prepareTitleSlideFields();
  }
  if (slideTypeSelect.value === 'custom-title') {
    maybeAutoNameCustomTitleSlide();
  }
  if (slideTypeSelect.value === 'scripture') {
    fillScriptureBookSelects(getCurrentTypeChangeSource() || {});
    if (scriptureIncludeTitle) scriptureIncludeTitle.checked = true;
    setScriptureTitleSlideType("말씀");
    syncScriptureTitleTypeUi();
    syncScriptureImageUI(current);
  }
  updateSettingsVisibility();
  if (slideTypeSelect.value === 'custom') {
    // Switching type is itself an unsaved change, so the canvas starts dirty.
    showCustomSlideInEditor(current, { markSaved: false });
  } else {
    releaseCustomEditorSlide();
  }
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
      current.titleThemeId = getCoverThemePicker(hymnTitleThemeGrid);
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
  setCoverThemeGridHidden(
    hymnTitleThemeGrid,
    !hymnIncludeTitle.checked
  );
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

const COVER_TITLE_THEME_IDS = [
  "original",
  "aurora",
  "monolith",
  "ivory",
  "marquee",
];

function normalizeCoverTitleThemeId(value) {
  return COVER_TITLE_THEME_IDS.includes(value) ? value : "original";
}

function setCoverThemePicker(grid, value) {
  if (!grid) return;
  const normalized = normalizeCoverTitleThemeId(value);
  grid.querySelectorAll("[data-title-theme]").forEach((card) => {
    const active = card.dataset.titleTheme === normalized;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-pressed", String(active));
  });
}

function restoreCoverThemePickers(hymnGrid, scriptureGrid, value) {
  setCoverThemePicker(hymnGrid, value);
  setCoverThemePicker(scriptureGrid, value);
}

function getCoverThemePicker(grid) {
  return (
    grid?.querySelector("[data-title-theme].is-active")?.dataset.titleTheme ||
    "original"
  );
}

function setCoverThemeGridHidden(grid, hidden) {
  if (!grid) return;
  grid.hidden = hidden;
}

function buildHymnTitlePreviewCacheKey(data) {
  if (data?.type !== "hymn") return "";
  return JSON.stringify({
    includeTitle: !!data.includeTitle,
    titleThemeId: normalizeCoverTitleThemeId(data.titleThemeId),
    hymnNumber: String(data.hymnNumber || ""),
    hymnKorTitle: (data.hymnKorTitle || "").trim(),
    hymnEngTitle: (data.hymnEngTitle || "").trim(),
  });
}

function isPreviewCacheHit(
  cachedSource,
  nextSource,
  cachedHymnTitle,
  nextHymnTitle
) {
  return (
    cachedSource === nextSource && cachedHymnTitle === nextHymnTitle
  );
}

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
  setCoverThemeGridHidden(
    scriptureTitleThemeGrid,
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
  setCoverThemePicker(scriptureTitleThemeGrid, slide.titleThemeId);
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
    titleThemeId: getCoverThemePicker(scriptureTitleThemeGrid),
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
    titleThemeId: slide.titleThemeId || "original",
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
    titleThemeId: slide.titleThemeId || "original",
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
  // Without the book list the selects are empty, so saving here would write
  // an empty or defaulted-wrong book into the stored slide.
  const booksBlocked = getBooksUnavailableMessage({ booksReady });
  if (booksBlocked) {
    reportSaveFailure(booksBlocked);
    return false;
  }

  const fields = collectScriptureSlideFields();
  if (!fields.koVersion && !fields.enVersion) {
    reportSaveFailure("번역을 하나 이상 선택하세요.");
    return false;
  }
  if (!fields.testament || !fields.book || !fields.chapter) {
    reportSaveFailure("구분, 책, 장을 입력하세요.");
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
    reportSaveFailure("성경 말씀 슬라이드 생성 실패: " + e.message);
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
  syncWorkspaceLayoutState(viewName);
}

navExtractor.addEventListener("click", () => switchView("extractor"));
navPpt.addEventListener("click", () => switchView("ppt"));
syncWorkspaceLayoutState("extractor");
pptSlidesPaneBtn?.addEventListener("click", () => {
  dispatchPptWorkspaceUi({ type: "toggle-slides" });
});
pptInspectorPaneBtn?.addEventListener("click", () => {
  dispatchPptWorkspaceUi({ type: "toggle-inspector" });
});
pptFocusModeBtn?.addEventListener("click", () => {
  dispatchPptWorkspaceUi({ type: "toggle-focus" });
});
slideEditor?.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest?.(
      ".editor-form, .custom-editor-side, .editor-actions, .custom-editor-context-toolbar"
    )
  ) {
    return;
  }
  closeCompactWorkspaceDrawers();
});
document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key !== "Escape" ||
      document.querySelector("dialog[open]") ||
      !closeCompactWorkspaceDrawers()
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  },
  true
);
window.addEventListener("resize", () => {
  if (pptWorkspaceResizeFrame !== null) {
    cancelAnimationFrame(pptWorkspaceResizeFrame);
  }
  pptWorkspaceResizeFrame = requestAnimationFrame(() => {
    pptWorkspaceResizeFrame = null;
    dispatchPptWorkspaceUi({ type: "resize", width: window.innerWidth });
  });
});
applyPptWorkspaceUi();
tabSlidesBtn.addEventListener("click", () => {
  closeBulkDropdown();
  setPptTab("slides");
});
tabTemplatesBtn.addEventListener("click", () => {
  closeBulkDropdown();
  setPptTab("templates");
});
templateGalleryGoSlidesBtn.addEventListener("click", () => setPptTab("slides"));
templateSchemaImportBtn?.addEventListener("click", () => {
  templateSchemaFileInput?.click();
});

templateSchemaFileInput?.addEventListener("change", async () => {
  const file = templateSchemaFileInput.files?.[0];
  templateSchemaFileInput.value = "";
  if (!file) {
    return;
  }
  await importTemplateSchemaFile(file);
});
templateBackBtn.addEventListener("click", () => {
  closeBulkDropdown();
  closeTemplateWorkspace();
});
templateNameDisplay.addEventListener("click", renameActiveTemplate);

// --- Storage (Server Side) ---

// `nextSlides` lets a caller persist a staged list before committing it to the
// in-memory records, so a failed request leaves those records untouched.
async function saveSlidesToServer(nextSlides = slides) {
  try {
    const resp = await fetch("/api/slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextSlides),
    });
    if (!resp.ok) {
      console.error("Failed to save slides");
      return false;
    }
    mainSlides = nextSlides.map((slide) => cloneSlide(slide));
    return true;
  } catch (e) {
    console.error("Network error saving slides", e);
    return false;
  }
}

async function persistCurrentWorkspace(nextSlides = slides) {
  return saveSlidesToServer(nextSlides);
}

// Reached only once the copy is actually in the list, so a clone that never
// landed is never selected or announced as a success.
function announceDuplicate(duplicate) {
  applySlideSelection(duplicate.id);
  showToast(`슬라이드를 복제했습니다: ${duplicate.name}`);
  return true;
}

// Pending changes are settled first and the clone itself runs outside the
// guard, so the list this request stages cannot be assigned over a mutation
// that a nested guarded transition let through while the server was answering.
async function duplicateCurrentSlide() {
  if (duplicateInProgress || !currentSlideId || blockedBySaveInProgress()) {
    return false;
  }

  // Claimed before the first await: structureSaving is only set once the
  // preflight is done, so without this two rapid clicks would both clear the
  // checks above and stage a list from the same starting point.
  duplicateInProgress = true;
  refreshSaveState();
  let restoreDuplicateLabel = () => {};

  try {
    if (!(await ensureNoPendingChanges())) {
      return false;
    }

    // The guard is a yield point, so a save may have started behind it.
    if (blockedBySaveInProgress()) {
      return false;
    }

    const sourceId = currentSlideId;
    const draft = collectCurrentSlideDraft();
    if (!sourceId || !draft) {
      return false;
    }

    if (
      draft.pendingFile ||
      draft.pendingBackgroundFile ||
      draft.pendingScriptureImage
    ) {
      alert("선택한 파일을 먼저 저장한 뒤 복제해 주세요.");
      return false;
    }

    structureSaving = true;
    refreshSaveState();
    restoreDuplicateLabel = showSaveButtonProgress(
      duplicateSlideBtn,
      "복제 중..."
    );

    // Template level: the copy needs its own files, so cloning and inserting
    // are one request. Splitting them would leave the cloned uploads behind
    // whenever the insert never landed.
    if (isTemplateMode()) {
      const payload = await requestTemplateWrite(
        activeTemplateId,
        `/slides/${encodeURIComponent(sourceId)}/duplicate`,
        { method: "POST" }
      );
      applyTemplateFromServer(payload.template);
      renderSlideList();
      return announceDuplicate(cloneSlide(payload.slide));
    }

    let duplicate;
    if (hasOwnedSlideAsset(draft)) {
      const response = await fetch("/api/slides/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: buildSerializableSlide(draft) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "슬라이드 복제에 실패했습니다.");
      }
      duplicate = cloneSlide(payload);
    } else {
      duplicate = cloneSlide(draft, { regenerateId: true });
    }

    duplicate.name = createDuplicateSlideName(
      draft.name,
      slides.map((slide) => slide.name)
    );
    const nextSlides = insertSlideAfter(slides, sourceId, duplicate);
    // The source is gone, so there is nothing to insert after: the clone is
    // dropped rather than appended somewhere the user did not ask for.
    if (nextSlides.length === slides.length) {
      return false;
    }

    if (isSlideUnsaved(draft)) {
      slides = nextSlides;
      syncWorkingSlidesToState();
    } else {
      const persisted = await persistCurrentWorkspace(nextSlides);
      if (!persisted) {
        throw new Error("슬라이드 복제본을 저장하지 못했습니다.");
      }
      slides = nextSlides;
    }

    return announceDuplicate(duplicate);
  } catch (error) {
    console.error("Failed to duplicate slide", error);
    alert(error.message || "슬라이드 복제 중 오류가 발생했습니다.");
    return false;
  } finally {
    restoreDuplicateLabel();
    structureSaving = false;
    duplicateInProgress = false;
    refreshSaveState();
  }
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

// Reports whether the cache now mirrors the server. A failed fetch leaves the
// existing cache alone so callers can abort instead of discarding onto an
// empty gallery.
async function loadTemplatesFromServer() {
  try {
    const resp = await fetch("/api/templates");
    if (!resp.ok) {
      console.error("Failed to load templates", resp.status);
      return false;
    }
    const payload = await resp.json();
    if (!Array.isArray(payload)) {
      console.error("Unexpected templates payload", payload);
      return false;
    }
    templates = payload.map(cloneTemplate);
    return true;
  } catch (e) {
    console.error("Failed to load templates", e);
    return false;
  }
}

async function loadPptDataFromServer() {
  await Promise.all([loadSlidesFromServer(), loadTemplatesFromServer()]);

  const activeTemplate = getActiveTemplate();
  if (activeTemplate) {
    loadWorkspaceSlides(activeTemplate.slides || []);
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
  updateAddSlideMenuState();
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

function openAddSlideDropdown() {
  if (!addSlideDropdown) return;
  addSlideDropdown.hidden = false;
  addSlideMenuBtn.setAttribute("aria-expanded", "true");
}

function closeAddSlideDropdown() {
  if (!addSlideDropdown) return;
  addSlideDropdown.hidden = true;
  addSlideMenuBtn.setAttribute("aria-expanded", "false");
}

// Relative placement needs a slide to anchor to; without one only the
// append-to-end entry means anything.
function updateAddSlideMenuState() {
  const hasAnchor = Boolean(currentSlideId);
  [addSlideAfterBtn, addSlideBeforeBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = !hasAnchor;
    btn.title = hasAnchor ? "" : "슬라이드를 먼저 선택하세요";
  });
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

// Main slide order is persisted immediately, so the reorder owns the request
// it starts: the new order is only authoritative once the server accepts it,
// and a failure puts the previous order back on screen.
async function moveSlideToIndex(slideId, targetIndex) {
  if (blockedBySaveInProgress()) {
    return false;
  }

  const plan = planReorder({
    ids: slides.map((slide) => slide.id),
    slideId,
    targetIndex,
  });
  if (!plan.changed) {
    return false;
  }

  const previousSlides = slides;
  const previousMainSlides = mainSlides;
  slides = applyReorder(slides, plan.fromIndex, plan.toIndex);
  renderSlideList();

  // Template level: the order, and nothing else. Reordering is a command, not
  // a draft, so it is written straight away and rolled back if refused.
  if (isTemplateMode()) {
    structureSaving = true;
    refreshSaveState();
    try {
      const payload = await requestTemplateWrite(
        activeTemplateId,
        "/slide-order",
        { method: "PUT", body: { slideIds: slides.map((slide) => slide.id) } }
      );
      applyTemplateFromServer(payload.template);
      renderSlideList();
      showToast("순서를 저장했습니다");
      return true;
    } catch (error) {
      console.error("Failed to reorder template slides", error);
      slides = previousSlides;
      renderSlideList();
      alert(REORDER_FAILURE_MESSAGE);
      return false;
    } finally {
      structureSaving = false;
      refreshSaveState();
    }
  }

  // mainSlides is only advanced by a successful POST, so nothing mirrors the
  // new order until the server has it.
  structureSaving = true;
  refreshSaveState();
  let persisted = false;
  try {
    persisted = await persistCurrentWorkspace();
  } finally {
    // Both outcomes leave the busy flag and the buttons converged here, so a
    // dirty draft gets its save button back either way.
    structureSaving = false;
    refreshSaveState();
  }

  if (persisted) {
    return true;
  }

  // The server never took the new order, so the authoritative one is the one
  // it still holds. The editor draft is untouched by order, so restoring the
  // list and its selection highlight is the whole rollback; the re-render
  // refreshes the buttons again.
  slides = previousSlides;
  mainSlides = previousMainSlides;
  renderSlideList();
  alert(REORDER_FAILURE_MESSAGE);
  return false;
}

async function moveSlideByOffset(slideId, offset) {
  const fromIndex = slides.findIndex((slide) => slide.id === slideId);
  if (fromIndex === -1) {
    return;
  }
  await moveSlideToIndex(slideId, fromIndex + offset);
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
  if (slide.type === "custom") {
    return "커스텀 편집";
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
// The position is applied inside the transition, not at click time: the guard
// can discard the slide being edited, so the anchor is only known once the
// popup has settled.
function createSlide(position = "after") {
  if (blockedBySaveInProgress()) {
    return Promise.resolve(false);
  }

  return guardTransition(async () => {
    appendNewSlide(position);
  });
}

function resolveInsertIndex(position) {
  if (position === "end" || !currentSlideId) {
    return slides.length;
  }
  const index = slides.findIndex((slide) => slide.id === currentSlideId);
  if (index < 0) {
    return slides.length;
  }
  return position === "before" ? index : index + 1;
}

function appendNewSlide(position = "end") {
  const newSlide = {
    id: generateClientId("slide"),
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
    titleKo: "주일예배",
    titleEn: "SUNDAY WORSHIP",
    dateMode: "custom",
    showDate: true,
    serviceDate: titleDateApi()?.todayIsoDate() || "",
    titleSubtitle: "",
    customTitleDesign: "aurora",
    customTitleKo: "",
    customTitleEn: "",
    customTitleSubtitle: "",
    customSlide: emptyCustomSlideModel(),
  };
  slides.splice(resolveInsertIndex(position), 0, newSlide);
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
  titleEl.style.cssText = 'text-align:center;font-family:"Malgun Gothic",sans-serif;font-size:1.6cqi;font-weight:bold;color:#fff;white-space:pre-line;line-height:1.3;padding:0 8px;';
  titleEl.textContent = buildHymnSubtitle({
    hymnNumber,
    hymnKorTitle: korTitle,
    hymnEngTitle: engTitle,
  });
  band.appendChild(titleEl);

  // container-type for cqi units
  wrap.style.containerType = 'inline-size';

  return wrap;
}

function buildThemedHymnTitleSlidePreview(
  titleThemeId,
  hymnNumber,
  korTitle,
  engTitle,
  previewWidth
) {
  const preview = buildCustomTitleSlidePreview(
    {
      customTitleDesign: normalizeCoverTitleThemeId(titleThemeId),
      customTitleKo: "찬송",
      customTitleEn: "HYMN",
      customTitleSubtitle: buildHymnSubtitle({
        hymnNumber,
        hymnKorTitle: korTitle,
        hymnEngTitle: engTitle,
      }),
    },
    previewWidth
  );
  preview.style.width = "100%";
  preview.style.height = "auto";
  preview.style.aspectRatio = "16 / 9";
  preview.style.marginBottom = "8px";
  preview.style.borderRadius = "4px";
  return preview;
}

function renderPreview(slideOverride) {
  if (!slidePreview) return;

  // The custom canvas is the live WYSIWYG preview; never clear or replace it.
  if ((slideOverride?.type ?? slideTypeSelect.value) === 'custom') {
    return;
  }

  let data = collectCurrentSlidePreviewDraft(slideOverride);

  if (!data) {
    const type = slideTypeSelect.value;
    if (type === 'hymn') {
      data = {
        ...((slides.find(s => s.id === currentSlideId) || {})),
        type: 'hymn',
        hymnNumber: hymnNumberInput.value,
        includeTitle: hymnIncludeTitle.checked,
        titleThemeId: getCoverThemePicker(hymnTitleThemeGrid),
        hymnKorTitle: hymnKorTitleInput.value.trim(),
        hymnEngTitle: hymnEngTitleInput.value.trim(),
      };
      data.sourceType = 'upload';
    } else if (type === 'scripture') {
      const current = getCurrentTypeChangeSource() || {};
      data = {
        ...current,
        type: 'scripture',
        name: slideNameInput.value,
        includeTitle: scriptureIncludeTitle.checked,
        titleThemeId: getCoverThemePicker(scriptureTitleThemeGrid),
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
  const hymnTitlePreviewKey = buildHymnTitlePreviewCacheKey(data);

  // Case 1: Legacy PPT URL Cache
  let potentialPptUrl = null;
  if (data.type === 'hymn' || (data.sourceType === 'upload' && (data.originalUrl || data.type === 'hymn'))) {
    potentialPptUrl = data.originalUrl;
    if (!potentialPptUrl && data.type === 'hymn' && data.hymnNumber) {
      potentialPptUrl = `https://www.rickc.online/uploads/1/0/9/7/109730685/nhymn${data.hymnNumber}.ppt`;
    }
  }
  if (
    potentialPptUrl &&
    isPreviewCacheHit(
      slidePreview.dataset.lastRenderedUrl,
      potentialPptUrl,
      slidePreview.dataset.lastRenderedHymnTitle,
      hymnTitlePreviewKey
    )
  ) {
    skipRender = true;
  }

  // Case 2: File object (Blob) Cache
  if (data.file) {
    const fileId = data.file.name + ':' + data.file.size + ':' + data.file.lastModified;
    if (
      isPreviewCacheHit(
        slidePreview.dataset.lastRenderedFile,
        fileId,
        slidePreview.dataset.lastRenderedHymnTitle,
        hymnTitlePreviewKey
      )
    ) {
      skipRender = true;
    }
  }

  // Case 3: Server File Path Cache
  // Only use this if not overridden by a new file upload. Title slides are
  // drawn from their own fields, so a leftover file path must not freeze them.
  const isTitleType = data.type === 'title' || data.type === 'custom-title';
  if (data.serverFilePath && !data.file && !isTitleType) {
    if (
      isPreviewCacheHit(
        slidePreview.dataset.lastRenderedPath,
        data.serverFilePath,
        slidePreview.dataset.lastRenderedHymnTitle,
        hymnTitlePreviewKey
      )
    ) {
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
  slidePreview.dataset.lastRenderedHymnTitle = hymnTitlePreviewKey;

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

    // Container for the deck viewer
    const pptxContainerId = "pptx-deck-" + Date.now();
    const pptxContainer = document.createElement('div');
    pptxContainer.id = pptxContainerId;
    pptxContainer.className = "pptx-deck";

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
    } else if (fileUrl) {
      ph.appendChild(pptxContainer);

      const previewState = {
        objectUrl: data.file && !data.file.name.toLowerCase().endsWith('.ppt') ? fileUrl : null,
        viewer: null
      };
      slidePreview.__pptxPreviewState = previewState;

      // Update Cache State
      if (data.file) {
        slidePreview.dataset.lastRenderedFile = data.file.name + ':' + data.file.size + ':' + data.file.lastModified;
      }
      if (data.serverFilePath) {
        slidePreview.dataset.lastRenderedPath = data.serverFilePath;
      }

      // Deferred so the placeholder is in the DOM first: the viewer measures the
      // container to fit slides, and a detached container measures as zero.
      setTimeout(async () => {
        if (slidePreview.__pptxPreviewState !== previewState) return;

        // The viewer fits slides to the container itself, so this zoom rides on
        // top of that fit scale rather than replacing it.
        let zoomPercent = 100;

        const controls = document.createElement('div');
        controls.className = 'zoom-controls';
        controls.innerHTML = `
          <button class="zoom-btn" id="zoom-out-${pptxContainerId}">-</button>
          <span class="zoom-display" id="zoom-val-${pptxContainerId}">100%</span>
          <button class="zoom-btn" id="zoom-in-${pptxContainerId}">+</button>
          <button class="zoom-btn" id="zoom-reset-${pptxContainerId}" title="Reset">⟲</button>
        `;
        slidePreview.appendChild(controls); // Fixed position, not inside scroll area

        const applyZoom = (next) => {
          zoomPercent = Math.min(300, Math.max(20, next));
          const display = document.getElementById('zoom-val-' + pptxContainerId);
          if (display) display.textContent = zoomPercent + '%';
          previewState.viewer?.setZoom(zoomPercent);
        };

        const btnIn = document.getElementById(`zoom-in-${pptxContainerId}`);
        const btnOut = document.getElementById(`zoom-out-${pptxContainerId}`);
        const btnReset = document.getElementById(`zoom-reset-${pptxContainerId}`);

        if (btnIn) btnIn.onclick = (e) => {
          e.stopPropagation();
          applyZoom(zoomPercent + 10);
        };
        if (btnOut) btnOut.onclick = (e) => {
          e.stopPropagation();
          applyZoom(zoomPercent - 10);
        };
        if (btnReset) btnReset.onclick = (e) => {
          e.stopPropagation();
          applyZoom(100);
        };

        try {
          // Substitutes must be registered before the deck lays out, and only
          // for fonts this machine is actually missing.
          await loadMissingDeckFonts();
          const { PptxViewer, RECOMMENDED_ZIP_LIMITS } = await import('@aiden0z/pptx-renderer');
          if (slidePreview.__pptxPreviewState !== previewState) return;

          // A locally picked file goes straight in as a Blob; only a server path
          // needs fetching.
          const source = data.file || (await fetch(fileUrl).then((resp) => resp.blob()));
          if (slidePreview.__pptxPreviewState !== previewState) return;

          const viewer = await PptxViewer.open(source, pptxContainer, {
            renderMode: 'list',
            fitMode: 'contain',
            // Uploads are untrusted, so the zip guards stay on.
            zipLimits: RECOMMENDED_ZIP_LIMITS,
            scrollContainer: slidePreview,
            lazySlides: true,
            lazyMedia: true,
            listOptions: { windowed: true, initialSlides: 4, batchSize: 4 }
          });

          // A newer preview may have replaced this one while the deck parsed.
          if (slidePreview.__pptxPreviewState !== previewState) {
            viewer.destroy();
            return;
          }
          previewState.viewer = viewer;
        } catch (e) {
          console.error("PPTX preview error:", e);
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
      const titleEl =
        normalizeCoverTitleThemeId(data.titleThemeId) === "original"
          ? buildHymnTitleSlidePreview(
              data.hymnNumber,
              data.hymnKorTitle,
              data.hymnEngTitle
            )
          : buildThemedHymnTitleSlidePreview(
              data.titleThemeId,
              data.hymnNumber,
              data.hymnKorTitle,
              data.hymnEngTitle,
              slidePreview.offsetWidth || 400
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
    slideEditor.style.display = "grid";
    slideRuntimeDraft = {};
    slideResetDraft = null;
    populateEditor(slide);
    slideBaselineSnapshot = isSlideUnsaved(slide)
      ? null
      : createSnapshot(collectCurrentSlideDraft());
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
    slideResetDraft = null;
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

// `reloadCustomCanvas` is only turned off right after a successful custom save,
// where the canvas already holds exactly what was committed and reloading it
// would needlessly drop the user's selection.
function populateEditor(
  slide,
  { reloadCustomCanvas = true, useExactDefaults = false } = {}
) {
  clearTransientSlideFileInputs();
  slide.titleThemeId = normalizeCoverTitleThemeId(slide.titleThemeId);
  slideNameInput.value = slide.name;
  slideTypeSelect.value = slide.type;

  hymnNumberInput.value = slide.hymnNumber || '';
  hymnIncludeTitle.checked = !!slide.includeTitle;
  if (hymnTitleFields) hymnTitleFields.hidden = !slide.includeTitle;
  restoreCoverThemePickers(
    hymnTitleThemeGrid,
    scriptureTitleThemeGrid,
    slide.titleThemeId
  );
  setCoverThemeGridHidden(hymnTitleThemeGrid, !hymnIncludeTitle.checked);
  hymnKorTitleInput.value = slide.hymnKorTitle || '';
  hymnEngTitleInput.value = slide.hymnEngTitle || '';

  updateSettingsVisibility(slide.sourceType);

  if (slide.type !== 'custom') {
    // Detach the canvas so a later stray change cannot touch this slide.
    releaseCustomEditorSlide();
  }

  if (slide.type === 'custom') {
    if (reloadCustomCanvas) {
      showCustomSlideInEditor(slide);
    }
  } else if (slide.type === 'scripture') {
    populateScriptureEditor(slide);
    if (useExactDefaults && !slide.testament) {
      ensureEmptySelectValue(scriptureTestamentSelect, "구분 선택");
    }
    if (useExactDefaults && !slide.book) {
      ensureEmptySelectValue(scriptureBookSelect, "책 선택");
    }
  } else if (slide.type === 'title') {
    initializeTitleDesignPicker(
      titleDesignCategoryGroup,
      titleDesignGrid,
      titleDesignSelect,
      slide.titleDesign
    );
    const textApi = titleTextApi();
    titleChurchNameInput.value =
      slide.churchName || (useExactDefaults ? "" : rememberedChurchName());
    titleKoInput.value =
      slide.titleKo == null ? textApi.defaultTitleKo() : slide.titleKo;
    titleEnInput.value =
      slide.titleEn == null
        ? textApi.defaultTitleEn(titleDesignSelect.value)
        : slide.titleEn;
    titleSubtitleInput.value = slide.titleSubtitle || '';
    const api = titleDateApi();
    const dateMode = api ? api.normalizeDateMode(slide.dateMode) : "custom";
    setSelectedDateMode(dateMode);
    titleShowDate.checked = slide.showDate !== false;
    // Pass the canonical slide record: automatic modes mutate serviceDate so
    // every export and serialization path reads the same refreshed value.
    titleServiceDateInput.value =
      dateMode === "custom" && useExactDefaults && !slide.serviceDate
        ? ""
        : api
          ? api.syncAutomaticServiceDate(slide, api.todayIsoDate())
          : slide.serviceDate || defaultServiceDate();
    updateTitleSeasonSuggestion();
  } else if (slide.type === 'custom-title') {
    restoreCustomTitleDesignEditor(customTitleDesignPicker, slide);
    customTitleKoInput.value = slide.customTitleKo || '';
    customTitleEnInput.value = slide.customTitleEn || '';
    customTitleSubtitleInput.value = slide.customTitleSubtitle || '';
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

const TITLE_CHURCH_STORAGE_KEY = "ppt.titleChurchName";

function titleDateApi() {
  return window.TitleSlideDate || null;
}

// main.jsx exposes the shared module before editor interaction and async slide
// hydration resume. Resolve it lazily inside helpers so calls happen after that
// module initialization even though app.js is a static dependency of main.jsx.
function titleTextApi() {
  return window.TitleSlideText;
}

function titleSlideCatalogApi() {
  return window.TitleSlideDesignCatalog;
}

function normalizeTitleDesign(value) {
  return titleTextApi().normalizeTitleDesign(value);
}

function resolveTitlePreviewKo(data) {
  const api = titleTextApi();
  return api.resolveTitleLine(data.titleKo, api.defaultTitleKo());
}

function resolveTitlePreviewEn(data, design) {
  const api = titleTextApi();
  return api.resolveTitleLine(data.titleEn, api.defaultTitleEn(design));
}

function titleKoFontSize(text, base, maxWidthInches) {
  return titleTextApi().worshipKoFontSize(text, base, maxWidthInches);
}

function titleEnFontSize(text, base, maxWidthInches) {
  return titleTextApi().worshipEnFontSize(text, base, maxWidthInches);
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
  return api ? api.todayIsoDate() : "";
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
    const selected = card.dataset.titleDesign === value;
    card.classList.toggle("is-active", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
}

function createTitleDesignCard(design, selectedId) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "theme-option-card";
  card.dataset.titleDesign = design.id;
  card.setAttribute("aria-label", `${design.name} 디자인`);
  const selected = design.id === selectedId;
  card.classList.toggle("is-active", selected);
  card.setAttribute("aria-pressed", String(selected));

  const preview = buildTitleSlidePreview(
    {
      titleDesign: design.id,
      titleKo: "주일예배",
      titleEn: null,
      churchName: "",
      titleSubtitle: "",
      showDate: false,
      serviceDate: "",
    },
    180
  );
  preview.classList.add("title-design-preview", "custom-title-card-preview");
  card.appendChild(preview);

  const copy = document.createElement("span");
  copy.className = "theme-option-copy";
  const name = document.createElement("strong");
  name.textContent = design.name;
  const description = document.createElement("small");
  description.textContent = design.description;
  copy.append(name, description);
  card.appendChild(copy);
  return card;
}

function renderTitleDesignCards(designGrid, designs, selectedId) {
  designGrid.replaceChildren(
    ...designs.map((design) => createTitleDesignCard(design, selectedId))
  );
}

function initializeTitleDesignPicker(
  categoryGroup,
  designGrid,
  designSelect,
  value
) {
  const api = titleSlideCatalogApi();
  if (!api || !categoryGroup || !designGrid || !designSelect) return "chapel";

  const hiddenThanksgiving = value === "thanksgiving";
  const selectedId = hiddenThanksgiving
    ? "thanksgiving"
    : api.normalizeTitleDesignId(value);
  const selectedCategory =
    (!hiddenThanksgiving && api.findTitleDesignCategory(selectedId)) ||
    api.findTitleDesignCategory(api.DEFAULT_TITLE_DESIGN_ID);

  categoryGroup.replaceChildren();
  for (const category of api.TITLE_SLIDE_DESIGN_CATEGORIES) {
    const designs = api.listTitleDesignsByCategory(category.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-title-category-button";
    button.dataset.titleDesignCategory = category.id;
    button.textContent = `${category.name} ${designs.length}`;
    button.setAttribute("aria-label", `${category.name} 디자인 보기`);
    const active = category.id === selectedCategory.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    categoryGroup.appendChild(button);
  }

  designSelect.replaceChildren();
  for (const design of api.TITLE_SLIDE_DESIGN_CATALOG) {
    const option = document.createElement("option");
    option.value = design.id;
    option.textContent = design.name;
    designSelect.appendChild(option);
  }
  if (hiddenThanksgiving) {
    const option = document.createElement("option");
    option.value = "thanksgiving";
    option.textContent = "추수 감사";
    designSelect.appendChild(option);
  }
  designSelect.value = selectedId;
  renderTitleDesignCards(
    designGrid,
    api.listTitleDesignsByCategory(selectedCategory.id),
    hiddenThanksgiving ? null : selectedId
  );
  return selectedId;
}

function filterTitleDesignCategory(
  categoryGroup,
  designGrid,
  designSelect,
  categoryId,
  render,
  refreshDirty
) {
  const api = titleSlideCatalogApi();
  if (!api) return;
  const designs = api.listTitleDesignsByCategory(categoryId);
  if (!designs.length) return;

  categoryGroup
    .querySelectorAll("[data-title-design-category]")
    .forEach((button) => {
      const active = button.dataset.titleDesignCategory === categoryId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

  const includesCurrent = designs.some(
    (design) => design.id === designSelect.value
  );
  if (!includesCurrent) {
    designSelect.value = designs[0].id;
  }
  renderTitleDesignCards(designGrid, designs, designSelect.value);
  if (!includesCurrent) {
    render();
    refreshDirty();
  }
}

function ensureEmptySelectValue(select, label) {
  if (!select) return;
  if (![...select.options].some((option) => option.value === "")) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = label;
    select.prepend(option);
  }
  select.value = "";
}

function selectedDateMode() {
  const api = titleDateApi();
  const checked = document.querySelector('input[name="titleDateMode"]:checked');
  return api ? api.normalizeDateMode(checked && checked.value) : "custom";
}

function setSelectedDateMode(mode) {
  const api = titleDateApi();
  const normalized = api ? api.normalizeDateMode(mode) : "custom";
  document.querySelectorAll('input[name="titleDateMode"]').forEach((radio) => {
    radio.checked = radio.value === normalized;
  });
}

function updateTitleSeasonSuggestion() {
  if (!titleSeasonSuggestBtn) return;

  const api = titleDateApi();
  const suggestion = api
    ? api.suggestSeasonLabel(titleServiceDateInput.value)
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
  const api = titleDateApi();
  const dateMode = selectedDateMode();
  const typed = titleServiceDateInput.value;
  const serviceDate = api
    ? api.resolveServiceDate(dateMode, typed, api.todayIsoDate())
    : typed;
  return {
    titleDesign: normalizeTitleDesign(titleDesignSelect.value),
    churchName: titleChurchNameInput.value.trim(),
    titleKo: titleKoInput.value,
    titleEn: titleEnInput.value,
    titleSubtitle: titleSubtitleInput.value.trim(),
    dateMode,
    showDate: titleShowDate.checked,
    serviceDate,
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
  if (content.ko) {
    stack.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SERIF};font-weight:700;font-size:${pt(titleKoFontSize(content.ko, 96))}px;line-height:1.1;` +
          `letter-spacing:${inch(0.1)}px;padding-left:${inch(0.1)}px;color:#FFFFFF;` +
          `margin-top:${inch(0.3)}px;`,
        content.ko
      )
    );
  }
  if (content.subtitle) {
    stack.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-weight:600;font-size:${pt(22)}px;color:#E8E2D4;` +
          `margin-top:${inch(0.2)}px;`,
        content.subtitle
      )
    );
  }
  if (content.en) {
    stack.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_LATIN};font-weight:700;font-size:${pt(16)}px;` +
          `letter-spacing:${pt(16) * 0.6}px;padding-left:${pt(16) * 0.6}px;color:${gold};` +
          `margin-top:${inch(0.28)}px;`,
        content.en
      )
    );
  }
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
  if (content.ko) {
    middle.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SANS};font-weight:800;font-size:${pt(titleKoFontSize(content.ko, 112))}px;line-height:1;color:${ink};`,
        content.ko
      )
    );
  }
  if (content.en) {
    const rule = titlePreviewNode(
      `width:${inch(4.4)}px;height:${Math.max(1, inch(0.009))}px;background:${hair};` +
        `margin-top:${inch(0.36)}px;`
    );
    middle.appendChild(rule);
    middle.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_LATIN};font-weight:700;font-size:${pt(14)}px;` +
          `letter-spacing:${pt(14) * 0.55}px;color:${muted};margin-top:${inch(0.2)}px;`,
        content.en
      )
    );
  }
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

  if (content.ko === "주일예배") {
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
  } else if (content.ko) {
    upper.appendChild(
      titlePreviewNode(
        `font-family:${TITLE_SERIF};font-weight:700;font-size:${pt(titleKoFontSize(content.ko, 88))}px;` +
          `line-height:1.05;color:#FFFFFF;text-align:center;`,
        content.ko
      )
    );
  }

  if (content.en) {
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
        content.en
      )
    );
  }
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

function titlePreviewShape(cssText, kind) {
  const shape = titlePreviewNode(cssText);
  shape.className =
    kind === "rule" ? "title-preview-rule" : "title-preview-motif";
  return shape;
}

function titlePreviewMotif(cssText) {
  return titlePreviewShape(cssText, "motif");
}

function titlePreviewRule(cssText) {
  return titlePreviewShape(cssText, "rule");
}

function buildEasterDawnPreview(container, content, unit) {
  const { inch, pt } = unit;
  container.style.background = "linear-gradient(145deg,#FFFBF2,#F3DCBD)";
  container.appendChild(
    titlePreviewMotif(
      `position:absolute;left:${inch(5.55)}px;top:${inch(-0.35)}px;width:${inch(2.2)}px;` +
        `height:${inch(2.2)}px;border-radius:50%;background:#FFF0CD;` +
        `box-shadow:0 0 ${inch(1.1)}px rgba(214,164,74,.28);`
    )
  );
  [-52, -34, -17, 0, 17, 34, 52].forEach((angle, index) => {
    container.appendChild(
      titlePreviewMotif(
        `position:absolute;left:${inch(6.62)}px;top:${inch(1.18)}px;width:${inch(0.05)}px;` +
          `height:${inch(0.92 - Math.abs(index - 3) * 0.07)}px;background:rgba(214,164,74,.28);` +
          `transform-origin:50% ${inch(-0.35)}px;transform:rotate(${angle}deg);`
      )
    );
  });
  if (content.church) {
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(0.58)}px;left:0;width:100%;text-align:center;` +
        `font-family:${TITLE_SANS};font-weight:700;font-size:${pt(18)}px;color:#9A7B45;`,
      content.church
    ));
  }
  if (content.ko) {
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(1.15)}px;left:0;width:100%;text-align:center;` +
        `font-family:${TITLE_SERIF};font-weight:700;font-size:${pt(titleKoFontSize(content.ko, 72))}px;color:#4A3617;`,
      content.ko
    ));
  }
  container.appendChild(titlePreviewRule(
    `position:absolute;top:${inch(2.75)}px;left:${inch(4.66)}px;width:${inch(4)}px;height:1px;background:#B48C4A;`
  ));
  if (content.en) {
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(2.9)}px;left:0;width:100%;text-align:center;` +
        `font-family:${TITLE_LATIN};font-weight:700;font-size:${pt(titleEnFontSize(content.en, 16))}px;` +
        `letter-spacing:${pt(16) * 0.34}px;color:#9A7B45;`,
      content.en
    ));
  }
  if (content.subtitle) {
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(3.42)}px;left:0;width:100%;text-align:center;` +
        `font-family:${TITLE_SANS};font-size:${pt(18)}px;color:#6A522B;`,
      content.subtitle
    ));
  }
  container.appendChild(titlePreviewRule(
    `position:absolute;top:${inch(6.05)}px;left:${inch(1.1)}px;width:${inch(11.1)}px;height:1px;background:#B48C4A;`
  ));
  if (content.koDate) {
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(6.35)}px;left:0;width:100%;text-align:center;` +
        `font-family:${TITLE_SANS};font-size:${pt(19)}px;color:#6A522B;`,
      content.koDate
    ));
  }
}

function buildEasterStainedPreview(container, content, unit) {
  const { inch, pt } = unit;
  container.style.background =
    "radial-gradient(circle at 50% 44%,rgba(138,92,199,.35),transparent 58%),linear-gradient(145deg,#0B1A33,#322055)";
  [0, 0.42].forEach((inset) => {
    container.appendChild(
      titlePreviewMotif(
        `position:absolute;left:${inch(3.55 + inset)}px;top:${inch(0.45 + inset)}px;` +
          `width:${inch(6.23 - inset * 2)}px;height:${inch(6.15 - inset * 2)}px;` +
          `border:${Math.max(1, inch(0.015))}px solid rgba(242,193,91,.5);border-radius:${inch(2.8)}px ${inch(2.8)}px ${inch(0.2)}px ${inch(0.2)}px;`
      )
    );
  });
  const centered = (text, top, size, color, font = TITLE_SANS) => {
    if (!text) return;
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(top)}px;left:${inch(4.2)}px;width:${inch(4.93)}px;text-align:center;` +
        `font-family:${font};font-weight:700;font-size:${pt(size)}px;color:${color};`,
      text
    ));
  };
  centered(content.subtitle, 1.72, 17, "#F2C15B");
  centered(content.ko, 2.35, titleKoFontSize(content.ko, 64, 4.93), "#FFFFFF", TITLE_SERIF);
  centered(content.en, 3.95, titleEnFontSize(content.en, 17, 4.93), "#E4D4FF", TITLE_LATIN);
  centered(content.koDate, 4.55, 18, "#E9DFC8");
  centered(content.church, 6.55, 17, "#C9B8F0");
}

function buildChristmasBurgundyPreview(container, content, unit) {
  const { inch, pt } = unit;
  container.style.background = "#2A0F16";
  container.appendChild(titlePreviewRule(
    `position:absolute;inset:0 auto 0 0;width:${inch(0.12)}px;background:#D9B376;`
  ));
  container.appendChild(titlePreviewMotif(
    `position:absolute;left:${inch(8.7)}px;top:${inch(1.85)}px;width:${inch(3.4)}px;height:${inch(3.4)}px;` +
      `background:rgba(217,179,118,.22);clip-path:polygon(50% 0,61% 37%,100% 50%,61% 63%,50% 100%,39% 63%,0 50%,39% 37%);`
  ));
  const left = (text, top, size, color, font = TITLE_SANS) => {
    if (!text) return;
    container.appendChild(titlePreviewNode(
      `position:absolute;left:${inch(1.15)}px;top:${inch(top)}px;width:${inch(6.75)}px;` +
        `font-family:${font};font-weight:700;font-size:${pt(size)}px;color:${color};`,
      text
    ));
  };
  left(content.church, 1.18, 18, "#D9B376");
  left(content.ko, 2, titleKoFontSize(content.ko, 68), "#F7EBDA", TITLE_SERIF);
  container.appendChild(titlePreviewRule(
    `position:absolute;left:${inch(1.15)}px;top:${inch(3.55)}px;width:${inch(3.2)}px;height:1px;background:#D9B376;`
  ));
  left(content.en, 3.74, titleEnFontSize(content.en, 17), "#D9B376", TITLE_LATIN);
  left(content.subtitle, 4.3, 18, "#E4D8C8");
  left(content.koDate, 5.55, 19, "#E4D8C8");
}

function buildChristmasEvergreenPreview(container, content, unit) {
  const { inch, pt } = unit;
  container.style.background = "linear-gradient(145deg,#07140C,#12301C)";
  [[1, .65, .22], [10.75, .82, .3], [11.8, 1.48, .18]].forEach(([x, y, size]) => {
    container.appendChild(titlePreviewMotif(
      `position:absolute;left:${inch(x)}px;top:${inch(y)}px;width:${inch(size)}px;height:${inch(size)}px;` +
        `background:#D9B376;clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%);`
    ));
  });
  [[-0.25, 5.75, 3.15, 2.15], [2.25, 6.05, 2.55, 1.7], [4.65, 5.65, 3.55, 2.25], [7.65, 5.95, 2.85, 1.9], [10.15, 5.6, 3.45, 2.3]].forEach(([x, y, w, h], index) => {
    container.appendChild(titlePreviewMotif(
      `position:absolute;left:${inch(x)}px;top:${inch(y)}px;width:${inch(w)}px;height:${inch(h)}px;` +
        `background:${index % 2 ? "#0A2012" : "#07180D"};clip-path:polygon(50% 0,100% 100%,0 100%);`
    ));
  });
  const centered = (text, top, size, color, font = TITLE_SANS) => {
    if (!text) return;
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(top)}px;left:0;width:100%;text-align:center;font-family:${font};` +
        `font-weight:700;font-size:${pt(size)}px;color:${color};`,
      text
    ));
  };
  centered(content.church, 1.4, 18, "#D9B376");
  centered(content.ko, 2, titleKoFontSize(content.ko, 64), "#F7EBDA", TITLE_SERIF);
  centered(content.en, 3.45, titleEnFontSize(content.en, 17), "#D9B376", TITLE_LATIN);
  centered(content.subtitle, 4.02, 18, "#CFD8CD");
  centered(content.koDate, 5.55, 18, "#CFD8CD");
}

function buildThanksgivingPreview(container, content, unit) {
  const { inch, pt } = unit;
  container.style.background = "linear-gradient(145deg,#3A2410,#1B1108)";
  [2.08, 11.253].forEach((x, side) => {
    container.appendChild(titlePreviewMotif(
      `position:absolute;left:${inch(x)}px;top:${inch(1.35)}px;width:1px;height:${inch(4.8)}px;background:#C99B54;`
    ));
    for (let index = 0; index < 4; index += 1) {
      container.appendChild(titlePreviewMotif(
        `position:absolute;left:${inch(x + (side ? 0.06 : -0.4))}px;top:${inch(2 + index * .78)}px;` +
          `width:${inch(.34)}px;height:${inch(.58)}px;border-radius:70% 20% 70% 20%;` +
          `background:#C99B54;transform:rotate(${side ? -52 : 52}deg);`
      ));
    }
  });
  const centered = (text, top, size, color, font = TITLE_SANS) => {
    if (!text) return;
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(top)}px;left:${inch(2.6)}px;width:${inch(8.13)}px;text-align:center;` +
        `font-family:${font};font-weight:700;font-size:${pt(size)}px;color:${color};`,
      text
    ));
  };
  centered(content.church, 1.2, 18, "#C99B54");
  centered(content.ko, 2.05, titleKoFontSize(content.ko, 64), "#FFF1D6", TITLE_SERIF);
  centered(content.en, 3.52, titleEnFontSize(content.en, 17), "#E6BD75", TITLE_LATIN);
  centered(content.subtitle, 4.08, 18, "#E8D8BD");
  centered(content.koDate, 5.42, 18, "#E8D8BD");
}

function buildAdventPreview(container, content, unit) {
  const { inch, pt } = unit;
  container.style.background =
    "radial-gradient(circle at 50% 18%,rgba(228,188,115,.28),transparent 38%),linear-gradient(145deg,#1A2140,#0A0E1A)";
  container.appendChild(titlePreviewMotif(
    `position:absolute;left:${inch(6.24)}px;top:${inch(.34)}px;width:${inch(.85)}px;height:${inch(1.12)}px;` +
      `background:#F2C15B;border-radius:65% 35% 60% 40%;transform:rotate(45deg);`
  ));
  container.appendChild(titlePreviewMotif(
    `position:absolute;left:${inch(6.37)}px;top:${inch(1.34)}px;width:${inch(.59)}px;height:${inch(1.52)}px;` +
      `background:#E9E4D8;border-radius:${inch(.04)}px;`
  ));
  const centered = (text, top, size, color, font = TITLE_SANS) => {
    if (!text) return;
    container.appendChild(titlePreviewNode(
      `position:absolute;top:${inch(top)}px;left:0;width:100%;text-align:center;font-family:${font};` +
        `font-weight:700;font-size:${pt(size)}px;color:${color};`,
      text
    ));
  };
  centered(content.ko, 3.2, titleKoFontSize(content.ko, 64), "#F5F0E7", TITLE_SERIF);
  centered(content.en, 4.48, titleEnFontSize(content.en, 17), "#A7B8E8", TITLE_LATIN);
  centered(content.subtitle, 4.98, 17, "#D7DCEE");
  centered(content.koDate, 5.48, 18, "#D7DCEE");
  centered(content.church, 6.35, 17, "#D7DCEE");
  for (let index = 0; index < 4; index += 1) {
    container.appendChild(titlePreviewMotif(
      `position:absolute;left:${inch(5.7 + .45 * index)}px;top:${inch(6.85)}px;width:${inch(.16)}px;` +
        `height:${inch(.16)}px;border-radius:50%;background:rgba(167,184,232,${index ? .4 : 1});`
    ));
  }
}

function buildCatalogFamilyDecoration(container, unit, design, layout) {
  const { inch } = unit;
  const { theme, layoutFamily: family } = design;
  const color = (hex) => `#${hex}`;
  const addRule = (css) => container.appendChild(titlePreviewRule(css));
  const {
    ARCH,
    BANNER,
    COLUMN,
    CORNER,
    EDITORIAL_INDEX,
    FRAME,
    GALLERY_RAIL,
    HORIZON_Y,
    PORTAL,
    SIDE_BAND,
    VEIL_PANEL,
  } = layout;

  if (family === "double-frame") {
    addRule(
      `position:absolute;inset:${inch(FRAME.outer)}px;border:1px solid ${color(theme.rule)};`
    );
    addRule(
      `position:absolute;inset:${inch(FRAME.inner)}px;border:1px solid ${color(theme.rule)};opacity:.6;`
    );
  } else if (family === "side-band") {
    addRule(
      `position:absolute;left:0;top:0;width:${inch(SIDE_BAND.w)}px;height:100%;background:${color(theme.accent)};`
    );
  } else if (family === "horizon-split") {
    addRule(
      `position:absolute;left:0;right:0;top:${inch(HORIZON_Y)}px;bottom:0;background:${color(theme.backgroundAccent)};opacity:.82;border-top:1px solid ${color(theme.rule)};`
    );
  } else if (family === "veil-panel") {
    addRule(
      `position:absolute;left:${inch(VEIL_PANEL.x)}px;top:0;width:${inch(VEIL_PANEL.w)}px;height:100%;` +
        `background:${color(theme.background)};opacity:.72;`
    );
  } else if (family === "corner-mark") {
    [
      ["left", "top"],
      ["right", "top"],
      ["left", "bottom"],
      ["right", "bottom"],
    ].forEach(([horizontal, vertical]) =>
      addRule(
        `position:absolute;${horizontal}:${inch(CORNER.inset)}px;${vertical}:${inch(CORNER.inset)}px;` +
          `width:${inch(CORNER.arm)}px;height:${inch(CORNER.drop)}px;` +
          `border-${horizontal}:1px solid ${color(theme.rule)};border-${vertical}:1px solid ${color(theme.rule)};`
      )
    );
  } else if (family === "banner-block") {
    addRule(
      `position:absolute;left:${inch(BANNER.x)}px;top:${inch(BANNER.y)}px;width:${inch(BANNER.w)}px;height:${inch(BANNER.h)}px;` +
        `background:${color(theme.backgroundAccent)};opacity:.8;border:1px solid ${color(theme.rule)};`
    );
  } else if (family === "column-split") {
    addRule(
      `position:absolute;left:0;top:0;width:${inch(COLUMN.w)}px;height:100%;` +
        `background:${color(theme.backgroundAccent)};opacity:.88;border-right:1px solid ${color(theme.rule)};`
    );
  } else if (family === "arch-window") {
    [0, ARCH.inset].forEach((inset, index) =>
      addRule(
        `position:absolute;left:${inch(ARCH.x + inset)}px;top:${inch(ARCH.y + inset)}px;` +
          `width:${inch(ARCH.w - inset * 2)}px;height:${inch(ARCH.h - inset * 2)}px;` +
          `border:1px solid ${color(theme.rule)};border-radius:${inch(2.9)}px ${inch(2.9)}px 0 0;` +
          `opacity:${index === 0 ? 0.82 : 0.55};`
      )
    );
  } else if (family === "gallery-rail") {
    addRule(
      `position:absolute;left:${inch(GALLERY_RAIL.x)}px;top:${inch(GALLERY_RAIL.y)}px;` +
        `width:${inch(GALLERY_RAIL.w)}px;height:1px;background:${color(theme.rule)};`
    );
    addRule(
      `position:absolute;left:${inch(GALLERY_RAIL.x + GALLERY_RAIL.w - GALLERY_RAIL.dot / 2)}px;` +
        `top:${inch(GALLERY_RAIL.y - GALLERY_RAIL.dot / 2)}px;width:${inch(GALLERY_RAIL.dot)}px;` +
        `height:${inch(GALLERY_RAIL.dot)}px;border-radius:50%;background:${color(theme.accent)};`
    );
  } else if (family === "portal-offset") {
    addRule(
      `position:absolute;left:${inch(PORTAL.left.x)}px;top:${inch(PORTAL.left.y)}px;` +
        `width:${inch(PORTAL.left.w)}px;height:${inch(PORTAL.left.h)}px;` +
        `background:${color(theme.backgroundAccent)};opacity:.66;`
    );
    addRule(
      `position:absolute;left:${inch(PORTAL.right.x)}px;top:${inch(PORTAL.right.y)}px;` +
        `width:${inch(PORTAL.right.w)}px;height:${inch(PORTAL.right.h)}px;` +
        `background:${color(theme.accent)};opacity:.28;`
    );
  } else if (family === "editorial-index") {
    addRule(
      `position:absolute;left:0;top:0;width:${inch(EDITORIAL_INDEX.w)}px;height:100%;` +
        `background:${color(theme.backgroundAccent)};opacity:.94;`
    );
    addRule(
      `position:absolute;left:${inch(EDITORIAL_INDEX.dividerX)}px;top:${inch(EDITORIAL_INDEX.dividerY)}px;` +
        `width:1px;height:${inch(EDITORIAL_INDEX.dividerH)}px;background:${color(theme.rule)};`
    );
  }
}

function buildCatalogFamilyMotif(container, unit, design) {
  const { inch } = unit;
  const color = `#${design.theme.accent}`;
  if (design.id === "lent-veil") {
    container.appendChild(
      titlePreviewMotif(
        `position:absolute;left:${inch(1.18)}px;top:${inch(1.6)}px;width:${inch(0.22)}px;height:${inch(4.3)}px;border-radius:${inch(0.08)}px;background:${color};`
      )
    );
  } else if (design.id === "palm-procession") {
    container.appendChild(
      titlePreviewMotif(
        `position:absolute;left:${inch(11.45)}px;top:${inch(0.62)}px;width:${inch(1.1)}px;height:${inch(1.1)}px;background:${color};opacity:.8;clip-path:polygon(0 0,100% 50%,0 100%,28% 50%);transform:rotate(28deg);`
      )
    );
  } else if (design.id === "new-year-blessing") {
    container.appendChild(
      titlePreviewMotif(
        `position:absolute;left:${inch(6.45)}px;top:${inch(0.42)}px;width:${inch(0.42)}px;height:${inch(0.42)}px;background:${color};transform:rotate(45deg);`
      )
    );
  }
}

function buildCatalogFamilyPreview(container, content, unit, design) {
  const layout = window.TitleSlideLayout;
  const { inch, pt } = unit;
  const { theme, layoutFamily: family } = design;
  const color = (hex) => `#${hex}`;
  // Matches the veil the PPTX renderer lays over a photo: the theme background
  // at 62% for dark designs, 48% for light ones.
  const veil = `${color(theme.background)}${theme.mood === "dark" ? "9E" : "7A"}`;
  container.style.background = design.asset
    ? `linear-gradient(${veil},${veil}),url("/${design.asset.path}") center/cover`
    : `linear-gradient(145deg,${color(theme.background)},${color(theme.backgroundAccent)})`;
  if (!layout) return;

  const box = layout.titleSlideComposition(family);
  if (!box) return;

  buildCatalogFamilyDecoration(container, unit, design, layout);
  buildCatalogFamilyMotif(container, unit, design);

  const tracking = layout.titleSlideTracking(family);
  const addRule = (css) => container.appendChild(titlePreviewRule(css));
  const text = (value, block, options) => {
    if (!value) return;
    const {
      x = box.x,
      w = box.w,
      align = box.align,
      size,
      font,
      color: ink,
      spacing = 0,
    } = options;
    container.appendChild(
      titlePreviewNode(
        `position:absolute;left:${inch(x)}px;top:${inch(block.y)}px;width:${inch(w)}px;text-align:${align};` +
          `font-family:${font || TITLE_SANS};font-weight:700;font-size:${pt(size)}px;color:${ink};` +
          `letter-spacing:${pt(spacing)}px;`,
        value
      )
    );
  };
  const church = (block, options) =>
    text(content.church, block, {
      size: 17,
      color: color(theme.muted),
      spacing: tracking.church,
      ...options,
    });
  const date = (block, options) =>
    text(content.koDate, block, {
      size: 15,
      color: color(theme.muted),
      spacing: tracking.date,
      ...options,
    });

  const koSize = titleKoFontSize(content.ko, 72, box.w);
  const dividerWidth = box.align === "left" ? 1.6 : 2.7;
  const dividerX =
    box.align === "left" ? box.x : box.x + (box.w - dividerWidth) / 2;
  const center = box.x + box.w / 2;
  const mark = layout.titleSlideMark(family);

  const draw = {
    "bracket-top": (block) =>
      addRule(
        `position:absolute;left:${inch(box.x)}px;top:${inch(block.y)}px;width:${inch(box.w)}px;height:1px;background:${color(theme.rule)};`
      ),
    "bracket-bottom": (block) => draw["bracket-top"](block),
    church,
    mark: (block) => {
      if (family === "centered-rule") {
        addRule(
          `position:absolute;left:${inch(center - mark.w / 2)}px;top:${inch(block.y)}px;width:${inch(mark.w)}px;height:1px;background:${color(theme.rule)};`
        );
        return;
      }
      container.appendChild(
        titlePreviewRule(
          `position:absolute;left:${inch(center - block.h / 2)}px;top:${inch(block.y)}px;width:${inch(block.h)}px;height:${inch(block.h)}px;background:${color(theme.accent)};transform:rotate(45deg);`
        )
      );
      [-mark.gemGap - mark.w, mark.gemGap].forEach((offset) =>
        addRule(
          `position:absolute;left:${inch(center + offset)}px;top:${inch(block.y + block.h / 2)}px;width:${inch(mark.w)}px;height:1px;background:${color(theme.rule)};`
        )
      );
    },
    ko: (block) =>
      text(content.ko, block, {
        size: koSize,
        color: color(theme.title),
        font: theme.titleFont === "serif" ? TITLE_SERIF : TITLE_SANS,
        spacing: tracking.ko,
      }),
    subtitle: (block) =>
      text(content.subtitle, block, { size: 20, color: color(theme.muted) }),
    "en-divider": (block) =>
      addRule(
        `position:absolute;left:${inch(dividerX)}px;top:${inch(block.y)}px;width:${inch(dividerWidth)}px;height:1px;background:${color(theme.rule)};`
      ),
    en: (block) =>
      text(content.en, block, {
        size: titleEnFontSize(content.en, 16, box.w),
        color: color(theme.accent),
        font: TITLE_LATIN,
        spacing: tracking.en,
      }),
    date,
  };

  const stack = layout.titleSlideStack(family, content, koSize);
  stack.forEach((block) => draw[block.kind](block));

  if (
    ["band", "banner", "edges", "rail", "portal", "index"].includes(box.zone)
  ) {
    layout.titleSlideZoneStack(family, content).forEach((block) => {
      const slot = {
        x: block.x ?? box.x,
        w: block.w ?? box.w,
        align: block.align ?? "center",
        ...(block.fontSize ? { size: block.fontSize } : {}),
      };
      if (block.kind === "church") church(block, slot);
      else date(block, slot);
    });
  } else if (box.zone === "footer") {
    const half = box.w / 2;
    if (content.church || content.koDate) {
      addRule(
        `position:absolute;left:${inch(box.x)}px;top:${inch(layout.FOOTER.ruleY)}px;width:${inch(box.w)}px;height:1px;background:${color(theme.rule)};`
      );
    }
    church({ y: layout.FOOTER.textY }, { w: half, align: "left" });
    date({ y: layout.FOOTER.textY }, {
      x: box.x + half,
      w: half,
      align: "right",
    });
  } else if (box.zone === "column") {
    const column = {
      x: layout.COLUMN.pad,
      w: layout.COLUMN.w - layout.COLUMN.pad * 2,
      align: "left",
    };
    church({ y: 1.2 }, column);
    if (content.church) {
      addRule(
        `position:absolute;left:${inch(column.x)}px;top:${inch(1.72)}px;width:${inch(layout.COLUMN.markWidth)}px;height:1px;background:${color(theme.rule)};`
      );
    }
    date({ y: 5.9 }, column);
  }
}

function buildTitleSlidePreview(data, previewWidth) {
  const width = previewWidth || 400;
  const perInch = width / 13.333;
  const unit = {
    inch: (value) => value * perInch,
    pt: (value) => (value / 72) * perInch,
  };
  const design = normalizeTitleDesign(data.titleDesign);
  const dateApi = titleDateApi();
  const serviceDate = dateApi
    ? dateApi.previewServiceDate(
        data.serviceDate,
        dateApi.todayIsoDate()
      )
    : data.serviceDate;
  const content = {
    church: (data.churchName || "").trim() || "교회 이름",
    subtitle: (data.titleSubtitle || "").trim(),
    ko: resolveTitlePreviewKo(data),
    en: resolveTitlePreviewEn(data, design),
    koDate: data.showDate === false ? "" : formatTitleDateKo(serviceDate),
    enDate: data.showDate === false ? "" : formatTitleDateEn(serviceDate),
  };

  const container = document.createElement("div");
  container.style.cssText =
    `position:relative;width:${width}px;height:${width * 0.5625}px;overflow:hidden;`;

  const builders = {
    chapel: buildChapelPreview,
    editorial: buildEditorialPreview,
    glow: buildGlowPreview,
    "easter-dawn": buildEasterDawnPreview,
    "easter-stained": buildEasterStainedPreview,
    "christmas-burgundy": buildChristmasBurgundyPreview,
    "christmas-evergreen": buildChristmasEvergreenPreview,
    thanksgiving: buildThanksgivingPreview,
    advent: buildAdventPreview,
  };
  const builder = builders[design];
  if (builder) {
    builder(container, content, unit);
  } else {
    const catalogDesign = titleSlideCatalogApi()?.findTitleDesign(design);
    if (catalogDesign && catalogDesign.layoutFamily !== "legacy") {
      buildCatalogFamilyPreview(container, content, unit, catalogDesign);
    } else {
      buildChapelPreview(container, content, unit);
    }
  }

  return container;
}

// --- Title (Custom) slide helpers ---

function customTitleCatalogApi() {
  return window.CustomTitleDesignCatalog || null;
}

function normalizeCustomTitleDesign(value) {
  const api = customTitleCatalogApi();
  return api ? api.normalizeCustomTitleDesignId(value) : "aurora";
}

// Loaded as a module, so it lands after this script's top-level run.
function customTitleTextApi() {
  return window.CustomTitleText || null;
}

function collectCustomTitleSlideData() {
  return {
    customTitleDesign: normalizeCustomTitleDesign(customTitleDesignSelect.value),
    customTitleKo: customTitleKoInput.value.trim(),
    customTitleEn: customTitleEnInput.value.trim(),
    customTitleSubtitle: customTitleSubtitleInput.value.trim(),
  };
}

// --- Title (Custom) preview (mirrors lib/custom-title-slide.js coordinates) ---

function buildCustomTitleSlidePreview(data, previewWidth) {
  return buildCatalogCustomTitleSlidePreview(data, previewWidth, {
    document,
    catalogApi: customTitleCatalogApi(),
    textApi: customTitleTextApi() || undefined,
  });
}

// --- Custom (WYSIWYG) slide editor integration ---

// The bridge and the editor are ES modules while this file is a classic script,
// so they are pulled in dynamically. The import starts at load time, but every
// caller still has to cope with it not being ready yet.
let customSlideBridge = null;
let customSlideBridgePromise = null;
let customEditorSession = null;
let customEditorSessionPromise = null;
let customEditorModel = null;

function activePptStageWidth() {
  if (slideTypeSelect.value === "custom") {
    return (
      customSlideEditorRoot
        ?.querySelector('[data-custom-editor="stage"]')
        ?.clientWidth ?? 0
    );
  }
  return slidePreview?.clientWidth ?? 0;
}

function reflowActivePptStage() {
  if (navExtractor.classList.contains("active")) {
    return;
  }

  if (slideTypeSelect.value === "custom") {
    customEditorSession?.resize(currentSlideId);
    return;
  }

  // The mounted PPTX viewer owns its own ResizeObserver. Recreating it here
  // would discard parsing work, zoom, scroll, and lazy-mounted slide state.
  if (slidePreview?.__pptxPreviewState?.viewer) {
    return;
  }
  renderPreview();
}

workspaceReflow = createWidthReflowCoordinator({
  measure: activePptStageWidth,
  reflow: reflowActivePptStage,
});

const workspaceResizeObserver =
  typeof ResizeObserver === "function"
    ? new ResizeObserver(() => workspaceReflow?.schedule())
    : null;
workspaceResizeObserver?.observe(slideEditor);

function loadCustomSlideBridge() {
  if (!customSlideBridgePromise) {
    customSlideBridgePromise = import("./custom-slide-bridge.js").then((module) => {
      customSlideBridge = module;
      return module;
    });
  }
  return customSlideBridgePromise;
}

loadCustomSlideBridge().catch((e) => {
  console.error("커스텀 편집기 모듈을 불러오지 못했습니다:", e);
});

// Mirrors createDefaultCustomSlide() for the short window before the module
// lands; the bridge is authoritative once it has loaded.
function emptyCustomSlideModel() {
  if (customSlideBridge) {
    return customSlideBridge.createEmptyCustomSlide();
  }
  return {
    version: 1,
    width: 1280,
    height: 720,
    background: { color: "#ffffff" },
    elements: [],
  };
}

function copyCustomSlideModel(model) {
  if (model === null || model === undefined) {
    return null;
  }
  if (customSlideBridge) {
    return customSlideBridge.copyCustomSlideModel(model);
  }
  return JSON.parse(JSON.stringify(model));
}

function resolveCustomDirtyState(state) {
  if (customSlideBridge) {
    return customSlideBridge.resolveCustomDirtyState(state);
  }
  return !state.slideSaved || Boolean(state.editorDirty) || Boolean(state.formDirty);
}

// One editor instance for the whole workspace, created at most once.
function ensureCustomEditorSession() {
  if (!customEditorSessionPromise) {
    customEditorSessionPromise = (async () => {
      const bridge = await loadCustomSlideBridge();
      if (!customSlideEditorRoot) {
        throw new Error("커스텀 편집기 영역을 찾을 수 없습니다.");
      }
      const { createCustomSlideEditor } = await import("./custom-slide-editor.js");
      const session = bridge.createCustomEditorSession({
        root: customSlideEditorRoot,
        createEditor: createCustomSlideEditor,
        uploadImage: (file) => bridge.uploadCustomImage(file),
        onChange: handleCustomEditorChange,
        onError: (message) => console.warn("커스텀 편집기:", message),
      });
      await session.ensureEditor();
      customEditorSession = session;
      return session;
    })().catch((error) => {
      customEditorSessionPromise = null;
      throw error;
    });
  }
  return customEditorSessionPromise;
}

function handleCustomEditorChange({ slideId, model, dirty }) {
  if (!slideId || slideId !== currentSlideId) {
    return;
  }
  customEditorModel = copyCustomSlideModel(model);
  customEditorDirty = Boolean(dirty);
  // Same path as a keystroke in the form: the guard, the save buttons and the
  // beforeunload warning all read the state this recomputes.
  refreshSaveState();
}

// Loads a slide's canvas. Stale loads are dropped by the session, so switching
// slides quickly can never leave one slide showing another's artwork.
function showCustomSlideInEditor(slide, { markSaved = Boolean(slide?.saved) } = {}) {
  if (!slide) return Promise.resolve();

  const slideId = slide.id;
  const model = copyCustomSlideModel(slide.customSlide) || emptyCustomSlideModel();
  customEditorModel = null;

  return ensureCustomEditorSession()
    .then((session) => session.showSlide(slideId, model, { markSaved }))
    .then((result) => {
      if (!result?.applied || slideId !== currentSlideId) {
        return;
      }
      customEditorModel = copyCustomSlideModel(model);
      customEditorDirty = Boolean(result.dirty);
      workspaceReflow?.schedule({ force: true });
      refreshSaveState();
    })
    .catch((error) => {
      console.error("커스텀 편집기 로드 실패:", error);
      alert("커스텀 편집기를 불러오지 못했습니다: " + error.message);
    });
}

function releaseCustomEditorSlide() {
  customEditorModel = null;
  customEditorDirty = false;
  if (customEditorSession) {
    customEditorSession.release();
  }
}

/**
 * The fields a custom save will commit, read off the live canvas. Nothing is
 * written to the slide record here: the caller commits them only once
 * persistence succeeded, so a failed save leaves the record, the canvas
 * baseline and the name field exactly as they were. Returns null - with the
 * reason already reported - when the editor is not ready to be read.
 */
function stageCustomSlideCandidate(slide, name) {
  const bridge = customSlideBridge;
  if (!bridge) {
    reportSaveFailure("커스텀 편집기 모듈을 불러오는 중입니다. 잠시 후 다시 저장해주세요.");
    return null;
  }

  const serialized = customEditorSession
    ? customEditorSession.serialize(slide.id)
    : null;
  if (!serialized) {
    reportSaveFailure("커스텀 편집기를 불러오는 중입니다. 잠시 후 다시 저장해주세요.");
    return null;
  }

  return bridge.stageCustomSlideSave({ name, serialized });
}

/**
 * Rebases the canvas onto the model that was just committed. Reports whether
 * the canvas is the one that was saved, so the caller knows it does not have
 * to reload it.
 */
function markCustomEditorSaved(slideId) {
  if (!customEditorSession || !customEditorSession.isActive(slideId)) {
    return false;
  }
  customEditorSession.markSaved(slideId);
  customEditorDirty = false;
  return true;
}

function toggleSettingsMode(mode) {
  updateSettingsVisibility(mode);
}

function setHidden(el, hidden) {
  if (el) el.hidden = !!hidden;
}

function updateSettingsVisibility(overrideMode) {
  const type = slideTypeSelect.value;
  slideEditor.dataset.slideType = type;
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

  // A custom slide edits itself on the canvas: no form settings, and the canvas
  // replaces the separate preview instead of doubling it.
  const customVisibility = customSlideBridge
    ? customSlideBridge.decideCustomVisibility(type)
    : {
        showCustomWorkspace: type === "custom",
        showPreview: type !== "custom",
      };
  setHidden(customSlideEditorRoot, !customVisibility.showCustomWorkspace);
  setHidden(slidePreviewArea, !customVisibility.showPreview);
  workspaceReflow?.schedule({ force: true });

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

function closeSlideResetDialog({ restoreFocus = true } = {}) {
  if (slideResetModal.open) {
    slideResetModal.close();
  }
  if (restoreFocus) {
    const focusTarget = editorResetBtn.disabled
      ? slideNameInput
      : editorResetBtn;
    if (focusTarget && !focusTarget.disabled) {
      focusTarget.focus();
    }
  }
}

function setSlideResetDialogBusy(busy) {
  const hadFocusInside =
    busy && slideResetModal.contains(document.activeElement);
  slideResetBackBtn.disabled = busy;
  slideResetConfirmBtn.disabled = busy;
  if (busy) {
    slideResetModal.setAttribute("aria-busy", "true");
    if (slideResetStatus) {
      slideResetStatus.hidden = false;
      slideResetStatus.textContent = "초기화하는 중입니다…";
    }
    if (hadFocusInside && slideResetCard) {
      slideResetCard.focus();
    }
  } else {
    slideResetModal.removeAttribute("aria-busy");
    if (slideResetStatus) {
      slideResetStatus.textContent = "";
      slideResetStatus.hidden = true;
    }
  }
}

function resetCurrentSlide() {
  if (!currentSlideId) return;
  if (blockedBySaveInProgress()) return;
  if (!slideResetModal.open) {
    slideResetModal.showModal();
    slideResetBackBtn.focus();
  }
}

async function confirmCurrentSlideReset() {
  if (!currentSlideId || blockedBySaveInProgress()) {
    closeSlideResetDialog();
    return;
  }

  const slideId = currentSlideId;
  const currentDraft = collectCurrentSlideDraft();
  if (!currentDraft) {
    closeSlideResetDialog();
    return;
  }
  const resetDraft = buildResetSlideDraft(currentDraft);
  const storedSlide = slides.find((slide) => slide.id === slideId);
  const resetStateDraft =
    storedSlide?.saved &&
    storedSlide.type === resetDraft.type &&
    isSlideAtResetDefaults(storedSlide)
      ? {
          ...storedSlide,
          id: resetDraft.id,
          name: resetDraft.name,
          type: resetDraft.type,
          saved: resetDraft.saved,
        }
      : resetDraft;

  setSlideResetDialogBusy(true);
  try {
    if (resetDraft.type === "custom") {
      // Let the browser paint aria-busy and the card focus before canvas work.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const session = await ensureCustomEditorSession();
      if (session.isLoading(slideId)) {
        showToast("커스텀 슬라이드를 불러오는 중입니다. 완료 후 다시 시도해 주세요.");
        closeSlideResetDialog();
        return;
      }
      if (!session.isActive(slideId)) {
        showToast("커스텀 편집기가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
        closeSlideResetDialog();
        return;
      }
      if (!(await session.reset(slideId))) {
        showToast(CUSTOM_RESET_RETRY_MESSAGE);
        closeSlideResetDialog();
        return;
      }
    }
    const resetBlockInput = {
      expectedSlideId: slideId,
      currentSlideId,
      saveState: getSaveState(),
    };
    if (!canApplyResetDraft(resetBlockInput)) {
      showToast(getResetDraftBlockMessage(resetBlockInput));
      closeSlideResetDialog();
      return;
    }

    slideRuntimeDraft = {};
    slideResetDraft = { id: slideId, draft: resetStateDraft };
    populateEditor(resetDraft, {
      reloadCustomCanvas: false,
      useExactDefaults: true,
    });
    renderPreview();
    updateButtonsState(resetDraft);
    refreshSaveState();
    const hasChangesToSave = !editorSaveBtn.disabled;
    closeSlideResetDialog({ restoreFocus: false });
    if (hasChangesToSave) {
      editorSaveBtn.focus();
      showToast("슬라이드를 초기화했습니다. 저장하기 전에는 취소할 수 있습니다.");
    } else {
      slideNameInput.focus();
      showToast("슬라이드가 저장된 초기 상태로 돌아왔습니다.");
    }
  } catch (error) {
    console.error("슬라이드 초기화 실패:", error);
    alert("슬라이드를 초기화하지 못했습니다: " + error.message);
    closeSlideResetDialog();
  } finally {
    setSlideResetDialogBusy(false);
  }
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
    card.addEventListener("drop", async (event) => {
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

      await moveSlideToIndex(draggedSlideId, nextIndex);
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
    moveUpBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await moveSlideByOffset(slide.id, -1);
    });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.type = "button";
    moveDownBtn.className = "slide-move-btn";
    moveDownBtn.title = "아래로 이동";
    moveDownBtn.disabled = index === slides.length - 1;
    moveDownBtn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18l6-6H6z"></path></svg>';
    moveDownBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await moveSlideByOffset(slide.id, 1);
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
    typeBadge.textContent = slide.type === "title" ? "TITLE" : slide.type === "custom-title" ? "TITLE+" : slide.type === "custom" ? "커스텀" : slide.type === "ad" ? "AD" : slide.type === "scripture" ? "말씀" : slide.sourceType === "upload" ? "PPT/PPTX" : "TEXT";

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

// Save buttons are disabled while a save runs, so the progress label is the
// only thing that tells the user which step is in flight. Returns the restore
// callback, and tolerates a missing button.
function showSaveButtonProgress(button, label) {
  if (!button) {
    return () => {};
  }
  const original = button.textContent;
  button.textContent = label;
  return () => {
    button.textContent = original;
  };
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

  // A slide that has never been saved is not part of the template on the
  // server yet, which is what decides between creating and replacing it.
  const isFirstSave = isSlideUnsaved(slides[index]);
  candidate.saved = true;

  if (isTemplateMode()) {
    // Slide level: one slide, addressed by its id. The request carries no
    // order and no template name, so saving content cannot move, drop or
    // rename anything else.
    const payload = await requestTemplateWrite(
      activeTemplateId,
      isFirstSave ? "/slides" : `/slides/${encodeURIComponent(candidate.id)}`,
      {
        method: isFirstSave ? "POST" : "PUT",
        body: {
          slide: buildSerializableSlide(candidate),
          ...(isFirstSave ? { index } : {}),
        },
      }
    );
    applyTemplateFromServer(payload.template);
    return true;
  }

  const nextSlides = slides.map((slide, i) =>
    i === index ? cloneSlide(candidate) : cloneSlide(slide)
  );
  const resp = await fetch("/api/slides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextSlides.map(buildSerializableSlide)),
  });
  if (!resp.ok) {
    const payload = await resp.json().catch(() => ({}));
    throw new Error(payload.error || "슬라이드 저장에 실패했습니다.");
  }

  slides = nextSlides;
  mainSlides = nextSlides.map(cloneSlide);
  return true;
}

async function saveCurrentSlide({ silent = false } = {}) {
  // An in-flight save owns the draft and the baselines. Returning before the
  // flag is set is what stops a second call from clearing the running save's
  // busy state.
  if (isSaveBusy(getSaveState())) {
    console.warn("Save already in progress; ignoring duplicate slide save");
    return false;
  }

  // Pinned so the tail can refuse to repopulate or recapture the editor if the
  // selection moved on while the save was in flight.
  const savingSlideId = currentSlideId;
  if (!savingSlideId) {
    reportSaveFailure("저장할 슬라이드가 없습니다.");
    return false;
  }

  const name = slideNameInput.value.trim();

  if (!name) {
    reportSaveFailure("슬라이드 이름을 입력하세요.");
    return false;
  }

  // Check duplicate name
  const existing = slides.find((s) => s.name === name && s.id !== savingSlideId);
  if (existing) {
    reportSaveFailure("이미 존재하는 슬라이드 이름입니다.");
    return false;
  }

  const slide = collectCurrentSlideDraft();
  if (!slide) {
    reportSaveFailure("슬라이드 정보를 찾을 수 없습니다.");
    return false;
  }

  slideSaving = true;
  refreshSaveState();
  try {
    if (slide.type === 'custom') {
      // The canvas is the record for a custom slide, so the staged values come
      // from the editor. Nothing is written to the stored slide here:
      // commitSlideCandidate() below is what makes the save a transaction.
      const staged = stageCustomSlideCandidate(slide, name);
      if (!staged) {
        return false;
      }
      Object.assign(slide, staged);

    } else if (slide.type === 'hymn') {
      const number = hymnNumberInput.value;
      if (!number) {
        reportSaveFailure("찬송가 장수를 입력하세요.");
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
          reportSaveFailure("자동 다운로드 실패: " + e.message);
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
      slide.titleThemeId = getCoverThemePicker(hymnTitleThemeGrid);
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
            reportSaveFailure("배경 이미지 업로드 실패: " + e.message);
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
          reportSaveFailure("파일 크기가 50MB를 초과합니다.");
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
            reportSaveFailure("파일 업로드 실패: " + e.message);
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
        reportSaveFailure("교회 이름을 입력하세요.");
        return false;
      }
      if (!titleData.serviceDate) {
        reportSaveFailure("주일 날짜를 선택하세요.");
        return false;
      }

      Object.assign(slide, titleData);
      slide.sourceType = 'basic';
      slide.saved = true;

    } else if (slide.type === 'custom-title') {
      const customTitleData = collectCustomTitleSlideData();
      if (!customTitleData.customTitleKo) {
        reportSaveFailure("타이틀 이름(한글)을 입력하세요.");
        return false;
      }

      Object.assign(slide, customTitleData);
      slide.sourceType = 'basic';
      slide.saved = true;

    } else {
      // Simple Slide Logic
      const sourceRadio = document.querySelector('input[name="sourceType"]:checked');
      if (!sourceRadio) {
        reportSaveFailure("슬라이드 소스 종류를 선택하세요.");
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
            reportSaveFailure("배경 이미지 업로드 실패: " + e.message);
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
              reportSaveFailure("파일 업로드 실패: " + (err?.message || err));
              return false;
            }
          }
        } else if (!slide.fileName && !slide.serverFilePath) {
          reportSaveFailure("PPTX 파일을 업로드해주세요.");
          return false;
        }
      }
    }

    const restoreSaveLabel = showSaveButtonProgress(editorSaveBtn, "저장 중...");
    let committed = false;
    try {
      committed = await commitSlideCandidate(slide);
    } finally {
      restoreSaveLabel();
    }
    if (!committed) {
      reportSaveFailure(
        "슬라이드 목록에서 대상을 찾을 수 없어 저장하지 못했습니다."
      );
      return false;
    }

    if (slide.type === "title") {
      rememberChurchName(slide.churchName);
    }
    // Never write the saved model into an editor that has moved on to another
    // slide, which a programmatic save could otherwise do.
    if (currentSlideId === savingSlideId) {
      // The canvas already holds exactly what was committed, so it is rebased
      // onto the new baseline in place instead of being reloaded: a reload
      // would drop the user's selection right after a successful save.
      const canvasInPlace = markCustomEditorSaved(slide.id);
      populateEditor(slide, { reloadCustomCanvas: !canvasInPlace });
      slideRuntimeDraft = {};
      slideResetDraft = null;
      slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft());
      updateButtonsState(slide);
    }
    refreshSaveState();
    renderSlideList();
    if (!silent) {
      showToast("슬라이드가 저장되었습니다");
    }
    return true;
  } catch (e) {
    console.error("Error in saveCurrentSlide:", e);
    reportSaveFailure("저장 중 오류 발생: " + e.message);
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
          titleKo: slide.titleKo,
          titleEn: slide.titleEn,
          serviceDate: slide.serviceDate,
          titleSubtitle: slide.titleSubtitle,
          dateMode: slide.dateMode,
          showDate: slide.showDate,
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
          customTitleSubtitle: slide.customTitleSubtitle,
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

  if (slide.type === 'custom') {
    try {
      const resp = await fetch('/api/create-custom-slide-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: slide.name,
          customSlide: copyCustomSlideModel(slide.customSlide) || emptyCustomSlideModel(),
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert("다운로드 실패: " + (err.error || "Unknown Error"));
        return;
      }

      const skippedImages = customSlideBridge
        ? customSlideBridge.parseSkippedImageWarnings(
            resp.headers.get('X-Custom-Slide-Warnings')
          )
        : 0;

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = customSlideBridge
        ? customSlideBridge.customSlideDownloadFilename(slide.name)
        : `${slide.name || 'custom_slide'}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // The download already succeeded; this only reports what was left out.
      if (skippedImages > 0) {
        alert(`이미지 ${skippedImages}개를 불러올 수 없어 건너뛰고 저장했습니다.`);
      }
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
    unrestorable: Boolean(slide.unrestorable),
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
    titleKo: slide.titleKo,
    titleEn: slide.titleEn,
    serviceDate: slide.serviceDate,
    titleSubtitle: slide.titleSubtitle,
    dateMode: slide.dateMode,
    showDate: slide.showDate,
    customTitleDesign: slide.customTitleDesign,
    customTitleKo: slide.customTitleKo,
    customTitleEn: slide.customTitleEn,
    customTitleSubtitle: slide.customTitleSubtitle,
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
    titleThemeId: slide.titleThemeId || "original",
    customImageData: slide.customImageData,
    scriptureSignature: slide.scriptureSignature,
    // Deep copy so clones and templates never share a canvas model.
    customSlide: copyCustomSlideModel(slide.customSlide),
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
  if (blockedBySaveInProgress()) return;

  const selectedSlides = getSelectedSlides();
  if (selectedSlides.length === 0) {
    alert("삭제할 슬라이드를 선택하세요.");
    return;
  }

  if (!confirm(`선택한 ${selectedSlides.length}개 슬라이드를 삭제하시겠습니까?`)) {
    return;
  }

  // The confirm is a yield point, so a save may have started behind it.
  if (blockedBySaveInProgress()) return;

  const selectedIds = selectedSlides.map((slide) => slide.id);

  try {
    if (isTemplateMode()) {
      await removeTemplateSlideIds(selectedIds);
      selectedSlideIds.clear();

      if (currentSlideId && selectedIds.includes(currentSlideId)) {
        resetEditorSelection();
      }

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

function formatUnrestorableSchemaMessage(names, { forExport }) {
  const list = names.map((name) => `- ${name}`).join("\n");
  if (forExport) {
    return `다음 슬라이드는 파일이 없어 다른 컴퓨터에서 다시 만들 수 없습니다:\n\n${list}\n\n스키마만 내보낼까요?`;
  }
  return `템플릿을 가져왔습니다. 다음 슬라이드는 파일이 없어 다시 만들 수 없습니다:\n\n${list}`;
}

function downloadTemplateSchema(schema) {
  const blob = new Blob([JSON.stringify(schema, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = templateSchemaFilename(schema.template.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportTemplateSchemaById(templateId) {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    return;
  }
  const unrestorable = unrestorableSlideNames(template.slides || []);
  if (
    unrestorable.length > 0 &&
    !confirm(formatUnrestorableSchemaMessage(unrestorable, { forExport: true }))
  ) {
    return;
  }
  downloadTemplateSchema(toPortableTemplateSchema(template));
  showToast(`스키마를 내보냈습니다: ${template.name}`);
}

async function importTemplateSchemaFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    alert(templateSchemaErrorMessage(TEMPLATE_SCHEMA_ERROR.INVALID_JSON));
    return;
  }

  const parsed = parseTemplateSchema(text);
  if (!parsed.ok) {
    alert(parsed.message);
    return;
  }

  try {
    const resp = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: parsed.schema.template.name,
        slides: parsed.schema.template.slides,
      }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.error || "템플릿 가져오기에 실패했습니다.");
    }
    const importedTemplate = payload?.template;
    if (
      !importedTemplate ||
      typeof importedTemplate !== "object" ||
      typeof importedTemplate.id !== "string" ||
      !importedTemplate.id.trim() ||
      typeof importedTemplate.name !== "string" ||
      !importedTemplate.name.trim() ||
      !Array.isArray(importedTemplate.slides) ||
      importedTemplate.slides.length === 0
    ) {
      throw new Error("템플릿 가져오기에 실패했습니다.");
    }

    templates.push(cloneTemplate(importedTemplate));
    renderTemplateGallery();
    showToast(`템플릿을 가져왔습니다: ${importedTemplate.name}`);
    if (parsed.unrestorableNames.length > 0) {
      alert(
        formatUnrestorableSchemaMessage(parsed.unrestorableNames, {
          forExport: false,
        })
      );
    }
  } catch (err) {
    alert(err.message || "템플릿 가져오기 중 오류가 발생했습니다.");
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

  // A delete accepted here would race a template the server is still writing.
  if (blockedBySaveInProgress()) {
    return;
  }

  if (!confirm(`'${template.name}' 템플릿을 삭제하시겠습니까?`)) {
    return;
  }

  // The confirm is a yield point, so a save may have started behind it.
  if (blockedBySaveInProgress()) {
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

// Template level: the name, and nothing else. Like every other structural
// command it is written as soon as it is given.
async function renameActiveTemplate() {
  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) {
    return;
  }

  if (blockedBySaveInProgress()) {
    return;
  }

  const trimmedName = promptTemplateName(activeTemplate.name);
  if (!trimmedName) {
    return;
  }

  // The prompt is a yield point, so a save may have started behind it.
  if (blockedBySaveInProgress()) {
    return;
  }

  structureSaving = true;
  refreshSaveState();
  try {
    const payload = await requestTemplateWrite(activeTemplate.id, "", {
      method: "PATCH",
      body: { name: trimmedName },
    });
    applyTemplateFromServer(payload.template);
    renderTemplateGallery();
    updateTemplateManagementUi();
    showToast("템플릿 이름을 변경했습니다");
  } catch (err) {
    alert(err.message || "템플릿 이름 변경 중 오류가 발생했습니다.");
  } finally {
    structureSaving = false;
    refreshSaveState();
  }
}

// Renaming from the gallery has no "저장" button to fall back on, so persist
// immediately instead of leaving the change pending.
async function renameTemplateById(templateId) {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    return;
  }

  if (blockedBySaveInProgress()) {
    return;
  }

  const trimmedName = promptTemplateName(template.name);
  if (!trimmedName) {
    return;
  }

  // The prompt is a yield point, so a save may have started behind it.
  if (blockedBySaveInProgress()) {
    return;
  }

  try {
    const payload = await requestTemplateWrite(template.id, "", {
      method: "PATCH",
      body: { name: trimmedName },
    });
    applyTemplateFromServer(payload.template);
    renderTemplateGallery();
    updateTemplateManagementUi();
    showToast("템플릿 이름을 변경했습니다");
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

    const skippedImages = customSlideBridge
      ? customSlideBridge.parseSkippedImageWarnings(
          resp.headers.get("X-Custom-Slide-Warnings")
        )
      : 0;

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

    // The download already succeeded; this only reports what was left out.
    if (skippedImages > 0) {
      alert(`이미지 ${skippedImages}개를 불러올 수 없어 건너뛰고 저장했습니다.`);
    }
  } catch (err) {
    alert(err.message || "선택 슬라이드 다운로드 중 오류가 발생했습니다.");
  }
}


// --- Event Listeners ---

addSlideBtn.addEventListener("click", () => createSlide());
addSlideMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (addSlideDropdown.hidden) {
    closeBulkDropdown();
    openAddSlideDropdown();
  } else {
    closeAddSlideDropdown();
  }
});
addSlideAfterBtn.addEventListener("click", () => {
  closeAddSlideDropdown();
  createSlide("after");
});
addSlideBeforeBtn.addEventListener("click", () => {
  closeAddSlideDropdown();
  createSlide("before");
});
addSlideEndBtn.addEventListener("click", () => {
  closeAddSlideDropdown();
  createSlide("end");
});
duplicateSlideBtn.addEventListener("click", duplicateCurrentSlide);

editorSaveBtn.addEventListener("click", () => saveCurrentSlide());
editorResetBtn.addEventListener("click", resetCurrentSlide);
editorCancelBtn.addEventListener("click", cancelEdit);
slideResetBackBtn.addEventListener("click", () => closeSlideResetDialog());
slideResetConfirmBtn.addEventListener("click", () => {
  confirmCurrentSlideReset();
});
slideResetModal.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (slideResetConfirmBtn.disabled) return;
  closeSlideResetDialog();
});
slideResetModal.addEventListener("click", (event) => {
  if (event.target === slideResetModal && !slideResetConfirmBtn.disabled) {
    closeSlideResetDialog();
  }
});

async function deleteCurrentSlide() {
  if (!currentSlideId) return;
  if (blockedBySaveInProgress()) return;

  if (!confirm("정말 이 슬라이드를 삭제하시겠습니까?")) {
    return;
  }

  // The confirm is a yield point, so a save may have started behind it.
  if (blockedBySaveInProgress()) return;

  // Call API
  try {
    if (isTemplateMode()) {
      await removeTemplateSlideIds([currentSlideId]);
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

// Cancel restores the current slide in place. It is not navigation, so it
// must not go through the unsaved-changes guard.
function cancelEdit() {
  if (!currentSlideId) return;
  if (blockedBySaveInProgress()) return;

  const slide = slides.find((s) => s.id === currentSlideId);
  if (!slide) return;

  if (isSlideUnsaved(slide)) {
    const neighborId = resolveAdjacentSlideId(slides, currentSlideId);
    slides = slides.filter((entry) => entry.id !== currentSlideId);
    syncWorkingSlidesToState();
    if (neighborId) {
      applySlideSelection(neighborId);
    } else {
      resetEditorSelection();
      renderSlideList();
    }
    return;
  }

  slideRuntimeDraft = {};
  slideResetDraft = null;
  populateEditor(slide);
  slideBaselineSnapshot = createSnapshot(collectCurrentSlideDraft());
  renderPreview(slide);
  updateButtonsState(slide);
  refreshSaveState();
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
    closeAddSlideDropdown();
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
  if (addSlideDropdown && !addSlideDropdown.hidden) {
    if (!addSlideMenuBtn.contains(e.target) && !addSlideDropdown.contains(e.target)) {
      closeAddSlideDropdown();
    }
  }
  if (templateGalleryGrid && !templateGalleryGrid.contains(e.target)) {
    closeTemplateCardMenus();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (addSlideDropdown && !addSlideDropdown.hidden) {
    closeAddSlideDropdown();
    addSlideMenuBtn.focus();
  }
  if (bulkActionDropdown && !bulkActionDropdown.hidden) {
    closeBulkDropdown();
  }
});

bulkDeleteBtn.addEventListener("click", () => { closeBulkDropdown(); deleteSelectedSlides(); });
bulkTemplateBtn.addEventListener("click", () => { closeBulkDropdown(); createTemplateFromSelection(); });
bulkDownloadBtn.addEventListener("click", () => { closeBulkDropdown(); downloadSelectedSlidesBundle(); });
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
    slideNameInput.value = buildTitleSlideName(titleServiceDateInput.value);
  }
}

function prepareTitleSlideFields() {
  const slide = slides.find((entry) => entry.id === currentSlideId);
  if (!titleChurchNameInput.value.trim()) {
    titleChurchNameInput.value = rememberedChurchName();
  }
  if (slide?.type !== "title") {
    initializeTitleDesignPicker(
      titleDesignCategoryGroup,
      titleDesignGrid,
      titleDesignSelect,
      slide?.titleDesign
    );
    const textApi = titleTextApi();
    titleKoInput.value =
      slide?.titleKo == null ? textApi.defaultTitleKo() : slide.titleKo;
    titleEnInput.value =
      slide?.titleEn == null
        ? textApi.defaultTitleEn(titleDesignSelect.value)
        : slide.titleEn;
    titleSubtitleInput.value = slide?.titleSubtitle || "";
    setSelectedDateMode(slide?.dateMode || "custom");
    titleShowDate.checked = slide?.showDate !== false;
    const api = titleDateApi();
    titleServiceDateInput.value = api
      ? api.resolveServiceDate(
          slide?.dateMode || "custom",
          slide?.serviceDate,
          api.todayIsoDate()
        )
      : slide?.serviceDate || defaultServiceDate();
  } else if (!titleServiceDateInput.value) {
    titleServiceDateInput.value = defaultServiceDate();
  }
  updateTitleSeasonSuggestion();
  maybeAutoNameTitleSlide();
}

if (titleDesignCategoryGroup && titleDesignGrid && titleDesignSelect) {
  initializeTitleDesignPicker(
    titleDesignCategoryGroup,
    titleDesignGrid,
    titleDesignSelect,
    titleDesignSelect.value
  );
  titleDesignCategoryGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-title-design-category]");
    if (!button) return;
    filterTitleDesignCategory(
      titleDesignCategoryGroup,
      titleDesignGrid,
      titleDesignSelect,
      button.dataset.titleDesignCategory,
      renderPreview,
      refreshSaveState
    );
  });
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

[titleKoInput, titleEnInput].forEach((input) => {
  input.addEventListener('input', () => {
    renderPreview();
    refreshSaveState();
  });
});

titleShowDate.addEventListener('change', () => {
  renderPreview();
  refreshSaveState();
});

document.querySelectorAll('input[name="titleDateMode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    const api = titleDateApi();
    if (api) {
      titleServiceDateInput.value = api.resolveServiceDate(
        radio.value,
        titleServiceDateInput.value,
        api.todayIsoDate()
      );
    }
    updateTitleSeasonSuggestion();
    maybeAutoNameTitleSlide();
    renderPreview();
    refreshSaveState();
  });
});

titleServiceDateInput.addEventListener('input', () => {
  setSelectedDateMode('custom');
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

[
  hymnTitleThemeGrid,
  scriptureTitleThemeGrid,
].forEach((grid) => {
  if (!grid) return;
  grid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-title-theme]");
    if (!card) return;
    setCoverThemePicker(grid, card.dataset.titleTheme);
    renderPreview();
    refreshSaveState();
  });
});

// Only replaces names the user has not personalised yet.
function maybeAutoNameCustomTitleSlide() {
  const current = slideNameInput.value.trim();
  if (current && !/^새 슬라이드\d*$/.test(current)) return;

  const ko = customTitleKoInput.value.trim();
  if (ko) slideNameInput.value = ko;
}

if (
  customTitleDesignCategories &&
  customTitleDesignGrid &&
  customTitleDesignSelect
) {
  customTitleDesignPicker = createCustomTitleDesignPicker({
    document,
    categoryGroup: customTitleDesignCategories,
    designGrid: customTitleDesignGrid,
    designSelect: customTitleDesignSelect,
    catalogApi: customTitleCatalogApi(),
    buildPreview: buildCustomTitleSlidePreview,
    render: renderPreview,
    refreshDirty: refreshSaveState,
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

customTitleSubtitleInput.addEventListener('input', () => {
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
  if (!shouldWarnBeforeUnload(getSaveState())) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

// Load slides on init. The book list has to be in place first: the scripture
// editor fills its selects from it, and a slide selected before it arrives
// would be baselined with an empty testament and book.
// The readiness marker is written for both outcomes, so nothing waits forever
// on a render that threw, and a failed init never reads as ready.
async function initPptWorkspace() {
  try {
    await booksSettled;
    if (!booksReady) {
      showToast(getBooksUnavailableMessage({ booksReady }));
    }
    await loadPptDataFromServer();
    document.body.dataset.pptReady = "true";
  } catch (error) {
    console.error("Failed to initialize the PPT workspace", error);
    document.body.dataset.pptReady = "failed";
    document.body.dataset.pptReadyError = error?.message || String(error);
    showToast(WORKSPACE_INIT_FAILED_MESSAGE);
  }
}

// Caught inside, so the call itself can never raise an unhandled rejection.
initPptWorkspace();

// Helpers
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지 읽기에 실패했습니다."));
    reader.readAsDataURL(file);
  });
}
