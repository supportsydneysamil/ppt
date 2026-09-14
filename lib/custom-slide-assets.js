import fs from "node:fs/promises";
import path from "node:path";

import { imageSize } from "image-size";

import {
  cloneCustomSlide,
  normalizeCustomSlide,
} from "../public/custom-slide-model.js";

// Re-exported for callers that already reach for the asset module. The function
// itself lives in slide-record.js so the browser bundle never pulls this
// Node-only module (fs, path, image-size) into its graph.
export { customSlideFieldForTemplate } from "./slide-record.js";

// PptxGenJS embeds these three formats byte-for-byte and image-size reports
// reliable pixel dimensions for them. SVG is deliberately excluded: PowerPoint
// rasterizes it inconsistently and its intrinsic size is often unset.
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// image-size reports jpeg as "jpg"; both the declared mime type and the file
// extension are folded into these same keys before comparison.
const MIME_TO_FORMAT = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const EXTENSION_TO_FORMAT = new Map([
  [".png", "png"],
  [".jpg", "jpg"],
  [".jpeg", "jpg"],
  [".webp", "webp"],
]);

export const SUPPORTED_CUSTOM_IMAGE_MIME_TYPES = [...SUPPORTED_IMAGE_MIME_TYPES];

export function isSupportedCustomImageUpload(file) {
  if (!file || typeof file !== "object") {
    return false;
  }

  const mimeType = String(file.mimetype || "").split(";")[0].trim().toLowerCase();
  const extension = path.extname(String(file.originalname || "")).toLowerCase();

  return (
    SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) &&
    SUPPORTED_IMAGE_EXTENSIONS.has(extension)
  );
}

/**
 * Upload sources the model considers safe, in first-use order, deduplicated.
 * Deliberately not gated on `type`: a record whose type moved away from custom
 * still owns its pictures until the record itself is deleted.
 */
export function collectCustomSlideImageSrcs(slide) {
  if (!slide?.customSlide) {
    return [];
  }

  const customSlide = normalizeCustomSlide(slide.customSlide);
  const srcs = new Set();
  for (const element of customSlide.elements) {
    if (element.type === "image" && element.src) {
      srcs.add(element.src);
    }
  }
  return [...srcs];
}

/**
 * Copies a custom slide for a template: every element gets a fresh id and every
 * distinct image gets its own copy on disk, so deleting either slide can never
 * take the other's pictures with it.
 */
export async function cloneCustomSlideAssets(customSlide, cloneAsset) {
  const cloned = cloneCustomSlide(customSlide);
  const clonedSrcs = new Map();

  for (const element of cloned.elements) {
    if (element.type !== "image" || !element.src) {
      continue;
    }
    if (!clonedSrcs.has(element.src)) {
      clonedSrcs.set(element.src, (await cloneAsset(element.src)) || element.src);
    }
    element.src = clonedSrcs.get(element.src);
  }

  return normalizeCustomSlide(cloned);
}

/** Resolves `/uploads/...` to an absolute path that provably stays in uploads. */
export function resolveUploadsChildPath(uploadsDir, serverFilePath) {
  if (typeof serverFilePath !== "string" || !serverFilePath.startsWith("/uploads/")) {
    return null;
  }

  const relativePath = serverFilePath.slice("/uploads/".length);
  if (!relativePath || relativePath.includes("\0")) {
    return null;
  }

  const root = path.resolve(uploadsDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

/** Sniffed dimensions plus the real format of the bytes on disk, or null. */
export async function inspectImageFile(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return null;
  }
  try {
    const { width, height, type } = imageSize(await fs.readFile(filePath));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width, height, type };
  } catch {
    return null;
  }
}

export async function readImageDimensions(filePath) {
  const inspected = await inspectImageFile(filePath);
  return inspected ? { width: inspected.width, height: inspected.height } : null;
}

function declaredImageFormat(file) {
  const mimeType = String(file?.mimetype || "").split(";")[0].trim().toLowerCase();
  const extension = path.extname(String(file?.originalname || "")).toLowerCase();
  const fromMime = MIME_TO_FORMAT.get(mimeType);
  const fromExtension = EXTENSION_TO_FORMAT.get(extension);

  return fromMime && fromMime === fromExtension ? fromMime : null;
}

/**
 * Last line of defence for image uploads: the declared type is only a hint, so
 * the stored bytes are sniffed and dimensioned. Anything that fails is removed
 * from disk before the caller answers, so a rejected upload leaves nothing
 * behind for the renderer to find later.
 */
export async function validateUploadedImageBytes(file) {
  const inspected = await inspectImageFile(file?.path);
  const declared = declaredImageFormat(file);

  if (!inspected || !declared || inspected.type !== declared) {
    if (typeof file?.path === "string" && file.path.length > 0) {
      try {
        await fs.unlink(file.path);
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.warn("Failed to remove rejected image upload:", err.message);
        }
      }
    }
    return {
      valid: false,
      error: "이미지 파일이 손상되었거나 확장자와 형식이 일치하지 않습니다.",
    };
  }

  return {
    valid: true,
    dimensions: { width: inspected.width, height: inspected.height },
  };
}

/**
 * Render options for appendCustomSlide. Unsafe sources throw here on purpose:
 * the renderer turns the rejection into a per-image warning instead of losing
 * the whole slide.
 */
export function createCustomSlideRenderOptions({ uploadsDir, onWarning } = {}) {
  return {
    onWarning,
    resolveImagePath(src) {
      const resolved = resolveUploadsChildPath(uploadsDir, src);
      if (!resolved) {
        throw new Error("업로드 폴더 밖의 이미지 경로입니다.");
      }
      return resolved;
    },
    getImageDimensions: readImageDimensions,
  };
}
