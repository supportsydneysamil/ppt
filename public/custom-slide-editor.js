import {
  cloneCustomSlide,
  createDefaultCustomSlide,
  fabricObjectsToCustomSlide,
  normalizeCustomSlide,
} from "./custom-slide-model.js";
import { createCustomSlideHistory } from "./custom-slide-history.js";
import {
  applyTheme,
  CUSTOM_SLIDE_THEMES,
  isThemeId,
  nativePaletteFromDefinition,
  resolvePalette,
} from "./custom-slide-themes.js";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const NUDGE_SMALL = 1;
export const NUDGE_LARGE = 10;

const SNAP_THRESHOLD = 8;
const HISTORY_DEBOUNCE_MS = 220;
const PASTE_OFFSET = 24;
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const TEMPLATE_DEFINITIONS = [
  {
    id: "blank",
    label: "빈 슬라이드",
    elements: [],
  },
  {
    id: "title-hero",
    label: "타이틀 히어로",
    background: "#0f172a",
    elements: [
      {
        id: "title-hero-band",
        type: "rect",
        x: 0,
        y: 232,
        width: 1280,
        height: 256,
        fill: "#1d4ed8",
        stroke: "",
        strokeWidth: 0,
        opacity: 0.9,
        themeRole: "accent",
      },
      {
        id: "title-hero-title",
        type: "text",
        x: 140,
        y: 268,
        width: 1000,
        height: 110,
        text: "제목을 입력하세요",
        fontFamily: "Malgun Gothic",
        fontSize: 72,
        fontWeight: "bold",
        color: "#ffffff",
        textAlign: "center",
        themeRole: "title",
      },
      {
        id: "title-hero-subtitle",
        type: "text",
        x: 240,
        y: 392,
        width: 800,
        height: 60,
        text: "부제목 또는 날짜",
        fontFamily: "Malgun Gothic",
        fontSize: 32,
        fontWeight: "normal",
        color: "#dbeafe",
        textAlign: "center",
        themeRole: "muted",
      },
    ],
  },
  {
    id: "split-photo",
    label: "좌우 분할 (사진)",
    background: "#ffffff",
    elements: [
      {
        id: "split-photo-panel",
        type: "rect",
        x: 0,
        y: 0,
        width: 560,
        height: 720,
        fill: "#e2e8f0",
        stroke: "",
        strokeWidth: 0,
        themeRole: "surface",
      },
      {
        id: "split-photo-hint",
        type: "text",
        x: 80,
        y: 320,
        width: 400,
        height: 80,
        text: "이미지를 추가하세요",
        fontFamily: "Malgun Gothic",
        fontSize: 28,
        fontWeight: "normal",
        color: "#64748b",
        textAlign: "center",
        themeRole: "muted",
      },
      {
        id: "split-photo-title",
        type: "text",
        x: 640,
        y: 220,
        width: 560,
        height: 100,
        text: "소제목",
        fontFamily: "Malgun Gothic",
        fontSize: 56,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "split-photo-body",
        type: "text",
        x: 640,
        y: 340,
        width: 560,
        height: 200,
        text: "본문 내용을 입력하세요.",
        fontFamily: "Malgun Gothic",
        fontSize: 28,
        fontWeight: "normal",
        color: "#334154",
        textAlign: "left",
        themeRole: "body",
      },
    ],
  },
  {
    id: "quote-card",
    label: "인용 카드",
    background: "#f8fafc",
    elements: [
      {
        id: "quote-card-frame",
        type: "roundRect",
        x: 140,
        y: 120,
        width: 1000,
        height: 480,
        rx: 32,
        fill: "#ffffff",
        stroke: "#cbd5e1",
        strokeWidth: 3,
        themeRole: "surface",
        themeStrokeRole: "stroke",
      },
      {
        id: "quote-card-accent",
        type: "rect",
        x: 200,
        y: 200,
        width: 96,
        height: 8,
        fill: "#2563eb",
        stroke: "",
        strokeWidth: 0,
        themeRole: "accent",
      },
      {
        id: "quote-card-quote",
        type: "text",
        x: 200,
        y: 248,
        width: 880,
        height: 200,
        text: "인용문을 입력하세요.",
        fontFamily: "Malgun Gothic",
        fontSize: 40,
        fontWeight: "normal",
        color: "#111827",
        textAlign: "left",
        themeRole: "body",
      },
      {
        id: "quote-card-author",
        type: "text",
        x: 200,
        y: 480,
        width: 880,
        height: 60,
        text: "- 출처",
        fontFamily: "Malgun Gothic",
        fontSize: 26,
        fontWeight: "normal",
        color: "#64748b",
        textAlign: "right",
        themeRole: "muted",
      },
    ],
  },
  {
    id: "agenda-list",
    label: "예배 순서",
    background: "#ffffff",
    elements: [
      {
        id: "agenda-list-title",
        type: "text",
        x: 120,
        y: 96,
        width: 1040,
        height: 90,
        text: "예배 순서",
        fontFamily: "Malgun Gothic",
        fontSize: 60,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "agenda-list-rule",
        type: "line",
        x: 120,
        y: 200,
        x2: 1160,
        y2: 200,
        stroke: "#2563eb",
        strokeWidth: 4,
        themeRole: "accent",
      },
      {
        id: "agenda-list-body",
        type: "text",
        x: 120,
        y: 248,
        width: 1040,
        height: 360,
        text: "1. 첫 번째 순서\n2. 두 번째 순서\n3. 세 번째 순서",
        fontFamily: "Malgun Gothic",
        fontSize: 36,
        fontWeight: "normal",
        color: "#1f2937",
        textAlign: "left",
        themeRole: "body",
      },
    ],
  },
  {
    id: "scripture",
    label: "성경 본문",
    background: "#ffffff",
    elements: [
      {
        id: "scripture-rule",
        type: "rect",
        x: 120,
        y: 140,
        width: 8,
        height: 440,
        fill: "#2563eb",
        stroke: "",
        strokeWidth: 0,
        themeRole: "accent",
      },
      {
        id: "scripture-verse",
        type: "text",
        x: 168,
        y: 160,
        width: 980,
        height: 360,
        text: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라",
        fontFamily: "Malgun Gothic",
        fontSize: 36,
        fontWeight: "normal",
        color: "#111827",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "scripture-ref",
        type: "text",
        x: 168,
        y: 540,
        width: 980,
        height: 48,
        text: "요한복음 3:16",
        fontFamily: "Malgun Gothic",
        fontSize: 24,
        fontWeight: "normal",
        color: "#64748b",
        textAlign: "left",
        themeRole: "muted",
      },
    ],
  },
  {
    id: "lyrics",
    label: "찬양 가사",
    background: "#0f172a",
    elements: [
      {
        id: "lyrics-song",
        type: "text",
        x: 140,
        y: 72,
        width: 1000,
        height: 48,
        text: "곡 제목",
        fontFamily: "Malgun Gothic",
        fontSize: 22,
        fontWeight: "normal",
        color: "#93b4fc",
        textAlign: "center",
        themeRole: "muted",
      },
      {
        id: "lyrics-body",
        type: "text",
        x: 140,
        y: 220,
        width: 1000,
        height: 360,
        text: "가사를 입력하세요\n두 번째 줄",
        fontFamily: "Malgun Gothic",
        fontSize: 48,
        fontWeight: "bold",
        color: "#ffffff",
        textAlign: "center",
        themeRole: "title",
      },
    ],
  },
  {
    id: "sermon-title",
    label: "설교 제목",
    background: "#0f172a",
    elements: [
      {
        id: "sermon-title-kicker",
        type: "text",
        x: 140,
        y: 176,
        width: 1000,
        height: 40,
        text: "시리즈 이름",
        fontFamily: "Malgun Gothic",
        fontSize: 20,
        fontWeight: "normal",
        color: "#93b4fc",
        textAlign: "left",
        themeRole: "muted",
      },
      {
        id: "sermon-title-bar",
        type: "rect",
        x: 140,
        y: 232,
        width: 72,
        height: 6,
        fill: "#1d4ed8",
        stroke: "",
        strokeWidth: 0,
        themeRole: "accent",
      },
      {
        id: "sermon-title-heading",
        type: "text",
        x: 140,
        y: 260,
        width: 1000,
        height: 160,
        text: "설교 제목",
        fontFamily: "Malgun Gothic",
        fontSize: 56,
        fontWeight: "bold",
        color: "#ffffff",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "sermon-title-meta",
        type: "text",
        x: 140,
        y: 448,
        width: 1000,
        height: 48,
        text: "본문 · 설교자",
        fontFamily: "Malgun Gothic",
        fontSize: 24,
        fontWeight: "normal",
        color: "#dbeafe",
        textAlign: "left",
        themeRole: "body",
      },
    ],
  },
  {
    id: "sermon-points",
    label: "설교 요점",
    background: "#ffffff",
    elements: [
      {
        id: "sermon-points-title",
        type: "text",
        x: 120,
        y: 80,
        width: 1040,
        height: 72,
        text: "오늘의 말씀",
        fontFamily: "Malgun Gothic",
        fontSize: 48,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "sermon-points-body",
        type: "text",
        x: 120,
        y: 180,
        width: 1040,
        height: 440,
        text: "1. 첫 번째 요점\n2. 두 번째 요점\n3. 세 번째 요점",
        fontFamily: "Malgun Gothic",
        fontSize: 36,
        fontWeight: "normal",
        color: "#1f2937",
        textAlign: "left",
        themeRole: "body",
      },
    ],
  },
  {
    id: "announcements",
    label: "교회 광고",
    background: "#ffffff",
    elements: [
      {
        id: "announcements-title",
        type: "text",
        x: 120,
        y: 80,
        width: 1040,
        height: 72,
        text: "교회 소식",
        fontFamily: "Malgun Gothic",
        fontSize: 48,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "announcements-body",
        type: "text",
        x: 120,
        y: 180,
        width: 1040,
        height: 440,
        text: "• 날짜 · 시간 · 장소\n• 두 번째 소식\n• 세 번째 소식",
        fontFamily: "Malgun Gothic",
        fontSize: 32,
        fontWeight: "normal",
        color: "#1f2937",
        textAlign: "left",
        themeRole: "body",
      },
    ],
  },
  {
    id: "creed",
    label: "공동 고백·기도문",
    background: "#ffffff",
    elements: [
      {
        id: "creed-kicker",
        type: "text",
        x: 140,
        y: 64,
        width: 1000,
        height: 44,
        text: "사도신경",
        fontFamily: "Malgun Gothic",
        fontSize: 22,
        fontWeight: "normal",
        color: "#64748b",
        textAlign: "center",
        themeRole: "muted",
      },
      {
        id: "creed-body",
        type: "text",
        x: 140,
        y: 130,
        width: 1000,
        height: 520,
        text: "전능하사 천지를 만드신 하나님 아버지를 내가 믿사오며,\n그 외아들 우리 주 예수 그리스도를 믿사오니",
        fontFamily: "Malgun Gothic",
        fontSize: 32,
        fontWeight: "normal",
        color: "#111827",
        textAlign: "center",
        themeRole: "body",
      },
    ],
  },
  {
    id: "prayer",
    label: "기도 제목",
    background: "#ffffff",
    elements: [
      {
        id: "prayer-title",
        type: "text",
        x: 120,
        y: 80,
        width: 1040,
        height: 72,
        text: "기도 제목",
        fontFamily: "Malgun Gothic",
        fontSize: 48,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "prayer-body",
        type: "text",
        x: 120,
        y: 180,
        width: 1040,
        height: 440,
        text: "1. 첫 번째 제목\n2. 두 번째 제목\n3. 세 번째 제목",
        fontFamily: "Malgun Gothic",
        fontSize: 36,
        fontWeight: "normal",
        color: "#1f2937",
        textAlign: "left",
        themeRole: "body",
      },
    ],
  },
  {
    id: "welcome",
    label: "환영",
    background: "#ffffff",
    elements: [
      {
        id: "welcome-title",
        type: "text",
        x: 120,
        y: 250,
        width: 1040,
        height: 120,
        text: "환영합니다",
        fontFamily: "Malgun Gothic",
        fontSize: 72,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "center",
        themeRole: "title",
      },
      {
        id: "welcome-body",
        type: "text",
        x: 180,
        y: 400,
        width: 920,
        height: 80,
        text: "오늘 처음 오신 분들을 진심으로 환영합니다",
        fontFamily: "Malgun Gothic",
        fontSize: 28,
        fontWeight: "normal",
        color: "#64748b",
        textAlign: "center",
        themeRole: "muted",
      },
    ],
  },
  {
    id: "offering",
    label: "봉헌",
    background: "#ffffff",
    elements: [
      {
        id: "offering-title",
        type: "text",
        x: 120,
        y: 240,
        width: 1040,
        height: 100,
        text: "봉헌",
        fontFamily: "Malgun Gothic",
        fontSize: 64,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "center",
        themeRole: "title",
      },
      {
        id: "offering-body",
        type: "text",
        x: 160,
        y: 360,
        width: 960,
        height: 80,
        text: "하나님을 찬송하는 마음으로 드립니다",
        fontFamily: "Malgun Gothic",
        fontSize: 28,
        fontWeight: "normal",
        color: "#64748b",
        textAlign: "center",
        themeRole: "muted",
      },
    ],
  },
  {
    id: "next-week",
    label: "다음 주 안내",
    background: "#ffffff",
    elements: [
      {
        id: "next-week-kicker",
        type: "text",
        x: 120,
        y: 220,
        width: 420,
        height: 40,
        text: "다음 주일",
        fontFamily: "Malgun Gothic",
        fontSize: 20,
        fontWeight: "normal",
        color: "#64748b",
        textAlign: "left",
        themeRole: "muted",
      },
      {
        id: "next-week-date",
        type: "text",
        x: 120,
        y: 268,
        width: 420,
        height: 180,
        text: "주일",
        fontFamily: "Malgun Gothic",
        fontSize: 72,
        fontWeight: "bold",
        color: "#0f172a",
        textAlign: "left",
        themeRole: "title",
      },
      {
        id: "next-week-body",
        type: "text",
        x: 580,
        y: 268,
        width: 580,
        height: 220,
        text: "주일예배\n오전 11:00 · 본당",
        fontFamily: "Malgun Gothic",
        fontSize: 32,
        fontWeight: "normal",
        color: "#1f2937",
        textAlign: "left",
        themeRole: "body",
      },
    ],
  },
];

