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

const navExtractor = document.getElementById("navExtractor");
const navPpt = document.getElementById("navPpt");
const viewExtractor = document.getElementById("view-extractor");
const viewPpt = document.getElementById("view-ppt");

const slideListContainer = document.getElementById("slideListContainer");
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
const sourceRadios = document.querySelectorAll('input[name="sourceType"]');
const basicSettingsMode = document.getElementById("basicSettingsMode");
const uploadSettingsMode = document.getElementById("uploadSettingsMode");
const simpleSlideSettings = document.getElementById("simpleSlideSettings");
const hymnSlideSettings = document.getElementById("hymnSlideSettings");
const hymnNumberInput = document.getElementById("hymnNumber");
const hymnLoadBtn = document.getElementById("hymnLoadBtn");
const userPptxFile = document.getElementById("userPptxFile");
const adSlideSettings = document.getElementById("adSlideSettings");
const adTitleInput = document.getElementById("adTitle");
const adTitleSizeSelect = document.getElementById("adTitleSize");
const adTitleAlignSelect = document.getElementById("adTitleAlign");
const adBgSourceRadios = document.querySelectorAll('input[name="adBgSource"]');
const adBgImageFile = document.getElementById("adBgImageFile");
const adBgImageUrl = document.getElementById("adBgImageUrl");
const adBgOpacity = document.getElementById("adBgOpacity");
const adBgOpacityValue = document.getElementById("adBgOpacityValue");

// State
let slides = [];
let currentSlideId = null;
let hasUnsavedChanges = false;

// --- Event Listeners for Hymn Type ---
slideTypeSelect.addEventListener('change', () => {
  const type = slideTypeSelect.value;
  if (type === 'hymn') {
    simpleSlideSettings.style.display = 'none';
    hymnSlideSettings.style.display = 'block';
    adSlideSettings.style.display = 'none';
  } else if (type === 'ad') {
    simpleSlideSettings.style.display = 'block';
    hymnSlideSettings.style.display = 'none';
    adSlideSettings.style.display = 'block';
  } else {
    simpleSlideSettings.style.display = 'block';
    hymnSlideSettings.style.display = 'none';
    adSlideSettings.style.display = 'none';
  }
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

// --- Storage ---

// --- Storage ---

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
    }
  } catch (e) {
    console.error("Network error saving slides", e);
  }
}

