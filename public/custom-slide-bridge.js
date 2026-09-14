// Glue between the classic app.js slide workspace and the module-based WYSIWYG
// editor. Everything here is DOM-free so the integration decisions (visibility,
// dirty state, upload validation, load races) are testable without a browser.

import {
  createDefaultCustomSlide,
  normalizeCustomSlide,
} from "./custom-slide-model.js";

const IMAGE_UPLOAD_ENDPOINT = "/api/upload?kind=image";
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SUPPORTED_IMAGE_EXTENSION = /\.(png|jpe?g|webp)$/i;

export function createEmptyCustomSlide() {
  return createDefaultCustomSlide();
}

/** Normalized deep copy; null stays null so non-custom slides stay clean. */
export function copyCustomSlideModel(model) {
  if (model === null || model === undefined) {
    return null;
  }
  return normalizeCustomSlide(model);
}

export function decideCustomVisibility(type) {
  const isCustom = type === "custom";
  return {
    isCustom,
    showCustomWorkspace: isCustom,
    showSlideSettings: !isCustom,
    showPreview: !isCustom,
  };
}

/**
 * A slide that was never saved stays dirty no matter what the canvas says, and
 * a pending rename survives a canvas undo back to its clean baseline.
 */
export function resolveCustomDirtyState({ slideSaved, editorDirty, formDirty }) {
  return !slideSaved || Boolean(editorDirty) || Boolean(formDirty);
}

/**
 * Whether the form fields outside the canvas have drifted from the saved
 * record. The type is only compared when the caller supplies one, so a slide
 * switched to custom stays dirty until it is saved.
 */
export function resolveCustomFormDirty(nameValue, slide, typeValue) {
  if (String(nameValue ?? "").trim() !== String(slide?.name ?? "").trim()) {
    return true;
  }
  if (typeValue === null || typeValue === undefined) {
    return false;
  }
  return String(typeValue).trim() !== String(slide?.type ?? "").trim();
}

/** Number of pictures the server skipped, from the response header. */
export function parseSkippedImageWarnings(headerValue) {
  const count = Number.parseInt(String(headerValue ?? ""), 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * The fields a successful custom save will commit. Nothing is written to the
 * slide record here: the caller commits only once persistence succeeded, so a
 * failed request leaves the original record and its dirty state intact.
 */
export function stageCustomSlideSave({ name, serialized }) {
  return {
    name: String(name ?? "").trim(),
    type: "custom",
    sourceType: "basic",
    saved: true,
    customSlide: copyCustomSlideModel(serialized) ?? createDefaultCustomSlide(),
  };
}

/** The slide list as it will look once `staged` is committed. */
export function withStagedSlide(slides, slideId, staged) {
  return (Array.isArray(slides) ? slides : []).map((slide) =>
    slide?.id === slideId ? { ...slide, ...staged } : slide
  );
}

export function validateCustomImageFile(file) {
  if (!file) {
    return { valid: false, error: "이미지 파일을 선택하세요." };
  }

  const type = String(file.type || "").split(";")[0].trim().toLowerCase();
  const name = String(file.name || "");

  if (type === "image/svg+xml" || /\.svg$/i.test(name)) {
    return {
      valid: false,
      error: "SVG 이미지는 지원하지 않습니다. PNG, JPEG, WebP 파일을 사용하세요.",
    };
  }
  // A blank type is rejected here too, so the client agrees with the server
  // instead of letting an unlabelled file through to a 400.
  if (!SUPPORTED_IMAGE_EXTENSION.test(name) || !SUPPORTED_IMAGE_MIME_TYPES.has(type)) {
    return {
      valid: false,
      error: "PNG, JPEG, WebP 이미지만 추가할 수 있습니다.",
    };
  }

  return { valid: true };
}

/**
 * Uploads through the existing /api/upload route, marked so the server applies
 * image-only validation without changing PPT/PPTX uploads.
 */
export async function uploadCustomImage(file, options = {}) {
  const { fetchImpl = globalThis.fetch, endpoint = IMAGE_UPLOAD_ENDPOINT } = options;
  const validation = validateCustomImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const body = new FormData();
  body.append("file", file);

  const response = await fetchImpl(endpoint, { method: "POST", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "이미지 업로드에 실패했습니다.");
  }

  const payload = await response.json();
  if (typeof payload?.path !== "string" || !payload.path.startsWith("/uploads/")) {
    throw new Error("업로드 경로가 올바르지 않습니다.");
  }
  return payload.path;
}

export function customSlideDownloadFilename(slideName) {
  const trimmed = String(slideName ?? "").trim();
  return `${trimmed || "custom_slide"}.pptx`;
}

/**
 * Owns the single editor instance shared by every custom slide. Loads are
 * generation-stamped: a slow render for a slide the user already left resolves
 * without touching state, so one slide can never adopt another's canvas.
 */
export function createCustomEditorSession(options = {}) {
  const { root, createEditor, uploadImage, onChange, onError } = options;

  let editorPromise = null;
  let editor = null;
  let generation = 0;
  let activeSlideId = null;
  let loadDepth = 0;

  function ensureEditor() {
    if (!editorPromise) {
      editorPromise = (async () =>
        createEditor(root, {
          uploadImage,
          onChange(model, meta) {
            // Loads notify too; the caller decides that state explicitly.
            if (loadDepth > 0) {
              return;
            }
            onChange?.({
              slideId: activeSlideId,
              model,
              dirty: Boolean(meta?.dirty),
            });
          },
          onError(message, cause) {
            onError?.(message, cause);
          },
        }))().then(
        (instance) => {
          editor = instance;
          return instance;
        },
        (error) => {
          // Let a later attempt retry instead of caching the failure forever.
          editorPromise = null;
          throw error;
        }
      );
    }
    return editorPromise;
  }

  async function showSlide(slideId, model, { markSaved = true } = {}) {
    const token = (generation += 1);
    // Mid-load the canvas belongs to nobody: the outgoing slide must not be
    // serialized or marked saved from a canvas that is being overwritten.
    activeSlideId = null;

    let instance;
    try {
      instance = await ensureEditor();
      if (token !== generation) {
        return { applied: false };
      }

      loadDepth += 1;
      try {
        await instance.load(model ?? createDefaultCustomSlide(), { markSaved });
      } finally {
        loadDepth -= 1;
      }
    } catch (error) {
      if (token === generation) {
        activeSlideId = null;
      }
      throw error;
    }

    if (token !== generation) {
      return { applied: false };
    }

    activeSlideId = slideId;
    return { applied: true, dirty: instance.isDirty() };
  }

  function ownsSlide(slideId) {
    return Boolean(editor) && slideId !== undefined && slideId === activeSlideId;
  }

  return {
    ensureEditor,
    showSlide,
    get activeSlideId() {
      return activeSlideId;
    },
    get editor() {
      return editor;
    },
    isReady() {
      return Boolean(editor);
    },
    isActive(slideId) {
      return ownsSlide(slideId);
    },
    isDirty() {
      return editor ? editor.isDirty() : false;
    },
    serialize(slideId) {
      if (!ownsSlide(slideId)) {
        return null;
      }
      return editor.serialize();
    },
    async reset(slideId) {
      if (!ownsSlide(slideId)) {
        return false;
      }
      await editor.reset();
      return ownsSlide(slideId);
    },
    markSaved(slideId) {
      if (!ownsSlide(slideId)) {
        return;
      }
      editor.markSaved();
    },
    /** Detach from the slide being left without tearing the editor down. */
    release() {
      generation += 1;
      activeSlideId = null;
    },
  };
}
