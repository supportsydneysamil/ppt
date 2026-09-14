import { sanitizeSlideForTemplate } from "./slide-record.js";

export const TEMPLATE_SCHEMA_KIND = "samil-template-schema";
export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_SCHEMA_MIN_VERSION = 1;
export const TEMPLATE_SCHEMA_MAX_VERSION = 1;

export const TEMPLATE_SCHEMA_ERROR = {
  INVALID_JSON: "invalid_json",
  KIND: "kind",
  VERSION_INVALID: "version_invalid",
  VERSION_TOO_NEW: "version_too_new",
  VERSION_TOO_OLD: "version_too_old",
  NAME: "name",
  SLIDES: "slides",
};

export function templateSchemaErrorMessage(code) {
  switch (code) {
    case TEMPLATE_SCHEMA_ERROR.INVALID_JSON:
      return "템플릿 스키마 파일을 읽을 수 없습니다.";
    case TEMPLATE_SCHEMA_ERROR.KIND:
      return "이 파일은 템플릿 스키마가 아닙니다.";
    case TEMPLATE_SCHEMA_ERROR.VERSION_INVALID:
      return "스키마 버전이 올바르지 않습니다.";
    case TEMPLATE_SCHEMA_ERROR.VERSION_TOO_NEW:
      return "앱을 업데이트한 뒤 다시 가져와 주세요.";
    case TEMPLATE_SCHEMA_ERROR.VERSION_TOO_OLD:
      return "너무 오래된 스키마 형식이라 가져올 수 없습니다.";
    case TEMPLATE_SCHEMA_ERROR.NAME:
      return "템플릿 이름이 없습니다.";
    case TEMPLATE_SCHEMA_ERROR.SLIDES:
      return "슬라이드가 없는 스키마는 가져올 수 없습니다.";
    default:
      return "템플릿 스키마를 처리할 수 없습니다.";
  }
}

function isOwnedUploadPath(value) {
  return typeof value === "string" && value.startsWith("/uploads/");
}

function fail(code) {
  return { ok: false, code, message: templateSchemaErrorMessage(code) };
}

function toPortableCustomSlide(customSlide) {
  if (!customSlide || typeof customSlide !== "object") {
    return customSlide ?? null;
  }
  const elements = Array.isArray(customSlide.elements)
    ? customSlide.elements.map((element) => {
        if (element?.type !== "image") {
          return element;
        }
        const src = isOwnedUploadPath(element.src) ? "" : element.src || "";
        return { ...element, src };
      })
    : [];
  return { ...customSlide, elements };
}

export function toPortableSlide(slide) {
  const portable = sanitizeSlideForTemplate(slide || {});
  delete portable.id;
  portable.serverFilePath = null;
  portable.thumbnail = null;
  portable.fileSaved = false;
  portable.adBgImagePath = null;
  if (isOwnedUploadPath(portable.customImageData)) {
    portable.customImageData = null;
  }
  portable.customSlide = toPortableCustomSlide(portable.customSlide);
  return portable;
}

export function toPortableTemplateSchema(template) {
  const slides = Array.isArray(template?.slides)
    ? template.slides.map((slide) => toPortableSlide(slide))
    : [];
  return {
    kind: TEMPLATE_SCHEMA_KIND,
    version: TEMPLATE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    template: {
      name: String(template?.name || "").trim(),
      slides,
    },
  };
}

export function isUnrestorableSlide(slide) {
  if (!slide || typeof slide !== "object") {
    return false;
  }
  const localPptWithoutSource =
    Boolean(slide.fileName) &&
    !slide.originalUrl &&
    (slide.sourceType === "upload" || isOwnedUploadPath(slide.serverFilePath));
  const fileAdBackground =
    slide.adBgSource === "file" || isOwnedUploadPath(slide.adBgImagePath);
  const localCustomImage = isOwnedUploadPath(slide.customImageData);
  const localCanvasImage = Boolean(
    slide.customSlide?.elements?.some(
      (element) =>
        element?.type === "image" &&
        (isOwnedUploadPath(element.src) || element.src === "")
    )
  );
  return Boolean(
    localPptWithoutSource ||
      fileAdBackground ||
      localCustomImage ||
      localCanvasImage
  );
}

export function unrestorableSlideNames(slides) {
  if (!Array.isArray(slides)) {
    return [];
  }
  return slides
    .filter((slide) => isUnrestorableSlide(slide))
    .map((slide) => String(slide.name || "이름 없는 슬라이드"));
}

export function migrateTemplateSchema(doc) {
  // ponytail: identity while MIN === MAX === 1; add N→N+1 branches when version bumps
  let current = doc;
  let version = current.version;
  while (version < TEMPLATE_SCHEMA_VERSION) {
    current = { ...current, version: version + 1 };
    version += 1;
  }
  return current;
}

export function parseTemplateSchema(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail(TEMPLATE_SCHEMA_ERROR.INVALID_JSON);
  }

  if (!parsed || typeof parsed !== "object" || parsed.kind !== TEMPLATE_SCHEMA_KIND) {
    return fail(TEMPLATE_SCHEMA_ERROR.KIND);
  }

  if (!Number.isInteger(parsed.version)) {
    return fail(TEMPLATE_SCHEMA_ERROR.VERSION_INVALID);
  }
  if (parsed.version > TEMPLATE_SCHEMA_MAX_VERSION) {
    return fail(TEMPLATE_SCHEMA_ERROR.VERSION_TOO_NEW);
  }
  if (parsed.version < TEMPLATE_SCHEMA_MIN_VERSION) {
    return fail(TEMPLATE_SCHEMA_ERROR.VERSION_TOO_OLD);
  }

  const migrated = migrateTemplateSchema(parsed);
  const name = String(migrated.template?.name || "").trim();
  const slides = migrated.template?.slides;
  if (!name) {
    return fail(TEMPLATE_SCHEMA_ERROR.NAME);
  }
  if (!Array.isArray(slides) || slides.length === 0) {
    return fail(TEMPLATE_SCHEMA_ERROR.SLIDES);
  }

  const unrestorableNames = unrestorableSlideNames(slides);
  return {
    ok: true,
    schema: {
      kind: TEMPLATE_SCHEMA_KIND,
      version: TEMPLATE_SCHEMA_VERSION,
      exportedAt: migrated.exportedAt,
      template: {
        name,
        slides: slides.map((slide) => toPortableSlide(slide)),
      },
    },
    unrestorableNames,
  };
}

export function templateSchemaFilename(name) {
  const base =
    String(name || "template")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim() || "template";
  return `${base}.samil-template.json`;
}