export const CUSTOM_SLIDE_TEMPLATES = TEMPLATE_DEFINITIONS.map((definition) => {
  const model = normalizeCustomSlide({
    version: 1,
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    background: { color: definition.background ?? "#ffffff" },
    elements: definition.elements.map((element, index) => ({
      rotation: 0,
      opacity: 1,
      zIndex: index,
      ...element,
    })),
  });
  return {
    id: definition.id,
    label: definition.label,
    nativePalette: nativePaletteFromDefinition(definition),
    model,
  };
});

export function instantiateTemplate(templateId, idFactory, themeId = "native") {
  const template =
    CUSTOM_SLIDE_TEMPLATES.find((candidate) => candidate.id === templateId) ??
    CUSTOM_SLIDE_TEMPLATES.find((candidate) => candidate.id === "blank");

  if (!template) {
    return createDefaultCustomSlide();
  }

  const resolvedThemeId = isThemeId(themeId) ? themeId : "native";
  const cloned = cloneCustomSlide(template.model, idFactory);
  const painted = applyTheme(cloned, resolvePalette(resolvedThemeId, template.nativePalette));
  return normalizeCustomSlide({
    ...painted,
    templateId: template.id,
    themeId: resolvedThemeId,
  });
}

export function decideKeyboardCommand(event) {
  if (!event || typeof event.key !== "string") {
    return null;
  }

  const target = event.target ?? {};
  if (event.isTextEditing || target.isContentEditable) {
    return null;
  }
  if (typeof target.tagName === "string" && TYPING_TAGS.has(target.tagName.toUpperCase())) {
    return null;
  }

  const key = event.key.toLowerCase();
  const withModifier = Boolean(event.ctrlKey || event.metaKey);

  if (withModifier) {
    switch (key) {
      case "c":
        return "copy";
      case "v":
        return "paste";
      case "d":
        return "duplicate";
      case "a":
        return "select-all";
      case "[":
        return event.shiftKey ? "backward" : null;
      case "]":
        return event.shiftKey ? "forward" : null;
      case "z":
        return event.shiftKey ? "redo" : "undo";
      case "y":
        return "redo";
      default:
        return null;
    }
  }

  if (key === "delete" || key === "backspace") {
    return "delete";
  }
  if (key === "escape") {
    return "deselect";
  }
  if (key === "arrowleft") {
    return event.shiftKey ? "nudge-left-large" : "nudge-left";
  }
  if (key === "arrowright") {
    return event.shiftKey ? "nudge-right-large" : "nudge-right";
  }
  if (key === "arrowup") {
    return event.shiftKey ? "nudge-up-large" : "nudge-up";
  }
  if (key === "arrowdown") {
    return event.shiftKey ? "nudge-down-large" : "nudge-down";
  }

  return null;
}

export function isActiveSelection(object) {
  return Boolean(object && object.type === "activeSelection");
}

export function selectedFabricObjects(canvas) {
  const active = canvas?.getActiveObject?.();
  if (!active) {
    return [];
  }
  if (isActiveSelection(active) && typeof active.getObjects === "function") {
    return active.getObjects();
  }
  if (active.role === "element") {
    return [active];
  }
  return [];
}

export function serializeAfterRestoringSelection(canvas, fabric, serializeElements) {
  const active = canvas.getActiveObject?.();
  const members = isActiveSelection(active) && typeof active.getObjects === "function"
    ? [...active.getObjects()]
    : null;
  if (members) {
    canvas.discardActiveObject();
  }
  const result = serializeElements();
  if (members && members.length > 0 && fabric?.ActiveSelection) {
    const selection = new fabric.ActiveSelection(members, { canvas });
    canvas.setActiveObject(selection);
  }
  return result;
}

export function alignBoxesTogether(boxes, alignment) {
  if (!Array.isArray(boxes) || boxes.length === 0) {
    return boxes;
  }
  const minX = Math.min(...boxes.map((box) => box.x));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return boxes.map((box) => {
    switch (alignment) {
      case "left":
        return { ...box, x: minX };
      case "center":
        return { ...box, x: minX + (maxX - minX - box.width) / 2 };
      case "right":
        return { ...box, x: maxX - box.width };
      case "top":
        return { ...box, y: minY };
      case "middle":
        return { ...box, y: minY + (maxY - minY - box.height) / 2 };
      case "bottom":
        return { ...box, y: maxY - box.height };
      default:
        return { ...box };
    }
  });
}

