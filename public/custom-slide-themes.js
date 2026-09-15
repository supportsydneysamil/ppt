export const THEME_ROLES = Object.freeze([
  "background",
  "surface",
  "accent",
  "title",
  "body",
  "muted",
  "stroke",
]);

const ROLE_SET = new Set(THEME_ROLES);

const DEFAULT_NATIVE = Object.freeze({
  background: "#ffffff",
  surface: "#ffffff",
  accent: "#2563eb",
  title: "#111827",
  body: "#1f2937",
  muted: "#64748b",
  stroke: "#cbd5e1",
});

function palette(id, label, background, accent, title, body, muted, surface, stroke) {
  return { id, label, background, accent, title, body, muted, surface, stroke };
}

export const CUSTOM_SLIDE_THEMES = Object.freeze([
  { id: "native", label: "네이티브" },
  palette("plain", "플레인", "#ffffff", "#111827", "#111827", "#4b5563", "#6b7280", "#f3f4f6", "#d1d5db"),
  palette("deep-black", "딥블랙", "#0a0a0b", "#c9a961", "#f5f5f4", "#d4d4d8", "#a1a1aa", "#18181b", "#3f3f46"),
  palette("simple", "심플", "#f7f5f2", "#7d8c72", "#1f2328", "#3f433e", "#8a8578", "#efece6", "#d4d0c8"),
  palette("midnight", "미드나잇 블루", "#0b1a33", "#3b82f6", "#eaf1ff", "#c5d4ee", "#7ea2e8", "#13284a", "#1e3a5f"),
  palette("warm-sand", "웜 샌드", "#f3ece1", "#b4623a", "#3b2f22", "#5c4a3a", "#9c7b5c", "#e7dccb", "#d4c4ae"),
  palette("evergreen", "에버그린", "#0f2a22", "#c9a961", "#f2ede1", "#d5e4da", "#9ec4ad", "#17362c", "#2a4f42"),
  palette("navy-gold", "네이비 골드", "#101c33", "#d4af6a", "#f7f1e4", "#e4d8c0", "#c5b48a", "#182744", "#2a3b5c"),
  palette("stone", "스톤", "#eef0f3", "#475569", "#1e293b", "#334155", "#64748b", "#e2e6eb", "#cbd5e1"),
  palette("wine", "와인", "#2a1218", "#c9a27a", "#f6ebe3", "#e6d0c2", "#d4b8a4", "#3a1c24", "#5c3340"),
  palette("ivory", "아이보리 잉크", "#faf6ee", "#1c1917", "#1c1917", "#3f3a34", "#8a7354", "#f1eadc", "#ddd4c4"),
  palette("charcoal", "차콜", "#1c1f24", "#d0d5dd", "#f4f5f7", "#d5dae2", "#a8b0bc", "#272b32", "#3d434c"),
  palette("dawn", "던", "#f8f1ea", "#c47a6a", "#3a2a24", "#5a433a", "#b07868", "#f0e4d8", "#e0cfc4"),
  palette("cobalt", "코발트", "#07101c", "#2f6fed", "#f3f7ff", "#c5d4ea", "#8eb4e8", "#0e1a2e", "#1a2f4d"),
  palette("linen", "리넨", "#efe9dc", "#4a5348", "#2a2e28", "#3f443d", "#6d7464", "#e5dece", "#cfc6b4"),
  palette("graphite", "그래파이트", "#252a33", "#6f87a6", "#eef2f6", "#c5ced8", "#8ea0b8", "#2f3540", "#3d4654"),
  palette("fog", "포그", "#e8eef4", "#3d5a73", "#1b2a38", "#334859", "#6b8499", "#dde5ee", "#c5d0db"),
  palette("copper", "코퍼", "#1c1410", "#c07a42", "#f4eadf", "#e2d0c0", "#d4a574", "#2a1e18", "#4a3428"),
  palette("pearl", "펄", "#f6f7f9", "#9aa3b0", "#2b3038", "#3f4752", "#8b93a0", "#eceef2", "#d5d8de"),
  palette("violet", "바이올렛", "#231428", "#b08bc4", "#f4eef8", "#ddd0e6", "#c9b4d8", "#321c38", "#4a2d52"),
  palette("lake", "레이크", "#0d2428", "#5aa8a2", "#eef7f6", "#cfe3e0", "#8ec4c0", "#163338", "#23484d"),
]);

export function isThemeId(value) {
  return CUSTOM_SLIDE_THEMES.some((theme) => theme.id === value);
}

export function normalizeThemeRole(value) {
  return ROLE_SET.has(value) ? value : undefined;
}

function colorFromElement(element) {
  if (element.type === "text" && typeof element.color === "string" && element.color) {
    return element.color;
  }
  if (element.type === "line" && typeof element.stroke === "string" && element.stroke) {
    return element.stroke;
  }
  if (typeof element.fill === "string" && element.fill) {
    return element.fill;
  }
  return null;
}

export function nativePaletteFromDefinition(definition) {
  const paletteColors = { ...DEFAULT_NATIVE };
  if (typeof definition?.background === "string" && definition.background) {
    paletteColors.background = definition.background;
  }
  for (const element of definition?.elements || []) {
    const role = normalizeThemeRole(element?.themeRole);
    const fillColor = colorFromElement(element);
    if (role && fillColor) {
      paletteColors[role] = fillColor;
    }
    const strokeRole = normalizeThemeRole(element?.themeStrokeRole);
    if (strokeRole && typeof element?.stroke === "string" && element.stroke) {
      paletteColors[strokeRole] = element.stroke;
    }
  }
  return paletteColors;
}

export function resolvePalette(themeId, nativePalette) {
  const fallback = { id: "native", ...DEFAULT_NATIVE, ...nativePalette };
  if (!themeId || themeId === "native" || !isThemeId(themeId)) {
    return fallback;
  }
  const theme = CUSTOM_SLIDE_THEMES.find((candidate) => candidate.id === themeId);
  if (!theme || theme.id === "native") {
    return fallback;
  }
  return theme;
}

function paintElement(element, palette) {
  if (element.type === "image") {
    return element;
  }
  const next = { ...element };
  const role = normalizeThemeRole(element.themeRole);
  if (role && palette[role]) {
    if (element.type === "text") {
      next.color = palette[role];
    } else if (element.type === "line") {
      next.stroke = palette[role];
    } else {
      next.fill = palette[role];
    }
  }
  const strokeRole = normalizeThemeRole(element.themeStrokeRole);
  if (strokeRole && palette[strokeRole] && element.type !== "text" && element.type !== "image") {
    if (element.strokeWidth > 0 && element.stroke) {
      next.stroke = palette[strokeRole];
    }
  }
  return next;
}

export function applyTheme(model, palette) {
  const source = model && typeof model === "object" ? model : {};
  const colors = palette && typeof palette === "object" ? palette : DEFAULT_NATIVE;
  const themeId =
    typeof colors.id === "string" && isThemeId(colors.id) ? colors.id : source.themeId;
  const elements = Array.isArray(source.elements) ? source.elements : [];
  return {
    ...source,
    themeId,
    background: {
      color: colors.background || source.background?.color || DEFAULT_NATIVE.background,
    },
    elements: elements.map((element) => paintElement(element, colors)),
  };
}

export function clearThemeRoleForColorField(element, field) {
  const next = { ...element };
  if (field === "fill" || field === "color") {
    delete next.themeRole;
  }
  if (field === "stroke") {
    delete next.themeStrokeRole;
  }
  return next;
}
