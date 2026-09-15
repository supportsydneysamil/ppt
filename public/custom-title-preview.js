import {
  enTitleFontSize,
  koTitleFontSize,
  subtitleFontSize,
} from "../lib/custom-title-text.js";
import { buildHymnSubtitle } from "../lib/cover-title-content.js";

const TITLE_SANS = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
const TITLE_SERIF = "Batang,'Nanum Myeongjo',serif";
const TITLE_LATIN = "Arial,Helvetica,sans-serif";

const LEGACY_DESIGNS = {
  aurora: { id: "aurora", layoutFamily: "centered-rule" },
  monolith: { id: "monolith", layoutFamily: "centered-rule" },
  ivory: { id: "ivory", layoutFamily: "double-frame" },
  marquee: { id: "marquee", layoutFamily: "ornament-frame" },
};

const LEGACY_THEMES = {
  aurora: {
    background:
      "radial-gradient(72% 72% at 78% 8%, rgba(139,92,246,0.46), rgba(139,92,246,0) 72%)," +
      "radial-gradient(78% 78% at 10% 96%, rgba(45,212,191,0.34), rgba(45,212,191,0) 72%)," +
      "linear-gradient(135deg, #170E33 0%, #2C1A63 52%, #0C3A52 100%)",
    koFont: TITLE_SANS,
    koWeight: 700,
    koColor: "#FFFFFF",
    koTracking: 0.02,
    koGap: 0.34,
    dividerGap: 0.3,
    ruleWidth: 3.4,
    ruleWeight: 0.024,
    ruleColor: "#8B6BFF",
    enColor: "#C4B2FF",
    enWeight: 700,
    enTracking: 0.42,
    subtitleHalo:
      "radial-gradient(ellipse at center, rgba(196,178,255,0.15), rgba(196,178,255,0) 68%)",
    subtitleText: "#FFFFFF",
  },
  monolith: {
    background:
      "radial-gradient(62% 62% at 50% 0%, rgba(255,255,255,0.12), rgba(255,255,255,0) 70%)," +
      "linear-gradient(90deg, #0A0B0D 25%, #15171B 50%, #0A0B0D 75%)",
    koFont: TITLE_SERIF,
    koWeight: 700,
    koColor: "#F4F1EA",
    koTracking: 0.06,
    koGap: 0.36,
    dividerGap: 0.28,
    ruleWidth: 1.1,
    ruleWeight: 0.014,
    ruleColor: "#9A9689",
    enColor: "#9A9689",
    enWeight: 400,
    enTracking: 0.5,
    hairline: "#2C2E33",
    subtitleHalo:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.10), rgba(255,255,255,0) 68%)",
    subtitleText: "#EEE9DC",
  },
  ivory: {
    background: "#FAF6EF",
    koFont: TITLE_SERIF,
    koWeight: 700,
    koColor: "#1F1B16",
    koTracking: 0.04,
    koGap: 0.32,
    dividerGap: 0.28,
    ruleWidth: 2.2,
    ruleWeight: 0.017,
    ruleColor: "#C2A87A",
    enColor: "#907A52",
    enWeight: 700,
    enTracking: 0.45,
    frame: "#C2A87A",
    frameWeight: 0.021,
    subtitleHalo:
      "radial-gradient(ellipse at center, rgba(194,168,122,0.16), rgba(194,168,122,0) 68%)",
    subtitleText: "#5F4B2C",
  },
  marquee: {
    background: "#2A0F16",
    koFont: TITLE_SERIF,
    koWeight: 700,
    koColor: "#F7EBDA",
    koTracking: 0.05,
    koGap: 0.34,
    dividerGap: 0.3,
    ruleWidth: 3.6,
    ruleWeight: 0.014,
    ruleColor: "#D9B376",
    enColor: "#D9B376",
    enWeight: 700,
    enTracking: 0.48,
    frame: "#D9B376",
    frameWeight: 0.024,
    diamonds: true,
    subtitleHalo:
      "radial-gradient(ellipse at center, rgba(217,179,118,0.12), rgba(217,179,118,0) 68%)",
    subtitleText: "#F7EBDA",
  },
};