export function distributeBoxes(boxes, axis) {
  if (!Array.isArray(boxes) || boxes.length < 3) {
    return boxes;
  }
  const sorted = [...boxes].sort((left, right) =>
    axis === "y" ? left.y - right.y : left.x - right.x
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = axis === "y" ? first.y : first.x;
  const end =
    axis === "y" ? last.y + last.height : last.x + last.width;
  const totalSize = sorted.reduce(
    (sum, box) => sum + (axis === "y" ? box.height : box.width),
    0
  );
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  return sorted.map((box) => {
    const next =
      axis === "y" ? { ...box, y: cursor } : { ...box, x: cursor };
    cursor += (axis === "y" ? box.height : box.width) + gap;
    return next;
  });
}

export function alignBoxToSlide(box, alignment, canvasSize = {}) {
  const canvasWidth = canvasSize.width ?? SLIDE_WIDTH;
  const canvasHeight = canvasSize.height ?? SLIDE_HEIGHT;

  switch (alignment) {
    case "left":
      return { ...box, x: 0 };
    case "center":
      return { ...box, x: (canvasWidth - box.width) / 2 };
    case "right":
      return { ...box, x: canvasWidth - box.width };
    case "top":
      return { ...box, y: 0 };
    case "middle":
      return { ...box, y: (canvasHeight - box.height) / 2 };
    case "bottom":
      return { ...box, y: canvasHeight - box.height };
    default:
      return { ...box };
  }
}

function rotatedExtent(width, height, rotation) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

export function clampBoxToCanvas(box, canvasSize = {}) {
  const canvasWidth = canvasSize.width ?? SLIDE_WIDTH;
  const canvasHeight = canvasSize.height ?? SLIDE_HEIGHT;
  const rotation = box.rotation ?? 0;
  const extent = rotatedExtent(box.width, box.height, rotation);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  const clampedCenterX =
    extent.width > canvasWidth
      ? canvasWidth / 2
      : Math.min(canvasWidth - extent.width / 2, Math.max(extent.width / 2, centerX));
  const clampedCenterY =
    extent.height > canvasHeight
      ? canvasHeight / 2
      : Math.min(canvasHeight - extent.height / 2, Math.max(extent.height / 2, centerY));

  return {
    ...box,
    x: clampedCenterX - box.width / 2,
    y: clampedCenterY - box.height / 2,
  };
}

/**
 * Lines can only be translated, never resized, so both endpoints move by the
 * same delta. When a line is longer than the slide the start edge wins.
 */
export function clampLineIntoCanvas(line, canvasSize = {}) {
  const canvasWidth = canvasSize.width ?? SLIDE_WIDTH;
  const canvasHeight = canvasSize.height ?? SLIDE_HEIGHT;

  const minX = Math.min(line.x1, line.x2);
  const maxX = Math.max(line.x1, line.x2);
  const minY = Math.min(line.y1, line.y2);
  const maxY = Math.max(line.y1, line.y2);

  let dx = 0;
  let dy = 0;

  if (maxX > canvasWidth) {
    dx = canvasWidth - maxX;
  }
  if (minX + dx < 0) {
    dx = -minX;
  }
  if (maxY > canvasHeight) {
    dy = canvasHeight - maxY;
  }
  if (minY + dy < 0) {
    dy = -minY;
  }

  return {
    dx,
    dy,
    x1: line.x1 + dx,
    y1: line.y1 + dy,
    x2: line.x2 + dx,
    y2: line.y2 + dy,
  };
}

/**
 * Caps a scale pair so the rotated extent still fits the slide; without this a
 * drag can grow an object past the canvas and normalization then shrinks it,
 * making the object jump on serialize.
 */
export function limitScaleToCanvas(state, canvasSize = {}) {
  const canvasWidth = canvasSize.width ?? SLIDE_WIDTH;
  const canvasHeight = canvasSize.height ?? SLIDE_HEIGHT;
  const scaleX = Math.abs(state.scaleX ?? 1);
  const scaleY = Math.abs(state.scaleY ?? 1);
  const extent = rotatedExtent(
    Math.abs(state.width ?? 0) * scaleX,
    Math.abs(state.height ?? 0) * scaleY,
    state.rotation ?? 0
  );

  if (extent.width <= canvasWidth && extent.height <= canvasHeight) {
    return { scaleX, scaleY };
  }

  const factor = Math.min(
    extent.width > 0 ? canvasWidth / extent.width : 1,
    extent.height > 0 ? canvasHeight / extent.height : 1
  );

  return { scaleX: scaleX * factor, scaleY: scaleY * factor };
}

function snapAxis(edges, targets, threshold) {
  let delta = 0;
  let position = null;

  for (const edge of edges) {
    for (const target of targets) {
      const candidate = target - edge;
      if (Math.abs(candidate) <= threshold && (position === null || Math.abs(candidate) < Math.abs(delta))) {
        delta = candidate;
        position = target;
      }
    }
  }

  return { delta, position };
}

export function computeSnapAdjustment(
  box,
  canvasSize = {},
  otherBoxes = [],
  threshold = SNAP_THRESHOLD
) {
  const canvasWidth = canvasSize.width ?? SLIDE_WIDTH;
  const canvasHeight = canvasSize.height ?? SLIDE_HEIGHT;

  const xTargets = [0, canvasWidth / 2, canvasWidth];
  const yTargets = [0, canvasHeight / 2, canvasHeight];

  for (const other of otherBoxes) {
    xTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
    yTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
  }

  const horizontal = snapAxis(
    [box.x, box.x + box.width / 2, box.x + box.width],
    xTargets,
    threshold
  );
  const vertical = snapAxis(
    [box.y, box.y + box.height / 2, box.y + box.height],
    yTargets,
    threshold
  );

  const guides = [];
  if (horizontal.position !== null) {
    guides.push({ orientation: "vertical", position: horizontal.position });
  }
  if (vertical.position !== null) {
    guides.push({ orientation: "horizontal", position: vertical.position });
  }

  return { dx: horizontal.delta, dy: vertical.delta, guides };
}

function rotatePoint(x, y, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function applyElementChrome(object, element, fabric) {
  const locked = Boolean(element?.locked);
  const visible = element?.visible !== false;
  const shadow = element?.shadow;
  object.set({
    visible,
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    customLocked: locked,
    customVisible: visible,
  });
  if (shadow && fabric?.Shadow) {
    object.set({
      shadow: new fabric.Shadow({
        color: shadow.color,
        blur: shadow.blur,
        offsetX: shadow.offsetX,
        offsetY: shadow.offsetY,
      }),
    });
  } else if (shadow) {
    object.set({ shadow });
  }
  return object;
}

function tagObject(object, element, fabric) {
  object.set({
    role: "element",
    customElementId: element.id,
    elementType: element.type,
    ...(element.themeRole ? { themeRole: element.themeRole } : {}),
    ...(element.themeStrokeRole ? { themeStrokeRole: element.themeStrokeRole } : {}),
  });
  return applyElementChrome(object, element, fabric);
}

/**
 * Creates a Fabric object for every element type except images, which need to
 * be loaded asynchronously (see `buildFabricImage`).
 */
export function buildFabricObject(fabric, element) {
  if (!fabric || !element) {
    return null;
  }

  if (element.type === "line") {
    const line = new fabric.Line([element.x, element.y, element.x2, element.y2], {
      stroke: element.stroke || "#000000",
      strokeWidth: element.strokeWidth,
      strokeUniform: true,
      opacity: element.opacity ?? 1,
      objectCaching: false,
    });
    return tagObject(line, element, fabric);
  }

  const shared = {
    left: element.x + element.width / 2,
    top: element.y + element.height / 2,
    originX: "center",
    originY: "center",
    angle: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
    strokeUniform: true,
    objectCaching: false,
  };

  switch (element.type) {
    case "text": {
      const textbox = new fabric.Textbox(element.text ?? "", {
        ...shared,
        width: element.width,
        fill: element.color,
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight,
        textAlign: element.textAlign,
        fontStyle: element.italic ? "italic" : "normal",
        underline: Boolean(element.underline),
        lineHeight: element.lineHeight ?? 1.16,
        charSpacing: element.charSpacing ?? 0,
        splitByGrapheme: true,
      });
      // Fabric derives Textbox height from the wrapped text, so the centered
      // origin has to be re-anchored to the authored top edge.
      textbox.set({ top: element.y + (textbox.height ?? 0) / 2 });
      textbox.setCoords?.();
      return tagObject(textbox, element, fabric);
    }
    case "rect":
    case "roundRect": {
      const rect = new fabric.Rect({
        ...shared,
        width: element.width,
        height: element.height,
        fill: element.fill,
        stroke: element.stroke || null,
        strokeWidth: element.strokeWidth,
        rx: element.type === "roundRect" ? element.rx ?? 0 : 0,
        ry: element.type === "roundRect" ? element.rx ?? 0 : 0,
      });
      return tagObject(rect, element, fabric);
    }
    case "ellipse": {
      const ellipse = new fabric.Ellipse({
        ...shared,
        rx: element.width / 2,
        ry: element.height / 2,
        fill: element.fill,
        stroke: element.stroke || null,
        strokeWidth: element.strokeWidth,
      });
      return tagObject(ellipse, element, fabric);
    }
    default:
      return null;
  }
}

/**
 * Fits the bitmap inside the authored layout box. The box is kept on the object
 * (`customBoxWidth`/`customBoxHeight`) because `contain` letterboxes the visible
 * pixels: without the box, serializing would shrink the element to the letterbox
 * and toggling contain/cover would drift.
 */
export function applyImageFit(image, fit, boxWidth, boxHeight) {
  const naturalWidth = image.customNaturalWidth || image.width || 1;
  const naturalHeight = image.customNaturalHeight || image.height || 1;
  const box = {
    customBoxWidth: Math.max(0, boxWidth),
    customBoxHeight: Math.max(0, boxHeight),
  };

  if (fit === "cover") {
    const boxRatio = boxWidth / boxHeight;
    const naturalRatio = naturalWidth / naturalHeight;
    let cropWidth = naturalWidth;
    let cropHeight = naturalHeight;

    if (naturalRatio > boxRatio) {
      cropWidth = naturalHeight * boxRatio;
    } else {
      cropHeight = naturalWidth / boxRatio;
    }

    image.set({
      ...box,
      cropX: (naturalWidth - cropWidth) / 2,
      cropY: (naturalHeight - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
      scaleX: boxWidth / cropWidth,
      scaleY: boxHeight / cropHeight,
      customFitScaleX: boxWidth / cropWidth,
      customFitScaleY: boxHeight / cropHeight,
      customFit: "cover",
    });
    return;
  }

  const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  image.set({
    ...box,
    cropX: 0,
    cropY: 0,
    width: naturalWidth,
    height: naturalHeight,
    scaleX: scale,
    scaleY: scale,
    customFitScaleX: scale,
    customFitScaleY: scale,
    customFit: "contain",
  });
}

const MIN_FONT_SIZE = 1;
const MAX_FONT_SIZE = 512;

/**
 * Corner-resizing a Textbox scales its glyphs instead of its font size, so the
 * canvas would show one size and the saved slide another. Baking folds the
 * scale into the canonical `fontSize`/`width`, keeping the visible box and its
 * top-left edge where the drag left them.
 */
export function bakeTextScale(textbox) {
  if (!textbox) {
    return false;
  }

  const scaleX = Math.abs(textbox.scaleX ?? 1);
  const scaleY = Math.abs(textbox.scaleY ?? 1);
  if (Math.abs(scaleX - 1) < 1e-6 && Math.abs(scaleY - 1) < 1e-6) {
    return false;
  }

  const center = textbox.getCenterPoint();
  const displayedWidth = (textbox.width ?? 0) * scaleX;
  const displayedHeight = (textbox.height ?? 0) * scaleY;
  const left = center.x - displayedWidth / 2;
  const top = center.y - displayedHeight / 2;
  const fontSize = Math.min(
    MAX_FONT_SIZE,
    Math.max(MIN_FONT_SIZE, (textbox.fontSize ?? 24) * scaleY)
  );

  textbox.set({ fontSize, width: displayedWidth, scaleX: 1, scaleY: 1 });
  // Fabric derives the height from the wrapped text, so it has to be re-read
  // before the top-left edge can be restored.
  textbox.initDimensions?.();
  textbox.set({
    left: left + displayedWidth / 2,
    top: top + (textbox.height ?? 0) / 2,
  });
  textbox.setCoords?.();
  return true;
}

/** True once the user has scaled the image away from its fitted scale. */
export function imageScaleChanged(image) {
  return (
    Math.abs(Math.abs(image.scaleX ?? 1) - (image.customFitScaleX ?? 1)) > 1e-6 ||
    Math.abs(Math.abs(image.scaleY ?? 1) - (image.customFitScaleY ?? 1)) > 1e-6
  );
}

/** The layout box the user authored, which may be larger than the visible pixels. */
export function imageBoxFromObject(object) {
  const displayedWidth = (object.width ?? 0) * Math.abs(object.scaleX ?? 1);
  const displayedHeight = (object.height ?? 0) * Math.abs(object.scaleY ?? 1);
  return {
    width: object.customBoxWidth || displayedWidth,
    height: object.customBoxHeight || displayedHeight,
  };
}

/** Re-reads the layout box from a transform the user just performed. */
export function adoptImageTransform(image) {
  const displayedWidth = (image.width ?? 0) * Math.abs(image.scaleX ?? 1);
  const displayedHeight = (image.height ?? 0) * Math.abs(image.scaleY ?? 1);
  applyImageFit(image, image.customFit ?? "contain", displayedWidth, displayedHeight);
  return image;
}

export async function buildFabricImage(fabric, element) {
  const image = await fabric.FabricImage.fromURL(element.src, { crossOrigin: null });
  image.set({
    left: element.x + element.width / 2,
    top: element.y + element.height / 2,
    originX: "center",
    originY: "center",
    angle: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
    objectCaching: false,
    customNaturalWidth: image.width,
    customNaturalHeight: image.height,
    customSrc: element.src,
  });
  applyImageFit(image, element.fit, element.width || image.width, element.height || image.height);
  return tagObject(image, element, fabric);
}

function lineDescriptor(object) {
  const center = object.getCenterPoint();
  const points = object.calcLinePoints();
  const angle = object.angle ?? 0;
  const start = rotatePoint(points.x1 * object.scaleX, points.y1 * object.scaleY, angle);
  const end = rotatePoint(points.x2 * object.scaleX, points.y2 * object.scaleY, angle);

  return {
    role: "element",
    elementType: "line",
    customElementId: object.customElementId,
    type: "line",
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    x1: center.x + start.x,
    y1: center.y + start.y,
    x2: center.x + end.x,
    y2: center.y + end.y,
    stroke: object.stroke,
    strokeWidth: object.strokeWidth,
    opacity: object.opacity,
    ...(object.themeRole ? { themeRole: object.themeRole } : {}),
    ...(object.themeStrokeRole ? { themeStrokeRole: object.themeStrokeRole } : {}),
  };
}

/**
 * Converts a live Fabric object into the plain descriptor shape understood by
 * `fabricObjectsToCustomSlide`, always using a centered origin.
 */
export function fabricObjectToDescriptor(object) {
  if (!object) {
    return null;
  }

  if (object.elementType === "line") {
    return lineDescriptor(object);
  }

  const center = object.getCenterPoint();
  const base = {
    role: "element",
    elementType: object.elementType,
    customElementId: object.customElementId,
    left: center.x,
    top: center.y,
    originX: "center",
    originY: "center",
    width: object.width,
    height: object.height,
    scaleX: Math.abs(object.scaleX ?? 1),
    scaleY: Math.abs(object.scaleY ?? 1),
    angle: object.angle ?? 0,
    opacity: object.opacity ?? 1,
    ...(object.themeRole ? { themeRole: object.themeRole } : {}),
    ...(object.themeStrokeRole ? { themeStrokeRole: object.themeStrokeRole } : {}),
  };

  switch (object.elementType) {
    case "text":
      return {
        ...base,
        type: "textbox",
        text: object.text,
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        fontWeight: object.fontWeight,
        fill: object.fill,
        textAlign: object.textAlign,
      };
    case "image": {
      // Serialize the authored layout box, not the letterboxed bitmap.
      const box = imageBoxFromObject(object);
      return {
        ...base,
        type: "image",
        width: box.width,
        height: box.height,
        scaleX: 1,
        scaleY: 1,
        src: object.customSrc,
        fit: object.customFit,
      };
    }
    case "roundRect":
      return {
        ...base,
        type: "rect",
        fill: object.fill,
        stroke: object.stroke ?? "",
        strokeWidth: object.strokeWidth,
        rx: object.rx ?? 0,
      };
    case "rect":
    case "ellipse":
      return {
        ...base,
        type: object.elementType,
        fill: object.fill,
        stroke: object.stroke ?? "",
        strokeWidth: object.strokeWidth,
      };
    default:
      return null;
  }
}

function objectBox(object) {
  const center = object.getCenterPoint();
  // Images are laid out by their authored box, which `contain` letterboxes, so
  // alignment, snapping and bounds must use the same box that gets serialized.
  const displayed =
    object.elementType === "image"
      ? imageBoxFromObject(object)
      : {
          width: object.width * Math.abs(object.scaleX ?? 1),
          height: object.height * Math.abs(object.scaleY ?? 1),
        };
  const { width, height } = displayed;
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    rotation: object.angle ?? 0,
  };
}

function createIdFactory() {
  return function nextId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `element-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };
}

const ELEMENT_DEFAULTS = {
  text: {
    type: "text",
    width: 520,
    height: 120,
    text: "텍스트를 입력하세요",
    fontFamily: "Malgun Gothic",
    fontSize: 40,
    fontWeight: "normal",
    color: "#111827",
    textAlign: "left",
  },
  rect: {
    type: "rect",
    width: 360,
    height: 220,
    fill: "#2563eb",
    stroke: "",
    strokeWidth: 0,
  },
  roundRect: {
    type: "roundRect",
    width: 360,
    height: 220,
    rx: 28,
    fill: "#10b981",
    stroke: "",
    strokeWidth: 0,
  },
  ellipse: {
    type: "ellipse",
    width: 320,
    height: 320,
    fill: "#f59e0b",
    stroke: "",
    strokeWidth: 0,
  },
  line: {
    type: "line",
    strokeWidth: 6,
    stroke: "#111827",
  },
};

export async function createCustomSlideEditor(root, options = {}) {
  if (!root) {
    throw new Error("커스텀 편집기를 초기화할 영역이 없습니다.");
  }

  const fabricModule = options.fabricModuleUrl
    ? await import(/* @vite-ignore */ options.fabricModuleUrl)
    : await import("fabric");
  const fabric = fabricModule.fabric ?? fabricModule;

  const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const uploadImage = options.uploadImage;
  const nextId = createIdFactory();

  const dom = {
    canvas: root.querySelector('[data-custom-editor="canvas"]'),
    stage: root.querySelector('[data-custom-editor="stage"]'),
    template: root.querySelector('[data-custom-editor="template"]'),
    theme: root.querySelector('[data-custom-editor="theme"]'),
    file: root.querySelector('[data-custom-editor="file"]'),
    status: root.querySelector('[data-custom-editor="status"]'),
    error: root.querySelector('[data-custom-editor="error"]'),
    background: root.querySelector('[data-custom-editor="background"]'),
    panels: Array.from(root.querySelectorAll("[data-editor-panel]")),
    fields: Array.from(root.querySelectorAll("[data-editor-field]")),
    actions: Array.from(root.querySelectorAll("[data-editor-action]")),
  };

  if (!dom.canvas) {
    throw new Error("커스텀 편집기 캔버스를 찾을 수 없습니다.");
  }

  const canvas = new fabric.Canvas(dom.canvas, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    backgroundColor: "#ffffff",
    preserveObjectStacking: true,
    selection: true,
    controlsAboveOverlay: true,
  });

  const view = root.ownerDocument?.defaultView ?? globalThis;

  let model = createDefaultCustomSlide();
  const history = createCustomSlideHistory(model);
  let suspendSync = false;
  let historyTimer = null;
  let activeGuides = [];
  let clipboard = null;
  let zoom = 1;
  let spacePan = false;
  let panning = false;
  let panOrigin = null;
  // True while the last pointer or focus interaction happened inside the
  // editor, which is what scopes the clipboard and delete shortcuts.
  let canvasEngaged = false;
  let destroyed = false;
  let resizeObserver = null;
  // Unsubscribes the floating text toolbar from canvas movement, and re-runs
  // its placement for the transforms fabric handles without touching the DOM.
  let stopToolbarTracking = null;
  let positionToolbar = null;
  // Every render claims a generation; older generations must not touch the canvas.
  let renderToken = 0;
  let renderQueue = Promise.resolve();
  const strokeMemory = new WeakMap();

  function setStatus(message) {
    const text = message ?? "";
    if (dom.status && dom.status.textContent !== text) {
      dom.status.textContent = text;
    }
  }

  function setError(message, cause) {
    const text = message ?? "";
    if (dom.error) {
      if (text) {
        // Reveal the alert region before writing the text, otherwise assistive
        // technology has nothing live to announce.
        if (dom.error.hidden) {
          dom.error.hidden = false;
        }
        if (dom.error.textContent !== text) {
          dom.error.textContent = text;
        }
      } else {
        if (dom.error.textContent !== "") {
          dom.error.textContent = "";
        }
        if (!dom.error.hidden) {
          dom.error.hidden = true;
        }
      }
    }
    if (text) {
      onError(text, cause);
    }
  }

  function elementObjects() {
    return canvas.getObjects().filter((object) => object.role === "element");
  }

  function serialize() {
    return serializeAfterRestoringSelection(canvas, fabric, () => {
      const descriptors = elementObjects()
        .map((object) => fabricObjectToDescriptor(object))
        .filter(Boolean);
      return fabricObjectsToCustomSlide(descriptors, {
        ...model,
        background: { color: canvas.backgroundColor },
      });
    });
  }

  function syncModel() {
    model = serialize();
    return model;
  }

  function notifyChange() {
    onChange(model, { dirty: history.isDirty() });
  }

  function refreshActionStates() {
    const hasSelection = selectedFabricObjects(canvas).length > 0;
    for (const button of root.querySelectorAll("[data-editor-action]")) {
      const action = button.dataset.editorAction;
      if (action === "undo") {
        button.disabled = !history.canUndo();
      } else if (action === "redo") {
        button.disabled = !history.canRedo();
      } else if (
        action.startsWith("align-") ||
        action === "forward" ||
        action === "backward" ||
        action === "to-front" ||
        action === "to-back" ||
        action === "duplicate" ||
        action === "delete" ||
        action === "copy"
      ) {
        button.disabled = !hasSelection;
      } else if (action === "distribute-x" || action === "distribute-y") {
        button.disabled = selectedFabricObjects(canvas).length < 3;
      }
    }
    refreshContextToolbar();
    refreshLayerList();
  }

  function pushHistory() {
    if (suspendSync || destroyed) {
      return;
    }
    syncModel();
    history.push(model);
    refreshActionStates();
    notifyChange();
  }

  function queueHistory() {
    if (suspendSync || destroyed) {
      return;
    }
    if (historyTimer !== null) {
      clearTimeout(historyTimer);
    }
    historyTimer = setTimeout(() => {
      historyTimer = null;
      pushHistory();
    }, HISTORY_DEBOUNCE_MS);
  }

  function flushHistory() {
    if (historyTimer !== null) {
      clearTimeout(historyTimer);
      historyTimer = null;
      pushHistory();
    }
  }

  /**
   * Claims the current render generation. Anything awaited afterwards (an
   * upload, an image decode) must stop when the claim no longer holds: the
   * canvas has moved on to another slide, or the editor is gone.
   */
  function claimGeneration() {
    const token = renderToken;
    return () => destroyed || token !== renderToken;
  }

  /** Renders never overlap: each one waits for the previous to settle. */
  function renderModel(nextModel) {
    const token = (renderToken += 1);
    const run = renderQueue.then(
      () => performRender(nextModel, token),
      () => performRender(nextModel, token)
    );
    renderQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function performRender(nextModel, token) {
    const isStale = () => destroyed || token !== renderToken;
    if (isStale()) {
      return false;
    }

    suspendSync = true;
    try {
      canvas.discardActiveObject();
      canvas.remove(...canvas.getObjects());
      canvas.backgroundColor = nextModel.background.color;
      if (dom.background) {
        dom.background.value = nextModel.background.color;
      }

      for (const element of nextModel.elements) {
        if (element.type === "image") {
          if (!element.src) {
            continue;
          }
          try {
            const image = await buildFabricImage(fabric, element);
            if (isStale()) {
              return false;
            }
            canvas.add(image);
          } catch (error) {
            if (isStale()) {
              return false;
            }
            setError("이미지를 불러오지 못했습니다.", error);
          }
          continue;
        }
        const object = buildFabricObject(fabric, element);
        if (object) {
          canvas.add(object);
        }
      }

      if (isStale()) {
        return false;
      }
      canvas.requestRenderAll();
    } finally {
      // A superseded render must not clear the flag the newer render owns.
      if (token === renderToken) {
        suspendSync = false;
      }
    }

    updatePropertyPanel();
    refreshActionStates();
    return true;
  }

  async function load(nextModel, { markSaved = true } = {}) {
    if (destroyed) {
      return model;
    }

    setError("");
    model = normalizeCustomSlide(nextModel ?? createDefaultCustomSlide());
    const rendered = await renderModel(model);
    if (!rendered || destroyed) {
      return model;
    }

    // Seed history from what the canvas actually produced (Fabric decides text
    // heights), so the slide cannot undo into the previously loaded one and an
    // immediate serialize/isDirty is stable.
    model = serialize();
    history.reset(model, { markSaved });
    setThemeSelectValue(model.themeId);
    setStatus("슬라이드를 불러왔습니다.");
    refreshActionStates();
    notifyChange();
    return model;
  }

  async function restore(snapshot) {
    if (destroyed) {
      return false;
    }
    model = normalizeCustomSlide(snapshot);
    const rendered = await renderModel(model);
    if (!rendered || destroyed) {
      return false;
    }
    // Undo/redo reload a snapshot without pushing new history.
    model = serialize();
    refreshActionStates();
    notifyChange();
    return true;
  }

  function showPanels(names) {
    for (const element of root.querySelectorAll("[data-editor-panel]")) {
      element.hidden = !names.includes(element.dataset.editorPanel);
    }
  }

  function field(name) {
    return root.querySelector(`[data-editor-field="${name}"]`);
  }

  function setFieldValue(name, value) {
    const input = field(name);
    if (!input) {
      return;
    }
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value ?? "";
    }
  }

  function syncStrokeFields(active) {
    const hasStroke = Boolean(active.stroke);
    const remembered = strokeMemory.get(active);
    setFieldValue("noStroke", !hasStroke);
    setFieldValue("stroke", hasStroke ? active.stroke : remembered?.stroke || "#000000");
    setFieldValue(
      "strokeWidth",
      hasStroke ? active.strokeWidth ?? 0 : remembered?.strokeWidth ?? 0
    );

    const strokeInput = field("stroke");
    const strokeWidthInput = field("strokeWidth");
    if (strokeInput) {
      strokeInput.disabled = !hasStroke;
    }
    if (strokeWidthInput) {
      strokeWidthInput.disabled = !hasStroke;
    }
  }

  function updatePropertyPanel() {
    const active = canvas.getActiveObject();
    if (!active || (active.role !== "element" && !isActiveSelection(active))) {
      showPanels(["empty"]);
      setStatus("선택된 개체가 없습니다.");
      refreshContextToolbar();
      return;
    }
    const target = isActiveSelection(active) ? selectedFabricObjects(canvas)[0] : active;
    if (!target || target.role !== "element") {
      showPanels(["empty"]);
      return;
    }
    const box = objectBox(target);
    setFieldValue("opacity", target.opacity ?? 1);
    setFieldValue("rotation", Math.round(target.angle ?? 0));
    setFieldValue("locked", Boolean(target.customLocked));
    setFieldValue("visible", target.visible !== false);
    setFieldValue("shadowEnabled", Boolean(target.shadow));

    switch (target.elementType) {
      case "text":
        showPanels(["text", "common"]);
        setFieldValue("text", target.text);
        setFieldValue("fontFamily", target.fontFamily);
        setFieldValue("fontSize", Math.round(target.fontSize));
        setFieldValue("bold", String(target.fontWeight) === "bold" || Number(target.fontWeight) >= 600);
        setFieldValue("italic", target.fontStyle === "italic");
        setFieldValue("underline", Boolean(target.underline));
        setFieldValue("color", target.fill);
        setFieldValue("textAlign", target.textAlign);
        setFieldValue("valign", target.textAlignVertical ?? "top");
        setFieldValue("lineHeight", target.lineHeight ?? 1.16);
        setFieldValue("charSpacing", target.charSpacing ?? 0);
        setStatus("텍스트가 선택되었습니다.");
        break;
      case "image":
        showPanels(["image", "common"]);
        setFieldValue("fit", target.customFit ?? "contain");
        setStatus("이미지가 선택되었습니다.");
        break;
      case "line": {
        showPanels(["shape", "common"]);
        const fillInput = field("fill");
        if (fillInput) {
          fillInput.disabled = true;
        }
        syncStrokeFields(target);
        setStatus("선이 선택되었습니다.");
        break;
      }
      default: {
        showPanels(["shape", "common"]);
        const fillInput = field("fill");
        if (fillInput) {
          fillInput.disabled = false;
        }
        setFieldValue("fill", target.fill ?? "#cccccc");
        syncStrokeFields(target);
        setStatus(`도형(${box.width.toFixed(0)}×${box.height.toFixed(0)})이 선택되었습니다.`);
        break;
      }
    }
  }

  function enforceBounds(object) {
    if (!object) {
      return;
    }
    if (isActiveSelection(object) && typeof object.getObjects === "function") {
      for (const child of object.getObjects()) {
        enforceBounds(child);
      }
      return;
    }

    if (object.elementType === "line") {
      // A line can only be translated, so both endpoints move together.
      const clamped = clampLineIntoCanvas(fabricObjectToDescriptor(object), {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
      });
      if (clamped.dx !== 0 || clamped.dy !== 0) {
        object.set({
          left: object.left + clamped.dx,
          top: object.top + clamped.dy,
        });
        object.setCoords();
      }
      return;
    }

    const box = objectBox(object);
    const clamped = clampBoxToCanvas(box, { width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
    if (clamped.x !== box.x || clamped.y !== box.y) {
      object.set({
        left: object.left + (clamped.x - box.x),
        top: object.top + (clamped.y - box.y),
      });
      object.setCoords();
    }
  }

  // Without a cap, a drag can grow an object past the slide and normalization
  // then shrinks it, making the shape jump when it is serialized.
  function limitScaling(object) {
    if (!object || object.elementType === "line") {
      return;
    }
    const limited = limitScaleToCanvas(
      {
        width: object.width,
        height: object.height,
        rotation: object.angle ?? 0,
        scaleX: object.scaleX,
        scaleY: object.scaleY,
      },
      { width: SLIDE_WIDTH, height: SLIDE_HEIGHT }
    );

    const signX = (object.scaleX ?? 1) < 0 ? -1 : 1;
    const signY = (object.scaleY ?? 1) < 0 ? -1 : 1;
    if (
      limited.scaleX !== Math.abs(object.scaleX ?? 1) ||
      limited.scaleY !== Math.abs(object.scaleY ?? 1)
    ) {
      object.set({ scaleX: limited.scaleX * signX, scaleY: limited.scaleY * signY });
      object.setCoords();
    }
  }

  function applySnapping(object) {
    const box = objectBox(object);
    const others = elementObjects()
      .filter((candidate) => candidate !== object)
      .map((candidate) => objectBox(candidate));
    const snap = computeSnapAdjustment(
      box,
      { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      others
    );

    if (snap.dx !== 0 || snap.dy !== 0) {
      object.set({ left: object.left + snap.dx, top: object.top + snap.dy });
      object.setCoords();
    }
    activeGuides = snap.guides;
  }

  // Guides live on the lower context, which Fabric clears on every render, so
  // they never fight the selection layer drawn on top.
  function drawGuides() {
    if (activeGuides.length === 0) {
      return;
    }
    const context = canvas.getContext();
    if (!context) {
      return;
    }

    context.save();
    context.strokeStyle = "#f43f5e";
    context.lineWidth = 1;
    context.setLineDash([6, 4]);
    for (const guide of activeGuides) {
      context.beginPath();
      if (guide.orientation === "vertical") {
        context.moveTo(guide.position, 0);
        context.lineTo(guide.position, SLIDE_HEIGHT);
      } else {
        context.moveTo(0, guide.position);
        context.lineTo(SLIDE_WIDTH, guide.position);
      }
      context.stroke();
    }
    context.restore();
  }

  function clearGuides() {
    if (activeGuides.length === 0) {
      return;
    }
    activeGuides = [];
    canvas.requestRenderAll();
  }

  function addElement(element) {
    const object = buildFabricObject(fabric, element);
    if (!object) {
      return null;
    }
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    pushHistory();
    updatePropertyPanel();
    return object;
  }

  function centeredElement(type) {
    const defaults = ELEMENT_DEFAULTS[type];
    if (type === "line") {
      return {
        ...defaults,
        id: nextId(),
        x: SLIDE_WIDTH / 2 - 240,
        y: SLIDE_HEIGHT / 2,
        x2: SLIDE_WIDTH / 2 + 240,
        y2: SLIDE_HEIGHT / 2,
        opacity: 1,
        zIndex: elementObjects().length,
      };
    }
    return {
      ...defaults,
      id: nextId(),
      x: (SLIDE_WIDTH - defaults.width) / 2,
      y: (SLIDE_HEIGHT - defaults.height) / 2,
      rotation: 0,
      opacity: 1,
      zIndex: elementObjects().length,
    };
  }

  async function insertImageFile(file) {
    if (destroyed) {
      return;
    }
    if (typeof uploadImage !== "function") {
      setError("이미지 업로드 기능이 준비되지 않았습니다.");
      return;
    }

    const isStale = claimGeneration();
    setError("");
    setStatus("이미지를 업로드하고 있습니다...");
    let provisional = null;

    try {
      const src = await uploadImage(file);
      if (isStale()) {
        return;
      }
      if (typeof src !== "string" || !src.startsWith("/uploads/")) {
        throw new Error("업로드 경로가 올바르지 않습니다.");
      }

      const element = {
        id: nextId(),
        type: "image",
        src,
        fit: "contain",
        x: 0,
        y: 0,
        width: SLIDE_WIDTH * 0.6,
        height: SLIDE_HEIGHT * 0.6,
        rotation: 0,
        opacity: 1,
        zIndex: elementObjects().length,
      };
      element.x = (SLIDE_WIDTH - element.width) / 2;
      element.y = (SLIDE_HEIGHT - element.height) / 2;

      provisional = await buildFabricImage(fabric, element);
      if (isStale()) {
        return;
      }
      canvas.add(provisional);
      canvas.setActiveObject(provisional);
      canvas.requestRenderAll();
      pushHistory();
      updatePropertyPanel();
      setStatus("이미지를 추가했습니다.");
    } catch (error) {
      // A superseded upload owns none of the visible state: the slide it was
      // started from is gone, so it must not report on the one now loaded.
      if (isStale()) {
        return;
      }
      if (provisional) {
        canvas.remove(provisional);
        canvas.requestRenderAll();
      }
      setStatus("");
      setError("이미지 업로드에 실패했습니다.", error);
    }
  }

  function withSelection(callback) {
    const objects = selectedFabricObjects(canvas).filter((object) => object.role === "element");
    if (objects.length === 0) {
      return;
    }
    callback(objects);
  }

  function applyBoxToObject(object, fromBox, toBox) {
    object.set({
      left: object.left + (toBox.x - fromBox.x),
      top: object.top + (toBox.y - fromBox.y),
    });
    object.setCoords();
  }

  function alignSelection(alignment, together = false) {
    withSelection((objects) => {
      const boxes = objects.map((object) => objectBox(object));
      const aligned = together && objects.length > 1
        ? alignBoxesTogether(boxes, alignment)
        : boxes.map((box) =>
            alignBoxToSlide(box, alignment, { width: SLIDE_WIDTH, height: SLIDE_HEIGHT })
          );
      objects.forEach((object, index) => applyBoxToObject(object, boxes[index], aligned[index]));
      canvas.requestRenderAll();
      pushHistory();
      setStatus(together ? "선택 기준으로 정렬했습니다." : "슬라이드 기준으로 정렬했습니다.");
    });
  }

  function distributeSelection(axis) {
    withSelection((objects) => {
      if (objects.length < 3) {
        setStatus("균등 분배는 개체 3개 이상이 필요합니다.");
        return;
      }
      const boxes = objects.map((object) => ({ ...objectBox(object), object }));
      const distributed = distributeBoxes(boxes, axis);
      for (const box of distributed) {
        applyBoxToObject(box.object, boxes.find((item) => item.object === box.object), box);
      }
      canvas.requestRenderAll();
      pushHistory();
      setStatus(axis === "y" ? "세로로 균등 분배했습니다." : "가로로 균등 분배했습니다.");
    });
  }

  function reorderSelection(direction) {
    withSelection((objects) => {
      const ordered = direction === "backward" || direction === "to-back"
        ? objects
        : [...objects].reverse();
      for (const object of ordered) {
        if (direction === "forward") {
          canvas.bringObjectForward(object);
        } else if (direction === "backward") {
          canvas.sendObjectBackwards(object);
        } else if (direction === "to-front" && typeof canvas.bringObjectToFront === "function") {
          canvas.bringObjectToFront(object);
        } else if (direction === "to-back" && typeof canvas.sendObjectToBack === "function") {
          canvas.sendObjectToBack(object);
        } else if (direction === "to-front") {
          canvas.bringObjectForward(object);
        } else {
          canvas.sendObjectBackwards(object);
        }
      }
      canvas.requestRenderAll();
      pushHistory();
    });
  }

  function selectedElementModel(active) {
    const descriptor = fabricObjectToDescriptor(active);
    const slide = fabricObjectsToCustomSlide([descriptor]);
    return slide.elements[0] ?? null;
  }

  async function duplicateSelection() {
    const objects = selectedFabricObjects(canvas);
    if (objects.length === 0) {
      return;
    }
    for (const object of objects) {
      const element = selectedElementModel(object);
      if (element) {
        await pasteElement({ ...element, id: nextId() });
      }
    }
    setStatus("개체를 복제했습니다.");
  }

  async function pasteElement(element) {
    if (destroyed) {
      return;
    }
    const isStale = claimGeneration();
    const shifted =
      element.type === "line"
        ? {
            ...element,
            x: element.x + PASTE_OFFSET,
            y: element.y + PASTE_OFFSET,
            x2: element.x2 + PASTE_OFFSET,
            y2: element.y2 + PASTE_OFFSET,
          }
        : { ...element, x: element.x + PASTE_OFFSET, y: element.y + PASTE_OFFSET };

    const normalized = normalizeCustomSlide({
      ...model,
      elements: [shifted],
    }).elements[0];

    if (!normalized) {
      return;
    }

    if (normalized.type === "image") {
      try {
        const object = await buildFabricImage(fabric, normalized);
        if (isStale()) {
          return;
        }
        canvas.add(object);
        canvas.setActiveObject(object);
      } catch (error) {
        if (isStale()) {
          return;
        }
        setError("이미지를 복제하지 못했습니다.", error);
        return;
      }
    } else {
      const object = buildFabricObject(fabric, normalized);
      if (!object) {
        return;
      }
      canvas.add(object);
      canvas.setActiveObject(object);
    }

    canvas.requestRenderAll();
    pushHistory();
    updatePropertyPanel();
  }

  function deleteSelection() {
    withSelection((objects) => {
      canvas.remove(...objects);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      pushHistory();
      updatePropertyPanel();
      setStatus("개체를 삭제했습니다.");
    });
  }

  function copySelection() {
    const objects = selectedFabricObjects(canvas);
    if (objects.length === 0) {
      return;
    }
    clipboard = objects.map((object) => selectedElementModel(object)).filter(Boolean);
    setStatus("개체를 복사했습니다.");
  }

  async function pasteClipboard() {
    const items = Array.isArray(clipboard) ? clipboard : clipboard ? [clipboard] : [];
    for (const element of items) {
      await pasteElement({ ...element, id: nextId() });
    }
  }

  function nudgeSelection(dx, dy) {
    withSelection((objects) => {
      for (const object of objects) {
        object.set({ left: object.left + dx, top: object.top + dy });
        enforceBounds(object);
        object.setCoords();
      }
      canvas.requestRenderAll();
      queueHistory();
    });
  }

  function setZoom(next) {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    resizeToStage();
    setStatus(`${Math.round(zoom * 100)}%`);
  }

  function hideContextMenu() {
    const menu = root.querySelector("[data-editor-ui='context-menu']");
    if (menu) {
      menu.hidden = true;
    }
  }

  function showContextMenu(event) {
    const menu = root.querySelector("[data-editor-ui='context-menu']");
    if (!menu) {
      return;
    }
    menu.hidden = false;
    menu.style.left = `${event.offsetX}px`;
    menu.style.top = `${event.offsetY}px`;
  }

  function stopContextToolbarTracking() {
    stopToolbarTracking?.();
    stopToolbarTracking = null;
    positionToolbar = null;
  }

  function refreshContextToolbar() {
    const toolbar = root.querySelector("[data-editor-ui='context-toolbar']");
    if (!toolbar) {
      return;
    }
    const objects = selectedFabricObjects(canvas);
    const text = objects.find((object) => object.elementType === "text");
    toolbar.hidden = !text;
    stopContextToolbarTracking();
    if (!text || !canvas.lowerCanvasEl) {
      return;
    }
    // The toolbar sits outside the scrolling stage, so it is placed against the
    // viewport. Both the rect and the offsets have to be read fresh on every
    // update, otherwise the toolbar keeps the screen spot it was first given.
    const reference = {
      contextElement: canvas.lowerCanvasEl,
      getBoundingClientRect() {
        const box = objectBox(text);
        const canvasRect = canvas.lowerCanvasEl.getBoundingClientRect();
        const scaleX = canvasRect.width / SLIDE_WIDTH;
        const scaleY = canvasRect.height / SLIDE_HEIGHT;
        const left = canvasRect.left + box.x * scaleX;
        const top = canvasRect.top + box.y * scaleY;
        const width = box.width * scaleX;
        const height = box.height * scaleY;
        return {
          x: left,
          y: top,
          left,
          top,
          width,
          height,
          right: left + width,
          bottom: top + height,
        };
      },
    };
    positionToolbar = () => {
      computePosition(reference, toolbar, {
        strategy: "fixed",
        placement: "top",
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (destroyed) {
          return;
        }
        toolbar.style.position = "fixed";
        toolbar.style.left = `${x}px`;
        toolbar.style.top = `${y}px`;
      });
    };
    stopToolbarTracking = autoUpdate(reference, toolbar, () => positionToolbar?.());
  }

  function refreshLayerList() {
    const list = root.querySelector("[data-editor-ui='layers']");
    if (!list) {
      return;
    }
    const objects = [...elementObjects()].reverse();
    list.replaceChildren();
    for (const object of objects) {
      const item = list.ownerDocument.createElement("li");
      item.draggable = true;
      item.dataset.elementId = object.customElementId;
      item.className = "custom-editor-layer";
      if (selectedFabricObjects(canvas).includes(object)) {
        item.classList.add("is-active");
      }
      const label = list.ownerDocument.createElement("button");
      label.type = "button";
      label.textContent = object.elementType || "개체";
      label.addEventListener("click", () => {
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
        handleSelectionChange();
      });
      const vis = list.ownerDocument.createElement("button");
      vis.type = "button";
      vis.textContent = object.visible === false ? "숨김" : "표시";
      vis.addEventListener("click", () => {
        object.set({ visible: object.visible === false, customVisible: object.visible === false });
        canvas.requestRenderAll();
        pushHistory();
        refreshLayerList();
      });
      const lock = list.ownerDocument.createElement("button");
      lock.type = "button";
      lock.textContent = object.customLocked ? "잠금" : "잠금 해제";
      lock.addEventListener("click", () => {
        const locked = !object.customLocked;
        applyElementChrome(object, { locked, visible: object.visible !== false, shadow: object.shadow }, fabric);
        canvas.requestRenderAll();
        pushHistory();
        refreshLayerList();
      });
      item.append(label, vis, lock);
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", object.customElementId);
      });
      item.addEventListener("dragover", (event) => event.preventDefault());
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        const fromId = event.dataTransfer.getData("text/plain");
        const from = elementObjects().find((candidate) => candidate.customElementId === fromId);
        if (!from || from === object) {
          return;
        }
        canvas.remove(from);
        const index = canvas.getObjects().indexOf(object);
        canvas.add(from);
        if (typeof canvas.moveObjectTo === "function") {
          canvas.moveObjectTo(from, index);
        }
        canvas.requestRenderAll();
        pushHistory();
        refreshLayerList();
      });
      list.append(item);
    }
  }

  async function undo() {
    if (destroyed) {
      return;
    }
    flushHistory();
    if (!history.canUndo()) {
      return;
    }
    if (await restore(history.undo())) {
      setStatus("실행을 취소했습니다.");
    }
  }

  async function redo() {
    if (destroyed) {
      return;
    }
    flushHistory();
    if (!history.canRedo()) {
      return;
    }
    if (await restore(history.redo())) {
      setStatus("다시 실행했습니다.");
    }
  }

  async function applyTemplate(templateId) {
    if (destroyed) {
      return model;
    }
    const themeId = root.querySelector('[data-custom-editor="theme"]')?.value ?? "native";
    model = instantiateTemplate(templateId, nextId, themeId);
    const rendered = await renderModel(model);
    if (!rendered || destroyed) {
      return model;
    }
    pushHistory();
    setStatus("템플릿을 적용했습니다.");
    return model;
  }

  async function applyCurrentTheme(themeId) {
    if (destroyed) {
      return model;
    }
    const current = syncModel();
    const template = CUSTOM_SLIDE_TEMPLATES.find((item) => item.id === current.templateId);
    const native =
      template?.nativePalette ??
      nativePaletteFromDefinition({
        background: current.background?.color,
        elements: current.elements,
      });
    model = normalizeCustomSlide({
      ...applyTheme(current, resolvePalette(themeId, native)),
      templateId: current.templateId,
    });
    setThemeSelectValue(model.themeId);
    const rendered = await renderModel(model);
    if (!rendered || destroyed) {
      return model;
    }
    pushHistory();
    setStatus("테마를 적용했습니다.");
    return model;
  }

  function setThemeSelectValue(themeId) {
    for (const select of root.querySelectorAll('[data-custom-editor="theme"]')) {
      select.value = themeId || "native";
    }
  }

  // A reset intentionally leaves a dirty blank slide with one undo back to the
  // slide that was being edited.
  async function resetToBlank() {
    if (destroyed) {
      return model;
    }
    model = createDefaultCustomSlide();
    const rendered = await renderModel(model);
    if (!rendered || destroyed) {
      return model;
    }
    pushHistory();
    setStatus("편집 내용을 초기화했습니다.");
    return model;
  }

  function applyFieldChange(name, input) {
    const targets = selectedFabricObjects(canvas);
    if (targets.length === 0) {
      return;
    }

    for (const active of targets) {
    switch (name) {
      case "text":
        active.set({ text: input.value });
        break;
      case "fontFamily":
        active.set({ fontFamily: input.value });
        break;
      case "fontSize":
        active.set({ fontSize: Number(input.value) || active.fontSize });
        break;
      case "bold":
        active.set({ fontWeight: input.checked ? "bold" : "normal" });
        break;
      case "italic":
        active.set({ fontStyle: input.checked ? "italic" : "normal" });
        break;
      case "underline":
        active.set({ underline: input.checked });
        break;
      case "valign":
        active.set({ textAlignVertical: input.value });
        break;
      case "lineHeight":
        active.set({ lineHeight: Number(input.value) || 1.16 });
        break;
      case "charSpacing":
        active.set({ charSpacing: Number(input.value) || 0 });
        break;
      case "locked":
        applyElementChrome(active, {
          locked: input.checked,
          visible: active.visible !== false,
          shadow: active.shadow,
        }, fabric);
        break;
      case "visible":
        active.set({ visible: input.checked, customVisible: input.checked });
        break;
      case "shadowEnabled":
        if (input.checked) {
          applyElementChrome(active, {
            locked: active.customLocked,
            visible: active.visible !== false,
            shadow: { color: field("shadowColor")?.value || "#000000", blur: 12, offsetX: 6, offsetY: 6, opacity: 0.45 },
          }, fabric);
        } else {
          active.set({ shadow: null });
        }
        break;
      case "shadowColor":
        if (active.shadow) {
          const current = active.shadow;
          applyElementChrome(active, {
            locked: active.customLocked,
            visible: active.visible !== false,
            shadow: {
              color: input.value,
              blur: current.blur ?? 12,
              offsetX: current.offsetX ?? 6,
              offsetY: current.offsetY ?? 6,
              opacity: current.opacity ?? 0.45,
            },
          }, fabric);
        }
        break;
      case "color":
        active.set({ fill: input.value, themeRole: undefined });
        break;
      case "textAlign":
        active.set({ textAlign: input.value });
        break;
      case "fit": {
        // Re-fit inside the authored box so toggling never drifts.
        const box = imageBoxFromObject(active);
        applyImageFit(active, input.value, box.width, box.height);
        break;
      }
      case "fill":
        active.set({ fill: input.value, themeRole: undefined });
        break;
      case "stroke":
        active.set({ stroke: input.value || null, themeStrokeRole: undefined });
        break;
      case "strokeWidth":
        active.set({ strokeWidth: Number(input.value) || 0 });
        break;
      case "noStroke": {
        if (input.checked) {
          strokeMemory.set(active, {
            stroke: active.stroke ?? "",
            strokeWidth: active.strokeWidth ?? 0,
          });
          active.set({ stroke: null, strokeWidth: 0, themeStrokeRole: undefined });
        } else {
          const remembered = strokeMemory.get(active);
          const color = remembered?.stroke || field("stroke")?.value || "#000000";
          const width =
            remembered?.strokeWidth || Number(field("strokeWidth")?.value) || 1;
          active.set({ stroke: color, strokeWidth: width });
        }
        syncStrokeFields(active);
        break;
      }
      case "opacity":
        active.set({ opacity: Math.min(1, Math.max(0, Number(input.value))) });
        break;
      case "rotation":
        active.rotate(Number(input.value) || 0);
        enforceBounds(active);
        break;
      default:
        continue;
    }

    active.setCoords();
    }
    canvas.requestRenderAll();
    queueHistory();
  }

  async function runAction(action) {
    if (destroyed) {
      return;
    }
    switch (action) {
      case "add-text":
        addElement(centeredElement("text"));
        setStatus("텍스트를 추가했습니다.");
        break;
      case "add-rect":
        addElement(centeredElement("rect"));
        setStatus("사각형을 추가했습니다.");
        break;
      case "add-roundRect":
        addElement(centeredElement("roundRect"));
        setStatus("둥근 사각형을 추가했습니다.");
        break;
      case "add-ellipse":
        addElement(centeredElement("ellipse"));
        setStatus("원을 추가했습니다.");
        break;
      case "add-line":
        addElement(centeredElement("line"));
        setStatus("선을 추가했습니다.");
        break;
      case "add-image":
        dom.file?.click();
        break;
      case "undo":
        await undo();
        break;
      case "redo":
        await redo();
        break;
      case "forward":
      case "backward":
      case "to-front":
      case "to-back":
        reorderSelection(action);
        break;
      case "copy":
        copySelection();
        hideContextMenu();
        break;
      case "paste":
        await pasteClipboard();
        hideContextMenu();
        break;
      case "duplicate":
        await duplicateSelection();
        hideContextMenu();
        break;
      case "delete":
        deleteSelection();
        hideContextMenu();
        break;
      case "zoom-in":
        setZoom(zoom + 0.25);
        break;
      case "zoom-out":
        setZoom(zoom - 0.25);
        break;
      case "zoom-fit":
        setZoom(1);
        break;
      case "distribute-x":
        distributeSelection("x");
        break;
      case "distribute-y":
        distributeSelection("y");
        break;
      case "apply-template":
        await applyTemplate(
          root.querySelector('[data-custom-editor="template"]')?.value ?? "blank"
        );
        break;
      default:
        if (action === "align-selection-left") {
          alignSelection("left", true);
        } else if (action.startsWith("align-")) {
          alignSelection(action.slice("align-".length));
        }
        break;
    }
  }

  const listeners = [];
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }

  listen(root, "click", (event) => {
    const button = event.target.closest?.("[data-editor-action]");
    if (!button || !root.contains(button)) {
      return;
    }
    event.preventDefault();
    runAction(button.dataset.editorAction).catch((error) => {
      setError("작업을 수행하지 못했습니다.", error);
    });
  });

  listen(root, "input", (event) => {
    const input = event.target;
    if (input?.dataset?.editorField) {
      applyFieldChange(input.dataset.editorField, input);
    }
    if (input?.getAttribute?.("data-custom-editor") === "background") {
      canvas.backgroundColor = input.value;
      canvas.requestRenderAll();
      queueHistory();
    }
  });

  listen(root, "change", (event) => {
    const input = event.target;
    if (input?.dataset?.editorField) {
      applyFieldChange(input.dataset.editorField, input);
    }
  });

  if (dom.file) {
    listen(dom.file, "change", () => {
      const [file] = dom.file.files ?? [];
      if (file) {
        insertImageFile(file).finally(() => {
          dom.file.value = "";
        });
      }
    });
  }

  if (dom.template) {
    listen(dom.template, "change", () => {
      setStatus(`${dom.template.selectedOptions[0]?.textContent ?? ""} 템플릿을 선택했습니다.`);
    });
  }

  for (const select of root.querySelectorAll('[data-custom-editor="theme"]')) {
    listen(select, "change", () => {
      applyCurrentTheme(select.value);
    });
  }

  /**
   * Clipboard and delete keys belong to the canvas only while the user is
   * working in it: the surrounding page has its own selection and its own
   * Ctrl+C, so a stale canvas selection must not swallow them.
   */
  function isCanvasShortcutInScope(target) {
    if (target && typeof target.nodeType === "number" && root.contains(target)) {
      return true;
    }
    return canvasEngaged;
  }

  function canExecuteCommand(command) {
    const hasSelection = selectedFabricObjects(canvas).length > 0;

    switch (command) {
      case "copy":
      case "delete":
      case "duplicate":
      case "forward":
      case "backward":
        return hasSelection;
      case "paste":
        return Boolean(clipboard && (Array.isArray(clipboard) ? clipboard.length : true));
      case "select-all":
      case "deselect":
        return true;
      case "undo":
        return history.canUndo() || historyTimer !== null;
      case "redo":
        return history.canRedo();
      default:
        return command.startsWith("nudge-");
    }
  }

  function handleKeydown(event) {
    if (destroyed || root.hidden || !root.isConnected) {
      return;
    }
    if (event.code === "Space" && !TYPING_TAGS.has((event.target?.tagName || "").toUpperCase())) {
      spacePan = true;
      const stage = dom.stage;
      if (stage) {
        stage.style.cursor = "grab";
      }
    }
    const active = canvas.getActiveObject();
    const command = decideKeyboardCommand({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      target: event.target,
      isTextEditing: Boolean(active?.isEditing),
    });

    if (!command || !canExecuteCommand(command)) {
      return;
    }
    if (
      (command === "copy" || command === "paste" || command === "delete") &&
      !isCanvasShortcutInScope(event.target)
    ) {
      return;
    }

    event.preventDefault();
    switch (command) {
      case "copy":
        copySelection();
        break;
      case "paste":
        pasteClipboard().catch((error) => {
          setError("붙여넣기에 실패했습니다.", error);
        });
        break;
      case "duplicate":
        duplicateSelection().catch((error) => setError("복제에 실패했습니다.", error));
        break;
      case "undo":
        undo().catch((error) => setError("실행 취소에 실패했습니다.", error));
        break;
      case "redo":
        redo().catch((error) => setError("다시 실행에 실패했습니다.", error));
        break;
      case "delete":
        deleteSelection();
        break;
      case "select-all":
        if (elementObjects().length && fabric.ActiveSelection) {
          canvas.setActiveObject(new fabric.ActiveSelection(elementObjects(), { canvas }));
          canvas.requestRenderAll();
          handleSelectionChange();
        }
        break;
      case "deselect":
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        handleSelectionChange();
        hideContextMenu();
        break;
      case "forward":
      case "backward":
        reorderSelection(command);
        break;
      case "nudge-left":
        nudgeSelection(-NUDGE_SMALL, 0);
        break;
      case "nudge-right":
        nudgeSelection(NUDGE_SMALL, 0);
        break;
      case "nudge-up":
        nudgeSelection(0, -NUDGE_SMALL);
        break;
      case "nudge-down":
        nudgeSelection(0, NUDGE_SMALL);
        break;
      case "nudge-left-large":
        nudgeSelection(-NUDGE_LARGE, 0);
        break;
      case "nudge-right-large":
        nudgeSelection(NUDGE_LARGE, 0);
        break;
      case "nudge-up-large":
        nudgeSelection(0, -NUDGE_LARGE);
        break;
      case "nudge-down-large":
        nudgeSelection(0, NUDGE_LARGE);
        break;
      default:
        break;
    }
  }

  function trackEngagement(event) {
    const target = event.target;
    canvasEngaged = Boolean(
      target && typeof target.nodeType === "number" && root.contains(target)
    );
  }

  const editorDocument = root.ownerDocument ?? document;
  listen(editorDocument, "keydown", handleKeydown);
  listen(editorDocument, "keyup", (event) => {
    if (event.code === "Space") {
      spacePan = false;
      panning = false;
      if (dom.stage) {
        dom.stage.style.cursor = "";
      }
    }
  });
  listen(editorDocument, "mousedown", trackEngagement);
  listen(editorDocument, "focusin", trackEngagement);
  listen(editorDocument, "click", (event) => {
    if (!event.target.closest?.("[data-editor-ui='context-menu']")) {
      hideContextMenu();
    }
  });

  if (dom.stage) {
    listen(dom.stage, "contextmenu", (event) => {
      event.preventDefault();
      canvasEngaged = true;
      showContextMenu(event);
    });
    listen(dom.stage, "mousedown", (event) => {
      if (!spacePan) {
        return;
      }
      panning = true;
      panOrigin = { x: event.clientX, y: event.clientY, sl: dom.stage.scrollLeft, st: dom.stage.scrollTop };
      event.preventDefault();
    });
    listen(dom.stage, "mousemove", (event) => {
      if (!panning || !panOrigin) {
        return;
      }
      dom.stage.scrollLeft = panOrigin.sl - (event.clientX - panOrigin.x);
      dom.stage.scrollTop = panOrigin.st - (event.clientY - panOrigin.y);
    });
    listen(dom.stage, "mouseup", () => {
      panning = false;
    });
    listen(dom.stage, "wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
    }, { passive: false });
  }

  // Fabric transforms the object without touching the DOM, so nothing else
  // tells the floating toolbar that the text moved out from under it.
  canvas.on("object:moving", ({ target }) => {
    if (!isActiveSelection(target)) {
      applySnapping(target);
    }
    enforceBounds(target);
    positionToolbar?.();
  });
  canvas.on("object:scaling", ({ target }) => {
    if (!isActiveSelection(target)) {
      limitScaling(target);
    }
    enforceBounds(target);
    positionToolbar?.();
  });
  canvas.on("object:rotating", ({ target }) => {
    limitScaling(target);
    enforceBounds(target);
    positionToolbar?.();
  });
  canvas.on("object:modified", ({ target }) => {
    clearGuides();
    if (target?.elementType === "image" && imageScaleChanged(target)) {
      // A transform the user performed defines the new layout box.
      adoptImageTransform(target);
    }
    if (target?.elementType === "text" && bakeTextScale(target)) {
      enforceBounds(target);
    }
    canvas.requestRenderAll();
    pushHistory();
    updatePropertyPanel();
  });
  canvas.on("text:changed", () => {
    queueHistory();
  });

  function handleSelectionChange() {
    const active = canvas.getActiveObject();
    if (active && (active.role === "element" || isActiveSelection(active))) {
      canvasEngaged = true;
    }
    updatePropertyPanel();
    refreshActionStates();
  }

  canvas.on("selection:created", handleSelectionChange);
  canvas.on("selection:updated", handleSelectionChange);
  canvas.on("selection:cleared", handleSelectionChange);
  canvas.on("mouse:up", clearGuides);
  canvas.on("after:render", drawGuides);

  function resizeToStage() {
    const host = dom.stage ?? root;
    const available = host.clientWidth;
    if (!available) {
      return;
    }
    const width = Math.min(available, SLIDE_WIDTH) * zoom;
    const height = (width * SLIDE_HEIGHT) / SLIDE_WIDTH;
    canvas.setDimensions({ width: `${width}px`, height: `${height}px` }, { cssOnly: true });
  }

  if (typeof view.ResizeObserver === "function") {
    resizeObserver = new view.ResizeObserver(() => resizeToStage());
    resizeObserver.observe(dom.stage ?? root);
  } else if (typeof view.addEventListener === "function") {
    listen(view, "resize", resizeToStage);
  }
  resizeToStage();

  const templateSelects = root.querySelectorAll('[data-custom-editor="template"]');
  for (const select of templateSelects) {
    select.replaceChildren();
    for (const template of CUSTOM_SLIDE_TEMPLATES) {
      const option = select.ownerDocument.createElement("option");
      option.value = template.id;
      option.textContent = template.label;
      select.append(option);
    }
  }

  const themeSelects = root.querySelectorAll('[data-custom-editor="theme"]');
  for (const select of themeSelects) {
    select.replaceChildren();
    for (const theme of CUSTOM_SLIDE_THEMES) {
      const option = select.ownerDocument.createElement("option");
      option.value = theme.id;
      option.textContent = theme.label;
      select.append(option);
    }
  }

  await load(model);

  return {
    canvas,
    load,
    serialize() {
      if (destroyed) {
        return model;
      }
      flushHistory();
      return syncModel();
    },
    reset: resetToBlank,
    undo,
    redo,
    applyTemplate,
    isDirty() {
      if (!destroyed) {
        flushHistory();
      }
      return history.isDirty();
    },
    markSaved() {
      if (destroyed) {
        return;
      }
      flushHistory();
      history.markSaved();
      refreshActionStates();
      notifyChange();
    },
    async destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      // Invalidate any render still awaiting an image.
      renderToken += 1;
      if (historyTimer !== null) {
        clearTimeout(historyTimer);
        historyTimer = null;
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
      stopContextToolbarTracking();
      for (const removeListener of listeners) {
        removeListener();
      }
      listeners.length = 0;
      return canvas.dispose();
    },
  };
}
