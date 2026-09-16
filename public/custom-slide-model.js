import { isThemeId, normalizeThemeRole } from "./custom-slide-themes.js";

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_BACKGROUND = "#ffffff";
const MAX_ZINDEX = 10000;
const MAX_ID_RETRIES = 8;
const MAX_PATH_DECODE_PASSES = 5;
const MAX_ALT_TEXT_LENGTH = 500;

const ELEMENT_TYPES = new Set([
  "text",
  "image",
  "rect",
  "roundRect",
  "ellipse",
  "line",
]);

const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const TEXT_VALIGNS = new Set(["top", "middle", "bottom"]);
const IMAGE_FITS = new Set(["contain", "cover", "stretch"]);

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizeTextAlign(value) {
  return TEXT_ALIGNS.has(value) ? value : "left";
}

function normalizeTextValign(value) {
  return TEXT_VALIGNS.has(value) ? value : "top";
}

function normalizeShadow(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (value.enabled === false) {
    return null;
  }
  const offsetX = finiteNumber(value.offsetX, 0);
  const offsetY = finiteNumber(value.offsetY, 0);
  const blur = clamp(finiteNumber(value.blur, 8), 0, 100);
  if (blur === 0 && offsetX === 0 && offsetY === 0 && value.enabled !== true) {
    return null;
  }
  return {
    color: normalizeColor(value.color, "#000000"),
    blur,
    offsetX,
    offsetY,
    opacity: clamp(finiteNumber(value.opacity, 0.45), 0, 1),
  };
}

export function fabricShadowToPptx(shadow) {
  const normalized = normalizeShadow(shadow);
  if (!normalized) {
    return null;
  }
  const offset = Math.hypot(normalized.offsetX, normalized.offsetY);
  const angle =
    ((Math.atan2(normalized.offsetY, normalized.offsetX) * 180) / Math.PI + 360) % 360;
  return {
    type: "outer",
    color: normalized.color.replace(/^#/, ""),
    blur: normalized.blur,
    offset,
    angle,
    opacity: normalized.opacity,
  };
}

function fabricShadowToModel(shadow) {
  if (!shadow || typeof shadow !== "object") {
    return null;
  }
  return normalizeShadow({
    color: shadow.color,
    blur: shadow.blur,
    offsetX: shadow.offsetX,
    offsetY: shadow.offsetY,
    opacity: shadow.opacity,
    enabled: true,
  });
}

function normalizeImageFit(value) {
  return IMAGE_FITS.has(value) ? value : "contain";
}

function normalizeAltText(value) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_ALT_TEXT_LENGTH)
    : "";
}

function normalizeRotation(value) {
  const rotation = finiteNumber(value, 0);
  return ((rotation % 360) + 360) % 360;
}

function normalizeZIndex(value) {
  return clamp(Math.trunc(finiteNumber(value, 0)), 0, MAX_ZINDEX);
}

function repeatedlyDecode(value) {
  let decoded = value;
  for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
    let next = decoded;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  return decoded;
}

function hasUnsafePathSegment(segment) {
  return segment.length === 0 || segment === "." || segment === "..";
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

function hasUnsafePercentEscapes(value) {
  if (/%(?![0-9A-Fa-f]{2})/.test(value)) {
    return true;
  }

  return /%2[fFeE]|%5[cC]|%2[eE]|%0[0-9a-fA-F]|%1[0-9a-fA-F]|%7[fF]|%25[0-9A-Fa-f]{2}/i.test(value);
}

function splitPathSegments(path) {
  return path.split(/[/\\]/);
}

function pathSegmentsAreSafe(path) {
  return splitPathSegments(path).every((segment) => !hasUnsafePathSegment(segment));
}

function normalizeImageSrc(value) {
  if (typeof value !== "string" || !value.startsWith("/uploads/")) {
    return "";
  }
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("%00")
  ) {
    return "";
  }

  const remainder = value.slice("/uploads/".length);
  if (remainder.length === 0 || remainder.endsWith("/")) {
    return "";
  }

  if (hasUnsafePercentEscapes(remainder) || !pathSegmentsAreSafe(remainder)) {
    return "";
  }

  const decodedRemainder = repeatedlyDecode(remainder);
  if (decodedRemainder === null) {
    return "";
  }

  if (
    decodedRemainder.includes("\\") ||
    hasControlCharacter(decodedRemainder) ||
    hasUnsafePercentEscapes(decodedRemainder) ||
    !pathSegmentsAreSafe(decodedRemainder)
  ) {
    return "";
  }

  return value;
}