const FAMILY_LAYOUTS = {
  "centered-rule": { align: "center", width: "100%", offsetX: "0", offsetY: "0" },
  "double-frame": { align: "center", width: "100%", offsetX: "0", offsetY: "0" },
  "ornament-frame": { align: "center", width: "100%", offsetX: "0", offsetY: "0" },
  "side-band": { align: "left", width: "57%", offsetX: "9.75%", offsetY: "0" },
  "horizon-split": { align: "center", width: "100%", offsetX: "0", offsetY: "9%" },
  "emblem-crest": { align: "center", width: "100%", offsetX: "0", offsetY: "6%" },
  "veil-panel": { align: "left", width: "42.4%", offsetX: "47.6%", offsetY: "0" },
  "corner-mark": { align: "left", width: "69%", offsetX: "9.4%", offsetY: "0" },
};

function node(document, cssText, text = "") {
  const element = document.createElement("div");
  element.style.cssText = cssText;
  element.textContent = text;
  return element;
}

function diamond(document, cssText, size, color) {
  return node(
    document,
    `position:absolute;${cssText}width:${size}px;height:${size}px;` +
      `background:${color};transform:rotate(45deg);`
  );
}

function resolveDesign(value, catalogApi) {
  const requested = typeof value === "string" ? value : "aurora";
  const normalized = catalogApi
    ? catalogApi.normalizeCustomTitleDesignId(requested)
    : LEGACY_DESIGNS[requested]
      ? requested
      : "aurora";
  return (
    catalogApi?.findCustomTitleDesign(normalized) ||
    LEGACY_DESIGNS[normalized] ||
    LEGACY_DESIGNS.aurora
  );
}

function previewTheme(design) {
  if (LEGACY_THEMES[design.id]) return LEGACY_THEMES[design.id];
  const source = design.theme;
  return {
    background:
      `radial-gradient(70% 80% at 50% 10%, #${source.accent}33, transparent 72%),` +
      `linear-gradient(135deg, #${source.background}, #${source.backgroundAccent})`,
    koFont: source.titleFont === "serif" ? TITLE_SERIF : TITLE_SANS,
    koWeight: 700,
    koColor: `#${source.title}`,
    koTracking: 0.04,
    koGap: 0.34,
    dividerGap: 0.3,
    ruleWidth: 2.6,
    ruleWeight: 0.017,
    ruleColor: `#${source.rule}`,
    enColor: `#${source.accent}`,
    enWeight: 700,
    enTracking: 0.42,
    subtitleHalo:
      `radial-gradient(ellipse at center, #${source.haloColor}${Math.round(
        source.haloOpacity * 255
      )
        .toString(16)
        .padStart(2, "0")}, transparent 68%)`,
    subtitleText: `#${source.subtitleText}`,
  };
}

function motifNode(document, family, style) {
  const motif = node(document, `position:absolute;pointer-events:none;${style}`);
  motif.dataset.customTitleFamilyMotif = family;
  return motif;
}

function addFamilyMotif(container, design, unit, document) {
  if (LEGACY_THEMES[design.id]) return;
  const { inch } = unit;
  const family = design.layoutFamily;
  const source = design.theme || {};
  const accent = `#${source.accent || "C4B2FF"}`;
  const rule = `#${source.rule || "8B6BFF"}`;
  const background = source.background || "170E33";
  const backgroundAccent = source.backgroundAccent || "2C1A63";

  if (family === "centered-rule") {
    container.append(
      motifNode(
        document,
        family,
        `left:5%;right:5%;top:${inch(0.65)}px;border-top:1px solid ${rule};`
      ),
      node(
        document,
        `position:absolute;left:31%;right:31%;bottom:${inch(0.65)}px;border-top:1px solid ${rule};`
      )
    );
  } else if (family === "double-frame") {
    container.append(
      motifNode(
        document,
        family,
        `inset:${inch(0.42)}px;border:1.5px solid ${rule};`
      ),
      node(document, `position:absolute;inset:${inch(0.57)}px;border:1px solid ${rule};`)
    );
  } else if (family === "ornament-frame") {
    container.appendChild(
      motifNode(
        document,
        family,
        `inset:${inch(0.46)}px;border:1.5px solid ${rule};`
      )
    );
    [
      `top:${inch(0.4)}px;left:${inch(0.4)}px;`,
      `top:${inch(0.4)}px;right:${inch(0.4)}px;`,
      `bottom:${inch(0.4)}px;left:${inch(0.4)}px;`,
      `bottom:${inch(0.4)}px;right:${inch(0.4)}px;`,
    ].forEach((position) =>
      container.appendChild(diamond(document, position, inch(0.12), accent))
    );
  } else if (family === "side-band") {
    container.append(
      motifNode(
        document,
        family,
        `inset:0 auto 0 0;width:${inch(0.34)}px;background:${accent};`
      ),
      node(
        document,
        `position:absolute;inset:0 auto 0 ${inch(0.56)}px;width:${inch(0.06)}px;background:${rule};`
      )
    );
  } else if (family === "horizon-split") {
    container.append(
      motifNode(
        document,
        family,
        `left:0;right:0;top:63%;bottom:0;background:#${backgroundAccent}7A;`
      ),
      node(
        document,
        `position:absolute;left:0;right:0;top:63%;border-top:1.5px solid ${rule};`
      )
    );
  } else if (family === "emblem-crest") {
    container.append(
      motifNode(
        document,
        family,
        `left:calc(50% - ${inch(0.34)}px);top:${inch(1.05)}px;width:${inch(
          0.68
        )}px;height:${inch(0.68)}px;border:1.5px solid ${accent};border-radius:50%;`
      ),
      diamond(
        document,
        `left:calc(50% - ${inch(0.07)}px);top:${inch(1.32)}px;`,
        inch(0.14),
        accent
      )
    );
  } else if (family === "veil-panel") {
    container.appendChild(
      motifNode(
        document,
        family,
        `left:43.6%;right:6%;top:9%;bottom:9%;border:1px solid ${rule};` +
          `border-left:2px solid ${accent};background:#${background}CC;`
      )
    );
  } else if (family === "corner-mark") {
    container.append(
      motifNode(
        document,
        family,
        `left:6%;top:10%;width:8%;height:14%;border-left:2px solid ${accent};border-top:2px solid ${accent};`
      ),
      node(
        document,
        `position:absolute;right:6%;bottom:10%;width:8%;height:14%;border-right:2px solid ${accent};border-bottom:2px solid ${accent};`
      )
    );
  }
}