async function loadSlidesFromServer() {
  try {
    const resp = await fetch("/api/slides");
    if (resp.ok) {
      slides = await resp.json();
      if (!Array.isArray(slides)) slides = [];
      renderSlideList();
    }
  } catch (e) {
    console.error("Failed to load slides", e);
    slides = [];
  }
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

function renderPreview(slideOverride) {
  // Use override if provided (for loading initial state), otherwise build from inputs
  let data = slideOverride;
  // Note: if doing "Live Preview" (data is null), we are reading form inputs.
  // The user might have selected a file in the input, but not saved it yet.

  if (!data) {
    // Live preview from inputs
    const type = slideTypeSelect.value;
    if (type === 'hymn') {
      data = {
        type: 'hymn',
        hymnNumber: hymnNumberInput.value,
        // Try to find if we have file info in current slide
        ...((slides.find(s => s.id === currentSlideId) || {}))
      };
      // Explicitly set source type to upload-like behavior for renderer
      data.sourceType = 'upload';
    } else if (type === 'ad') {
      data = {
        name: slideNameInput.value,
        type: 'ad',
        sourceType: document.querySelector('input[name="sourceType"]:checked').value,
        content: slideContentInput.value,
        font: slideFontSelect.value,
        fontSize: slideFontSizeSelect.value,
        bg: slideBgSelect.value,
        align: slideAlignSelect.value,
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
        bg: slideBgSelect.value,
        align: slideAlignSelect.value,
        // For preview, we check the INPUT element directly
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

  console.log("renderPreview called with data:", data);

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

  // Clear caches before render
  slidePreview.dataset.lastRenderedUrl = "";
  slidePreview.dataset.lastRenderedFile = "";
  slidePreview.dataset.lastRenderedPath = "";

  slidePreview.innerHTML = "";

  // Ensure slidePreview is visible (just in case)
  if (!slidePreview) return;

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

      // Update Cache State
      if (data.file) {
        slidePreview.dataset.lastRenderedFile = data.file.name + ':' + data.file.size + ':' + data.file.lastModified;
      }
      if (data.serverFilePath) {
        slidePreview.dataset.lastRenderedPath = data.serverFilePath;
      }

      // Render
      setTimeout(() => {
        try {
          window.jQuery(`#${pptxContainerId}`).pptxToHtml({
            pptxFileUrl: fileUrl,
            slidesScale: "50%", // Render at 50% of native
            slideMode: false,
            keyBoardShortCut: false
          });

          // Zoom State
          let manualZoomMultiplier = 1.0;

          // Helper: Apply Zoom
          const applyZoom = () => {
            const container = document.getElementById(pptxContainerId);
            if (!container) return;

            const slides = container.querySelectorAll('.slide');
            if (slides.length === 0) return;

            const styles = window.getComputedStyle(container);
            const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
            const availableWidth = (container.offsetWidth - paddingX) || 400;

            slides.forEach(slide => {
              const slideWidth = slide.offsetWidth || slide.scrollWidth || 500;
              // Base fit: (Available / Slide) * 0.99 for safety
              // Then multiply by manualZoomMultiplier
              const baseZoom = (availableWidth / slideWidth) * 0.99;
              const finalZoom = baseZoom * manualZoomMultiplier;

              slide.style.zoom = finalZoom;
              slide.style.marginBottom = '20px';
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
          setTimeout(() => {
            const btnIn = document.getElementById(`zoom-in-${pptxContainerId}`);
            const btnOut = document.getElementById(`zoom-out-${pptxContainerId}`);
            const btnReset = document.getElementById(`zoom-reset-${pptxContainerId}`);

            if (btnIn) btnIn.onclick = (e) => {
              e.stopPropagation();
              manualZoomMultiplier = Math.min(manualZoomMultiplier + 0.1, 3.0);
              applyZoom();
            };
            if (btnOut) btnOut.onclick = (e) => {
              e.stopPropagation();
              manualZoomMultiplier = Math.max(manualZoomMultiplier - 0.1, 0.2);
              applyZoom();
            };
            if (btnReset) btnReset.onclick = (e) => {
              e.stopPropagation();
              manualZoomMultiplier = 1.0;
              applyZoom();
            };
          }, 100);

          // Post-render: poll for slides and apply zoom to fit container
          let checks = 0;
          const fitInterval = setInterval(() => {
            checks++;
            const container = document.getElementById(pptxContainerId);
            if (!container) { clearInterval(fitInterval); return; }

            const slides = container.querySelectorAll('.slide');
            if (slides.length > 0) {
              clearInterval(fitInterval);
              applyZoom(); // Initial apply
            }
            if (checks > 30) clearInterval(fitInterval);
          }, 100);

          // Window resize listener
          const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(applyZoom);
          });
          resizeObserver.observe(pptxContainer);

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

  // Ad Slide Render
  if (data.type === 'ad' && data.sourceType === 'basic') {
    slidePreview.classList.remove('preview-scroll-mode');
    const container = document.createElement("div");
    container.className = "preview-content";
    container.style.position = "relative";
    container.style.overflow = "hidden";
    
    // Background image
    if (data.adBgSource === 'file' && data.adBgImageFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        container.style.backgroundImage = `url(${e.target.result})`;
        container.style.backgroundSize = "cover";
        container.style.backgroundPosition = "center";
      };
      reader.readAsDataURL(data.adBgImageFile);
    } else if (data.adBgSource === 'url' && data.adBgImageUrl) {
      container.style.backgroundImage = `url(${data.adBgImageUrl})`;
      container.style.backgroundSize = "cover";
      container.style.backgroundPosition = "center";
    } else {
      container.style.backgroundColor = data.bg === "black" ? "black" : "white";
    }
    
    // Overlay
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = `rgba(0,0,0,${data.adBgOpacity / 100})`;
    overlay.style.pointerEvents = "none";
    container.appendChild(overlay);
    
    // Content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.style.position = "relative";
    contentWrapper.style.zIndex = "1";
    contentWrapper.style.padding = "20px";
    contentWrapper.style.height = "100%";
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";
    
    // Title
    if (data.adTitle) {
      const title = document.createElement("div");
      title.textContent = data.adTitle;
      title.style.fontWeight = "bold";
      title.style.color = data.bg === "black" ? "white" : "black";
      title.style.textAlign = data.adTitleAlign || "center";
      title.style.marginBottom = "20px";
      
      const titleSizeMap = { large: "24px", medium: "18px", small: "14px" };
      title.style.fontSize = titleSizeMap[data.adTitleSize] || "18px";
      
      contentWrapper.appendChild(title);
    }
    
    // Content
    const content = document.createElement("div");
    content.style.flex = "1";
    content.style.display = "flex";
    content.style.alignItems = "center";
    content.style.justifyContent = "center";
    content.style.fontFamily = data.font;
    content.style.color = data.bg === "black" ? "white" : "black";
    content.style.textAlign = data.align;
    
    const lines = data.content ? data.content.split('\n') : ["내용을 입력하세요"];
    lines.forEach(line => {
      const p = document.createElement("div");
      p.textContent = line;
      p.style.fontSize = `${data.fontSize || 40}px`;
      p.style.fontWeight = "bold";
      p.style.lineHeight = "1.2";
      content.appendChild(p);
    });
    
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

  // Content split by newline
  const lines = data.content ? data.content.split('\n') : ["내용을 입력하세요"];

  lines.forEach(line => {
    const p = document.createElement("div");
    p.textContent = line;
    p.style.fontSize = `${data.fontSize || 40}px`;
    p.style.fontWeight = "bold";
    p.style.lineHeight = "1.2";
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

  if (slide.type === 'hymn') {
    simpleSlideSettings.style.display = 'none';
    hymnSlideSettings.style.display = 'block';
    adSlideSettings.style.display = 'none';
  } else if (slide.type === 'ad') {
    simpleSlideSettings.style.display = 'block';
    hymnSlideSettings.style.display = 'none';
    adSlideSettings.style.display = 'block';

    slideContentInput.value = slide.content;
    slideFontSelect.value = slide.font;
    slideFontSizeSelect.value = slide.fontSize || "40";
    slideBgSelect.value = slide.bg;
    slideAlignSelect.value = slide.align;

    sourceRadios.forEach(r => {
      r.checked = r.value === slide.sourceType;
    });
    toggleSettingsMode(slide.sourceType);

    // Load ad-specific properties
    adTitleInput.value = slide.adTitle || '';
    adTitleSizeSelect.value = slide.adTitleSize || 'medium';
    adTitleAlignSelect.value = slide.adTitleAlign || 'center';
    adBgOpacity.value = slide.adBgOpacity || 30;
    adBgOpacityValue.textContent = slide.adBgOpacity || 30;

    // Set background source radio
    adBgSourceRadios.forEach(r => {
      r.checked = r.value === (slide.adBgSource || 'none');
    });
    toggleAdBgMode(slide.adBgSource || 'none');
  } else {
    simpleSlideSettings.style.display = 'block';
    hymnSlideSettings.style.display = 'none';
    adSlideSettings.style.display = 'none';

    slideContentInput.value = slide.content;
    slideFontSelect.value = slide.font;
    slideFontSizeSelect.value = slide.fontSize || "40";
    slideBgSelect.value = slide.bg;
    slideAlignSelect.value = slide.align;

    // Set source type radio logic only for simple slides
    sourceRadios.forEach(r => {
      r.checked = r.value === slide.sourceType;
    });
    toggleSettingsMode(slide.sourceType);
  }

  // Clear file input to avoid showing stale filename from previous slide
  userPptxFile.value = '';
}

function toggleSettingsMode(mode) {
  if (mode === "basic") {
    basicSettingsMode.style.display = "block";
    uploadSettingsMode.style.display = "none";
  } else {
    basicSettingsMode.style.display = "none";
    uploadSettingsMode.style.display = "block";
  }
}

function toggleAdBgMode(source) {
  const adBgFileMode = document.getElementById("adBgFileMode");
  const adBgUrlMode = document.getElementById("adBgUrlMode");
  if (source === "file") {
    adBgFileMode.style.display = "block";
    adBgUrlMode.style.display = "none";
  } else if (source === "url") {
    adBgFileMode.style.display = "none";
    adBgUrlMode.style.display = "block";
  } else {
    adBgFileMode.style.display = "none";
    adBgUrlMode.style.display = "none";
  }
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
    editorCancelBtn.style.display = "none";
  } else {
    editorDownloadBtn.style.display = "none";
    editorDeleteBtn.style.display = "none";
    editorCancelBtn.style.display = "inline-flex";
  }
}

function renderSlideList() {
  slideListContainer.innerHTML = "";
  slides.forEach((slide) => {
    const card = document.createElement("div");
    card.className = `slide-card ${slide.id === currentSlideId ? "active" : ""}`;
    card.onclick = () => selectSlide(slide.id);

    const title = document.createElement("h4");
    title.textContent = slide.name;
    const desc = document.createElement("p");
    desc.textContent =
      slide.type === "simple" ? "단순 슬라이드" : slide.type;

    card.appendChild(title);
    card.appendChild(desc);
    slideListContainer.appendChild(card);
  });
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
  console.log("saveCurrentSlide called. currentSlideId:", currentSlideId);
  if (!currentSlideId) {
    console.error("No currentSlideId!");
    return;
  }

  const name = slideNameInput.value.trim();
  console.log("Saving name:", name);

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
      slide.bg = slideBgSelect.value;
      slide.align = slideAlignSelect.value;
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

    // Save full list to server
    console.log("Saving slide data:", slide);
    await saveSlidesToServer();

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
          align: slide.align
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
    await fetch(`/api/slides/${currentSlideId}`, { method: 'DELETE' });
    // Refresh
    await loadSlidesFromServer();

    currentSlideId = null;
    hasUnsavedChanges = false;

    emptyEditorState.style.display = "flex";
    slideEditor.style.display = "none";
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

[
  slideNameInput,
  slideTypeSelect,
  slideContentInput,
  slideFontSelect,
  slideFontSizeSelect,
  slideBgSelect,
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

adBgSourceRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    hasUnsavedChanges = true;
    toggleAdBgMode(e.target.value);
    renderPreview();
  })
});

adBgOpacity.addEventListener('input', () => {
  adBgOpacityValue.textContent = adBgOpacity.value;
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
loadSlidesFromServer();

// Helpers
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지 읽기에 실패했습니다."));
    reader.readAsDataURL(file);
  });
}
