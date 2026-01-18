const testamentSelect = document.getElementById("testament");
const bookSelect = document.getElementById("book");
const chapterInput = document.getElementById("chapter");
const startInput = document.getElementById("startVerse");
const endInput = document.getElementById("endVerse");
const langKo = document.getElementById("langKo");
const langEn = document.getElementById("langEn");
const form = document.getElementById("verseForm");
const outputText = document.getElementById("outputText");
const source = document.getElementById("source");
const downloadBtn = document.getElementById("downloadBtn");
const downloadPptxBtn = document.getElementById("downloadPptxBtn");

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
  if (langKo.checked) {
    languages.push("ko");
  }
  if (langEn.checked) {
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

  if (!langKo.checked && !langEn.checked) {
    outputText.textContent = "언어를 하나 이상 선택하세요.";
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
  } catch (err) {
    outputText.textContent = "네트워크 오류가 발생했습니다.";
  }
}

function formatOutput(linesByLang) {
  const sections = [];
  if (linesByLang.ko && linesByLang.ko.length) {
    sections.push("[한글 (RNKSV)]");
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

testamentSelect.addEventListener("change", renderBooks);
form.addEventListener("submit", handleSubmit);
downloadBtn.addEventListener("click", handleDownload);
downloadPptxBtn.addEventListener("click", handlePptxDownload);

loadBooks().catch(() => {
  outputText.textContent = "도서 목록을 불러오지 못했습니다.";
});

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
    const params = buildParams();
    const resp = await fetch(`/api/pptx?${params.toString()}`);
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
    outputText.textContent = "PPTX 다운로드 중 오류가 발생했습니다.";
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
  if (langKo.checked && langEn.checked) {
    return "KO-EN";
  }
  if (langKo.checked) {
    return "KO";
  }
  if (langEn.checked) {
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
