// Pure template mutations. Each one owns exactly one scope: a slide's content,
// or the template's membership, order and name. Nothing here touches disk, so
// the routes in server.js stay thin and every rule below is unit tested.
import { collectCustomSlideImageSrcs } from "./custom-slide-assets.js";
import { createDuplicateSlideName } from "./slide-duplicate.js";
import { sanitizeSlideForTemplate } from "./slide-record.js";

function failure(status, error) {
  return { ok: false, status, error };
}

function withSlides(template, slides) {
  return {
    ok: true,
    template: { ...template, slideCount: slides.length, slides },
  };
}

/** Last-write stamp. createdAt stays on the original record. */
export function touchTemplate(template, at = new Date().toISOString()) {
  return { ...template, updatedAt: at };
}

/**
 * Insert a clone immediately after the source. Name uniquifying and the
 * supplied slide copies are the only differences; the original record stays
 * as it was so deleting one template cannot take the other's files.
 */
export function duplicateTemplate(templates, templateId, { id, now, slides }) {
  const index = templates.findIndex((entry) => entry.id === templateId);
  if (index === -1) {
    return failure(404, "Template not found");
  }

  const source = templates[index];
  const template = {
    id,
    name: createDuplicateSlideName(
      source.name,
      templates.map((entry) => entry.name)
    ),
    createdAt: now,
    updatedAt: now,
    slideCount: (slides || []).length,
    slides,
  };

  return {
    ok: true,
    template,
    templates: [
      ...templates.slice(0, index + 1),
      template,
      ...templates.slice(index + 1),
    ],
  };
}

/**
 * Every upload a slide owns. Deliberately not gated on `type`, matching
 * `collectCustomSlideImageSrcs`: a record that moved away from custom still
 * points at its pictures.
 */
export function collectSlideAssetPaths(slide) {
  return [
    ...new Set(
      [
        slide?.serverFilePath,
        slide?.thumbnail,
        slide?.adBgImagePath,
        ...collectCustomSlideImageSrcs(slide),
      ].filter(Boolean)
    ),
  ];
}

/**
 * Uploads the previous slides referenced and the next ones no longer do. Covers
 * both a removed slide and a surviving slide whose file was replaced, and never
 * reports a path another remaining slide still renders.
 */
export function collectOrphanedAssets(previousSlides, nextSlides) {
  const kept = new Set(
    (nextSlides || []).flatMap((slide) => collectSlideAssetPaths(slide))
  );
  const orphaned = new Set();

  for (const slide of previousSlides || []) {
    for (const assetPath of collectSlideAssetPaths(slide)) {
      if (!kept.has(assetPath)) {
        orphaned.add(assetPath);
      }
    }
  }

  return [...orphaned];
}

/**
 * Slide-level write. The addressed id wins over whatever the payload carries,
 * so a request can never be pointed at a neighbouring slide.
 */
export function replaceTemplateSlide(template, slideId, slide) {
  const slides = template.slides || [];
  const index = slides.findIndex((entry) => entry.id === slideId);
  if (index === -1) {
    return failure(404, "템플릿에 없는 슬라이드입니다.");
  }

  const nextSlide = { ...sanitizeSlideForTemplate(slide || {}), id: slideId };
  return withSlides(
    template,
    slides.map((entry, entryIndex) => (entryIndex === index ? nextSlide : entry))
  );
}

/** Template-level write: one new member at one position. */
export function insertTemplateSlide(template, slide, index) {
  if (!slide?.id) {
    return failure(400, "슬라이드 id가 필요합니다.");
  }

  const slides = template.slides || [];
  if (slides.some((entry) => entry.id === slide.id)) {
    return failure(409, "이미 템플릿에 있는 슬라이드입니다.");
  }

  const position = Number.isInteger(index)
    ? Math.max(0, Math.min(index, slides.length))
    : slides.length;
  const next = slides.slice();
  next.splice(position, 0, sanitizeSlideForTemplate(slide));
  return withSlides(template, next);
}

/** Template-level write: drop members. Unknown ids are ignored. */
export function removeTemplateSlides(template, ids) {
  const removable = Array.isArray(ids) ? ids : [];
  if (removable.length === 0) {
    return failure(400, "삭제할 슬라이드를 지정해 주세요.");
  }

  const slides = template.slides || [];
  const targets = new Set(removable);
  const next = slides.filter((entry) => !targets.has(entry.id));
  if (next.length === slides.length) {
    return failure(404, "템플릿에 없는 슬라이드입니다.");
  }

  return withSlides(template, next);
}

/**
 * Template-level write: order only. The payload has to be a permutation of the
 * ids already stored, so this endpoint can never add or drop a slide.
 */
export function applyTemplateSlideOrder(template, slideIds) {
  if (!Array.isArray(slideIds)) {
    return failure(400, "슬라이드 순서 목록이 필요합니다.");
  }

  const slides = template.slides || [];
  const byId = new Map(slides.map((entry) => [entry.id, entry]));
  const requested = new Set(slideIds);
  if (
    slideIds.length !== slides.length ||
    requested.size !== slideIds.length ||
    slideIds.some((id) => !byId.has(id))
  ) {
    return failure(400, "슬라이드 순서가 현재 템플릿과 맞지 않습니다.");
  }

  return withSlides(
    template,
    slideIds.map((id) => byId.get(id))
  );
}