function addLegacyFrame(container, theme, unit, document) {
  const { inch } = unit;
  if (theme.hairline) {
    [`top:${inch(0.45)}px`, `bottom:${inch(0.45)}px`].forEach((edge) => {
      container.appendChild(
        node(
          document,
          `position:absolute;${edge};left:${inch(0.45)}px;right:${inch(0.45)}px;` +
            `height:1px;background:${theme.hairline};`
        )
      );
    });
  }
  if (!theme.frame) return;
  const inset = theme.diamonds ? 0.44 : 0.42;
  container.appendChild(
    node(
      document,
      `position:absolute;inset:${inch(inset)}px;border:${Math.max(
        1,
        inch(theme.frameWeight)
      )}px solid ${theme.frame};`
    )
  );
  if (theme.diamonds) {
    const size = inch(0.11);
    const offset = inch(inset) - size / 2;
    [
      `top:${offset}px;left:${offset}px;`,
      `top:${offset}px;right:${offset}px;`,
      `bottom:${offset}px;left:${offset}px;`,
      `bottom:${offset}px;right:${offset}px;`,
    ].forEach((position) =>
      container.appendChild(diamond(document, position, size, theme.frame))
    );
  } else {
    container.appendChild(
      node(
        document,
        `position:absolute;inset:${inch(0.56)}px;border:1px solid ${theme.frame};`
      )
    );
  }
}

function addSubtitle(container, subtitle, theme, unit, document) {
  const { inch, pt } = unit;
  const halo = node(
    document,
    `position:absolute;left:8%;right:8%;bottom:${inch(0.55)}px;` +
      `height:${inch(0.85)}px;display:flex;align-items:center;justify-content:center;` +
      `box-sizing:border-box;background:${theme.subtitleHalo};border:0;z-index:2;`
  );
  halo.dataset.customTitleSubtitle = "";
  halo.appendChild(
    node(
      document,
      `position:relative;font-family:${TITLE_SANS};font-weight:700;` +
        `font-size:${pt(subtitleFontSize(subtitle))}px;line-height:1.2;` +
        `color:${theme.subtitleText};white-space:pre-line;letter-spacing:0.08em;` +
        "text-align:center;",
      subtitle
    )
  );
  container.appendChild(halo);
}