function snapCoordinate(value) {
  return Math.round(finiteNumber(value, 0) * 1e6) / 1e6;
}

function clampPosition(value, max) {
  return snapCoordinate(clamp(finiteNumber(value, 0), 0, max));
}

function clampSize(value, fallback, max) {
  if (value === Number.POSITIVE_INFINITY) {
    return max;
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return 0;
  }
  return clamp(finiteNumber(value, fallback), 0, max);
}

function getRotatedCorners(x, y, width, height, rotation) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const points = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return points.map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  });
}

function getAxisAlignedBounds(corners) {
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function rotatedBounds(x, y, width, height, rotation) {
  return getAxisAlignedBounds(getRotatedCorners(x, y, width, height, rotation));
}

function fitRotatedBoxInCanvas(x, y, width, height, rotation, canvasWidth, canvasHeight) {
  let boxX = finiteNumber(x, 0);
  let boxY = finiteNumber(y, 0);
  let boxWidth = Math.max(0, finiteNumber(width, 0));
  let boxHeight = Math.max(0, finiteNumber(height, 0));
  const margin = 0.01;

  if (boxWidth === 0 && boxHeight === 0) {
    return {
      x: clampPosition(boxX, canvasWidth),
      y: clampPosition(boxY, canvasHeight),
      width: 0,
      height: 0,
    };
  }

  if (normalizeRotation(rotation) === 0) {
    boxX = clampPosition(boxX, canvasWidth);
    boxY = clampPosition(boxY, canvasHeight);
    boxWidth = clampSize(boxWidth, 0, canvasWidth - boxX);
    boxHeight = clampSize(boxHeight, 0, canvasHeight - boxY);
    return {
      x: snapCoordinate(boxX),
      y: snapCoordinate(boxY),
      width: snapCoordinate(boxWidth),
      height: snapCoordinate(boxHeight),
    };
  }

  for (let iteration = 0; iteration < 32; iteration += 1) {
    let bounds = rotatedBounds(boxX, boxY, boxWidth, boxHeight, rotation);
    const fits =
      bounds.minX >= 0 &&
      bounds.minY >= 0 &&
      bounds.maxX <= canvasWidth &&
      bounds.maxY <= canvasHeight;

    if (fits) {
      break;
    }

    const aabbWidth = Math.max(bounds.maxX - bounds.minX, margin);
    const aabbHeight = Math.max(bounds.maxY - bounds.minY, margin);

    if (aabbWidth > canvasWidth - margin || aabbHeight > canvasHeight - margin) {
      const scale = Math.min(
        (canvasWidth - margin) / aabbWidth,
        (canvasHeight - margin) / aabbHeight,
        1
      );
      boxWidth = snapCoordinate(boxWidth * scale);
      boxHeight = snapCoordinate(boxHeight * scale);
      bounds = rotatedBounds(boxX, boxY, boxWidth, boxHeight, rotation);
    }

    if (bounds.minX < margin) {
      boxX += margin - bounds.minX;
    }
    if (bounds.minY < margin) {
      boxY += margin - bounds.minY;
    }

    bounds = rotatedBounds(boxX, boxY, boxWidth, boxHeight, rotation);
    if (bounds.maxX > canvasWidth - margin) {
      boxX -= bounds.maxX - (canvasWidth - margin);
    }
    if (bounds.maxY > canvasHeight - margin) {
      boxY -= bounds.maxY - (canvasHeight - margin);
    }
  }

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const corners = getRotatedCorners(boxX, boxY, boxWidth, boxHeight, rotation);
    const minX = Math.min(...corners.map((point) => point.x));
    const maxX = Math.max(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxY = Math.max(...corners.map((point) => point.y));

    if (minX >= 0 && minY >= 0 && maxX <= canvasWidth && maxY <= canvasHeight) {
      break;
    }

    if (minX < 0) {
      boxX += -minX + 1e-6;
    }
    if (minY < 0) {
      boxY += -minY + 1e-6;
    }
    if (maxX > canvasWidth) {
      boxX -= maxX - canvasWidth + 1e-6;
    }
    if (maxY > canvasHeight) {
      boxY -= maxY - canvasHeight + 1e-6;
    }
  }

  return {
    x: snapCoordinate(boxX),
    y: snapCoordinate(boxY),
    width: snapCoordinate(boxWidth),
    height: snapCoordinate(boxHeight),
  };
}

function normalizeBoxGeometry(element, canvasWidth, canvasHeight) {
  const fitted = fitRotatedBoxInCanvas(
    element.x,
    element.y,
    element.width,
    element.height,
    element.rotation,
    canvasWidth,
    canvasHeight
  );

  return {
    ...element,
    x: fitted.x,
    y: fitted.y,
    width: fitted.width,
    height: fitted.height,
  };
}

function normalizeCommonFields(element, index, canvasWidth, canvasHeight) {
  const x = finiteNumber(element.x, 0);
  const y = finiteNumber(element.y, 0);
  const width = clampSize(element.width, 0, canvasWidth);
  const height = clampSize(element.height, 0, canvasHeight);

  const common = {
    id:
      typeof element.id === "string" && element.id.length > 0
        ? element.id
        : `element-${index}`,
    type: element.type,
    x,
    y,
    width,
    height,
    rotation: normalizeRotation(element.rotation),
    opacity: clamp(finiteNumber(element.opacity, 1), 0, 1),
    zIndex: normalizeZIndex(element.zIndex),
    visible: element.visible !== false,
    locked: Boolean(element.locked),
    shadow: normalizeShadow(element.shadow),
    ...themeRoleFields(element),
  };

  return normalizeBoxGeometry(common, canvasWidth, canvasHeight);
}

function themeRoleFields(element) {
  const themeRole = normalizeThemeRole(element.themeRole);
  const themeStrokeRole = normalizeThemeRole(element.themeStrokeRole);
  return {
    ...(themeRole ? { themeRole } : {}),
    ...(themeStrokeRole ? { themeStrokeRole } : {}),
  };
}

function normalizeTextElement(element, index, canvasWidth, canvasHeight) {
  const common = normalizeCommonFields(element, index, canvasWidth, canvasHeight);
  return {
    ...common,
    text: typeof element.text === "string" ? element.text : "",
    fontFamily:
      typeof element.fontFamily === "string" && element.fontFamily.length > 0
        ? element.fontFamily
        : "Arial",
    fontSize: clamp(finiteNumber(element.fontSize, 24), 1, 512),
    fontWeight:
      element.fontWeight === undefined || element.fontWeight === null
        ? "normal"
        : String(element.fontWeight),
    color: normalizeColor(element.color, "#000000"),
    textAlign: normalizeTextAlign(element.textAlign),
    valign: normalizeTextValign(element.valign),
    italic: Boolean(element.italic),
    underline: Boolean(element.underline),
    lineHeight: clamp(finiteNumber(element.lineHeight, 1.16), 0.8, 3),
    charSpacing: clamp(finiteNumber(element.charSpacing, 0), -50, 200),
  };
}

function normalizeImageElement(element, index, canvasWidth, canvasHeight) {
  const common = normalizeCommonFields(element, index, canvasWidth, canvasHeight);
  return {
    ...common,
    src: normalizeImageSrc(element.src),
    fit: normalizeImageFit(element.fit),
    flipH: Boolean(element.flipH),
    flipV: Boolean(element.flipV),
    altText: normalizeAltText(element.altText),
    focalX: clamp(finiteNumber(element.focalX, 0.5), 0, 1),
    focalY: clamp(finiteNumber(element.focalY, 0.5), 0, 1),
    imageZoom: clamp(finiteNumber(element.imageZoom, 1), 1, 3),
  };
}

function normalizeShapeElement(element, index, canvasWidth, canvasHeight) {
  const common = normalizeCommonFields(element, index, canvasWidth, canvasHeight);
  return {
    ...common,
    fill: normalizeColor(element.fill, "#cccccc"),
    stroke: typeof element.stroke === "string" ? element.stroke : "",
    strokeWidth: clamp(finiteNumber(element.strokeWidth, 0), 0, 100),
  };
}

function normalizeRoundRectElement(element, index, canvasWidth, canvasHeight) {
  const shape = normalizeShapeElement(element, index, canvasWidth, canvasHeight);
  return {
    ...shape,
    rx: clamp(
      finiteNumber(element.rx, 0),
      0,
      Math.min(shape.width, shape.height) / 2
    ),
  };
}

function normalizeLineElement(element, index, canvasWidth, canvasHeight) {
  return {
    id:
      typeof element.id === "string" && element.id.length > 0
        ? element.id
        : `element-${index}`,
    type: "line",
    x: clampPosition(element.x, canvasWidth),
    y: clampPosition(element.y, canvasHeight),
    width: 0,
    height: 0,
    rotation: 0,
    opacity: clamp(finiteNumber(element.opacity, 1), 0, 1),
    zIndex: normalizeZIndex(element.zIndex),
    x2: clampPosition(element.x2, canvasWidth),
    y2: clampPosition(element.y2, canvasHeight),
    stroke: typeof element.stroke === "string" ? element.stroke : "#000000",
    strokeWidth: clamp(finiteNumber(element.strokeWidth, 1), 0, 100),
    visible: element.visible !== false,
    locked: Boolean(element.locked),
    shadow: normalizeShadow(element.shadow),
    ...themeRoleFields(element),
  };
}

function normalizeElement(element, index, canvasWidth, canvasHeight) {
  if (!element || typeof element !== "object" || !ELEMENT_TYPES.has(element.type)) {
    return null;
  }

  switch (element.type) {
    case "text":
      return normalizeTextElement(element, index, canvasWidth, canvasHeight);
    case "image":
      return normalizeImageElement(element, index, canvasWidth, canvasHeight);
    case "rect":
      return normalizeShapeElement(element, index, canvasWidth, canvasHeight);
    case "roundRect":
      return normalizeRoundRectElement(element, index, canvasWidth, canvasHeight);
    case "ellipse":
      return normalizeShapeElement(element, index, canvasWidth, canvasHeight);
    case "line":
      return normalizeLineElement(element, index, canvasWidth, canvasHeight);
    default:
      return null;
  }
}

export function createDefaultCustomSlide() {
  return {
    version: 1,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    background: { color: DEFAULT_BACKGROUND },
    elements: [],
  };
}

export function normalizeCustomSlide(input) {
  const source = input && typeof input === "object" ? input : {};
  const width = DEFAULT_WIDTH;
  const height = DEFAULT_HEIGHT;
  const elements = Array.isArray(source.elements) ? source.elements : [];

  const normalizedElements = elements
    .map((element, index) => {
      const normalized = normalizeElement(element, index, width, height);
      return normalized ? { ...normalized, __index: index } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.zIndex - b.zIndex || a.__index - b.__index)
    .map(({ __index, ...element }, index) => ({
      ...element,
      zIndex: index,
    }));

  const themeId =
    typeof source.themeId === "string" && source.themeId
      ? isThemeId(source.themeId)
        ? source.themeId
        : "native"
      : undefined;
  const templateId =
    typeof source.templateId === "string" && source.templateId ? source.templateId : undefined;

  return {
    version: 1,
    width,
    height,
    background: {
      color: normalizeColor(source.background?.color, DEFAULT_BACKGROUND),
    },
    ...(themeId ? { themeId } : {}),
    ...(templateId ? { templateId } : {}),
    elements: normalizedElements,
  };
}

function defaultIdFactory() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `element-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createUniqueIdFactory(sourceIds, idFactory = defaultIdFactory) {
  const used = new Set(sourceIds);
  const factory = typeof idFactory === "function" ? idFactory : defaultIdFactory;

  return function nextUniqueId() {
    for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt += 1) {
      const candidate = factory();
      if (typeof candidate === "string" && candidate.length > 0 && !used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }

    let fallback = defaultIdFactory();
    while (used.has(fallback)) {
      fallback = defaultIdFactory();
    }
    used.add(fallback);
    return fallback;
  };
}

export function cloneCustomSlide(input, idFactory = defaultIdFactory) {
  const normalized = normalizeCustomSlide(input);
  const nextId = createUniqueIdFactory(
    normalized.elements.map((element) => element.id),
    idFactory
  );

  return normalizeCustomSlide({
    ...normalized,
    elements: normalized.elements.map((element) => ({
      ...element,
      id: nextId(),
    })),
  });
}

function backgroundFabricObject(slide) {
  return {
    type: "rect",
    role: "background",
    left: 0,
    top: 0,
    width: slide.width,
    height: slide.height,
    fill: slide.background.color,
    selectable: false,
    evented: false,
    ...(slide.themeId ? { customThemeId: slide.themeId } : {}),
    ...(slide.templateId ? { customTemplateId: slide.templateId } : {}),
  };
}

export function customSlideToFabricObjects(model) {
  const slide = normalizeCustomSlide(model);
  const objects = [backgroundFabricObject(slide)];

  for (const element of slide.elements) {
    objects.push(elementToFabricObject(element));
  }

  return objects;
}

function elementToFabricObject(element) {
  if (element.type === "line") {
    return {
      type: "line",
      role: "element",
      customElementId: element.id,
      elementType: element.type,
      x1: element.x,
      y1: element.y,
      x2: element.x2,
      y2: element.y2,
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      opacity: element.opacity,
      angle: 0,
      visible: element.visible !== false,
      selectable: !element.locked,
      evented: !element.locked,
      customLocked: Boolean(element.locked),
      customVisible: element.visible !== false,
      shadow: element.shadow,
      ...themeRoleFields(element),
    };
  }

  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const base = {
    customElementId: element.id,
    elementType: element.type,
    left: centerX,
    top: centerY,
    width: element.width,
    height: element.height,
    originX: "center",
    originY: "center",
    angle: element.rotation,
    opacity: element.opacity,
    scaleX: 1,
    scaleY: 1,
    visible: element.visible !== false,
    selectable: !element.locked,
    evented: !element.locked,
    customLocked: Boolean(element.locked),
    customVisible: element.visible !== false,
    shadow: element.shadow,
    ...themeRoleFields(element),
  };

  switch (element.type) {
    case "text":
      return {
        ...base,
        type: "textbox",
        fill: element.color,
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight,
        textAlign: element.textAlign,
        fontStyle: element.italic ? "italic" : "normal",
        underline: Boolean(element.underline),
        lineHeight: element.lineHeight,
        charSpacing: element.charSpacing,
        textAlignVertical: element.valign,
        text: element.text,
      };
    case "image":
      return {
        ...base,
        type: "image",
        src: element.src,
        fit: element.fit,
        flipX: element.flipH,
        flipY: element.flipV,
        customAltText: element.altText,
        customFocalX: element.focalX,
        customFocalY: element.focalY,
        customImageZoom: element.imageZoom,
      };
    case "rect":
      return {
        ...base,
        type: "rect",
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      };
    case "roundRect":
      return {
        ...base,
        type: "rect",
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
        rx: element.rx,
        ry: element.rx,
      };
    case "ellipse":
      return {
        ...base,
        type: "ellipse",
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      };
    default:
      return null;
  }
}

function rotatePoint(x, y, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function originOffsetToCenter(width, height, originX, originY, rawScaleX, rawScaleY) {
  let offsetX = 0;
  let offsetY = 0;

  if (originX === "center") {
    offsetX = 0;
  } else if (originX === "right") {
    offsetX = -width / 2;
  } else if (rawScaleX < 0) {
    offsetX = -width / 2;
  } else {
    offsetX = width / 2;
  }

  if (originY === "center") {
    offsetY = 0;
  } else if (originY === "bottom") {
    offsetY = -height / 2;
  } else if (rawScaleY < 0) {
    offsetY = -height / 2;
  } else {
    offsetY = height / 2;
  }

  return { offsetX, offsetY };
}

function fabricBoxGeometry(object) {
  const rawScaleX = finiteNumber(object.scaleX, 1);
  const rawScaleY = finiteNumber(object.scaleY, 1);
  const absScaleX = Math.abs(rawScaleX);
  const absScaleY = Math.abs(rawScaleY);
  const width = finiteNumber(object.width, 0) * absScaleX;
  const height = finiteNumber(object.height, 0) * absScaleY;
  const left = finiteNumber(object.left, 0);
  const top = finiteNumber(object.top, 0);
  const angle = normalizeRotation(object.angle);
  const originX = object.originX ?? "left";
  const originY = object.originY ?? "top";
  const { offsetX, offsetY } = originOffsetToCenter(
    width,
    height,
    originX,
    originY,
    rawScaleX,
    rawScaleY
  );
  const rotatedOffset = rotatePoint(offsetX, offsetY, angle);
  const centerX = left + rotatedOffset.x;
  const centerY = top + rotatedOffset.y;

  return {
    x: snapCoordinate(centerX - width / 2),
    y: snapCoordinate(centerY - height / 2),
    width,
    height,
    rotation: angle,
    absScaleX,
    absScaleY,
  };
}

function fabricLineGeometry(object) {
  const left = finiteNumber(object.left, 0);
  const top = finiteNumber(object.top, 0);
  const scaleX = finiteNumber(object.scaleX, 1);
  const scaleY = finiteNumber(object.scaleY, 1);
  const angle = finiteNumber(object.angle, 0);
  const x1 = finiteNumber(object.x1, 0) * scaleX;
  const y1 = finiteNumber(object.y1, 0) * scaleY;
  const x2 = finiteNumber(object.x2, 0) * scaleX;
  const y2 = finiteNumber(object.y2, 0) * scaleY;
  const start = rotatePoint(x1, y1, angle);
  const end = rotatePoint(x2, y2, angle);

  return {
    x: snapCoordinate(left + start.x),
    y: snapCoordinate(top + start.y),
    x2: snapCoordinate(left + end.x),
    y2: snapCoordinate(top + end.y),
    rotation: 0,
  };
}

export function fabricObjectsToCustomSlide(objects, base) {
  const slide = normalizeCustomSlide(base ?? createDefaultCustomSlide());
  const sourceObjects = Array.isArray(objects) ? objects : [];

  const background = sourceObjects.find((object) => object?.role === "background");
  if (background && typeof background.fill === "string") {
    slide.background.color = background.fill;
  }
  if (typeof background?.customThemeId === "string" && background.customThemeId) {
    slide.themeId = background.customThemeId;
  }
  if (typeof background?.customTemplateId === "string" && background.customTemplateId) {
    slide.templateId = background.customTemplateId;
  }

  slide.elements = sourceObjects
    .filter((object) => object && object.role !== "background")
    .map((object, index) => fabricObjectToElement(object, index))
    .filter(Boolean);

  return normalizeCustomSlide(slide);
}

function fabricObjectToElement(object, orderIndex) {
  const elementType = object.elementType;
  if (!ELEMENT_TYPES.has(elementType)) {
    return null;
  }

  if (elementType === "line") {
    const geometry = fabricLineGeometry(object);
    return {
      id: object.customElementId,
      type: "line",
      x: geometry.x,
      y: geometry.y,
      width: 0,
      height: 0,
      rotation: 0,
      opacity: finiteNumber(object.opacity, 1),
      zIndex: orderIndex,
      x2: geometry.x2,
      y2: geometry.y2,
      stroke: typeof object.stroke === "string" ? object.stroke : "#000000",
      strokeWidth: finiteNumber(object.strokeWidth, 1),
      visible: object.visible !== false && object.customVisible !== false,
      locked: Boolean(object.customLocked) || object.selectable === false,
      shadow: fabricShadowToModel(object.shadow),
      ...themeRoleFields(object),
    };
  }

  const geometry = fabricBoxGeometry(object);
  const uniformScale = Math.min(
    geometry.absScaleX || 1,
    geometry.absScaleY || 1
  );
  const common = {
    id: object.customElementId,
    type: elementType === "roundRect" ? "roundRect" : elementType,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    rotation: geometry.rotation,
    opacity: finiteNumber(object.opacity, 1),
    zIndex: orderIndex,
    visible: object.visible !== false && object.customVisible !== false,
    locked: Boolean(object.customLocked) || object.selectable === false,
    shadow: fabricShadowToModel(object.shadow),
    ...themeRoleFields(object),
  };

  switch (elementType) {
    case "text":
      return {
        ...common,
        text: typeof object.text === "string" ? object.text : "",
        fontFamily:
          typeof object.fontFamily === "string" && object.fontFamily.length > 0
            ? object.fontFamily
            : "Arial",
        fontSize: finiteNumber(object.fontSize, 24),
        fontWeight:
          object.fontWeight === undefined || object.fontWeight === null
            ? "normal"
            : String(object.fontWeight),
        color: normalizeColor(object.fill, "#000000"),
        textAlign: normalizeTextAlign(object.textAlign),
        valign: normalizeTextValign(object.textAlignVertical),
        italic: object.fontStyle === "italic" || object.italic === true,
        underline: Boolean(object.underline),
        lineHeight: finiteNumber(object.lineHeight, 1.16),
        charSpacing: finiteNumber(object.charSpacing, 0),
      };
    case "image":
      return {
        ...common,
        src: normalizeImageSrc(object.src),
        fit: normalizeImageFit(object.fit),
        flipH: Boolean(object.flipH ?? object.flipX),
        flipV: Boolean(object.flipV ?? object.flipY),
        altText: normalizeAltText(object.altText ?? object.customAltText),
        focalX: clamp(
          finiteNumber(object.focalX ?? object.customFocalX, 0.5),
          0,
          1
        ),
        focalY: clamp(
          finiteNumber(object.focalY ?? object.customFocalY, 0.5),
          0,
          1
        ),
        imageZoom: clamp(
          finiteNumber(object.imageZoom ?? object.customImageZoom, 1),
          1,
          3
        ),
      };
    case "rect":
      return {
        ...common,
        fill: normalizeColor(object.fill, "#cccccc"),
        stroke: typeof object.stroke === "string" ? object.stroke : "",
        strokeWidth: finiteNumber(object.strokeWidth, 0),
      };
    case "roundRect":
      return {
        ...common,
        fill: normalizeColor(object.fill, "#cccccc"),
        stroke: typeof object.stroke === "string" ? object.stroke : "",
        strokeWidth: finiteNumber(object.strokeWidth, 0),
        rx: finiteNumber(object.rx, 0) * uniformScale,
      };
    case "ellipse":
      return {
        ...common,
        fill: normalizeColor(object.fill, "#cccccc"),
        stroke: typeof object.stroke === "string" ? object.stroke : "",
        strokeWidth: finiteNumber(object.strokeWidth, 0),
      };
    default:
      return null;
  }
}