export function buildCustomTitleSlidePreview(
  data,
  previewWidth,
  {
    document = globalThis.document,
    catalogApi = null,
    textApi = { koTitleFontSize, enTitleFontSize },
  } = {}
) {
  const width = previewWidth || 400;
  const perInch = width / 13.333;
  const unit = {
    inch: (value) => value * perInch,
    pt: (value) => (value / 72) * perInch,
  };
  const { inch, pt } = unit;
  const ko = (data?.customTitleKo || "").trim() || "타이틀 이름";
  const en = (data?.customTitleEn || "").trim();
  const subtitle = (data?.customTitleSubtitle || "").trim();
  const design = resolveDesign(data?.customTitleDesign, catalogApi);
  const theme = previewTheme(design);
  const familyLayout =
    FAMILY_LAYOUTS[design.layoutFamily] || FAMILY_LAYOUTS["centered-rule"];

  const container = node(
    document,
    `position:relative;width:${width}px;height:${width * 0.5625}px;overflow:hidden;`
  );
  container.dataset.customTitleDesign = design.id;
  container.dataset.customTitleFamily = design.layoutFamily;
  container.style.background = theme.background;
  if (design.asset?.path) {
    const localUrl = `url("/${design.asset.path}")`;
    container.dataset.customTitleBackgroundImage = localUrl;
    container.style.backgroundImage =
      `linear-gradient(#${design.theme.background}66,#${design.theme.background}66),` +
      localUrl;
    container.style.backgroundPosition = "center";
    container.style.backgroundSize = "cover";
  }

  addLegacyFrame(container, theme, unit, document);
  addFamilyMotif(container, design, unit, document);

  const stack = node(
    document,
    `position:relative;height:100%;width:${familyLayout.width};margin-left:${familyLayout.offsetX};` +
      "display:flex;flex-direction:column;justify-content:center;" +
      `align-items:${familyLayout.align === "center" ? "center" : "flex-start"};` +
      `text-align:${familyLayout.align};transform:translateY(${familyLayout.offsetY});`
  );
  stack.dataset.customTitleStack = "";
  if (subtitle) {
    stack.style.transform += ` translateY(${inch(-0.45)}px)`;
  }

  const koSize = pt(textApi.koTitleFontSize(ko));
  stack.appendChild(
    node(
      document,
      `font-family:${theme.koFont};font-weight:${theme.koWeight};font-size:${koSize}px;` +
        `line-height:1.22;color:${theme.koColor};white-space:nowrap;` +
        `letter-spacing:${koSize * theme.koTracking}px;` +
        `padding-left:${koSize * theme.koTracking}px;max-width:92%;`,
      ko
    )
  );

  if (en) {
    const rule = node(
      document,
      `position:relative;width:${inch(theme.ruleWidth)}px;` +
        `height:${Math.max(1, inch(theme.ruleWeight))}px;background:${theme.ruleColor};` +
        `margin-top:${inch(theme.koGap)}px;`
    );
    if (theme.diamonds) {
      const size = inch(0.12);
      rule.append(
        node(
          document,
          `position:absolute;top:0;left:50%;width:${inch(0.26)}px;height:100%;` +
            `transform:translateX(-50%);background:${theme.background};`
        ),
        diamond(
          document,
          `top:${-size / 2}px;left:calc(50% - ${size / 2}px);`,
          size,
          theme.ruleColor
        )
      );
    }
    stack.appendChild(rule);
    const enSize = pt(textApi.enTitleFontSize(en));
    stack.appendChild(
      node(
        document,
        `font-family:${TITLE_LATIN};font-weight:${theme.enWeight};font-size:${enSize}px;` +
          `line-height:1.5;color:${theme.enColor};white-space:nowrap;` +
          `letter-spacing:${enSize * theme.enTracking}px;` +
          `padding-left:${enSize * theme.enTracking}px;` +
          `margin-top:${inch(theme.dividerGap)}px;`,
        en.toUpperCase()
      )
    );
  }

  container.appendChild(stack);
  if (subtitle) addSubtitle(container, subtitle, theme, unit, document);
  return container;
}

export function buildThemedHymnTitleSlidePreview(
  titleThemeId,
  hymnNumber,
  korTitle,
  engTitle,
  previewWidth,
  options = {}
) {
  const preview = buildCustomTitleSlidePreview(
    {
      customTitleDesign: titleThemeId,
      customTitleKo: "찬송",
      customTitleEn: "HYMN",
      customTitleSubtitle: buildHymnSubtitle({
        hymnNumber,
        hymnKorTitle: korTitle,
        hymnEngTitle: engTitle,
      }),
    },
    previewWidth,
    options
  );
  preview.style.width = "100%";
  preview.style.height = "auto";
  preview.style.aspectRatio = "16 / 9";
  preview.style.marginBottom = "8px";
  preview.style.borderRadius = "4px";
  return preview;
}
